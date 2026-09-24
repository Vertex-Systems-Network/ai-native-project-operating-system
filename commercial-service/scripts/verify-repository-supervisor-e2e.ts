import { createHash } from "node:crypto";

type RpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: any;
  error?: { code?: number; message?: string };
};

const mode = process.env.ANPOS_E2E_MODE ?? "read";
const baseUrl = (process.env.ANPOS_E2E_BASE_URL ?? "").replace(/\/$/, "");
const accessToken = process.env.ANPOS_E2E_MCP_ACCESS_TOKEN ?? "";
const repository = process.env.ANPOS_E2E_REPOSITORY ?? "";
const billingAccountId = Number(process.env.ANPOS_E2E_BILLING_ACCOUNT_ID ?? "0");
const writeConfirm = process.env.ANPOS_E2E_WRITE_CONFIRM ?? "";
const resumePlanId = process.env.ANPOS_E2E_PLAN_ID ?? "";
const resumeHeadSha = process.env.ANPOS_E2E_PLAN_HEAD_SHA ?? "";

function fail(message: string): never {
  console.error(`Repository Supervisor E2E FAILED: ${message}`);
  process.exit(1);
}

function assertConfig(): void {
  let url: URL;
  try { url = new URL(baseUrl); }
  catch { fail("ANPOS_E2E_BASE_URL must be a valid HTTPS origin"); }
  if (url!.protocol !== "https:" || url!.username || url!.password || url!.search || url!.hash || url!.pathname !== "/") {
    fail("ANPOS_E2E_BASE_URL must be an HTTPS origin with no credentials/path/query/fragment");
  }
  if (!accessToken || accessToken.length > 4096 || /[\r\n]/.test(accessToken)) {
    fail("ANPOS_E2E_MCP_ACCESS_TOKEN must be supplied through the environment");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    fail("ANPOS_E2E_REPOSITORY must be owner/repo");
  }
  if (!Number.isSafeInteger(billingAccountId) || billingAccountId <= 0) {
    fail("ANPOS_E2E_BILLING_ACCOUNT_ID must be a positive safe integer");
  }
  if (!["read", "write_prepare", "write_verify_merge"].includes(mode)) {
    fail("ANPOS_E2E_MODE must be read, write_prepare, or write_verify_merge");
  }
  if (mode !== "read") {
    const repoName = repository.split("/")[1].toLowerCase();
    if (!/(?:^|[-_.])(e2e|sandbox|test)(?:$|[-_.])/.test(repoName)) {
      fail("write E2E is allowed only against a repository whose name explicitly contains e2e, sandbox, or test");
    }
    if (writeConfirm !== "I_ACCEPT_DISPOSABLE_TEST_REPO_MUTATION") {
      fail("write E2E requires ANPOS_E2E_WRITE_CONFIRM=I_ACCEPT_DISPOSABLE_TEST_REPO_MUTATION");
    }
  }
  if (mode === "write_verify_merge") {
    if (!/^[0-9a-f-]{36}$/.test(resumePlanId)) fail("ANPOS_E2E_PLAN_ID is required for write_verify_merge");
    if (!/^[0-9a-f]{40}$/i.test(resumeHeadSha)) fail("ANPOS_E2E_PLAN_HEAD_SHA is required for write_verify_merge");
  }
}

let rpcId = 0;
async function rpc(method: string, params: Record<string, unknown>): Promise<any> {
  rpcId += 1;
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as RpcResponse;
  if (!response.ok || payload.error) {
    fail(`${method} failed with HTTP ${response.status}: ${payload.error?.message ?? "unknown error"}`);
  }
  return payload.result;
}

async function tool(name: string, args: Record<string, unknown>): Promise<any> {
  const result = await rpc("tools/call", { name, arguments: args });
  if (!result || result.isError) {
    const reason = result?.structuredContent?.reason ?? result?.structuredContent?.error ?? "tool error";
    fail(`${name} failed: ${reason}`);
  }
  return result.structuredContent;
}

function receipt(kind: string, data: object): void {
  console.log(JSON.stringify({
    ok: true,
    kind,
    repository,
    service_origin: baseUrl,
    ...data,
  }, null, 2));
}

async function commonRead() {
  const discovery = await rpc("server/discover", {
    _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
  });
  if (!Array.isArray(discovery?.supportedVersions) || !discovery.supportedVersions.includes("2026-07-28")) {
    fail("server/discover does not advertise MCP 2026-07-28");
  }
  const listed = await rpc("tools/list", {});
  const names = new Set((listed?.tools ?? []).map((entry: any) => entry?.name));
  for (const required of ["repository_profile","repository_resolve","repository_audit","repository_get_assurance"]) {
    if (!names.has(required)) fail(`missing MCP tool: ${required}`);
  }
  const profile = await tool("repository_profile", {});
  if (!/^prf_[0-9a-f]{32}$/.test(String(profile?.id ?? ""))) fail("profile identity is not stable opaque format");

  const resolved = await tool("repository_resolve", {
    repository_url: repository,
    billing_account_id: billingAccountId,
  });
  if (!/^[0-9a-f]{40}$/i.test(String(resolved?.head_sha ?? ""))) fail("repository_resolve returned no immutable head SHA");
  const audit = await tool("repository_audit", {
    repository_url: repository,
    billing_account_id: billingAccountId,
  });
  if (audit?.head_sha !== resolved.head_sha) fail("audit head does not match resolved head");
  const assurance = await tool("repository_get_assurance", {
    repository_url: repository,
    billing_account_id: billingAccountId,
    ref: resolved.head_sha,
  });
  if (assurance?.verified_ref !== resolved.head_sha) fail("assurance was not read at the exact resolved ref");
  return { discovery, profile, resolved, audit, assurance };
}

async function main() {
  assertConfig();

  if (mode === "read") {
    const state = await commonRead();
    receipt("repository_supervisor_read_e2e", {
      profile_id: state.profile.id,
      canonical_repository_id: state.resolved.canonical_repository_id,
      head_sha: state.resolved.head_sha,
      classification: state.audit.classification,
      assurance_verified_ref: state.assurance.verified_ref,
    });
    return;
  }

  if (mode === "write_prepare") {
    const state = await commonRead();
    const short = String(state.resolved.head_sha).slice(0, 10);
    const branch = `anpos/e2e-${short}`;
    const markerPath = `docs/anpos-e2e/runtime-${short}.md`;
    const markerContent = [
      "# ANPOS Repository Supervisor production E2E marker",
      "",
      `Source head: ${state.resolved.head_sha}`,
      "Purpose: disposable guarded-write certification evidence.",
      "",
    ].join("\n");
    const plan = await tool("repository_plan_anpos_change", {
      repository_url: repository,
      billing_account_id: billingAccountId,
      expected_target_head_sha: state.resolved.head_sha,
      commit_message: "Add Repository Supervisor E2E marker",
      changes: [{ path: markerPath, operation: "upsert", content: markerContent }],
    });
    const applyKey = `e2e-apply-${createHash("sha256").update(String(plan.plan_id)).digest("hex").slice(0, 20)}`;
    const applied = await tool("repository_apply_anpos_change", {
      billing_account_id: billingAccountId,
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      branch_name: branch,
      idempotency_key: applyKey,
    });
    const prKey = `e2e-pr-${createHash("sha256").update(String(plan.plan_id)).digest("hex").slice(0, 20)}`;
    const pr = await tool("repository_open_change_request", {
      billing_account_id: billingAccountId,
      plan_id: plan.plan_id,
      expected_head_sha: applied.resulting_head_sha,
      title: "ANPOS Repository Supervisor E2E certification",
      body: "Disposable production E2E change created by the guarded Repository Supervisor verifier.",
      idempotency_key: prKey,
    });
    receipt("repository_supervisor_write_prepare_e2e", {
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      source_head_sha: state.resolved.head_sha,
      plan_head_sha: applied.resulting_head_sha,
      branch_name: applied.branch_name,
      pull_request_number: pr.pull_request_number,
      pull_request_url: pr.url,
      next_mode: "write_verify_merge",
      next_required_env_names: ["ANPOS_E2E_PLAN_ID","ANPOS_E2E_PLAN_HEAD_SHA"],
    });
    return;
  }

  const change = await tool("repository_get_change_request", {
    billing_account_id: billingAccountId,
    plan_id: resumePlanId,
  });
  if (change.head_sha !== resumeHeadSha) fail("PR head no longer matches supplied planned head");
  const ci = await tool("repository_get_ci", {
    billing_account_id: billingAccountId,
    plan_id: resumePlanId,
    commit_sha: resumeHeadSha,
  });
  if (ci.overall_state === "pending") {
    receipt("repository_supervisor_write_e2e_pending_ci", {
      plan_id: resumePlanId,
      plan_head_sha: resumeHeadSha,
      pull_request_number: change.pull_request_number,
      ci_state: ci.overall_state,
      action: "run this verifier again later; it does not busy-wait",
    });
    process.exit(2);
  }
  if (ci.overall_state !== "success") fail("exact planned head CI is not green");

  const mergeKey = `e2e-merge-${createHash("sha256").update(resumePlanId).digest("hex").slice(0, 20)}`;
  const merged = await tool("repository_merge_change_request", {
    billing_account_id: billingAccountId,
    plan_id: resumePlanId,
    expected_head_sha: resumeHeadSha,
    idempotency_key: mergeKey,
  });
  if (!merged.merged || merged.merge_commit_sha !== merged.resulting_default_branch_head_sha) {
    fail("guarded merge did not verify resulting default branch");
  }
  receipt("repository_supervisor_write_merge_e2e", {
    plan_id: resumePlanId,
    plan_head_sha: resumeHeadSha,
    pull_request_number: change.pull_request_number,
    exact_head_ci: "success",
    merge_commit_sha: merged.merge_commit_sha,
    resulting_default_branch_head_sha: merged.resulting_default_branch_head_sha,
  });
}

main().catch((error) => fail(error instanceof Error ? error.message : "unexpected verifier failure"));
