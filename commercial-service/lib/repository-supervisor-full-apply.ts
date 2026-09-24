import { createHash, randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import {
  materializeTemplateReleaseFiles,
  templateReleasePlanSnapshot,
  type MaterializedTemplateReleaseFile,
  type TemplateReleaseMaterializationRequest,
} from "./github";
import {
  executeWithSandboxDriver,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxFileArtifact,
} from "./execution-sandbox";
import { FULL_PLAN_SANDBOX_RUNNER, sandboxUtf8Artifact } from "./full-plan-sandbox-runner";
import { productionSandboxDriver } from "./remote-sandbox-driver";
import {
  validateStoredFullPlannerPayload,
  type FullPlannerPayload,
  type PlannerAction,
} from "./repository-supervisor-planner";
import {
  resolveGithubRepository,
  RepositorySupervisorError,
} from "./repository-supervisor-runtime";
import {
  applyGithubWritePlan,
  loadGithubSupervisorPlanForApply,
  validateFeatureBranchName,
  validateSupervisorIdempotencyKey,
} from "./repository-supervisor-write";

type FetchLike = typeof fetch;
type Principal = { id: number; login: string };

const GITHUB_API = "https://api.github.com";
const APPLY_LEASE_MINUTES = 20;
const WRITE_ACTIONS = new Set(["add_from_release", "replace_from_release", "bootstrap_transform"]);
const BOOTSTRAP_MODES = new Set(["bootstrap_child", "adopt_existing"]);

type GithubCommit = { sha?: string; tree?: { sha?: string } };
type GithubBlob = { sha?: string };
type GithubTree = { sha?: string };
type GithubRef = { object?: { sha?: string } };

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function githubHeaders(token: string): Record<string, string> {
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new RepositorySupervisorError(401, "github_authentication_required");
  }
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "ANPOS-Repository-Supervisor/0.6",
  };
}

async function githubRequest(
  method: string,
  path: string,
  token: string,
  fetchImpl: FetchLike,
  body?: unknown,
): Promise<Response> {
  return fetchImpl(`${GITHUB_API}${path}`, {
    method,
    headers: githubHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
}

async function json<T>(response: Response, code: string): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new RepositorySupervisorError(502, code); }
}

function repositoryPath(fullName: string): string {
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length) throw new RepositorySupervisorError(500, "full_plan_repository_identity_invalid");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function refPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

function writeActions(payload: FullPlannerPayload): PlannerAction[] {
  return payload.actions.filter((action) => WRITE_ACTIONS.has(action.action));
}

function materializationRequests(payload: FullPlannerPayload): TemplateReleaseMaterializationRequest[] {
  const selected = BOOTSTRAP_MODES.has(payload.mode)
    ? payload.actions
    : writeActions(payload);
  if (BOOTSTRAP_MODES.has(payload.mode) && !payload.actions.some((action) => action.path === "scripts/bootstrap_instance.py")) {
    throw new RepositorySupervisorError(409, "bootstrap_runner_missing_from_release_plan");
  }
  return selected.map((action) => ({
    path: action.path,
    git_object: String(action.release_git_object),
    sha256: action.release_sha256,
    size: action.release_bytes,
    git_mode: action.release_mode as "100644" | "100755",
  }));
}

function releaseInputArtifact(file: MaterializedTemplateReleaseFile): SandboxFileArtifact {
  return {
    path: `.anpos-input/release/${file.path}`,
    mode: file.git_mode,
    content_base64: file.content_base64,
    sha256: file.sha256,
    bytes: file.size,
  };
}

export function buildFullApplySandboxRequest(input: {
  plan_id: string;
  payload: FullPlannerPayload;
  materialized_release_files: MaterializedTemplateReleaseFile[];
}): SandboxExecutionRequest {
  const actions = writeActions(input.payload);
  if (!actions.length) throw new RepositorySupervisorError(409, "full_plan_no_changes");
  const planJson = JSON.stringify(input.payload);
  return {
    workspace_id: `anpos-${input.plan_id}`,
    source: undefined,
    command: ["python3", ".anpos-input/apply.py"],
    working_directory: "workspace",
    timeout_seconds: 900,
    max_output_bytes: 512 * 1024,
    max_artifact_bytes: 32 * 1024 * 1024,
    environment_variable_names: [],
    input_files: [
      sandboxUtf8Artifact(".anpos-input/apply.py", FULL_PLAN_SANDBOX_RUNNER, "100644"),
      sandboxUtf8Artifact(".anpos-input/plan.json", planJson, "100644"),
      ...input.materialized_release_files.map(releaseInputArtifact),
    ],
    output_paths: actions.map((action) => action.path).sort(),
    network: "deny",
  };
}

export function verifyFullApplySandboxOutputs(
  payload: FullPlannerPayload,
  result: SandboxExecutionResult,
): SandboxFileArtifact[] {
  if (
    result.exit_code !== 0
    || result.timed_out
    || result.output_truncated
    || !Array.isArray(result.output_files)
  ) throw new RepositorySupervisorError(422, "full_plan_sandbox_execution_failed");

  const actions = new Map(writeActions(payload).map((action) => [action.path, action]));
  if (result.output_files.length !== actions.size) {
    throw new RepositorySupervisorError(422, "full_plan_sandbox_output_set_mismatch");
  }
  for (const file of result.output_files) {
    const action = actions.get(file.path);
    if (!action) throw new RepositorySupervisorError(422, "full_plan_sandbox_output_set_mismatch");
    if (file.mode !== action.release_mode) {
      throw new RepositorySupervisorError(422, "full_plan_sandbox_output_mode_mismatch");
    }
    if (action.action !== "bootstrap_transform" && file.sha256 !== action.release_sha256) {
      throw new RepositorySupervisorError(422, "full_plan_sandbox_release_output_drift");
    }
  }
  return [...result.output_files].sort((a, b) => a.path.localeCompare(b.path));
}

function sandboxReceiptDigest(result: SandboxExecutionResult, outputs: SandboxFileArtifact[]): string {
  return sha256(stableJson({
    driver_id: result.driver_id,
    isolation: result.isolation,
    exit_code: result.exit_code,
    timed_out: result.timed_out,
    output_truncated: result.output_truncated,
    duration_ms: result.duration_ms,
    outputs: outputs.map((file) => ({
      path: file.path,
      mode: file.mode,
      sha256: file.sha256,
      bytes: file.bytes,
    })),
  }));
}

async function beginApplyLease(
  planId: string,
  idempotencyKey: string,
  operationId: string,
  principal: Principal,
  billingAccountId: number,
): Promise<unknown | null> {
  return transaction(async (client) => {
    const existing = await client.query(
      "SELECT plan_id,operation,result FROM repository_supervisor_write_idempotency WHERE idempotency_key=$1",
      [idempotencyKey],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.plan_id) !== planId || String(row.operation) !== "full_apply") {
        throw new RepositorySupervisorError(409, "idempotency_key_conflict");
      }
      return row.result;
    }

    const locked = await client.query(
      `SELECT status,apply_operation_id,apply_lease_expires_at
         FROM repository_supervisor_write_plans
         WHERE plan_id=$1 AND github_user_id=$2 AND billing_account_id=$3
         FOR UPDATE`,
      [planId, principal.id, billingAccountId],
    );
    if (!locked.rowCount) throw new RepositorySupervisorError(404, "write_plan_not_found");
    const row = locked.rows[0];
    if (row.status === "applying") {
      const lease = row.apply_lease_expires_at ? new Date(row.apply_lease_expires_at).getTime() : 0;
      if (lease > Date.now()) throw new RepositorySupervisorError(409, "full_plan_apply_in_progress");
      throw new RepositorySupervisorError(409, "full_plan_apply_recovery_required");
    }
    if (row.status !== "planned") throw new RepositorySupervisorError(409, "write_plan_not_applicable");

    await client.query(
      `UPDATE repository_supervisor_write_plans
         SET status='applying',apply_operation_id=$2,
             apply_lease_expires_at=NOW() + make_interval(mins => $3::int),
             updated_at=NOW()
         WHERE plan_id=$1 AND status='planned'`,
      [planId, operationId, APPLY_LEASE_MINUTES],
    );
    return null;
  });
}

async function resetApplyLease(planId: string, operationId: string): Promise<void> {
  await db().query(
    `UPDATE repository_supervisor_write_plans
       SET status='planned',apply_operation_id=NULL,apply_lease_expires_at=NULL,updated_at=NOW()
       WHERE plan_id=$1 AND status='applying' AND apply_operation_id=$2`,
    [planId, operationId],
  );
}

async function markRecoveryRequired(
  planId: string,
  operationId: string,
  branch: string,
  head: string,
): Promise<void> {
  await db().query(
    `UPDATE repository_supervisor_write_plans
       SET status='apply_recovery_required',applied_branch=$3,applied_head_sha=$4,
           apply_lease_expires_at=NULL,updated_at=NOW()
       WHERE plan_id=$1 AND status='applying' AND apply_operation_id=$2`,
    [planId, operationId, branch, head],
  );
}

async function completeApply(
  input: {
    planId: string;
    operationId: string;
    idempotencyKey: string;
    branch: string;
    head: string;
    receipt: string;
    result: object;
  },
): Promise<void> {
  await transaction(async (client) => {
    const locked = await client.query(
      "SELECT status,apply_operation_id FROM repository_supervisor_write_plans WHERE plan_id=$1 FOR UPDATE",
      [input.planId],
    );
    if (
      !locked.rowCount
      || locked.rows[0].status !== "applying"
      || locked.rows[0].apply_operation_id !== input.operationId
    ) throw new RepositorySupervisorError(409, "full_plan_apply_lease_lost");
    await client.query(
      `UPDATE repository_supervisor_write_plans
         SET status='applied',applied_branch=$2,applied_head_sha=$3,
             sandbox_receipt_sha256=$4,apply_operation_id=NULL,apply_lease_expires_at=NULL,updated_at=NOW()
         WHERE plan_id=$1`,
      [input.planId, input.branch, input.head, input.receipt],
    );
    await client.query(
      `INSERT INTO repository_supervisor_write_idempotency(idempotency_key,plan_id,operation,result)
       VALUES ($1,$2,'full_apply',$3::jsonb)`,
      [input.idempotencyKey, input.planId, JSON.stringify(input.result)],
    );
  });
}

async function cleanupBranch(
  repositoryFullName: string,
  branch: string,
  token: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  const repoPath = repositoryPath(repositoryFullName);
  const response = await githubRequest(
    "DELETE",
    `/repos/${repoPath}/git/refs/heads/${refPath(branch)}`,
    token,
    fetchImpl,
  );
  return response.ok || response.status === 404;
}

async function createGithubCommitFromSandbox(
  input: {
    repository_full_name: string;
    expected_head_sha: string;
    branch: string;
    mode: string;
    outputs: SandboxFileArtifact[];
  },
  token: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const repoPath = repositoryPath(input.repository_full_name);
  const baseResponse = await githubRequest(
    "GET",
    `/repos/${repoPath}/git/commits/${input.expected_head_sha}`,
    token,
    fetchImpl,
  );
  if (!baseResponse.ok) throw new RepositorySupervisorError(502, "github_base_commit_lookup_failed");
  const base = await json<GithubCommit>(baseResponse, "github_base_commit_invalid");
  const baseTree = base.tree?.sha;
  if (!baseTree || !/^[0-9a-f]{40}$/i.test(baseTree)) {
    throw new RepositorySupervisorError(502, "github_base_tree_invalid");
  }

  const treeEntries = new Array<Record<string, unknown>>(input.outputs.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= input.outputs.length) return;
      const file = input.outputs[index];
      const response = await githubRequest(
        "POST",
        `/repos/${repoPath}/git/blobs`,
        token,
        fetchImpl,
        { content: file.content_base64, encoding: "base64" },
      );
      if (!response.ok) throw new RepositorySupervisorError(502, "github_blob_create_failed");
      const blob = await json<GithubBlob>(response, "github_blob_response_invalid");
      if (!blob.sha || !/^[0-9a-f]{40}$/i.test(blob.sha)) {
        throw new RepositorySupervisorError(502, "github_blob_response_invalid");
      }
      treeEntries[index] = { path: file.path, mode: file.mode, type: "blob", sha: blob.sha };
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, input.outputs.length) }, () => worker()));

  const treeResponse = await githubRequest(
    "POST",
    `/repos/${repoPath}/git/trees`,
    token,
    fetchImpl,
    { base_tree: baseTree, tree: treeEntries },
  );
  if (!treeResponse.ok) throw new RepositorySupervisorError(502, "github_tree_create_failed");
  const tree = await json<GithubTree>(treeResponse, "github_tree_response_invalid");
  if (!tree.sha || !/^[0-9a-f]{40}$/i.test(tree.sha)) {
    throw new RepositorySupervisorError(502, "github_tree_response_invalid");
  }

  const commitResponse = await githubRequest(
    "POST",
    `/repos/${repoPath}/git/commits`,
    token,
    fetchImpl,
    {
      message: `ANPOS ${input.mode.replaceAll("_", " ")} via Repository Supervisor`,
      tree: tree.sha,
      parents: [input.expected_head_sha],
    },
  );
  if (!commitResponse.ok) throw new RepositorySupervisorError(502, "github_commit_create_failed");
  const commit = await json<GithubCommit>(commitResponse, "github_commit_response_invalid");
  if (!commit.sha || !/^[0-9a-f]{40}$/i.test(commit.sha)) {
    throw new RepositorySupervisorError(502, "github_commit_response_invalid");
  }
  return commit.sha.toLowerCase();
}

async function createAndVerifyBranch(
  repositoryFullName: string,
  branch: string,
  commitSha: string,
  token: string,
  fetchImpl: FetchLike,
): Promise<void> {
  const repoPath = repositoryPath(repositoryFullName);
  const create = await githubRequest(
    "POST",
    `/repos/${repoPath}/git/refs`,
    token,
    fetchImpl,
    { ref: `refs/heads/${branch}`, sha: commitSha },
  );
  if (create.status === 422) throw new RepositorySupervisorError(409, "feature_branch_already_exists");
  if (!create.ok) throw new RepositorySupervisorError(502, "github_feature_branch_create_failed");
  const read = await githubRequest(
    "GET",
    `/repos/${repoPath}/git/ref/heads/${refPath(branch)}`,
    token,
    fetchImpl,
  );
  if (!read.ok) throw new RepositorySupervisorError(502, "github_feature_branch_verify_failed");
  const ref = await json<GithubRef>(read, "github_feature_branch_verify_invalid");
  if (ref.object?.sha?.toLowerCase() !== commitSha) {
    throw new RepositorySupervisorError(502, "github_feature_branch_verify_invalid");
  }
}

function releaseMatchesPlan(payload: FullPlannerPayload, current: Awaited<ReturnType<typeof templateReleasePlanSnapshot>>): boolean {
  return (
    current.repository === payload.release.repository
    && current.release_ref === payload.release.release_ref
    && current.source_revision === payload.release.source_revision
    && current.source_tree === payload.release.source_tree
    && current.file_count === payload.release.file_count
    && current.total_bytes === payload.release.total_bytes
  );
}

export async function applyGithubSupervisorPlan(
  input: {
    plan_id: string;
    plan_hash: string;
    branch_name: unknown;
    idempotency_key: unknown;
  },
  principal: Principal,
  billingAccountId: number,
  token: string,
  fetchImpl: FetchLike = fetch,
) {
  const record = await loadGithubSupervisorPlanForApply(
    { plan_id: input.plan_id, plan_hash: input.plan_hash },
    principal,
    billingAccountId,
  );
  if (record.mode === "bounded_change") {
    return applyGithubWritePlan(input, principal, billingAccountId, token, fetchImpl);
  }
  if (["applied", "pr_open", "merged"].includes(record.status)) {
    return {
      plan_id: record.plan_id,
      branch_name: record.applied_branch,
      resulting_head_sha: record.applied_head_sha,
      status: record.status,
    };
  }

  const payload = validateStoredFullPlannerPayload(record.payload);
  if (payload.mode === "bootstrap_empty" || !record.expected_target_head_sha) {
    throw new RepositorySupervisorError(409, "empty_repository_initialization_pending");
  }
  if (!payload.conflict_free || payload.apply_implementation === "conflict_resolution_required") {
    throw new RepositorySupervisorError(409, "full_plan_conflict_resolution_required");
  }
  if (payload.apply_implementation === "no_changes") {
    throw new RepositorySupervisorError(409, "full_plan_no_changes");
  }
  if (!payload.safe_to_apply || payload.apply_implementation !== "sandbox_full_plan_v1") {
    throw new RepositorySupervisorError(409, "full_plan_apply_contract_mismatch");
  }

  const branch = validateFeatureBranchName(input.branch_name, record.default_branch);
  const idempotencyKey = validateSupervisorIdempotencyKey(input.idempotency_key);
  const resolution = await resolveGithubRepository(record.repository_full_name, token, fetchImpl);
  if (
    resolution.canonical_repository_id !== record.canonical_repository_id
    || resolution.default_branch !== record.default_branch
    || resolution.head_sha?.toLowerCase() !== record.expected_target_head_sha.toLowerCase()
    || payload.target.expected_head_sha?.toLowerCase() !== record.expected_target_head_sha.toLowerCase()
  ) throw new RepositorySupervisorError(409, "target_head_changed_replan_required");

  const currentRelease = await templateReleasePlanSnapshot();
  if (!releaseMatchesPlan(payload, currentRelease)) {
    throw new RepositorySupervisorError(409, "commercial_release_changed_replan_required");
  }

  const operationId = randomUUID();
  const prior = await beginApplyLease(record.plan_id, idempotencyKey, operationId, principal, billingAccountId);
  if (prior) return prior;

  let branchCreated = false;
  let commitSha = "";
  try {
    const materialized = await materializeTemplateReleaseFiles(materializationRequests(payload));
    const sandboxRequest = buildFullApplySandboxRequest({
      plan_id: record.plan_id,
      payload,
      materialized_release_files: materialized,
    });
    const sandboxResult = await executeWithSandboxDriver(sandboxRequest, productionSandboxDriver(fetchImpl));
    const outputs = verifyFullApplySandboxOutputs(payload, sandboxResult);
    const receipt = sandboxReceiptDigest(sandboxResult, outputs);

    const beforeCommit = await resolveGithubRepository(record.repository_full_name, token, fetchImpl);
    if (beforeCommit.head_sha?.toLowerCase() !== record.expected_target_head_sha.toLowerCase()) {
      throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
    }

    commitSha = await createGithubCommitFromSandbox({
      repository_full_name: record.repository_full_name,
      expected_head_sha: record.expected_target_head_sha,
      branch,
      mode: payload.mode,
      outputs,
    }, token, fetchImpl);

    const beforeBranch = await resolveGithubRepository(record.repository_full_name, token, fetchImpl);
    if (beforeBranch.head_sha?.toLowerCase() !== record.expected_target_head_sha.toLowerCase()) {
      throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
    }

    await createAndVerifyBranch(record.repository_full_name, branch, commitSha, token, fetchImpl);
    branchCreated = true;

    const afterBranch = await resolveGithubRepository(record.repository_full_name, token, fetchImpl);
    if (afterBranch.head_sha?.toLowerCase() !== record.expected_target_head_sha.toLowerCase()) {
      const cleaned = await cleanupBranch(record.repository_full_name, branch, token, fetchImpl);
      branchCreated = !cleaned;
      throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
    }

    const result = {
      plan_id: record.plan_id,
      mode: payload.mode,
      branch_name: branch,
      resulting_head_sha: commitSha,
      expected_target_head_sha: record.expected_target_head_sha,
      applied_paths: outputs.map((file) => file.path),
      sandbox_receipt_sha256: receipt,
      sandbox_driver_id: sandboxResult.driver_id,
      status: "applied",
    };
    await completeApply({
      planId: record.plan_id,
      operationId,
      idempotencyKey,
      branch,
      head: commitSha,
      receipt,
      result,
    });
    return result;
  } catch (error) {
    if (branchCreated && commitSha) {
      const cleaned = await cleanupBranch(record.repository_full_name, branch, token, fetchImpl).catch(() => false);
      if (!cleaned) {
        await markRecoveryRequired(record.plan_id, operationId, branch, commitSha).catch(() => undefined);
        throw new RepositorySupervisorError(409, "full_plan_apply_recovery_required");
      }
    }
    await resetApplyLease(record.plan_id, operationId).catch(() => undefined);
    throw error;
  }
}
