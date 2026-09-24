import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { db, transaction } from "./db";
import { supervisorAppConfig } from "./env";
import {
  auditGithubRepository,
  normalizeGithubRepositoryLocator,
  RepositorySupervisorError,
} from "./repository-supervisor-runtime";

type FetchLike = typeof fetch;
const GITHUB_API = "https://api.github.com";
const MAX_CHANGE_COUNT = 40;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const PLAN_TTL_MS = 30 * 60 * 1000;
const WRITE_VERSION = 1;

export type RepositoryWriteChangeInput = {
  path: string;
  action: "upsert" | "delete";
  content?: string;
};

export type RepositoryWriteChange = {
  path: string;
  action: "upsert" | "delete";
  content?: string;
  expected_blob_sha: string | null;
  expected_mode: "100644" | "100755" | null;
};

export type RepositoryWritePlan = {
  plan_id: string;
  github_repository_id: number;
  repository_full_name: string;
  default_branch: string;
  expected_target_head_sha: string;
  created_by_github_user_id: number;
  billing_account_id: number;
  plan_digest_sha256: string;
  changes: RepositoryWriteChange[];
  commit_message: string;
  status: "planned" | "applied";
  expires_at: string;
  branch_name?: string;
  resulting_head_sha?: string;
  change_request_id?: number;
};

export type WriteOperationResult = Record<string, unknown>;

export interface RepositoryWritePlanStore {
  create(plan: RepositoryWritePlan): Promise<void>;
  get(planId: string, githubUserId: number): Promise<RepositoryWritePlan | null>;
  markApplied(planId: string, branchName: string, resultingHeadSha: string): Promise<void>;
  markChangeRequest(planId: string, changeRequestId: number): Promise<void>;
  beginOperation(input: {
    idempotencyKey: string;
    operation: string;
    planId: string | null;
    githubRepositoryId: number;
    githubUserId: number;
    requestDigest: string;
  }): Promise<{ replay: WriteOperationResult | null }>;
  completeOperation(idempotencyKey: string, result: WriteOperationResult): Promise<void>;
  failOperation(idempotencyKey: string, error: string): Promise<void>;
}

type StoredPlanEnvelope = {
  v: 1;
  changes: RepositoryWriteChange[];
};

function key(label: string): Buffer {
  return createHash("sha256")
    .update(supervisorAppConfig().sessionSecret, "utf8")
    .update("\0", "utf8")
    .update(label, "utf8")
    .digest();
}

function sealPlan(changes: RepositoryWriteChange[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("repository-write-plan"), iv);
  const payload: StoredPlanEnvelope = { v: 1, changes };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([WRITE_VERSION]), iv, tag, encrypted]).toString("base64url");
}

function unsealPlan(value: string): RepositoryWriteChange[] {
  let raw: Buffer;
  try { raw = Buffer.from(value, "base64url"); }
  catch { throw new Error("REPOSITORY_WRITE_PLAN_INVALID"); }
  if (raw.length < 31 || raw[0] !== WRITE_VERSION) throw new Error("REPOSITORY_WRITE_PLAN_INVALID");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key("repository-write-plan"), raw.subarray(1, 13));
    decipher.setAuthTag(raw.subarray(13, 29));
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(29)), decipher.final()]).toString("utf8")) as StoredPlanEnvelope;
    if (parsed.v !== 1 || !Array.isArray(parsed.changes)) throw new Error("invalid");
    return parsed.changes;
  } catch {
    throw new Error("REPOSITORY_WRITE_PLAN_INVALID");
  }
}

function rowPlan(row: Record<string, unknown>): RepositoryWritePlan {
  const changes = unsealPlan(String(row.changes_ciphertext));
  return {
    plan_id: String(row.plan_id),
    github_repository_id: Number(row.github_repository_id),
    repository_full_name: String(row.repository_full_name),
    default_branch: String(row.default_branch),
    expected_target_head_sha: String(row.expected_target_head_sha),
    created_by_github_user_id: Number(row.created_by_github_user_id),
    billing_account_id: Number(row.billing_account_id),
    plan_digest_sha256: String(row.plan_digest_sha256),
    changes,
    commit_message: String(row.commit_message),
    status: row.status === "applied" ? "applied" : "planned",
    expires_at: new Date(String(row.expires_at)).toISOString(),
    branch_name: row.branch_name ? String(row.branch_name) : undefined,
    resulting_head_sha: row.resulting_head_sha ? String(row.resulting_head_sha) : undefined,
    change_request_id: row.opened_change_request_id == null ? undefined : Number(row.opened_change_request_id),
  };
}

export const databaseWritePlanStore: RepositoryWritePlanStore = {
  async create(plan) {
    await db().query(
      `INSERT INTO repository_write_plans(
        plan_id,github_repository_id,repository_full_name,default_branch,expected_target_head_sha,
        created_by_github_user_id,billing_account_id,plan_digest_sha256,changes_ciphertext,change_count,total_bytes,
        commit_message,status,expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'planned',$13)`,
      [
        plan.plan_id,
        plan.github_repository_id,
        plan.repository_full_name,
        plan.default_branch,
        plan.expected_target_head_sha,
        plan.created_by_github_user_id,
        plan.billing_account_id,
        plan.plan_digest_sha256,
        sealPlan(plan.changes),
        plan.changes.length,
        plan.changes.reduce((sum, change) => sum + Buffer.byteLength(change.content ?? "", "utf8"), 0),
        plan.commit_message,
        new Date(plan.expires_at),
      ],
    );
  },
  async get(planId, githubUserId) {
    const result = await db().query(
      `SELECT *, applied_branch_name AS branch_name
         FROM repository_write_plans
        WHERE plan_id=$1 AND created_by_github_user_id=$2`,
      [planId, githubUserId],
    );
    return result.rowCount ? rowPlan(result.rows[0]) : null;
  },
  async markApplied(planId, branchName, resultingHeadSha) {
    const result = await db().query(
      `UPDATE repository_write_plans
          SET status='applied', applied_at=NOW(), applied_branch_name=$2, resulting_head_sha=$3
        WHERE plan_id=$1 AND status='planned'`,
      [planId, branchName, resultingHeadSha],
    );
    if (!result.rowCount) throw new Error("REPOSITORY_WRITE_PLAN_STATE_CHANGED");
  },
  async markChangeRequest(planId, changeRequestId) {
    const result = await db().query(
      `UPDATE repository_write_plans
          SET opened_change_request_id=$2
        WHERE plan_id=$1 AND status='applied' AND opened_change_request_id IS NULL`,
      [planId, changeRequestId],
    );
    if (!result.rowCount) throw new Error("REPOSITORY_WRITE_PLAN_CHANGE_REQUEST_STATE_CHANGED");
  },
  async beginOperation(input) {
    return transaction(async (client) => {
      const existing = await client.query(
        "SELECT request_digest_sha256,status,result FROM repository_write_operations WHERE idempotency_key=$1 FOR UPDATE",
        [input.idempotencyKey],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (String(row.request_digest_sha256) !== input.requestDigest) {
          throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        }
        if (row.status === "completed" && row.result && typeof row.result === "object") {
          return { replay: row.result as WriteOperationResult };
        }
        throw new Error("IDEMPOTENT_OPERATION_IN_PROGRESS");
      }
      await client.query(
        `INSERT INTO repository_write_operations(
          idempotency_key,operation,plan_id,github_repository_id,created_by_github_user_id,
          request_digest_sha256,status
        ) VALUES ($1,$2,$3,$4,$5,$6,'started')`,
        [
          input.idempotencyKey,
          input.operation,
          input.planId,
          input.githubRepositoryId,
          input.githubUserId,
          input.requestDigest,
        ],
      );
      return { replay: null };
    });
  },
  async completeOperation(idempotencyKey, result) {
    await db().query(
      `UPDATE repository_write_operations
          SET status='completed',result=$2::jsonb,completed_at=NOW(),error=NULL
        WHERE idempotency_key=$1`,
      [idempotencyKey, JSON.stringify(result)],
    );
  },
  async failOperation(idempotencyKey, error) {
    await db().query(
      `UPDATE repository_write_operations
          SET status='error',error=$2,completed_at=NOW()
        WHERE idempotency_key=$1`,
      [idempotencyKey, error.slice(0, 500)],
    );
  },
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function safePath(path: unknown): string {
  if (typeof path !== "string") throw new Error("INVALID_REPOSITORY_WRITE_PATH");
  const value = path.trim();
  if (!value || value.length > 512 || value.startsWith("/") || value.includes("\\") || /[\r\n\0]/.test(value)) {
    throw new Error("INVALID_REPOSITORY_WRITE_PATH");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..") || parts[0] === ".git") {
    throw new Error("INVALID_REPOSITORY_WRITE_PATH");
  }
  const lower = value.toLowerCase();
  if (
    lower === ".env"
    || (lower.startsWith(".env.") && lower !== ".env.example")
    || /(^|\/)(id_rsa|id_ed25519|credentials\.json|service-account\.json)$/i.test(value)
    || /\.(pem|p12|pfx|key)$/i.test(value)
  ) {
    throw new Error("SECRET_BEARING_PATH_FORBIDDEN");
  }
  return value;
}

function normalizeCommitMessage(value: unknown): string {
  if (typeof value !== "string") throw new Error("COMMIT_MESSAGE_REQUIRED");
  const message = value.trim();
  if (!message || message.length > 200 || /[\0]/.test(message)) throw new Error("INVALID_COMMIT_MESSAGE");
  return message;
}

function normalizeChanges(input: unknown): RepositoryWriteChangeInput[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_CHANGE_COUNT) {
    throw new Error("INVALID_REPOSITORY_CHANGE_SET");
  }
  const seen = new Set<string>();
  let total = 0;
  return input.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_REPOSITORY_CHANGE_SET");
    const item = raw as Record<string, unknown>;
    const path = safePath(item.path);
    if (seen.has(path)) throw new Error("DUPLICATE_REPOSITORY_WRITE_PATH");
    seen.add(path);
    if (item.action !== "upsert" && item.action !== "delete") throw new Error("INVALID_REPOSITORY_WRITE_ACTION");
    if (item.action === "delete") return { path, action: "delete" as const };
    if (typeof item.content !== "string") throw new Error("REPOSITORY_WRITE_CONTENT_REQUIRED");
    if (
      item.content.includes("-----BEGIN PRIVATE KEY-----")
      || /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/.test(item.content)
      || /AKIA[0-9A-Z]{16}/.test(item.content)
    ) throw new Error("SECRET_LIKE_CONTENT_FORBIDDEN");
    const bytes = Buffer.byteLength(item.content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new Error("REPOSITORY_WRITE_FILE_TOO_LARGE");
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error("REPOSITORY_WRITE_SET_TOO_LARGE");
    return { path, action: "upsert" as const, content: item.content };
  });
}

function assertSha(value: string, code = "IMMUTABLE_HEAD_SHA_REQUIRED"): void {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(code);
}

function assertUserId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("GITHUB_USER_ID_REQUIRED");
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(value)) throw new Error("VALID_IDEMPOTENCY_KEY_REQUIRED");
}

function assertFeatureBranch(value: string, defaultBranch: string): void {
  if (
    !/^anpos\/[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(value)
    || value.includes("..")
    || value.endsWith("/")
    || value === defaultBranch
    || value === `refs/heads/${defaultBranch}`
  ) throw new Error("INVALID_FEATURE_BRANCH");
}

function repositoryId(resolutionId: string): number {
  const match = /^github:(\d+)$/.exec(resolutionId);
  const value = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("GITHUB_REPOSITORY_ID_INVALID");
  return value;
}

function headers(token: string): Record<string, string> {
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) throw new Error("GITHUB_AUTHENTICATION_REQUIRED");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "ANPOS-Repository-Supervisor/0.4.3",
    "Content-Type": "application/json",
  };
}

async function github(
  path: string,
  token: string,
  fetchImpl: FetchLike,
  init: RequestInit = {},
): Promise<Response> {
  return fetchImpl(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

async function json<T>(response: Response, code: string): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new Error(code); }
}

function repoPath(fullName: string): string {
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length) throw new Error("INVALID_CANONICAL_REPOSITORY");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function baseTreeSha(
  fullName: string,
  ref: string,
  token: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const response = await github(`/repos/${repoPath(fullName)}/git/commits/${ref}`, token, fetchImpl);
  if (!response.ok) throw new Error("BASE_COMMIT_LOOKUP_FAILED");
  const commit = await json<{ tree?: { sha?: string } }>(response, "BASE_COMMIT_INVALID");
  const treeSha = commit.tree?.sha;
  if (!treeSha || !/^[0-9a-f]{40}$/i.test(treeSha)) throw new Error("BASE_TREE_INVALID");
  return treeSha;
}

type TreeEntry = { path?: string; mode?: string; type?: string; sha?: string };

async function treeEntries(
  fullName: string,
  treeSha: string,
  token: string,
  fetchImpl: FetchLike,
  cache: Map<string, TreeEntry[]>,
): Promise<TreeEntry[]> {
  const cached = cache.get(treeSha);
  if (cached) return cached;
  const response = await github(`/repos/${repoPath(fullName)}/git/trees/${treeSha}`, token, fetchImpl);
  if (!response.ok) throw new Error("REPOSITORY_TREE_LOOKUP_FAILED");
  const body = await json<{ tree?: TreeEntry[]; truncated?: boolean }>(response, "REPOSITORY_TREE_RESPONSE_INVALID");
  if (body.truncated === true || !Array.isArray(body.tree)) throw new Error("REPOSITORY_TREE_RESPONSE_INVALID");
  cache.set(treeSha, body.tree);
  return body.tree;
}

async function observedBlobState(
  fullName: string,
  path: string,
  rootTreeSha: string,
  token: string,
  fetchImpl: FetchLike,
  cache: Map<string, TreeEntry[]>,
): Promise<{ sha: string; mode: "100644" | "100755" } | null> {
  const parts = path.split("/");
  let treeSha = rootTreeSha;
  for (let index = 0; index < parts.length; index += 1) {
    const entries = await treeEntries(fullName, treeSha, token, fetchImpl, cache);
    const entry = entries.find((candidate) => candidate.path === parts[index]);
    if (!entry) return null;
    const last = index === parts.length - 1;
    if (!last) {
      if (entry.type !== "tree" || !entry.sha || !/^[0-9a-f]{40}$/i.test(entry.sha)) {
        throw new Error("REPOSITORY_WRITE_PATH_COLLISION");
      }
      treeSha = entry.sha;
      continue;
    }
    if (
      entry.type !== "blob"
      || !entry.sha
      || !/^[0-9a-f]{40}$/i.test(entry.sha)
      || !["100644", "100755"].includes(String(entry.mode))
    ) {
      throw new Error("UNSUPPORTED_REPOSITORY_WRITE_TARGET");
    }
    return { sha: entry.sha, mode: entry.mode as "100644" | "100755" };
  }
  return null;
}

async function requireActiveWritableProject(
  repository: string,
  expectedHead: string,
  token: string,
  fetchImpl: FetchLike,
) {
  const audit = await auditGithubRepository(repository, token, fetchImpl);
  if (audit.classification !== "active_project") throw new Error("ACTIVE_ANPOS_PROJECT_REQUIRED");
  if (!audit.write_capability) throw new Error("REPOSITORY_WRITE_PERMISSION_REQUIRED");
  if (!audit.head_sha || audit.head_sha.toLowerCase() !== expectedHead.toLowerCase()) {
    throw new Error("EXPECTED_TARGET_HEAD_MISMATCH");
  }
  return audit;
}

export async function createRepositoryWritePlan(input: {
  repository: string;
  expectedTargetHeadSha: string;
  changes: unknown;
  commitMessage: unknown;
  githubUserId: number;
  billingAccountId: number;
  token: string;
}, store: RepositoryWritePlanStore = databaseWritePlanStore, fetchImpl: FetchLike = fetch) {
  assertUserId(input.githubUserId);
  assertUserId(input.billingAccountId);
  assertSha(input.expectedTargetHeadSha);
  const changes = normalizeChanges(input.changes);
  const commitMessage = normalizeCommitMessage(input.commitMessage);
  const audit = await requireActiveWritableProject(input.repository, input.expectedTargetHeadSha, input.token, fetchImpl);
  const resolutionId = repositoryId(audit.canonical_repository_id);

  const rootTreeSha = await baseTreeSha(audit.full_name, input.expectedTargetHeadSha, input.token, fetchImpl);
  const treeCache = new Map<string, TreeEntry[]>();
  const bound: RepositoryWriteChange[] = [];
  for (const change of changes) {
    const expected = await observedBlobState(
      audit.full_name,
      change.path,
      rootTreeSha,
      input.token,
      fetchImpl,
      treeCache,
    );
    if (change.action === "delete" && expected === null) throw new Error("DELETE_TARGET_NOT_FOUND");
    bound.push({
      ...change,
      expected_blob_sha: expected?.sha ?? null,
      expected_mode: expected?.mode ?? null,
    });
  }

  const planId = randomUUID();
  const digestPayload = {
    repository_id: resolutionId,
    repository_full_name: audit.full_name,
    default_branch: audit.default_branch,
    expected_target_head_sha: input.expectedTargetHeadSha.toLowerCase(),
    created_by_github_user_id: input.githubUserId,
    billing_account_id: input.billingAccountId,
    changes: bound,
    commit_message: commitMessage,
  };
  const plan: RepositoryWritePlan = {
    plan_id: planId,
    github_repository_id: resolutionId,
    repository_full_name: audit.full_name,
    default_branch: audit.default_branch,
    expected_target_head_sha: input.expectedTargetHeadSha.toLowerCase(),
    created_by_github_user_id: input.githubUserId,
    billing_account_id: input.billingAccountId,
    plan_digest_sha256: sha256(canonicalJson(digestPayload)),
    changes: bound,
    commit_message: commitMessage,
    status: "planned",
    expires_at: new Date(Date.now() + PLAN_TTL_MS).toISOString(),
  };
  await store.create(plan);
  return {
    plan_id: plan.plan_id,
    repository_full_name: plan.repository_full_name,
    default_branch: plan.default_branch,
    expected_target_head_sha: plan.expected_target_head_sha,
    plan_digest_sha256: plan.plan_digest_sha256,
    billing_account_id: plan.billing_account_id,
    changes: plan.changes.map((change) => ({
      path: change.path,
      action: change.action,
      expected_blob_sha: change.expected_blob_sha,
      expected_mode: change.expected_mode,
      bytes: Buffer.byteLength(change.content ?? "", "utf8"),
    })),
    commit_message: plan.commit_message,
    safe_to_apply: true,
    expires_at: plan.expires_at,
  };
}

async function loadPlan(planId: string, githubUserId: number, store: RepositoryWritePlanStore): Promise<RepositoryWritePlan> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) throw new Error("VALID_WRITE_PLAN_ID_REQUIRED");
  const plan = await store.get(planId, githubUserId);
  if (!plan) throw new Error("REPOSITORY_WRITE_PLAN_NOT_FOUND");
  return plan;
}

function requestDigest(value: object): string {
  return sha256(canonicalJson(value));
}

async function withIdempotency<T extends WriteOperationResult>(
  store: RepositoryWritePlanStore,
  input: {
    idempotencyKey: string;
    operation: string;
    planId: string | null;
    githubRepositoryId: number;
    githubUserId: number;
    digestPayload: object;
  },
  fn: () => Promise<T>,
): Promise<T> {
  assertIdempotencyKey(input.idempotencyKey);
  const started = await store.beginOperation({
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    planId: input.planId,
    githubRepositoryId: input.githubRepositoryId,
    githubUserId: input.githubUserId,
    requestDigest: requestDigest(input.digestPayload),
  });
  if (started.replay) return started.replay as T;
  try {
    const result = await fn();
    await store.completeOperation(input.idempotencyKey, result);
    return result;
  } catch (error) {
    await store.failOperation(input.idempotencyKey, error instanceof Error ? error.message : "operation_failed");
    throw error;
  }
}

async function assertPlanStillMatches(plan: RepositoryWritePlan, token: string, fetchImpl: FetchLike) {
  const audit = await requireActiveWritableProject(
    plan.repository_full_name,
    plan.expected_target_head_sha,
    token,
    fetchImpl,
  );
  if (repositoryId(audit.canonical_repository_id) !== plan.github_repository_id) {
    throw new Error("REPOSITORY_IDENTITY_CHANGED");
  }
  const rootTreeSha = await baseTreeSha(plan.repository_full_name, plan.expected_target_head_sha, token, fetchImpl);
  const treeCache = new Map<string, TreeEntry[]>();
  for (const change of plan.changes) {
    const observed = await observedBlobState(
      plan.repository_full_name,
      change.path,
      rootTreeSha,
      token,
      fetchImpl,
      treeCache,
    );
    if (
      (observed?.sha ?? null) !== change.expected_blob_sha
      || (observed?.mode ?? null) !== change.expected_mode
    ) throw new Error("REPOSITORY_PATH_PRECONDITION_CHANGED");
  }
  return audit;
}

export async function applyRepositoryWritePlan(input: {
  planId: string;
  branchName: string;
  idempotencyKey: string;
  confirmDeletions: boolean;
  githubUserId: number;
  billingAccountId: number;
  token: string;
}, store: RepositoryWritePlanStore = databaseWritePlanStore, fetchImpl: FetchLike = fetch) {
  assertUserId(input.githubUserId);
  assertUserId(input.billingAccountId);
  const plan = await loadPlan(input.planId, input.githubUserId, store);
  if (plan.billing_account_id !== input.billingAccountId) throw new Error("WRITE_PLAN_BILLING_ACCOUNT_MISMATCH");
  assertFeatureBranch(input.branchName, plan.default_branch);
  if (plan.changes.some((change) => change.action === "delete") && input.confirmDeletions !== true) {
    throw new Error("DELETE_CONFIRMATION_REQUIRED");
  }
  return withIdempotency(store, {
    idempotencyKey: input.idempotencyKey,
    operation: "apply_plan",
    planId: plan.plan_id,
    githubRepositoryId: plan.github_repository_id,
    githubUserId: input.githubUserId,
    digestPayload: {
      plan_id: plan.plan_id,
      billing_account_id: input.billingAccountId,
      branch_name: input.branchName,
      confirm_deletions: input.confirmDeletions,
    },
  }, async () => {
    if (plan.status !== "planned") throw new Error("REPOSITORY_WRITE_PLAN_ALREADY_APPLIED");
    if (new Date(plan.expires_at).getTime() <= Date.now()) throw new Error("REPOSITORY_WRITE_PLAN_EXPIRED");
    await assertPlanStillMatches(plan, input.token, fetchImpl);
    const path = repoPath(plan.repository_full_name);

    const commitResponse = await github(
      `/repos/${path}/git/commits/${plan.expected_target_head_sha}`,
      input.token,
      fetchImpl,
    );
    if (!commitResponse.ok) throw new Error("BASE_COMMIT_LOOKUP_FAILED");
    const baseCommit = await json<{ tree?: { sha?: string } }>(commitResponse, "BASE_COMMIT_INVALID");
    const baseTree = baseCommit.tree?.sha;
    if (!baseTree || !/^[0-9a-f]{40}$/i.test(baseTree)) throw new Error("BASE_TREE_INVALID");

    const tree = plan.changes.map((change) => change.action === "delete"
      ? { path: change.path, mode: change.expected_mode ?? "100644", type: "blob", sha: null }
      : { path: change.path, mode: change.expected_mode ?? "100644", type: "blob", content: change.content ?? "" });

    const treeResponse = await github(`/repos/${path}/git/trees`, input.token, fetchImpl, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree }),
    });
    if (!treeResponse.ok) throw new Error("FEATURE_TREE_CREATE_FAILED");
    const createdTree = await json<{ sha?: string }>(treeResponse, "FEATURE_TREE_RESPONSE_INVALID");
    if (!createdTree.sha || !/^[0-9a-f]{40}$/i.test(createdTree.sha)) throw new Error("FEATURE_TREE_RESPONSE_INVALID");

    const newCommitResponse = await github(`/repos/${path}/git/commits`, input.token, fetchImpl, {
      method: "POST",
      body: JSON.stringify({
        message: plan.commit_message,
        tree: createdTree.sha,
        parents: [plan.expected_target_head_sha],
      }),
    });
    if (!newCommitResponse.ok) throw new Error("FEATURE_COMMIT_CREATE_FAILED");
    const newCommit = await json<{ sha?: string }>(newCommitResponse, "FEATURE_COMMIT_RESPONSE_INVALID");
    if (!newCommit.sha || !/^[0-9a-f]{40}$/i.test(newCommit.sha)) throw new Error("FEATURE_COMMIT_RESPONSE_INVALID");

    const refResponse = await github(`/repos/${path}/git/refs`, input.token, fetchImpl, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${input.branchName}`, sha: newCommit.sha }),
    });
    if (refResponse.status === 422) throw new Error("FEATURE_BRANCH_ALREADY_EXISTS");
    if (!refResponse.ok) throw new Error("FEATURE_BRANCH_CREATE_FAILED");

    const verify = await github(
      `/repos/${path}/branches/${encodeURIComponent(input.branchName)}`,
      input.token,
      fetchImpl,
    );
    if (!verify.ok) throw new Error("FEATURE_BRANCH_VERIFICATION_FAILED");
    const verified = await json<{ commit?: { sha?: string } }>(verify, "FEATURE_BRANCH_VERIFICATION_INVALID");
    if (verified.commit?.sha !== newCommit.sha) throw new Error("FEATURE_BRANCH_VERIFICATION_MISMATCH");

    await store.markApplied(plan.plan_id, input.branchName, newCommit.sha);
    return {
      plan_id: plan.plan_id,
      branch_name: input.branchName,
      base_head_sha: plan.expected_target_head_sha,
      resulting_head_sha: newCommit.sha,
      applied_paths: plan.changes.map((change) => change.path),
      verification: "provider_branch_reread_match",
    };
  });
}
async function resolveForWrite(repository: string, token: string, fetchImpl: FetchLike) {
  const audit = await auditGithubRepository(repository, token, fetchImpl);
  if (audit.classification !== "active_project") throw new Error("ACTIVE_ANPOS_PROJECT_REQUIRED");
  if (!audit.write_capability) throw new Error("REPOSITORY_WRITE_PERMISSION_REQUIRED");
  return audit;
}

export async function openRepositoryChangeRequest(input: {
  repository: string;
  planId: string;
  headBranch: string;
  expectedHeadSha: string;
  title: string;
  body: string;
  idempotencyKey: string;
  githubUserId: number;
  billingAccountId: number;
  token: string;
}, store: RepositoryWritePlanStore = databaseWritePlanStore, fetchImpl: FetchLike = fetch) {
  assertUserId(input.githubUserId);
  assertUserId(input.billingAccountId);
  assertSha(input.expectedHeadSha);
  const plan = await store.get(input.planId, input.githubUserId);
  if (!plan || plan.status !== "applied") throw new Error("APPLIED_WRITE_PLAN_REQUIRED");
  if (plan.billing_account_id !== input.billingAccountId) throw new Error("WRITE_PLAN_BILLING_ACCOUNT_MISMATCH");
  if (plan.branch_name !== input.headBranch || plan.resulting_head_sha?.toLowerCase() !== input.expectedHeadSha.toLowerCase()) {
    throw new Error("APPLIED_PLAN_BRANCH_BINDING_MISMATCH");
  }
  assertFeatureBranch(input.headBranch, plan.default_branch);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body : "";
  if (!title || title.length > 256 || body.length > 64_000) throw new Error("INVALID_CHANGE_REQUEST_METADATA");

  return withIdempotency(store, {
    idempotencyKey: input.idempotencyKey,
    operation: "open_change_request",
    planId: plan.plan_id,
    githubRepositoryId: plan.github_repository_id,
    githubUserId: input.githubUserId,
    digestPayload: {
      plan_id: plan.plan_id,
      billing_account_id: input.billingAccountId,
      head_branch: input.headBranch,
      expected_head_sha: input.expectedHeadSha.toLowerCase(),
      title,
      body,
    },
  }, async () => {
    if (plan.change_request_id != null) throw new Error("WRITE_PLAN_CHANGE_REQUEST_ALREADY_OPENED");
    const audit = await resolveForWrite(input.repository, input.token, fetchImpl);
    if (repositoryId(audit.canonical_repository_id) !== plan.github_repository_id) throw new Error("REPOSITORY_IDENTITY_MISMATCH");
    if (audit.default_branch !== plan.default_branch || audit.head_sha?.toLowerCase() !== plan.expected_target_head_sha.toLowerCase()) {
      throw new Error("EXPECTED_TARGET_HEAD_MISMATCH");
    }

    const path = repoPath(audit.full_name);
    const branch = await github(
      `/repos/${path}/branches/${encodeURIComponent(input.headBranch)}`,
      input.token,
      fetchImpl,
    );
    if (!branch.ok) throw new Error("FEATURE_BRANCH_LOOKUP_FAILED");
    const branchData = await json<{ commit?: { sha?: string } }>(branch, "FEATURE_BRANCH_LOOKUP_INVALID");
    if (branchData.commit?.sha?.toLowerCase() !== input.expectedHeadSha.toLowerCase()) {
      throw new Error("EXPECTED_FEATURE_HEAD_MISMATCH");
    }

    const response = await github(`/repos/${path}/pulls`, input.token, fetchImpl, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        head: input.headBranch,
        base: audit.default_branch,
      }),
    });
    if (!response.ok) throw new Error("CHANGE_REQUEST_CREATE_FAILED");
    const created = await json<{
      number?: number;
      html_url?: string;
      head?: { sha?: string };
      base?: { sha?: string; ref?: string };
    }>(response, "CHANGE_REQUEST_RESPONSE_INVALID");
    if (!Number.isSafeInteger(created.number) || !created.html_url || created.head?.sha !== input.expectedHeadSha) {
      throw new Error("CHANGE_REQUEST_RESPONSE_INVALID");
    }
    await store.markChangeRequest(plan.plan_id, Number(created.number));
    return {
      change_request_id: Number(created.number),
      url: created.html_url,
      head_sha: created.head.sha,
      base_sha: created.base?.sha ?? null,
      base_branch: created.base?.ref ?? audit.default_branch,
    };
  });
}

export async function getRepositoryChangeRequest(input: {
  repository: string;
  changeRequestId: number;
  token: string;
}, fetchImpl: FetchLike = fetch) {
  const audit = await resolveForWrite(input.repository, input.token, fetchImpl);
  if (!Number.isSafeInteger(input.changeRequestId) || input.changeRequestId <= 0) throw new Error("VALID_CHANGE_REQUEST_ID_REQUIRED");
  const response = await github(
    `/repos/${repoPath(audit.full_name)}/pulls/${input.changeRequestId}`,
    input.token,
    fetchImpl,
  );
  if (!response.ok) throw new Error("CHANGE_REQUEST_LOOKUP_FAILED");
  const pull = await json<any>(response, "CHANGE_REQUEST_RESPONSE_INVALID");
  return {
    change_request_id: input.changeRequestId,
    state: String(pull.state ?? "unknown"),
    draft: pull.draft === true,
    head_sha: String(pull.head?.sha ?? ""),
    head_branch: String(pull.head?.ref ?? ""),
    base_sha: String(pull.base?.sha ?? ""),
    base_branch: String(pull.base?.ref ?? ""),
    mergeable: pull.mergeable === true,
    mergeability: String(pull.mergeable_state ?? "unknown"),
    html_url: typeof pull.html_url === "string" ? pull.html_url : null,
  };
}

export async function getRepositoryCi(input: {
  repository: string;
  commitSha: string;
  token: string;
}, fetchImpl: FetchLike = fetch) {
  assertSha(input.commitSha, "VALID_COMMIT_SHA_REQUIRED");
  const normalized = normalizeGithubRepositoryLocator(input.repository);
  const response = await github(
    `/repos/${repoPath(normalized.full_name)}/commits/${input.commitSha}/check-runs?per_page=100`,
    input.token,
    fetchImpl,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!response.ok) throw new Error("CHECK_RUN_LOOKUP_FAILED");
  const body = await json<{ check_runs?: any[] }>(response, "CHECK_RUN_RESPONSE_INVALID");
  const checks = Array.isArray(body.check_runs) ? body.check_runs.map((check) => ({
    id: Number(check.id),
    name: String(check.name ?? ""),
    status: String(check.status ?? "unknown"),
    conclusion: check.conclusion == null ? null : String(check.conclusion),
    html_url: typeof check.html_url === "string" ? check.html_url : null,
  })) : [];
  const terminalAllowed = new Set(["success", "neutral", "skipped"]);
  const pending = checks.filter((check) => check.status !== "completed").length;
  const failed = checks.filter((check) => check.status === "completed" && !terminalAllowed.has(check.conclusion ?? "")).length;
  return {
    commit_sha: input.commitSha.toLowerCase(),
    overall_state: checks.length === 0 ? "unconfigured" : failed > 0 ? "failed" : pending > 0 ? "pending" : "green",
    checks_configured: checks.length > 0,
    checks,
  };
}

export async function mergeRepositoryChangeRequest(input: {
  repository: string;
  planId: string;
  billingAccountId: number;
  changeRequestId: number;
  expectedHeadSha: string;
  mergeMethod: "merge" | "squash" | "rebase";
  confirmMerge: boolean;
  idempotencyKey: string;
  githubUserId: number;
  token: string;
}, store: RepositoryWritePlanStore = databaseWritePlanStore, fetchImpl: FetchLike = fetch) {
  assertUserId(input.githubUserId);
  assertUserId(input.billingAccountId);
  assertSha(input.expectedHeadSha);
  if (!Number.isSafeInteger(input.changeRequestId) || input.changeRequestId <= 0) throw new Error("VALID_CHANGE_REQUEST_ID_REQUIRED");
  if (!["merge", "squash", "rebase"].includes(input.mergeMethod)) throw new Error("INVALID_MERGE_METHOD");
  if (input.confirmMerge !== true) throw new Error("MERGE_CONFIRMATION_REQUIRED");

  const plan = await loadPlan(input.planId, input.githubUserId, store);
  if (plan.status !== "applied") throw new Error("APPLIED_WRITE_PLAN_REQUIRED");
  if (plan.billing_account_id !== input.billingAccountId) throw new Error("WRITE_PLAN_BILLING_ACCOUNT_MISMATCH");
  if (plan.change_request_id !== input.changeRequestId) throw new Error("WRITE_PLAN_CHANGE_REQUEST_MISMATCH");
  if (plan.resulting_head_sha?.toLowerCase() !== input.expectedHeadSha.toLowerCase()) {
    throw new Error("APPLIED_PLAN_BRANCH_BINDING_MISMATCH");
  }

  return withIdempotency(store, {
    idempotencyKey: input.idempotencyKey,
    operation: "merge_change_request",
    planId: plan.plan_id,
    githubRepositoryId: plan.github_repository_id,
    githubUserId: input.githubUserId,
    digestPayload: {
      repository_id: plan.github_repository_id,
      plan_id: plan.plan_id,
      billing_account_id: input.billingAccountId,
      change_request_id: input.changeRequestId,
      expected_head_sha: input.expectedHeadSha.toLowerCase(),
      merge_method: input.mergeMethod,
      confirm_merge: true,
    },
  }, async () => {
    const audit = await resolveForWrite(input.repository, input.token, fetchImpl);
    if (repositoryId(audit.canonical_repository_id) !== plan.github_repository_id) {
      throw new Error("REPOSITORY_IDENTITY_MISMATCH");
    }

    const current = await getRepositoryChangeRequest({
      repository: audit.full_name,
      changeRequestId: input.changeRequestId,
      token: input.token,
    }, fetchImpl);
    if (current.state !== "open" || current.draft) throw new Error("CHANGE_REQUEST_NOT_MERGE_READY");
    if (current.head_sha.toLowerCase() !== input.expectedHeadSha.toLowerCase()) throw new Error("EXPECTED_CHANGE_REQUEST_HEAD_MISMATCH");
    if (current.head_branch !== plan.branch_name) throw new Error("WRITE_PLAN_CHANGE_REQUEST_BRANCH_MISMATCH");
    if (current.base_branch !== audit.default_branch) throw new Error("CHANGE_REQUEST_BASE_MISMATCH");
    if (!current.mergeable || current.mergeability !== "clean") throw new Error("CHANGE_REQUEST_POLICY_NOT_SATISFIED");

    const ci = await getRepositoryCi({
      repository: audit.full_name,
      commitSha: input.expectedHeadSha,
      token: input.token,
    }, fetchImpl);
    if (!ci.checks_configured || ci.overall_state !== "green") throw new Error("CHANGE_REQUEST_CHECKS_NOT_GREEN");

    const path = repoPath(audit.full_name);
    const response = await github(`/repos/${path}/pulls/${input.changeRequestId}/merge`, input.token, fetchImpl, {
      method: "PUT",
      body: JSON.stringify({
        sha: input.expectedHeadSha,
        merge_method: input.mergeMethod,
      }),
    });
    const result = await json<{ merged?: boolean; sha?: string; message?: string }>(response, "CHANGE_REQUEST_MERGE_RESPONSE_INVALID");
    if (!response.ok || result.merged !== true || !result.sha || !/^[0-9a-f]{40}$/i.test(result.sha)) {
      throw new Error("CHANGE_REQUEST_MERGE_REJECTED");
    }

    const verify = await github(
      `/repos/${path}/branches/${encodeURIComponent(audit.default_branch)}`,
      input.token,
      fetchImpl,
    );
    if (!verify.ok) throw new Error("RESULTING_DEFAULT_BRANCH_LOOKUP_FAILED");
    const verified = await json<{ commit?: { sha?: string } }>(verify, "RESULTING_DEFAULT_BRANCH_INVALID");
    if (!verified.commit?.sha || !/^[0-9a-f]{40}$/i.test(verified.commit.sha)) {
      throw new Error("RESULTING_DEFAULT_BRANCH_INVALID");
    }
    return {
      merged: true,
      merge_commit_sha: result.sha,
      resulting_default_branch_head_sha: verified.commit.sha,
      policy_precheck: {
        mergeability: current.mergeability,
        checks_state: ci.overall_state,
        checks_configured: ci.checks_configured,
      },
    };
  });
}
