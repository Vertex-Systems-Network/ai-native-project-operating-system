import { createHash, randomUUID } from "node:crypto";
import packageJson from "../package.json";
import { templateReleasePlanSnapshot, type CommercialReleasePlanSnapshot } from "./github";
import {
  auditGithubRepository,
  listGithubRepositoryTree,
  RepositorySupervisorError,
  type RepositorySupervisorAudit,
  type RepositorySupervisorClassification,
  type RepositoryTreeEntry,
} from "./repository-supervisor-runtime";
import {
  persistGithubSupervisorPlan,
  type StoredSupervisorPlanEnvelope,
  type SupervisorPlanMode,
} from "./repository-supervisor-write";

export type FullPlannerMode = Exclude<SupervisorPlanMode, "bounded_change">;
export type GithubSecurityCapability = "enabled" | "unavailable" | "unknown";

export type PlannerActionKind =
  | "unchanged"
  | "add_from_release"
  | "replace_from_release"
  | "bootstrap_transform"
  | "manual_merge"
  | "preserve_project_state"
  | "migration_review";

export type PlannerAction = {
  path: string;
  action: PlannerActionKind;
  release_git_object: string | null;
  release_sha256: string;
  release_mode: string;
  target_git_object: string | null;
  target_mode: string | null;
  reason: string;
  confirmation_required: boolean;
};

export type FullPlannerPayload = StoredSupervisorPlanEnvelope & {
  mode: FullPlannerMode;
  release: {
    repository: string;
    release_ref: string;
    source_revision: string;
    source_tree: string;
    file_count: number;
    total_bytes: number;
  };
  target: {
    canonical_repository_id: string;
    repository_full_name: string;
    default_branch: string;
    expected_head_sha: string | null;
    classification: RepositorySupervisorClassification;
    protocol_version: string | null;
  };
  bootstrap_context: {
    project_name: string;
    github_owner: string;
    github_security_capability: GithubSecurityCapability;
    instance_id: string;
    initialized_at: string;
  } | null;
  actions: PlannerAction[];
  summary: {
    total_release_files: number;
    unchanged: number;
    add_from_release: number;
    replace_from_release: number;
    bootstrap_transform: number;
    manual_merge: number;
    preserve_project_state: number;
    migration_review: number;
    target_only_preserved: number;
    target_only_digest: string;
  };
  requirements_83_96: {
    policy: "preserve_verified_evidence_never_reset_on_adoption_or_upgrade";
    initialize_without_pass_claims: boolean;
    assurance_summary: RepositorySupervisorAudit["assurance_state_summary"];
    ai_assurance_reverification_required: boolean;
  };
  conflict_free: boolean;
  planning_complete: true;
  safe_to_apply: false;
  apply_implementation: "sandbox_full_plan_pending";
};

const CLASSIFICATION_BY_MODE: Record<FullPlannerMode, RepositorySupervisorClassification> = {
  bootstrap_empty: "empty_repository",
  bootstrap_child: "uninitialized_child",
  adopt_existing: "not_anpos",
  repair_partial: "partial_or_malformed",
  upgrade_active: "active_project",
};

const PROJECT_PRESERVE = new Set([
  "PROJECT-IDEA.md",
  "config/protocol/instance.json",
  "config/ai/project-state.json",
  "config/ai/memory-provenance.json",
  "config/ai/agent-catalog.json",
  "config/coordination/agent-work-queue.json",
  "config/coordination/supervisor-state.json",
  "config/coordination/merge-events.json",
  "config/coordination/agent-alerts.json",
  "config/consent/consent-requests.json",
  "config/integrations/project-management.json",
  "config/integrations/linear-sync.json",
  "config/assurance/assurance-state.json",
  "config/research/evidence-registry.json",
  "config/architecture/decision-records.json",
  "config/ai/asset-registry.json",
  "config/operations/runbooks-and-drills.json",
  "config/audit/audit-journal.json",
  "config/risk/risk-register.json",
  ".github/CODEOWNERS",
]);

const BOOTSTRAP_TRANSFORM = new Set([
  "config/protocol/instance.json",
  "config/ai/project-state.json",
  "config/ai/memory-provenance.json",
  "config/ai/agent-catalog.json",
  "config/coordination/agent-work-queue.json",
  "config/coordination/supervisor-state.json",
  "config/coordination/merge-events.json",
  "config/coordination/agent-alerts.json",
  "config/consent/consent-requests.json",
  "config/integrations/project-management.json",
  "config/integrations/linear-sync.json",
  "config/quality/quality-policy.json",
  "config/github/ruleset-policy.json",
  "config/security/control-plane-policy.json",
  "config/security/trust-policy.json",
  "config/security/threat-model.json",
  "config/runtime/budgets.json",
  "config/release/release-policy.json",
  "config/data/data-governance.json",
  "config/operations/operations-policy.json",
  "config/contracts/migration-policy.json",
  "config/integrations/sync-authority.json",
  "config/design/design-assurance.json",
  "config/testing/conformance-scenarios.json",
  "config/assurance/assurance-state.json",
  "config/research/evidence-registry.json",
  "config/assurance/runtime-executors.json",
  "config/ai/ai-evaluation-policy.json",
  "config/product/product-validation.json",
  "config/product/product-analytics.json",
  "config/product/experimentation-policy.json",
  "config/release/progressive-delivery.json",
  "config/quality/engineering-review-policy.json",
  "config/ai/responsible-ai-policy.json",
  "config/compliance/compliance-profile.json",
  "config/contracts/deprecation-policy.json",
  "config/architecture/decision-records.json",
  "config/ai/asset-registry.json",
  "config/operations/runbooks-and-drills.json",
  "config/audit/audit-journal.json",
  "config/risk/risk-register.json",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
]);

const SHARED_MERGE = new Set(["README.md", ".gitignore"]);
const MAX_RELEASE_FILES = 5_000;
const MAX_ACTIONS = 5_000;
const SOURCE_PROTOCOL_VERSION = String((packageJson as { anpos?: { source_protocol_version?: string } }).anpos?.source_protocol_version ?? "");

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pathStarts(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function isBootstrapTransform(path: string): boolean {
  return BOOTSTRAP_TRANSFORM.has(path) || path.startsWith(".github/workflows/");
}

function isSharedMerge(path: string): boolean {
  return SHARED_MERGE.has(path) || path.startsWith(".github/");
}

function isMaterialAiPath(path: string): boolean {
  return path.startsWith(".ai/") || path.startsWith("config/ai/");
}

function titleFromRepository(fullName: string): string {
  const name = fullName.split("/", 2)[1] ?? fullName;
  return name
    .replace(/[-_.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ownerHandle(value: string): string {
  const normalized = value.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(normalized)) {
    throw new RepositorySupervisorError(400, "invalid_github_owner_handle");
  }
  return normalized;
}

function projectName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || /[\r\n\0]/.test(normalized)) {
    throw new RepositorySupervisorError(400, "invalid_project_name");
  }
  return normalized;
}

function securityCapability(value: unknown): GithubSecurityCapability {
  if (value == null || value === "") return "unknown";
  if (value === "enabled" || value === "unavailable" || value === "unknown") return value;
  throw new RepositorySupervisorError(400, "invalid_github_security_capability");
}

function releaseIdentity(release: CommercialReleasePlanSnapshot) {
  return {
    repository: release.repository,
    release_ref: release.release_ref,
    source_revision: release.source_revision,
    source_tree: release.source_tree,
    file_count: release.file_count,
    total_bytes: release.total_bytes,
  };
}

function actionFor(
  mode: FullPlannerMode,
  path: string,
  releaseObject: string | null,
  target: RepositoryTreeEntry | undefined,
): { action: PlannerActionKind; reason: string; confirmation: boolean } {
  const same = Boolean(target && releaseObject && target.sha === releaseObject);

  if (mode === "bootstrap_empty") {
    if (isBootstrapTransform(path)) {
      return { action: "bootstrap_transform", reason: "child_runtime_identity_or_policy_requires_bootstrap_transformation", confirmation: false };
    }
    return { action: "add_from_release", reason: "empty_repository_receives_verified_sanitized_release_file", confirmation: false };
  }

  if (mode === "bootstrap_child") {
    if (isBootstrapTransform(path)) {
      return { action: "bootstrap_transform", reason: "template_child_requires_deterministic_runtime_reset_even_when_template_blob_matches", confirmation: false };
    }
    if (same) return { action: "unchanged", reason: "target_git_object_matches_verified_release", confirmation: false };
    if (!target) return { action: "add_from_release", reason: "missing_in_uninitialized_child", confirmation: false };
    if (isSharedMerge(path)) {
      return { action: "manual_merge", reason: "shared_template_file_changed_before_bootstrap_requires_review", confirmation: true };
    }
    return { action: "replace_from_release", reason: "uninitialized_template_control_file_drifted_from_verified_release", confirmation: false };
  }

  if (mode === "adopt_existing") {
    if (isBootstrapTransform(path)) {
      if (!target || same) {
        return { action: "bootstrap_transform", reason: "adopted_repository_requires_child_runtime_initialization", confirmation: false };
      }
      return {
        action: "manual_merge",
        reason: "existing_bootstrap_target_collision_requires_review_before_child_runtime_initialization",
        confirmation: true,
      };
    }
    if (same) return { action: "unchanged", reason: "target_git_object_matches_verified_release", confirmation: false };
    if (!target) return { action: "add_from_release", reason: "safe_new_anpos_release_path", confirmation: false };
    return {
      action: "manual_merge",
      reason: "existing_repository_collision_is_never_auto_overwritten_during_adoption",
      confirmation: true,
    };
  }

  if (same) return { action: "unchanged", reason: "target_git_object_matches_verified_release", confirmation: false };

  if (mode === "repair_partial") {
    if (PROJECT_PRESERVE.has(path)) {
      if (!target) {
        return {
          action: "migration_review",
          reason: "missing_project_state_or_evidence_requires_explicit_repair_without_resetting_verified_history",
          confirmation: true,
        };
      }
      return {
        action: "preserve_project_state",
        reason: "project_specific_state_or_evidence_is_preserved_during_repair",
        confirmation: false,
      };
    }
    if (target && isSharedMerge(path)) {
      return { action: "manual_merge", reason: "shared_repository_policy_collision_requires_review", confirmation: true };
    }
    if (!target) return { action: "add_from_release", reason: "missing_anpos_control_path", confirmation: false };
    return { action: "replace_from_release", reason: "malformed_anpos_control_path_repaired_from_verified_release", confirmation: false };
  }

  if (PROJECT_PRESERVE.has(path)) {
    if (!target) {
      return {
        action: "migration_review",
        reason: "upgrade_cannot_recreate_missing_project_state_from_template_without_evidence_review",
        confirmation: true,
      };
    }
    return {
      action: "migration_review",
      reason: "verified_project_state_or_evidence_differs_from_release_and_requires_non_destructive_migration",
      confirmation: true,
    };
  }
  if (target && isSharedMerge(path)) {
    return { action: "manual_merge", reason: "shared_repository_policy_or_document_requires_conservative_merge", confirmation: true };
  }
  if (!target) return { action: "add_from_release", reason: "new_anpos_release_path", confirmation: false };
  return { action: "replace_from_release", reason: "anpos_owned_path_updates_to_verified_release", confirmation: false };
}

export function buildFullPlannerPayload(input: {
  mode: FullPlannerMode;
  audit: RepositorySupervisorAudit;
  release: CommercialReleasePlanSnapshot;
  target_tree: RepositoryTreeEntry[];
  project_name?: string;
  github_owner?: string;
  github_security_capability?: GithubSecurityCapability;
  principal_login: string;
  generated_instance_id?: string;
  generated_at?: string;
}): FullPlannerPayload {
  const expectedClassification = CLASSIFICATION_BY_MODE[input.mode];
  if (input.audit.classification === "canonical_source") {
    throw new RepositorySupervisorError(403, "canonical_source_planning_forbidden");
  }
  if (input.audit.classification !== expectedClassification) {
    throw new RepositorySupervisorError(409, `planner_mode_classification_mismatch:${expectedClassification}`);
  }
  if (!SOURCE_PROTOCOL_VERSION || SOURCE_PROTOCOL_VERSION !== "1.4.0") {
    throw new RepositorySupervisorError(500, "planner_protocol_identity_invalid");
  }
  if (
    input.release.file_count !== input.release.files.length
    || input.release.file_count < 1
    || input.release.file_count > MAX_RELEASE_FILES
  ) throw new RepositorySupervisorError(422, "planner_release_file_count_invalid");

  const targetByPath = new Map(input.target_tree.map((entry) => [entry.path, entry]));
  const releasePaths = new Set(input.release.files.map((file) => file.path));
  const targetOnly = input.target_tree.filter((entry) => !releasePaths.has(entry.path));
  const targetOnlyDigest = sha256(
    targetOnly.map((entry) => `${entry.path}\0${entry.mode}\0${entry.sha}`).join("\n"),
  );

  const actions: PlannerAction[] = [];
  let aiDrift = false;
  for (const file of input.release.files) {
    if (!file.git_object || !/^[0-9a-f]{40}$/i.test(file.git_object)) {
      throw new RepositorySupervisorError(422, "planner_release_git_object_required");
    }
    const target = targetByPath.get(file.path);
    const decision = actionFor(input.mode, file.path, file.git_object.toLowerCase(), target);
    if (decision.action !== "unchanged" && isMaterialAiPath(file.path)) aiDrift = true;
    actions.push({
      path: file.path,
      action: decision.action,
      release_git_object: file.git_object.toLowerCase(),
      release_sha256: file.sha256,
      release_mode: file.git_mode,
      target_git_object: target?.sha ?? null,
      target_mode: target?.mode ?? null,
      reason: decision.reason,
      confirmation_required: decision.confirmation,
    });
  }
  if (actions.length > MAX_ACTIONS) throw new RepositorySupervisorError(422, "planner_action_count_too_large");

  const counts: Record<PlannerActionKind, number> = {
    unchanged: 0,
    add_from_release: 0,
    replace_from_release: 0,
    bootstrap_transform: 0,
    manual_merge: 0,
    preserve_project_state: 0,
    migration_review: 0,
  };
  for (const action of actions) counts[action.action] += 1;

  const needsBootstrapContext = ["bootstrap_empty", "bootstrap_child", "adopt_existing"].includes(input.mode);
  const context = needsBootstrapContext ? {
    project_name: projectName(input.project_name ?? titleFromRepository(input.audit.full_name)),
    github_owner: ownerHandle(input.github_owner ?? input.principal_login),
    github_security_capability: securityCapability(input.github_security_capability),
    instance_id: input.generated_instance_id ?? randomUUID(),
    initialized_at: input.generated_at ?? new Date().toISOString(),
  } : null;

  return {
    v: 1,
    mode: input.mode,
    release: releaseIdentity(input.release),
    target: {
      canonical_repository_id: input.audit.canonical_repository_id,
      repository_full_name: input.audit.full_name,
      default_branch: input.audit.default_branch,
      expected_head_sha: input.audit.head_sha,
      classification: input.audit.classification,
      protocol_version: input.audit.anpos_protocol_version,
    },
    bootstrap_context: context,
    actions,
    summary: {
      total_release_files: input.release.file_count,
      unchanged: counts.unchanged,
      add_from_release: counts.add_from_release,
      replace_from_release: counts.replace_from_release,
      bootstrap_transform: counts.bootstrap_transform,
      manual_merge: counts.manual_merge,
      preserve_project_state: counts.preserve_project_state,
      migration_review: counts.migration_review,
      target_only_preserved: targetOnly.length,
      target_only_digest: targetOnlyDigest,
    },
    requirements_83_96: {
      policy: "preserve_verified_evidence_never_reset_on_adoption_or_upgrade",
      initialize_without_pass_claims: ["bootstrap_empty", "bootstrap_child", "adopt_existing"].includes(input.mode),
      assurance_summary: input.audit.assurance_state_summary,
      ai_assurance_reverification_required: aiDrift && ["repair_partial", "upgrade_active"].includes(input.mode),
    },
    conflict_free: counts.manual_merge === 0 && counts.migration_review === 0,
    planning_complete: true,
    safe_to_apply: false,
    apply_implementation: "sandbox_full_plan_pending",
  };
}

export async function createGithubFullAnposPlan(input: {
  mode: FullPlannerMode;
  repository_url: unknown;
  expected_target_head_sha?: unknown;
  project_name?: unknown;
  github_owner?: unknown;
  github_security_capability?: unknown;
}, principal: { id: number; login: string }, billingAccountId: number, token: string, fetchImpl: typeof fetch = fetch) {
  const audit = await auditGithubRepository(input.repository_url, token, fetchImpl);
  if (audit.classification === "canonical_source") {
    throw new RepositorySupervisorError(403, "canonical_source_planning_forbidden");
  }
  if (!audit.write_capability) throw new RepositorySupervisorError(403, "repository_write_permission_required");

  if (input.expected_target_head_sha != null) {
    const asserted = String(input.expected_target_head_sha).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/i.test(asserted)) {
      throw new RepositorySupervisorError(400, "expected_target_head_sha_invalid");
    }
    if (!audit.head_sha || audit.head_sha.toLowerCase() !== asserted) {
      throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
    }
  }

  const [release, targetTree] = await Promise.all([
    templateReleasePlanSnapshot(),
    audit.head_sha
      ? listGithubRepositoryTree(audit.full_name, audit.head_sha, token, fetchImpl)
      : Promise.resolve([] as RepositoryTreeEntry[]),
  ]);

  const payload = buildFullPlannerPayload({
    mode: input.mode,
    audit,
    release,
    target_tree: targetTree,
    project_name: typeof input.project_name === "string" ? input.project_name : undefined,
    github_owner: typeof input.github_owner === "string" ? input.github_owner : undefined,
    github_security_capability: securityCapability(input.github_security_capability),
    principal_login: principal.login,
  });

  const stored = await persistGithubSupervisorPlan({
    mode: input.mode,
    canonical_repository_id: audit.canonical_repository_id,
    repository_full_name: audit.full_name,
    default_branch: audit.default_branch,
    expected_target_head_sha: audit.head_sha,
    payload,
  }, principal, billingAccountId);

  const actionable = payload.actions.filter((row) => row.action !== "unchanged");
  const preview = actionable.slice(0, 200);
  return {
    ...stored,
    release: payload.release,
    target: payload.target,
    bootstrap_context: payload.bootstrap_context,
    summary: payload.summary,
    requirements_83_96: payload.requirements_83_96,
    conflict_free: payload.conflict_free,
    planning_complete: payload.planning_complete,
    safe_to_apply: payload.safe_to_apply,
    apply_implementation: payload.apply_implementation,
    action_preview: preview,
    action_preview_truncated: actionable.length > preview.length,
    full_action_count: payload.actions.length,
    confirmation_paths: payload.actions
      .filter((row) => row.confirmation_required)
      .slice(0, 200)
      .map((row) => row.path),
  };
}
