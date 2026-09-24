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
  normalizeGithubRepositoryLocator,
  resolveGithubRepository,
  RepositorySupervisorError,
  type RepositoryResolution,
} from "./repository-supervisor-runtime";

const GITHUB_API = "https://api.github.com";
const CANONICAL_REPOSITORY = "Vertex-Systems-Network/ai-native-project-operating-system";
const PLAN_TTL_SECONDS = 30 * 60;
const MAX_CHANGES = 24;
const MAX_FILE_BYTES = 256_000;
const MAX_TOTAL_BYTES = 1_000_000;
const PAYLOAD_VERSION = 1;

type FetchLike = typeof fetch;

export type PlannedChange = {
  path: string;
  operation: "upsert" | "delete";
  content?: string;
};

type StoredPlanPayload = {
  v: 1;
  mode: "bounded_change";
  commit_message: string;
  changes: Array<{
    path: string;
    operation: "upsert" | "delete";
    content: string | null;
    content_sha256: string | null;
    bytes: number;
  }>;
};

export type WritePlanSummary = {
  plan_id: string;
  plan_hash: string;
  mode: "bounded_change";
  canonical_repository_id: string;
  repository_full_name: string;
  default_branch: string;
  expected_target_head_sha: string;
  expires_at: string;
  safe_to_apply: true;
  changes: Array<{
    path: string;
    operation: "upsert" | "delete";
    content_sha256: string | null;
    bytes: number;
  }>;
};

type PlanRow = {
  plan_id: string;
  github_user_id: string | number;
  github_login: string;
  billing_account_id: string | number;
  canonical_repository_id: string;
  repository_full_name: string;
  default_branch: string;
  expected_target_head_sha: string;
  mode: string;
  plan_hash: string;
  payload_ciphertext: string;
  status: string;
  applied_branch: string | null;
  applied_head_sha: string | null;
  pull_request_number: string | number | null;
  merge_commit_sha: string | null;
  expires_at: Date | string;
};

type GithubCommit = { sha?: string; tree?: { sha?: string } };
type GithubBlob = { sha?: string };
type GithubTree = { sha?: string };
type GithubPull = {
  number?: number;
  state?: string;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  head?: { sha?: string; ref?: string };
  base?: { sha?: string; ref?: string };
  html_url?: string;
};
type GithubCheckRuns = {
  total_count?: number;
  check_runs?: Array<{
    name?: string;
    status?: string;
    conclusion?: string | null;
    html_url?: string;
  }>;
};
type GithubStatus = {
  state?: string;
  statuses?: Array<{
    context?: string;
    state?: string;
    target_url?: string | null;
  }>;
};
type GithubMerge = { merged?: boolean; message?: string; sha?: string };

function secretKey(): Buffer {
  return createHash("sha256")
    .update(supervisorAppConfig().sessionSecret, "utf8")
    .update("\0repository-supervisor-write-plan", "utf8")
    .digest();
}

function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([PAYLOAD_VERSION]), iv, tag, encrypted]).toString("base64url");
}

function unseal(value: string): string {
  let raw: Buffer;
  try { raw = Buffer.from(value, "base64url"); }
  catch { throw new Error("WRITE_PLAN_PAYLOAD_INVALID"); }
  if (raw.length < 31 || raw[0] !== PAYLOAD_VERSION) throw new Error("WRITE_PLAN_PAYLOAD_INVALID");
  try {
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), raw.subarray(1, 13));
    decipher.setAuthTag(raw.subarray(13, 29));
    return Buffer.concat([decipher.update(raw.subarray(29)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("WRITE_PLAN_PAYLOAD_INVALID");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safePath(path: string): boolean {
  if (!path || path.length > 512 || path.startsWith("/") || path.includes("\\") || /[\r\n\0]/.test(path)) return false;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return false;
  const lower = path.toLowerCase();
  if (
    lower === ".env"
    || lower.startsWith(".env.")
    || lower.startsWith(".git/")
    || lower.startsWith(".github/workflows/")
    || lower === ".github/codeowners"
    || lower.startsWith("commercial-service/")
    || lower.startsWith("blueprints/commercial/")
    || lower.startsWith("blueprints/plugins/")
  ) return false;
  return true;
}

function rejectSecretMaterial(content: string): void {
  const forbidden = [
    /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/,
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i,
  ];
  if (forbidden.some((pattern) => pattern.test(content))) {
    throw new RepositorySupervisorError(422, "planned_change_contains_secret_material");
  }
}

export function validatePlannedChanges(changes: PlannedChange[]): StoredPlanPayload["changes"] {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > MAX_CHANGES) {
    throw new RepositorySupervisorError(400, "invalid_planned_changes");
  }
  const seen = new Set<string>();
  let total = 0;
  const normalized = changes.map((change) => {
    const path = typeof change?.path === "string" ? change.path.trim() : "";
    if (!safePath(path) || seen.has(path)) throw new RepositorySupervisorError(400, "invalid_planned_change_path");
    seen.add(path);
    if (change.operation === "delete") {
      return { path, operation: "delete" as const, content: null, content_sha256: null, bytes: 0 };
    }
    if (change.operation !== "upsert" || typeof change.content !== "string") {
      throw new RepositorySupervisorError(400, "invalid_planned_change");
    }
    const bytes = Buffer.byteLength(change.content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new RepositorySupervisorError(413, "planned_file_too_large");
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new RepositorySupervisorError(413, "planned_change_set_too_large");
    rejectSecretMaterial(change.content);
    return {
      path,
      operation: "upsert" as const,
      content: change.content,
      content_sha256: sha256(change.content),
      bytes,
    };
  });
  return normalized.sort((a, b) => a.path.localeCompare(b.path));
}

function commitMessage(value: unknown): string {
  if (typeof value !== "string") throw new RepositorySupervisorError(400, "commit_message_required");
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || /[\r\n\0]/.test(normalized)) {
    throw new RepositorySupervisorError(400, "invalid_commit_message");
  }
  return normalized;
}

export function validateFeatureBranchName(value: unknown, defaultBranch: string): string {
  if (typeof value !== "string") throw new RepositorySupervisorError(400, "branch_name_required");
  const normalized = value.trim();
  if (
    !/^anpos\/[a-z0-9](?:[a-z0-9._-]{1,79})$/.test(normalized)
    || normalized === defaultBranch
    || normalized.endsWith(".")
    || normalized.includes("..")
  ) throw new RepositorySupervisorError(400, "invalid_feature_branch_name");
  return normalized;
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,100}$/.test(value)) {
    throw new RepositorySupervisorError(400, "valid_idempotency_key_required");
  }
  return value;
}

function assertWriteTarget(resolution: RepositoryResolution): void {
  if (resolution.full_name.toLowerCase() === CANONICAL_REPOSITORY.toLowerCase()) {
    throw new RepositorySupervisorError(403, "canonical_source_write_forbidden");
  }
  if (resolution.archived) throw new RepositorySupervisorError(409, "archived_repository_write_forbidden");
  if (!resolution.write_capability) throw new RepositorySupervisorError(403, "repository_write_permission_required");
  if (!resolution.head_sha) throw new RepositorySupervisorError(409, "empty_repository_write_not_supported_by_bounded_change");
}

async function githubRequest(
  method: string,
  path: string,
  token: string,
  fetchImpl: FetchLike,
  body?: unknown,
): Promise<Response> {
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new RepositorySupervisorError(401, "github_authentication_required");
  }
  return fetchImpl(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "ANPOS-Repository-Supervisor/0.4",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

async function json<T>(response: Response, code: string): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new RepositorySupervisorError(502, code); }
}

async function loadPlan(
  planId: string,
  githubUserId: number,
  billingAccountId: number,
  forUpdate = false,
): Promise<PlanRow> {
  if (!/^[0-9a-f-]{36}$/.test(planId)) throw new RepositorySupervisorError(400, "invalid_plan_id");
  const suffix = forUpdate ? " FOR UPDATE" : "";
  const result = await db().query(
    `SELECT * FROM repository_supervisor_write_plans
      WHERE plan_id=$1 AND github_user_id=$2 AND billing_account_id=$3${suffix}`,
    [planId, githubUserId, billingAccountId],
  );
  if (!result.rowCount) throw new RepositorySupervisorError(404, "write_plan_not_found");
  const row = result.rows[0] as PlanRow;
  if (new Date(row.expires_at).getTime() <= Date.now() && row.status === "planned") {
    throw new RepositorySupervisorError(410, "write_plan_expired");
  }
  return row;
}

function decodePayload(row: PlanRow): StoredPlanPayload {
  let payload: StoredPlanPayload;
  try { payload = JSON.parse(unseal(row.payload_ciphertext)) as StoredPlanPayload; }
  catch { throw new RepositorySupervisorError(500, "write_plan_payload_invalid"); }
  if (payload.v !== 1 || payload.mode !== "bounded_change" || !Array.isArray(payload.changes)) {
    throw new RepositorySupervisorError(500, "write_plan_payload_invalid");
  }
  return payload;
}

async function idempotentResult(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number | null; rows: any[] }> },
  key: string,
  planId: string,
  operation: string,
): Promise<unknown | null> {
  const existing = await client.query(
    "SELECT result FROM repository_supervisor_write_idempotency WHERE idempotency_key=$1",
    [key],
  );
  if (!existing.rowCount) return null;
  const row = existing.rows[0];
  const owner = await client.query(
    "SELECT plan_id,operation FROM repository_supervisor_write_idempotency WHERE idempotency_key=$1",
    [key],
  );
  if (String(owner.rows[0]?.plan_id) !== planId || String(owner.rows[0]?.operation) !== operation) {
    throw new RepositorySupervisorError(409, "idempotency_key_conflict");
  }
  return row.result;
}

async function recordIdempotent(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  key: string,
  planId: string,
  operation: string,
  result: object,
): Promise<void> {
  await client.query(
    `INSERT INTO repository_supervisor_write_idempotency(idempotency_key,plan_id,operation,result)
      VALUES ($1,$2,$3,$4::jsonb)`,
    [key, planId, operation, JSON.stringify(result)],
  );
}

export async function createGithubWritePlan(input: {
  repository_url: unknown;
  expected_target_head_sha: unknown;
  commit_message: unknown;
  changes: PlannedChange[];
}, principal: { id: number; login: string }, billingAccountId: number, token: string, fetchImpl: FetchLike = fetch): Promise<WritePlanSummary> {
  const expected = typeof input.expected_target_head_sha === "string" ? input.expected_target_head_sha.trim() : "";
  if (!/^[0-9a-f]{40}$/i.test(expected)) throw new RepositorySupervisorError(400, "expected_target_head_sha_required");
  const resolution = await resolveGithubRepository(input.repository_url, token, fetchImpl);
  assertWriteTarget(resolution);
  if (resolution.head_sha?.toLowerCase() !== expected.toLowerCase()) {
    throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
  }

  const changes = validatePlannedChanges(input.changes);
  const payload: StoredPlanPayload = {
    v: 1,
    mode: "bounded_change",
    commit_message: commitMessage(input.commit_message),
    changes,
  };
  const planHash = sha256(stableJson({
    canonical_repository_id: resolution.canonical_repository_id,
    repository_full_name: resolution.full_name,
    default_branch: resolution.default_branch,
    expected_target_head_sha: expected.toLowerCase(),
    payload,
  }));
  const planId = randomUUID();
  const expiresAt = new Date(Date.now() + PLAN_TTL_SECONDS * 1000);
  await db().query(
    `INSERT INTO repository_supervisor_write_plans(
      plan_id,github_user_id,github_login,billing_account_id,canonical_repository_id,
      repository_full_name,default_branch,expected_target_head_sha,mode,plan_hash,
      payload_ciphertext,status,expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'bounded_change',$9,$10,'planned',$11)`,
    [
      planId,
      principal.id,
      principal.login,
      billingAccountId,
      resolution.canonical_repository_id,
      resolution.full_name,
      resolution.default_branch,
      expected.toLowerCase(),
      planHash,
      seal(JSON.stringify(payload)),
      expiresAt,
    ],
  );
  return {
    plan_id: planId,
    plan_hash: planHash,
    mode: "bounded_change",
    canonical_repository_id: resolution.canonical_repository_id,
    repository_full_name: resolution.full_name,
    default_branch: resolution.default_branch,
    expected_target_head_sha: expected.toLowerCase(),
    expires_at: expiresAt.toISOString(),
    safe_to_apply: true,
    changes: changes.map(({ path, operation, content_sha256, bytes }) => ({ path, operation, content_sha256, bytes })),
  };
}

export async function applyGithubWritePlan(input: {
  plan_id: string;
  plan_hash: string;
  branch_name: unknown;
  idempotency_key: unknown;
}, principal: { id: number; login: string }, billingAccountId: number, token: string, fetchImpl: FetchLike = fetch) {
  const key = idempotencyKey(input.idempotency_key);
  const row = await loadPlan(input.plan_id, principal.id, billingAccountId);
  if (row.plan_hash !== input.plan_hash) throw new RepositorySupervisorError(409, "write_plan_hash_mismatch");
  if (row.status !== "planned") {
    if (row.status === "applied" || row.status === "pr_open" || row.status === "merged") {
      return {
        plan_id: row.plan_id,
        branch_name: row.applied_branch,
        resulting_head_sha: row.applied_head_sha,
        status: row.status,
      };
    }
    throw new RepositorySupervisorError(409, "write_plan_not_applicable");
  }
  const payload = decodePayload(row);
  const branch = validateFeatureBranchName(input.branch_name, row.default_branch);
  const resolution = await resolveGithubRepository(row.repository_full_name, token, fetchImpl);
  assertWriteTarget(resolution);
  if (
    resolution.canonical_repository_id !== row.canonical_repository_id
    || resolution.default_branch !== row.default_branch
    || resolution.head_sha?.toLowerCase() !== row.expected_target_head_sha.toLowerCase()
  ) throw new RepositorySupervisorError(409, "target_head_changed_replan_required");

  const [owner, repo] = row.repository_full_name.split("/", 2);
  const baseCommitResponse = await githubRequest(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${row.expected_target_head_sha}`,
    token,
    fetchImpl,
  );
  if (!baseCommitResponse.ok) throw new RepositorySupervisorError(502, "github_base_commit_lookup_failed");
  const baseCommit = await json<GithubCommit>(baseCommitResponse, "github_base_commit_invalid");
  const baseTree = baseCommit.tree?.sha;
  if (!baseTree || !/^[0-9a-f]{40}$/i.test(baseTree)) throw new RepositorySupervisorError(502, "github_base_tree_invalid");

  const treeEntries: Array<Record<string, unknown>> = [];
  for (const change of payload.changes) {
    if (change.operation === "delete") {
      treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blobResponse = await githubRequest(
      "POST",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`,
      token,
      fetchImpl,
      { content: change.content, encoding: "utf-8" },
    );
    if (!blobResponse.ok) throw new RepositorySupervisorError(502, "github_blob_create_failed");
    const blob = await json<GithubBlob>(blobResponse, "github_blob_response_invalid");
    if (!blob.sha || !/^[0-9a-f]{40}$/i.test(blob.sha)) throw new RepositorySupervisorError(502, "github_blob_response_invalid");
    treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const treeResponse = await githubRequest(
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`,
    token,
    fetchImpl,
    { base_tree: baseTree, tree: treeEntries },
  );
  if (!treeResponse.ok) throw new RepositorySupervisorError(502, "github_tree_create_failed");
  const tree = await json<GithubTree>(treeResponse, "github_tree_response_invalid");
  if (!tree.sha || !/^[0-9a-f]{40}$/i.test(tree.sha)) throw new RepositorySupervisorError(502, "github_tree_response_invalid");

  const commitResponse = await githubRequest(
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`,
    token,
    fetchImpl,
    { message: payload.commit_message, tree: tree.sha, parents: [row.expected_target_head_sha] },
  );
  if (!commitResponse.ok) throw new RepositorySupervisorError(502, "github_commit_create_failed");
  const commit = await json<GithubCommit>(commitResponse, "github_commit_response_invalid");
  if (!commit.sha || !/^[0-9a-f]{40}$/i.test(commit.sha)) throw new RepositorySupervisorError(502, "github_commit_response_invalid");

  const beforeRef = await resolveGithubRepository(row.repository_full_name, token, fetchImpl);
  if (beforeRef.head_sha?.toLowerCase() !== row.expected_target_head_sha.toLowerCase()) {
    throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
  }

  const refResponse = await githubRequest(
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
    token,
    fetchImpl,
    { ref: `refs/heads/${branch}`, sha: commit.sha },
  );
  if (refResponse.status === 422) throw new RepositorySupervisorError(409, "feature_branch_already_exists");
  if (!refResponse.ok) throw new RepositorySupervisorError(502, "github_feature_branch_create_failed");

  const result = {
    plan_id: row.plan_id,
    branch_name: branch,
    resulting_head_sha: commit.sha,
    applied_paths: payload.changes.map((change) => change.path),
    expected_target_head_sha: row.expected_target_head_sha,
    status: "applied",
  };

  await transaction(async (client) => {
    const prior = await idempotentResult(client, key, row.plan_id, "apply");
    if (prior) return;
    await client.query(
      `UPDATE repository_supervisor_write_plans
        SET status='applied',applied_branch=$2,applied_head_sha=$3,updated_at=NOW()
        WHERE plan_id=$1 AND status='planned'`,
      [row.plan_id, branch, commit.sha],
    );
    await recordIdempotent(client, key, row.plan_id, "apply", result);
  });
  return result;
}

export async function openGithubWritePlanPullRequest(input: {
  plan_id: string;
  expected_head_sha: string;
  title: string;
  body: string;
  idempotency_key: unknown;
}, principal: { id: number; login: string }, billingAccountId: number, token: string, fetchImpl: FetchLike = fetch) {
  const key = idempotencyKey(input.idempotency_key);
  const row = await loadPlan(input.plan_id, principal.id, billingAccountId);
  if (!["applied", "pr_open"].includes(row.status) || !row.applied_branch || !row.applied_head_sha) {
    throw new RepositorySupervisorError(409, "write_plan_not_applied");
  }
  if (input.expected_head_sha !== row.applied_head_sha) throw new RepositorySupervisorError(409, "planned_branch_head_mismatch");
  if (row.pull_request_number) {
    return { plan_id: row.plan_id, pull_request_number: Number(row.pull_request_number), head_sha: row.applied_head_sha, status: row.status };
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!title || title.length > 200 || /[\r\n\0]/.test(title) || body.length > 20_000 || /\0/.test(body)) {
    throw new RepositorySupervisorError(400, "invalid_pull_request_metadata");
  }

  const [owner, repo] = row.repository_full_name.split("/", 2);
  const response = await githubRequest(
    "POST",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    token,
    fetchImpl,
    { title, body, head: row.applied_branch, base: row.default_branch },
  );
  if (!response.ok) throw new RepositorySupervisorError(502, "github_pull_request_create_failed");
  const pull = await json<GithubPull>(response, "github_pull_request_response_invalid");
  if (!Number.isSafeInteger(pull.number) || !pull.number || pull.head?.sha !== row.applied_head_sha) {
    throw new RepositorySupervisorError(502, "github_pull_request_response_invalid");
  }
  const result = {
    plan_id: row.plan_id,
    pull_request_number: pull.number,
    url: pull.html_url ?? null,
    head_sha: pull.head.sha,
    base_branch: row.default_branch,
    status: "pr_open",
  };
  await transaction(async (client) => {
    const prior = await idempotentResult(client, key, row.plan_id, "open_pr");
    if (prior) return;
    await client.query(
      "UPDATE repository_supervisor_write_plans SET status='pr_open',pull_request_number=$2,updated_at=NOW() WHERE plan_id=$1",
      [row.plan_id, pull.number],
    );
    await recordIdempotent(client, key, row.plan_id, "open_pr", result);
  });
  return result;
}

export async function getGithubWritePlanPullRequest(
  planId: string,
  principal: { id: number; login: string },
  billingAccountId: number,
  token: string,
  fetchImpl: FetchLike = fetch,
) {
  const row = await loadPlan(planId, principal.id, billingAccountId);
  if (!row.pull_request_number) throw new RepositorySupervisorError(404, "write_plan_pull_request_not_found");
  const [owner, repo] = row.repository_full_name.split("/", 2);
  const response = await githubRequest(
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${Number(row.pull_request_number)}`,
    token,
    fetchImpl,
  );
  if (!response.ok) throw new RepositorySupervisorError(502, "github_pull_request_lookup_failed");
  const pull = await json<GithubPull>(response, "github_pull_request_response_invalid");
  return {
    plan_id: row.plan_id,
    pull_request_number: Number(row.pull_request_number),
    state: pull.state ?? "unknown",
    merged: pull.merged === true,
    mergeable: pull.mergeable ?? null,
    mergeable_state: pull.mergeable_state ?? null,
    head_sha: pull.head?.sha ?? null,
    base_branch: pull.base?.ref ?? null,
    base_sha: pull.base?.sha ?? null,
    url: pull.html_url ?? null,
  };
}

export async function getGithubWritePlanCi(
  planId: string,
  commitSha: string,
  principal: { id: number; login: string },
  billingAccountId: number,
  token: string,
  fetchImpl: FetchLike = fetch,
) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new RepositorySupervisorError(400, "valid_commit_sha_required");
  const row = await loadPlan(planId, principal.id, billingAccountId);
  if (row.applied_head_sha !== commitSha) throw new RepositorySupervisorError(409, "planned_branch_head_mismatch");
  const [owner, repo] = row.repository_full_name.split("/", 2);
  const [checksResponse, statusResponse] = await Promise.all([
    githubRequest("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${commitSha}/check-runs`, token, fetchImpl),
    githubRequest("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${commitSha}/status`, token, fetchImpl),
  ]);
  if (!checksResponse.ok || !statusResponse.ok) throw new RepositorySupervisorError(502, "github_ci_lookup_failed");
  const checks = await json<GithubCheckRuns>(checksResponse, "github_check_runs_invalid");
  const statuses = await json<GithubStatus>(statusResponse, "github_status_response_invalid");
  const runs = Array.isArray(checks.check_runs) ? checks.check_runs : [];
  const legacy = Array.isArray(statuses.statuses) ? statuses.statuses : [];
  const checkGreen = runs.length > 0 && runs.every((run) =>
    run.status === "completed" && ["success", "neutral", "skipped"].includes(String(run.conclusion))
  );
  const legacyGreen = legacy.length === 0 || statuses.state === "success";
  return {
    plan_id: row.plan_id,
    commit_sha: commitSha,
    overall_state: checkGreen && legacyGreen ? "success" : runs.some((run) => run.status !== "completed") || statuses.state === "pending" ? "pending" : "failure",
    checks: runs.map((run) => ({ name: run.name ?? "unknown", status: run.status ?? "unknown", conclusion: run.conclusion ?? null, url: run.html_url ?? null })),
    statuses: legacy.map((status) => ({ context: status.context ?? "unknown", state: status.state ?? "unknown", url: status.target_url ?? null })),
  };
}

export async function mergeGithubWritePlanPullRequest(input: {
  plan_id: string;
  expected_head_sha: string;
  idempotency_key: unknown;
}, principal: { id: number; login: string }, billingAccountId: number, token: string, fetchImpl: FetchLike = fetch) {
  const key = idempotencyKey(input.idempotency_key);
  const row = await loadPlan(input.plan_id, principal.id, billingAccountId);
  if (row.status === "merged" && row.merge_commit_sha) {
    return { plan_id: row.plan_id, merged: true, merge_commit_sha: row.merge_commit_sha, resulting_default_branch_head_sha: row.merge_commit_sha };
  }
  if (row.status !== "pr_open" || !row.pull_request_number || !row.applied_head_sha) {
    throw new RepositorySupervisorError(409, "write_plan_pull_request_not_mergeable");
  }
  if (input.expected_head_sha !== row.applied_head_sha) throw new RepositorySupervisorError(409, "planned_branch_head_mismatch");

  const pr = await getGithubWritePlanPullRequest(row.plan_id, principal, billingAccountId, token, fetchImpl);
  if (
    pr.state !== "open"
    || pr.merged
    || pr.head_sha !== row.applied_head_sha
    || pr.base_branch !== row.default_branch
    || pr.mergeable !== true
  ) throw new RepositorySupervisorError(409, "pull_request_state_not_mergeable");

  const ci = await getGithubWritePlanCi(row.plan_id, row.applied_head_sha, principal, billingAccountId, token, fetchImpl);
  if (ci.overall_state !== "success") throw new RepositorySupervisorError(409, "required_ci_not_green");

  const current = await resolveGithubRepository(row.repository_full_name, token, fetchImpl);
  assertWriteTarget(current);
  if (current.head_sha?.toLowerCase() !== row.expected_target_head_sha.toLowerCase()) {
    throw new RepositorySupervisorError(409, "default_branch_changed_rebase_or_replan_required");
  }

  const [owner, repo] = row.repository_full_name.split("/", 2);
  const response = await githubRequest(
    "PUT",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${Number(row.pull_request_number)}/merge`,
    token,
    fetchImpl,
    { sha: row.applied_head_sha, merge_method: "merge" },
  );
  if (response.status === 405 || response.status === 409) throw new RepositorySupervisorError(409, "repository_policy_rejected_merge");
  if (!response.ok) throw new RepositorySupervisorError(502, "github_pull_request_merge_failed");
  const merged = await json<GithubMerge>(response, "github_merge_response_invalid");
  if (!merged.merged || !merged.sha || !/^[0-9a-f]{40}$/i.test(merged.sha)) {
    throw new RepositorySupervisorError(409, "github_pull_request_not_merged");
  }

  const after = await resolveGithubRepository(row.repository_full_name, token, fetchImpl);
  if (after.head_sha?.toLowerCase() !== merged.sha.toLowerCase()) {
    throw new RepositorySupervisorError(502, "resulting_default_branch_verification_failed");
  }

  const result = {
    plan_id: row.plan_id,
    merged: true,
    merge_commit_sha: merged.sha,
    resulting_default_branch_head_sha: after.head_sha,
  };
  await transaction(async (client) => {
    const prior = await idempotentResult(client, key, row.plan_id, "merge");
    if (prior) return;
    await client.query(
      "UPDATE repository_supervisor_write_plans SET status='merged',merge_commit_sha=$2,updated_at=NOW() WHERE plan_id=$1",
      [row.plan_id, merged.sha],
    );
    await recordIdempotent(client, key, row.plan_id, "merge", result);
  });
  return result;
}
