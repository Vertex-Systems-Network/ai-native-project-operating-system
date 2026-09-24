import assert from "node:assert/strict";
import test from "node:test";
import {
  auditGithubRepository,
  getGithubRepositoryAssurance,
  normalizeGithubRepositoryLocator,
  profileGithubAccount,
  RepositorySupervisorError,
  resolveGithubRepository,
  SUPERVISOR_AUDIT_PATHS,
} from "../lib/repository-supervisor-runtime";

const HEAD = "a".repeat(40);

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fileBody(value: unknown, sha = "b".repeat(40)) {
  return {
    type: "file",
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value), "utf8").toString("base64"),
    size: Buffer.byteLength(JSON.stringify(value), "utf8"),
    sha,
  };
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    const auth = new Headers(init?.headers).get("Authorization");
    assert.equal(auth, "Bearer token");
    return handler(url, init);
  }) as typeof fetch;
}

function repositoryMetadata(size = 10) {
  return {
    id: 123,
    full_name: "example/project",
    html_url: "https://github.com/example/project",
    private: true,
    archived: false,
    default_branch: "main",
    size,
    permissions: { pull: true, push: true },
  };
}

function activeFiles() {
  const rows = Array.from({ length: 14 }, (_, index) => {
    const n = 83 + index;
    return {
      requirement_id: `REQ-${n}`,
      name: `Requirement ${n}`,
      applicability: n === 92 ? "pending_detection" : "applicable",
      state: n === 83 ? "passed" : "not_started",
      reason: null,
      evidence_refs: n === 83 ? ["EVID-000001"] : [],
      last_verified_ref: n === 83 ? HEAD : null,
      last_verified_at: n === 83 ? "2026-09-24T00:00:00Z" : null,
      blocking_findings: n === 90 ? ["privacy_review_pending"] : [],
    };
  });
  const values: Record<string, unknown> = {
    ".ai/manifest.json": { protocol: "ANPOS", schema_version: 7 },
    "config/protocol/instance.json": {
      instance_status: "active_project",
      bootstrap_completed: true,
      source_protocol_version: "1.4.0",
    },
    "config/protocol/version.json": { version: "1.4.0" },
    "config/assurance/assurance-state.json": { requirements: rows },
    "config/research/evidence-registry.json": { evidence: [] },
    "config/ai/asset-registry.json": { assets: [] },
    "config/compliance/compliance-profile.json": { status: "pending_applicability_detection" },
    "config/architecture/decision-records.json": { decisions: [] },
    "config/operations/runbooks-and-drills.json": { runbooks: [], drills: [] },
    "config/audit/audit-journal.json": { entries: [] },
    "config/risk/risk-register.json": { risks: [] },
  };
  return values;
}

function activeRepositoryFetch(): typeof fetch {
  const values = activeFiles();
  return mockFetch((url) => {
    if (url.pathname === "/repos/example/project") return response(repositoryMetadata());
    if (url.pathname === "/repos/example/project/branches/main") return response({ commit: { sha: HEAD } });
    if (url.pathname.startsWith("/repos/example/project/contents/")) {
      assert.equal(url.searchParams.get("ref"), HEAD);
      const path = decodeURIComponent(url.pathname.slice("/repos/example/project/contents/".length));
      if (!(path in values)) return response({ message: "Not Found" }, 404);
      return response(fileBody(values[path]));
    }
    if (url.pathname === "/user") return response({ id: 42, login: "octo", name: "Octo User" });
    return response({ message: "unexpected" }, 500);
  });
}

test("GitHub repository locator accepts canonical GitHub HTTPS and owner/repo only", () => {
  assert.deepEqual(normalizeGithubRepositoryLocator("https://github.com/example/project.git"), {
    owner: "example",
    repo: "project",
    full_name: "example/project",
    canonical_url: "https://github.com/example/project",
  });
  assert.equal(normalizeGithubRepositoryLocator("example/project").full_name, "example/project");
  for (const bad of [
    "http://github.com/example/project",
    "https://user:pass@github.com/example/project",
    "https://gitlab.com/example/project",
    "https://github.com/example/project?x=1",
    "file:///tmp/repo",
    "example/project/extra",
  ]) {
    assert.throws(
      () => normalizeGithubRepositoryLocator(bad),
      (error: unknown) => error instanceof RepositorySupervisorError && error.code === "invalid_repository_url",
    );
  }
});

test("repository_resolve binds canonical identity and exact default-branch head", async () => {
  const result = await resolveGithubRepository("https://github.com/example/project", "token", activeRepositoryFetch());
  assert.equal(result.provider, "github");
  assert.equal(result.canonical_repository_id, "github:123");
  assert.equal(result.full_name, "example/project");
  assert.equal(result.default_branch, "main");
  assert.equal(result.head_sha, HEAD);
  assert.equal(result.permission_level, "write");
  assert.equal(result.write_capability, true);
  assert.equal(result.empty_repository, false);
});

test("repository_profile returns authenticated provider account identity", async () => {
  const result = await profileGithubAccount("token", activeRepositoryFetch());
  assert.deepEqual(result, {
    provider: "github",
    account_id: "github:42",
    account_display_name: "Octo User",
    account_login: "octo",
  });
});

test("repository_audit classifies active ANPOS child and summarizes Requirements 83-96", async () => {
  const result = await auditGithubRepository("example/project", "token", activeRepositoryFetch());
  assert.equal(result.classification, "active_project");
  assert.equal(result.head_sha, HEAD);
  assert.equal(result.anpos_protocol_version, "1.4.0");
  assert.equal(result.assurance_state_summary?.total, 14);
  assert.equal(result.assurance_state_summary?.verified_requirements, 1);
  assert.equal(result.assurance_state_summary?.blocking_findings, 1);
  assert.equal(result.governance_state_summary?.total, 8);
  assert.equal(result.classification_evidence.observed_paths["config/assurance/assurance-state.json"], "present");
  assert.equal(SUPERVISOR_AUDIT_PATHS.length, 11);
});

test("repository_audit classifies an empty repository without pretending ANPOS state exists", async () => {
  let controlReads = 0;
  const fetchImpl = mockFetch((url) => {
    if (url.pathname === "/repos/example/project") return response(repositoryMetadata(0));
    if (url.pathname === "/repos/example/project/branches/main") return response({ message: "Not Found" }, 404);
    if (url.pathname.includes("/contents/")) controlReads += 1;
    return response({ message: "unexpected" }, 500);
  });
  const result = await auditGithubRepository("example/project", "token", fetchImpl);
  assert.equal(result.classification, "empty_repository");
  assert.equal(result.head_sha, null);
  assert.equal(result.assurance_state_summary, null);
  assert.equal(controlReads, 0);
});

test("repository_get_assurance requires immutable SHA and returns evidence bound to that ref", async () => {
  const result = await getGithubRepositoryAssurance("example/project", HEAD, "token", activeRepositoryFetch());
  assert.equal(result.anpos_protocol_version, "1.4.0");
  assert.equal(result.requirements.length, 14);
  assert.deepEqual(result.blocking_findings, ["privacy_review_pending"]);
  assert.deepEqual(result.evidence_refs, ["EVID-000001"]);
  assert.equal(result.verified_ref, HEAD);

  await assert.rejects(
    () => getGithubRepositoryAssurance("example/project", "main", "token", activeRepositoryFetch()),
    (error: unknown) => error instanceof RepositorySupervisorError && error.code === "immutable_ref_required",
  );
});
