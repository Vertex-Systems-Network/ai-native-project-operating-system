import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFullPlannerPayload,
  buildResolvedFullPlannerPayload,
  type FullPlannerMode,
} from "../lib/repository-supervisor-planner";
import type { RepositorySupervisorAudit, RepositoryTreeEntry } from "../lib/repository-supervisor-runtime";
import type { CommercialReleasePlanSnapshot } from "../lib/github";

const RELEASE: CommercialReleasePlanSnapshot = {
  schema_version: 1,
  export_mode: "template",
  source_revision: "1".repeat(40),
  source_tree: "2".repeat(40),
  source_scope: "canonical-minus-vendor-only-paths",
  source_material: "committed_git_blobs_at_head",
  tracked_source_only: true,
  contains_secrets: false,
  file_count: 4,
  total_bytes: 40,
  repository: "Vertex-Systems-Network/anpos-commercial-template",
  release_ref: "3".repeat(40),
  files: [
    { path: ".ai/manifest.json", origin: ".ai/manifest.json", git_mode: "100644", git_object: "a".repeat(40), size: 10, sha256: "1".repeat(64) },
    { path: "README.md", origin: "README.md", git_mode: "100644", git_object: "b".repeat(40), size: 10, sha256: "2".repeat(64) },
    { path: "config/assurance/assurance-state.json", origin: "config/assurance/assurance-state.json", git_mode: "100644", git_object: "c".repeat(40), size: 10, sha256: "3".repeat(64) },
    { path: "config/protocol/instance.json", origin: "config/protocol/instance.json", git_mode: "100644", git_object: "d".repeat(40), size: 10, sha256: "4".repeat(64) },
  ],
};

function audit(mode: FullPlannerMode): RepositorySupervisorAudit {
  const classifications = {
    bootstrap_empty: "empty_repository",
    bootstrap_child: "uninitialized_child",
    adopt_existing: "not_anpos",
    repair_partial: "partial_or_malformed",
    upgrade_active: "active_project",
  } as const;
  return {
    provider: "github",
    canonical_repository_id: "github:123",
    canonical_url: "https://github.com/example/app",
    full_name: "example/app",
    default_branch: "main",
    head_sha: mode === "bootstrap_empty" ? null : "e".repeat(40),
    permission_level: "write",
    write_capability: true,
    classification: classifications[mode],
    classification_evidence: {
      protocol_detected: mode !== "bootstrap_empty" && mode !== "adopt_existing",
      protocol_version: mode === "upgrade_active" ? "1.3.13" : null,
      instance_status: mode === "upgrade_active" ? "active_project" : null,
      bootstrap_completed: mode === "upgrade_active" ? true : null,
      observed_paths: {},
    },
    anpos_protocol_version: mode === "upgrade_active" ? "1.3.13" : null,
    assurance_state_summary: mode === "upgrade_active" ? {
      total: 14,
      by_state: { verified: 4, not_started: 10 },
      applicable: 10,
      pending_detection: 0,
      blocking_findings: 0,
      evidence_refs: 7,
      verified_requirements: 4,
    } : null,
    governance_state_summary: null,
    limitations: [],
  };
}

function tree(path: string, sha: string): RepositoryTreeEntry {
  return { path, mode: "100644", sha, size: 10 };
}

test("bootstrap_empty plans verified release plus child transforms without writes", () => {
  const plan = buildFullPlannerPayload({
    mode: "bootstrap_empty",
    audit: audit("bootstrap_empty"),
    release: RELEASE,
    target_tree: [],
    principal_login: "octo",
    generated_instance_id: "11111111-1111-4111-8111-111111111111",
    generated_at: "2026-09-24T00:00:00.000Z",
  });
  assert.equal(plan.target.expected_head_sha, null);
  assert.equal(plan.bootstrap_context?.project_name, "App");
  assert.equal(plan.bootstrap_context?.github_owner, "octo");
  assert.equal(plan.summary.bootstrap_transform, 2);
  assert.equal(plan.summary.add_from_release, 2);
  assert.equal(plan.conflict_free, true);
  assert.equal(plan.safe_to_apply, true);
  assert.equal(plan.apply_implementation, "guarded_empty_repository_v1");
  assert.equal(plan.requirements_83_96.initialize_without_pass_claims, true);
});

test("bootstrap_child transforms runtime identity even when template blobs match", () => {
  const plan = buildFullPlannerPayload({
    mode: "bootstrap_child",
    audit: audit("bootstrap_child"),
    release: RELEASE,
    target_tree: [
      tree(".ai/manifest.json", "a".repeat(40)),
      tree("README.md", "b".repeat(40)),
      tree("config/assurance/assurance-state.json", "c".repeat(40)),
      tree("config/protocol/instance.json", "d".repeat(40)),
    ],
    principal_login: "octo",
    generated_instance_id: "11111111-1111-4111-8111-111111111111",
    generated_at: "2026-09-24T00:00:00.000Z",
  });
  assert.equal(plan.actions.find((row) => row.path === "config/protocol/instance.json")?.action, "bootstrap_transform");
  assert.equal(plan.actions.find((row) => row.path === "README.md")?.action, "unchanged");
  assert.equal(plan.actions.find((row) => row.path === ".ai/manifest.json")?.action, "unchanged");
  assert.equal(plan.safe_to_apply, true);
  assert.equal(plan.apply_implementation, "sandbox_full_plan_v1");
});

test("adopt_existing never auto-overwrites collisions and preserves target-only application files", () => {
  const plan = buildFullPlannerPayload({
    mode: "adopt_existing",
    audit: audit("adopt_existing"),
    release: RELEASE,
    target_tree: [
      tree("README.md", "f".repeat(40)),
      tree("src/index.ts", "9".repeat(40)),
    ],
    principal_login: "octo",
    generated_instance_id: "11111111-1111-4111-8111-111111111111",
    generated_at: "2026-09-24T00:00:00.000Z",
  });
  const readme = plan.actions.find((row) => row.path === "README.md");
  assert.equal(readme?.action, "manual_merge");
  assert.equal(readme?.confirmation_required, true);
  assert.equal(plan.summary.target_only_preserved, 1);
  assert.match(plan.summary.target_only_digest, /^[0-9a-f]{64}$/);
  assert.equal(plan.conflict_free, false);
  assert.equal(plan.safe_to_apply, false);
  assert.equal(plan.apply_implementation, "conflict_resolution_required");
  assert.equal(plan.requirements_83_96.initialize_without_pass_claims, true);
});

test("upgrade_active preserves evidence and flags AI assurance re-verification on material drift", () => {
  const plan = buildFullPlannerPayload({
    mode: "upgrade_active",
    audit: audit("upgrade_active"),
    release: RELEASE,
    target_tree: [
      tree(".ai/manifest.json", "9".repeat(40)),
      tree("README.md", "8".repeat(40)),
      tree("config/assurance/assurance-state.json", "7".repeat(40)),
      tree("config/protocol/instance.json", "6".repeat(40)),
    ],
    principal_login: "octo",
  });
  assert.equal(plan.bootstrap_context, null);
  assert.equal(plan.actions.find((row) => row.path === "config/assurance/assurance-state.json")?.action, "migration_review");
  assert.equal(plan.actions.find((row) => row.path === "config/protocol/instance.json")?.action, "migration_review");
  assert.equal(plan.actions.find((row) => row.path === ".ai/manifest.json")?.action, "replace_from_release");
  assert.equal(plan.actions.find((row) => row.path === "README.md")?.action, "manual_merge");
  assert.equal(plan.requirements_83_96.assurance_summary?.verified_requirements, 4);
  assert.equal(plan.requirements_83_96.ai_assurance_reverification_required, true);
  assert.equal(plan.conflict_free, false);
  assert.equal(plan.safe_to_apply, false);
  assert.equal(plan.apply_implementation, "conflict_resolution_required");
});

test("planner mode must match the audited repository classification", () => {
  assert.throws(
    () => buildFullPlannerPayload({
      mode: "upgrade_active",
      audit: audit("adopt_existing"),
      release: RELEASE,
      target_tree: [],
      principal_login: "octo",
    }),
    /planner_mode_classification_mismatch:active_project/,
  );
});


test("resolved plan converts every manual merge into explicit immutable decisions", () => {
  const source = buildFullPlannerPayload({
    mode: "adopt_existing",
    audit: audit("adopt_existing"),
    release: RELEASE,
    target_tree: [
      tree("README.md", "f".repeat(40)),
      tree("src/index.ts", "9".repeat(40)),
    ],
    principal_login: "octo",
    generated_instance_id: "11111111-1111-4111-8111-111111111111",
    generated_at: "2026-09-24T00:00:00.000Z",
  });
  const blocker = source.actions.find((row) => row.path === "README.md");
  assert.equal(blocker?.action, "manual_merge");

  const resolved = buildResolvedFullPlannerPayload({
    source_payload: source,
    source_plan_id: "22222222-2222-4222-8222-222222222222",
    source_plan_hash: "a".repeat(64),
    resolved_by_github_login: "octo",
    resolutions: [{
      path: "README.md",
      resolution: "use_release",
      expected_target_git_object: "f".repeat(40),
    }],
  });
  assert.equal(resolved.conflict_free, true);
  assert.equal(resolved.safe_to_apply, true);
  assert.equal(resolved.apply_implementation, "sandbox_full_plan_v1");
  assert.equal(resolved.actions.find((row) => row.path === "README.md")?.action, "replace_from_release");
  assert.equal(resolved.resolution?.source_plan_hash, "a".repeat(64));
});

test("resolved plan requires explicit acknowledgement before replacing migration-reviewed project state", () => {
  const source = buildFullPlannerPayload({
    mode: "upgrade_active",
    audit: audit("upgrade_active"),
    release: RELEASE,
    target_tree: [
      tree(".ai/manifest.json", "a".repeat(40)),
      tree("README.md", "b".repeat(40)),
      tree("config/assurance/assurance-state.json", "7".repeat(40)),
      tree("config/protocol/instance.json", "6".repeat(40)),
    ],
    principal_login: "octo",
  });
  const blockers = source.actions.filter((row) => row.action === "migration_review");
  assert.equal(blockers.length, 2);

  assert.throws(() => buildResolvedFullPlannerPayload({
    source_payload: source,
    source_plan_id: "33333333-3333-4333-8333-333333333333",
    source_plan_hash: "b".repeat(64),
    resolved_by_github_login: "octo",
    resolutions: [
      {
        path: "config/assurance/assurance-state.json",
        resolution: "use_release",
        expected_target_git_object: "7".repeat(40),
      },
      {
        path: "config/protocol/instance.json",
        resolution: "keep_target",
        expected_target_git_object: "6".repeat(40),
      },
    ],
  }), /project_state_replacement_acknowledgement_required/);

  const resolved = buildResolvedFullPlannerPayload({
    source_payload: source,
    source_plan_id: "33333333-3333-4333-8333-333333333333",
    source_plan_hash: "b".repeat(64),
    resolved_by_github_login: "octo",
    resolutions: [
      {
        path: "config/assurance/assurance-state.json",
        resolution: "use_release",
        expected_target_git_object: "7".repeat(40),
        acknowledge_project_state_replacement: true,
      },
      {
        path: "config/protocol/instance.json",
        resolution: "keep_target",
        expected_target_git_object: "6".repeat(40),
      },
    ],
  });
  assert.equal(resolved.summary.migration_review, 0);
  assert.equal(resolved.conflict_free, true);
  assert.equal(resolved.actions.find((row) => row.path === "config/protocol/instance.json")?.action, "preserve_project_state");
});
