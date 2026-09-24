import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRepositoryWritePlan,
  createRepositoryWritePlan,
  getRepositoryChangeRequest,
  getRepositoryCi,
  mergeRepositoryChangeRequest,
  openRepositoryChangeRequest,
  type RepositoryWritePlan,
  type RepositoryWritePlanStore,
  type WriteOperationResult,
} from "../lib/repository-write-runtime";

const HEAD = "a".repeat(40);
const ROOT_TREE = "b".repeat(40);
const README_SHA = "c".repeat(40);
const CREATED_TREE = "d".repeat(40);
const FEATURE_HEAD = "e".repeat(40);
const MERGE_HEAD = "f".repeat(40);
const BILLING_ACCOUNT_ID = 42;

class MemoryStore implements RepositoryWritePlanStore {
  plans = new Map<string, RepositoryWritePlan>();
  operations = new Map<string, { digest: string; status: string; result?: WriteOperationResult }>();

  async create(plan: RepositoryWritePlan) {
    this.plans.set(plan.plan_id, structuredClone(plan));
  }

  async get(planId: string, githubUserId: number) {
    const plan = this.plans.get(planId);
    if (!plan || plan.created_by_github_user_id !== githubUserId) return null;
    return structuredClone(plan);
  }

  async markApplied(planId: string, branchName: string, resultingHeadSha: string) {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "planned") throw new Error("REPOSITORY_WRITE_PLAN_STATE_CHANGED");
    plan.status = "applied";
    plan.branch_name = branchName;
    plan.resulting_head_sha = resultingHeadSha;
  }

  async markChangeRequest(planId: string, changeRequestId: number) {
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== "applied" || plan.change_request_id != null) {
      throw new Error("REPOSITORY_WRITE_PLAN_CHANGE_REQUEST_STATE_CHANGED");
    }
    plan.change_request_id = changeRequestId;
  }

  async beginOperation(input: {
    idempotencyKey: string;
    operation: string;
    planId: string | null;
    githubRepositoryId: number;
    githubUserId: number;
    requestDigest: string;
  }) {
    const existing = this.operations.get(input.idempotencyKey);
    if (existing) {
      if (existing.digest !== input.requestDigest) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
      if (existing.status === "completed" && existing.result) return { replay: structuredClone(existing.result) };
      throw new Error("IDEMPOTENT_OPERATION_IN_PROGRESS");
    }
    this.operations.set(input.idempotencyKey, { digest: input.requestDigest, status: "started" });
    return { replay: null };
  }

  async completeOperation(idempotencyKey: string, result: WriteOperationResult) {
    const row = this.operations.get(idempotencyKey);
    if (!row) throw new Error("missing operation");
    row.status = "completed";
    row.result = structuredClone(result);
  }

  async failOperation(idempotencyKey: string) {
    const row = this.operations.get(idempotencyKey);
    if (row) row.status = "error";
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fileBody(value: unknown, sha = "1".repeat(40)) {
  const raw = JSON.stringify(value);
  return {
    type: "file",
    encoding: "base64",
    content: Buffer.from(raw, "utf8").toString("base64"),
    size: Buffer.byteLength(raw),
    sha,
  };
}

function activeControl(path: string): unknown | null {
  const values: Record<string, unknown> = {
    ".ai/manifest.json": { protocol: "ANPOS", schema_version: 7 },
    "config/protocol/instance.json": {
      instance_status: "active_project",
      bootstrap_completed: true,
      source_protocol_version: "1.4.0",
    },
    "config/protocol/version.json": { version: "1.4.0" },
  };
  return path in values ? values[path] : null;
}

function githubHarness(options: { active?: boolean } = {}) {
  let merged = false;
  let createdBranches = 0;
  let createdPulls = 0;
  let mergeCalls = 0;
  let treeRequestBody: any = null;

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    const method = init?.method ?? "GET";
    const auth = new Headers(init?.headers).get("Authorization");
    assert.equal(auth, "Bearer token");
    const path = decodeURIComponent(url.pathname);

    if (path === "/repos/example/project" && method === "GET") {
      return json({
        id: 123,
        full_name: "example/project",
        html_url: "https://github.com/example/project",
        private: true,
        archived: false,
        default_branch: "main",
        size: 10,
        permissions: { pull: true, push: true },
      });
    }

    if (path === "/repos/example/project/branches/main" && method === "GET") {
      return json({ commit: { sha: merged ? MERGE_HEAD : HEAD } });
    }

    if (path === "/repos/example/project/branches/anpos/milestone" && method === "GET") {
      return json({ commit: { sha: FEATURE_HEAD } });
    }

    if (path.startsWith("/repos/example/project/contents/") && method === "GET") {
      assert.equal(url.searchParams.get("ref"), merged ? MERGE_HEAD : HEAD);
      const relative = path.slice("/repos/example/project/contents/".length);
      const value = options.active === false ? null : activeControl(relative);
      return value === null ? json({ message: "Not Found" }, 404) : json(fileBody(value));
    }

    if (path === `/repos/example/project/git/commits/${HEAD}` && method === "GET") {
      return json({ sha: HEAD, tree: { sha: ROOT_TREE } });
    }

    if (path === `/repos/example/project/git/trees/${ROOT_TREE}` && method === "GET") {
      return json({
        truncated: false,
        tree: [
          { path: "README.md", type: "blob", mode: "100755", sha: README_SHA },
        ],
      });
    }

    if (path === "/repos/example/project/git/trees" && method === "POST") {
      treeRequestBody = JSON.parse(String(init?.body ?? "{}"));
      return json({ sha: CREATED_TREE }, 201);
    }

    if (path === "/repos/example/project/git/commits" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.tree, CREATED_TREE);
      assert.deepEqual(body.parents, [HEAD]);
      return json({ sha: FEATURE_HEAD }, 201);
    }

    if (path === "/repos/example/project/git/refs" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.ref, "refs/heads/anpos/milestone");
      assert.equal(body.sha, FEATURE_HEAD);
      createdBranches += 1;
      return json({ ref: body.ref, object: { sha: FEATURE_HEAD } }, 201);
    }

    if (path === "/repos/example/project/pulls" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.head, "anpos/milestone");
      assert.equal(body.base, "main");
      createdPulls += 1;
      return json({
        number: 7,
        html_url: "https://github.com/example/project/pull/7",
        head: { sha: FEATURE_HEAD, ref: "anpos/milestone" },
        base: { sha: HEAD, ref: "main" },
      }, 201);
    }

    if (path === "/repos/example/project/pulls/7" && method === "GET") {
      return json({
        number: 7,
        state: "open",
        draft: false,
        html_url: "https://github.com/example/project/pull/7",
        head: { sha: FEATURE_HEAD, ref: "anpos/milestone" },
        base: { sha: HEAD, ref: "main" },
        mergeable: true,
        mergeable_state: "clean",
      });
    }

    if (path === `/repos/example/project/commits/${FEATURE_HEAD}/check-runs` && method === "GET") {
      return json({
        check_runs: [
          {
            id: 99,
            name: "ci",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/example/project/actions/runs/99",
          },
        ],
      });
    }

    if (path === "/repos/example/project/pulls/7/merge" && method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.sha, FEATURE_HEAD);
      assert.equal(body.merge_method, "merge");
      mergeCalls += 1;
      merged = true;
      return json({ merged: true, sha: MERGE_HEAD, message: "Pull Request successfully merged" });
    }

    return json({ message: `unexpected ${method} ${path}` }, 500);
  }) as typeof fetch;

  return {
    fetchImpl,
    counts: () => ({ createdBranches, createdPulls, mergeCalls }),
    treeBody: () => treeRequestBody,
  };
}

async function preparePlanAndPullRequest(store: MemoryStore, harness: ReturnType<typeof githubHarness>) {
  const plan = await createRepositoryWritePlan({
    repository: "example/project",
    expectedTargetHeadSha: HEAD,
    changes: [{ path: "README.md", action: "upsert", content: "updated\n" }],
    commitMessage: "Update README",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  await applyRepositoryWritePlan({
    planId: plan.plan_id,
    branchName: "anpos/milestone",
    idempotencyKey: `apply:prepare:${plan.plan_id.slice(0, 8)}`,
    confirmDeletions: false,
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  await openRepositoryChangeRequest({
    repository: "example/project",
    planId: plan.plan_id,
    headBranch: "anpos/milestone",
    expectedHeadSha: FEATURE_HEAD,
    title: "Update README",
    body: "Bound change",
    idempotencyKey: `pr:prepare:${plan.plan_id.slice(0, 8)}`,
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  return plan;
}

test("guarded write plan binds active project head, blob SHA and executable mode", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  const plan = await createRepositoryWritePlan({
    repository: "example/project",
    expectedTargetHeadSha: HEAD,
    changes: [
      { path: "README.md", action: "upsert", content: "updated\n" },
      { path: "notes.txt", action: "upsert", content: "new\n" },
    ],
    commitMessage: "Update project docs",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  assert.equal(plan.repository_full_name, "example/project");
  assert.equal(plan.expected_target_head_sha, HEAD);
  assert.equal(plan.safe_to_apply, true);
  assert.equal(plan.changes[0].expected_blob_sha, README_SHA);
  assert.equal(plan.changes[0].expected_mode, "100755");
  assert.equal(plan.changes[1].expected_blob_sha, null);
  assert.equal(plan.changes[1].expected_mode, null);
  assert.match(plan.plan_digest_sha256, /^[0-9a-f]{64}$/);
});

test("feature-branch apply preserves mode and replays successful idempotency key", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  const plan = await createRepositoryWritePlan({
    repository: "example/project",
    expectedTargetHeadSha: HEAD,
    changes: [{ path: "README.md", action: "upsert", content: "updated\n" }],
    commitMessage: "Update README",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  const input = {
    planId: plan.plan_id,
    branchName: "anpos/milestone",
    idempotencyKey: "apply:milestone:001",
    confirmDeletions: false,
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  };
  const applied = await applyRepositoryWritePlan(input, store, harness.fetchImpl);
  const replay = await applyRepositoryWritePlan(input, store, harness.fetchImpl);

  assert.deepEqual(replay, applied);
  assert.equal(applied.resulting_head_sha, FEATURE_HEAD);
  assert.equal(harness.counts().createdBranches, 1);
  assert.equal(harness.treeBody().tree[0].mode, "100755");
});

test("applied plan is bound to exact feature branch and head before PR creation", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  const plan = await createRepositoryWritePlan({
    repository: "example/project",
    expectedTargetHeadSha: HEAD,
    changes: [{ path: "README.md", action: "upsert", content: "updated\n" }],
    commitMessage: "Update README",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);
  await applyRepositoryWritePlan({
    planId: plan.plan_id,
    branchName: "anpos/milestone",
    idempotencyKey: "apply:milestone:002",
    confirmDeletions: false,
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  await assert.rejects(
    () => openRepositoryChangeRequest({
      repository: "example/project",
      planId: plan.plan_id,
      headBranch: "anpos/other",
      expectedHeadSha: FEATURE_HEAD,
      title: "Wrong branch",
      body: "",
      idempotencyKey: "pr:milestone:bad1",
      githubUserId: 42,
      billingAccountId: BILLING_ACCOUNT_ID,
      token: "token",
    }, store, harness.fetchImpl),
    /APPLIED_PLAN_BRANCH_BINDING_MISMATCH/,
  );

  const opened = await openRepositoryChangeRequest({
    repository: "example/project",
    planId: plan.plan_id,
    headBranch: "anpos/milestone",
    expectedHeadSha: FEATURE_HEAD,
    title: "Update README",
    body: "Bound change",
    idempotencyKey: "pr:milestone:001",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);
  assert.equal(opened.change_request_id, 7);
  assert.equal(opened.head_sha, FEATURE_HEAD);
  assert.equal(harness.counts().createdPulls, 1);
});

test("guarded merge requires clean exact-head PR and green checks then rereads main", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  const plan = await preparePlanAndPullRequest(store, harness);

  const current = await getRepositoryChangeRequest({
    repository: "example/project",
    changeRequestId: 7,
    token: "token",
  }, harness.fetchImpl);
  assert.equal(current.mergeability, "clean");
  assert.equal(current.head_sha, FEATURE_HEAD);

  const ci = await getRepositoryCi({
    repository: "example/project",
    commitSha: FEATURE_HEAD,
    token: "token",
  }, harness.fetchImpl);
  assert.equal(ci.overall_state, "green");
  assert.equal(ci.checks_configured, true);

  const merged = await mergeRepositoryChangeRequest({
    repository: "example/project",
    planId: plan.plan_id,
    billingAccountId: BILLING_ACCOUNT_ID,
    changeRequestId: 7,
    expectedHeadSha: FEATURE_HEAD,
    mergeMethod: "merge",
    confirmMerge: true,
    idempotencyKey: "merge:milestone:001",
    githubUserId: 42,
    token: "token",
  }, store, harness.fetchImpl);
  assert.equal(merged.merged, true);
  assert.equal(merged.merge_commit_sha, MERGE_HEAD);
  assert.equal(merged.resulting_default_branch_head_sha, MERGE_HEAD);
  assert.equal(harness.counts().mergeCalls, 1);
});

test("guarded merge fails closed when no CI check runs are configured", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  const plan = await preparePlanAndPullRequest(store, harness);
  const noChecks = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    if (decodeURIComponent(url.pathname) === `/repos/example/project/commits/${FEATURE_HEAD}/check-runs`) {
      return json({ check_runs: [] });
    }
    return harness.fetchImpl(input, init);
  }) as typeof fetch;

  const ci = await getRepositoryCi({
    repository: "example/project",
    commitSha: FEATURE_HEAD,
    token: "token",
  }, noChecks);
  assert.equal(ci.overall_state, "unconfigured");
  assert.equal(ci.checks_configured, false);

  await assert.rejects(
    () => mergeRepositoryChangeRequest({
      repository: "example/project",
      planId: plan.plan_id,
      billingAccountId: BILLING_ACCOUNT_ID,
      changeRequestId: 7,
      expectedHeadSha: FEATURE_HEAD,
      mergeMethod: "merge",
      confirmMerge: true,
      idempotencyKey: "merge:no-ci:001",
      githubUserId: 42,
      token: "token",
    }, store, noChecks),
    /CHANGE_REQUEST_CHECKS_NOT_GREEN/,
  );
});

test("guarded write plan cannot switch billing account or merge an unrelated pull request", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  const plan = await createRepositoryWritePlan({
    repository: "example/project",
    expectedTargetHeadSha: HEAD,
    changes: [{ path: "README.md", action: "upsert", content: "updated\n" }],
    commitMessage: "Update README",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  await assert.rejects(
    () => applyRepositoryWritePlan({
      planId: plan.plan_id,
      branchName: "anpos/milestone",
      idempotencyKey: "apply:wrong-billing:001",
      confirmDeletions: false,
      githubUserId: 42,
      billingAccountId: 99,
      token: "token",
    }, store, harness.fetchImpl),
    /WRITE_PLAN_BILLING_ACCOUNT_MISMATCH/,
  );

  await applyRepositoryWritePlan({
    planId: plan.plan_id,
    branchName: "anpos/milestone",
    idempotencyKey: "apply:chain:001",
    confirmDeletions: false,
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);
  await openRepositoryChangeRequest({
    repository: "example/project",
    planId: plan.plan_id,
    headBranch: "anpos/milestone",
    expectedHeadSha: FEATURE_HEAD,
    title: "Update README",
    body: "",
    idempotencyKey: "pr:chain:001",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  await assert.rejects(
    () => mergeRepositoryChangeRequest({
      repository: "example/project",
      planId: plan.plan_id,
      billingAccountId: BILLING_ACCOUNT_ID,
      changeRequestId: 8,
      expectedHeadSha: FEATURE_HEAD,
      mergeMethod: "merge",
      confirmMerge: true,
      idempotencyKey: "merge:wrong-pr:001",
      githubUserId: 42,
      token: "token",
    }, store, harness.fetchImpl),
    /WRITE_PLAN_CHANGE_REQUEST_MISMATCH/,
  );
});

test("generic write path rejects secret-bearing paths and non-active repositories", async () => {
  const store = new MemoryStore();
  await assert.rejects(
    () => createRepositoryWritePlan({
      repository: "example/project",
      expectedTargetHeadSha: HEAD,
      changes: [{ path: ".env", action: "upsert", content: "TOKEN=x" }],
      commitMessage: "Bad",
      githubUserId: 42,
      billingAccountId: BILLING_ACCOUNT_ID,
      token: "token",
    }, store, githubHarness().fetchImpl),
    /SECRET_BEARING_PATH_FORBIDDEN/,
  );

  await assert.rejects(
    () => createRepositoryWritePlan({
      repository: "example/project",
      expectedTargetHeadSha: HEAD,
      changes: [{ path: "README.md", action: "upsert", content: "x" }],
      commitMessage: "Bad classification",
      githubUserId: 42,
      billingAccountId: BILLING_ACCOUNT_ID,
      token: "token",
    }, store, githubHarness({ active: false }).fetchImpl),
    /ACTIVE_ANPOS_PROJECT_REQUIRED/,
  );
});

test("generic write path rejects stale expected main head and direct/default branches", async () => {
  const store = new MemoryStore();
  const harness = githubHarness();
  await assert.rejects(
    () => createRepositoryWritePlan({
      repository: "example/project",
      expectedTargetHeadSha: "9".repeat(40),
      changes: [{ path: "README.md", action: "upsert", content: "x" }],
      commitMessage: "Stale",
      githubUserId: 42,
      billingAccountId: BILLING_ACCOUNT_ID,
      token: "token",
    }, store, harness.fetchImpl),
    /EXPECTED_TARGET_HEAD_MISMATCH/,
  );

  const plan = await createRepositoryWritePlan({
    repository: "example/project",
    expectedTargetHeadSha: HEAD,
    changes: [{ path: "README.md", action: "upsert", content: "x" }],
    commitMessage: "Valid",
    githubUserId: 42,
    billingAccountId: BILLING_ACCOUNT_ID,
    token: "token",
  }, store, harness.fetchImpl);

  await assert.rejects(
    () => applyRepositoryWritePlan({
      planId: plan.plan_id,
      branchName: "main",
      idempotencyKey: "apply:direct:001",
      confirmDeletions: false,
      githubUserId: 42,
      billingAccountId: BILLING_ACCOUNT_ID,
      token: "token",
    }, store, harness.fetchImpl),
    /INVALID_FEATURE_BRANCH/,
  );
});
