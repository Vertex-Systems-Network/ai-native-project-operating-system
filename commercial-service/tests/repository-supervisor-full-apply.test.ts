import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFullApplySandboxRequest,
  verifyFullApplySandboxOutputs,
} from "../lib/repository-supervisor-full-apply";
import type { FullPlannerPayload } from "../lib/repository-supervisor-planner";
import type { MaterializedTemplateReleaseFile } from "../lib/github";
import type { SandboxExecutionResult } from "../lib/execution-sandbox";

const content = Buffer.from('{"enabled":true}\n', "utf8");
const digest = "a050ef06ea542b8fd8781f1e945f9adcd03c7ae5190719e66ba826e2059fce12";

const payload: FullPlannerPayload = {
  v: 1,
  mode: "repair_partial",
  release: {
    repository: "Vertex-Systems-Network/anpos-commercial-template",
    release_ref: "1".repeat(40),
    source_revision: "2".repeat(40),
    source_tree: "3".repeat(40),
    file_count: 1,
    total_bytes: content.length,
  },
  target: {
    canonical_repository_id: "github:123",
    repository_full_name: "example/app",
    default_branch: "main",
    expected_head_sha: "4".repeat(40),
    classification: "partial_or_malformed",
    protocol_version: "1.4.0",
  },
  bootstrap_context: null,
  actions: [{
    path: "config/example.json",
    action: "replace_from_release",
    release_git_object: "5".repeat(40),
    release_sha256: digest,
    release_mode: "100644",
    release_bytes: content.length,
    target_git_object: "6".repeat(40),
    target_mode: "100644",
    reason: "repair_fixture",
    confirmation_required: false,
  }],
  summary: {
    total_release_files: 1,
    unchanged: 0,
    add_from_release: 0,
    replace_from_release: 1,
    bootstrap_transform: 0,
    manual_merge: 0,
    preserve_project_state: 0,
    migration_review: 0,
    target_only_preserved: 0,
    target_only_digest: "7".repeat(64),
  },
  requirements_83_96: {
    policy: "preserve_verified_evidence_never_reset_on_adoption_or_upgrade",
    initialize_without_pass_claims: false,
    assurance_summary: null,
    ai_assurance_reverification_required: false,
  },
  conflict_free: true,
  planning_complete: true,
  safe_to_apply: true,
  apply_implementation: "sandbox_full_plan_v1",
};

const releaseFile: MaterializedTemplateReleaseFile = {
  path: "config/example.json",
  git_object: "5".repeat(40),
  sha256: digest,
  size: content.length,
  git_mode: "100644",
  content_base64: content.toString("base64"),
};

test("full apply sandbox request uses empty isolated workspace and exact output allowlist", () => {
  const request = buildFullApplySandboxRequest({
    plan_id: "11111111-1111-4111-8111-111111111111",
    payload,
    materialized_release_files: [releaseFile],
  });
  assert.equal(request.source, undefined);
  assert.deepEqual(request.command, ["python3", ".anpos-input/apply.py"]);
  assert.deepEqual(request.output_paths, ["config/example.json"]);
  assert.equal(request.network, "deny");
  assert.equal(request.max_artifact_bytes, 32 * 1024 * 1024);
  assert.ok(request.input_files?.some((file) => file.path === ".anpos-input/apply.py"));
  assert.ok(request.input_files?.some((file) => file.path === ".anpos-input/plan.json"));
  assert.ok(request.input_files?.some((file) => file.path === ".anpos-input/release/config/example.json"));
});

test("full apply accepts exact release output and rejects non-transform drift", () => {
  const good: SandboxExecutionResult = {
    driver_id: "sandbox",
    isolation: "remote_ephemeral",
    exit_code: 0,
    stdout: "{}",
    stderr: "",
    timed_out: false,
    output_truncated: false,
    duration_ms: 10,
    output_files: [{
      path: "config/example.json",
      mode: "100644",
      content_base64: content.toString("base64"),
      sha256: digest,
      bytes: content.length,
    }],
  };
  assert.equal(verifyFullApplySandboxOutputs(payload, good)[0].sha256, digest);

  const drift = Buffer.from('{"enabled":false}\n', "utf8");
  const bad: SandboxExecutionResult = {
    ...good,
    output_files: [{
      path: "config/example.json",
      mode: "100644",
      content_base64: drift.toString("base64"),
      sha256: "f".repeat(64),
      bytes: drift.length,
    }],
  };
  assert.throws(
    () => verifyFullApplySandboxOutputs(payload, bad),
    /full_plan_sandbox_release_output_drift/,
  );
});

test("full apply rejects timeout or truncated sandbox evidence", () => {
  const result: SandboxExecutionResult = {
    driver_id: "sandbox",
    isolation: "remote_ephemeral",
    exit_code: 0,
    stdout: "",
    stderr: "",
    timed_out: true,
    output_truncated: false,
    duration_ms: 900_000,
    output_files: [],
  };
  assert.throws(
    () => verifyFullApplySandboxOutputs(payload, result),
    /full_plan_sandbox_execution_failed/,
  );
});
