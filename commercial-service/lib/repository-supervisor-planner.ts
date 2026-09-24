import { createHash, randomUUID } from "node:crypto";
import packageJson from "../package.json";
import { templateReleasePlanSnapshot, type CommercialReleasePlanSnapshot } from "./github";
import {
  auditGithubRepository,
  listGithubRepositoryTree,
  resolveGithubRepository,
  RepositorySupervisorError,
  type RepositorySupervisorAudit,
  type RepositorySupervisorClassification,
  type RepositoryTreeEntry,
} from "./repository-supervisor-runtime";
import {
  loadGithubSupervisorPlanForApply,
  persistGithubSupervisorPlan,
  type StoredSupervisorPlanEnvelope,
  type SupervisorPlanMode,
} from "./repository-supervisor-write";

export type FullPlannerMode = Exclude<SupervisorPlanMode, "bounded_change">;
export type GithubSecurityCapability = "enabled" | "unavailable" | "unknown";
export type ConflictResolutionChoice = "keep_target" | "use_release";

export type ConflictResolutionInput = {
  path: unknown;
  resolution: unknown;
  expected_target_git_object?: unknown;
  acknowledge_project_state_replacement?: unknown;
};

export type ConflictResolutionDecision = {
  path: string;
  resolution: ConflictResolutionChoice;
  expected_target_git_object: string | null;
  acknowledge_project_state_replacement: boolean;
};

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
  release_bytes: number;
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
  resolution?: {
    source_plan_id: string;
    source_plan_hash: string;
    resolved_by_github_login: string;
    decisions: ConflictResolutionDecision[];
  } | null;
  conflict_free: boolean;
  planning_complete: true;
  safe_to_apply: boolean;
  apply_implementation:
    | "sandbox_full_plan_v1"
    | "guarded_empty_repository_v1"
    | "conflict_resolution_required"
    | "no_changes";
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
      release_bytes: file.size,
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
    safe_to_apply:
      counts.manual_merge === 0
      && counts.migration_review === 0
      && counts.add_from_release + counts.replace_from_release + counts.bootstrap_transform > 0,
    apply_implementation:
      input.mode === "bootstrap_empty"
        ? "guarded_empty_repository_v1"
        : counts.manual_merge > 0 || counts.migration_review > 0
          ? "conflict_resolution_required"
          : counts.add_from_release + counts.replace_from_release + counts.bootstrap_transform === 0
            ? "no_changes"
            : "sandbox_full_plan_v1",
  };
}


function normalizedResolutionTarget(value: unknown): string | null {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new RepositorySupervisorError(400, "conflict_resolution_expected_target_invalid");
  }
  return normalized;
}

function summarizeResolvedActions(actions: PlannerAction[]) {
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
  return counts;
}

export function buildResolvedFullPlannerPayload(input: {
  source_payload: FullPlannerPayload;
  source_plan_id: string;
  source_plan_hash: string;
  resolutions: ConflictResolutionInput[];
  resolved_by_github_login: string;
}): FullPlannerPayload {
  const source = validateStoredFullPlannerPayload(input.source_payload);
  if (
    source.apply_implementation !== "conflict_resolution_required"
    || source.conflict_free
    || source.safe_to_apply
  ) throw new RepositorySupervisorError(409, "source_plan_does_not_require_conflict_resolution");
  if (!/^[0-9a-f-]{36}$/.test(input.source_plan_id)) {
    throw new RepositorySupervisorError(400, "source_plan_id_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(input.source_plan_hash)) {
    throw new RepositorySupervisorError(400, "source_plan_hash_invalid");
  }
  const resolver = ownerHandle(input.resolved_by_github_login);
  const blockers = source.actions.filter((action) => action.action === "manual_merge" || action.action === "migration_review");
  if (!blockers.length) throw new RepositorySupervisorError(409, "source_plan_has_no_resolvable_conflicts");
  if (!Array.isArray(input.resolutions) || input.resolutions.length !== blockers.length) {
    throw new RepositorySupervisorError(400, "all_plan_conflicts_require_exact_resolution");
  }

  const blockerByPath = new Map(blockers.map((action) => [action.path, action]));
  const normalized = new Map<string, ConflictResolutionDecision>();
  for (const raw of input.resolutions) {
    const path = typeof raw?.path === "string" ? raw.path.trim() : "";
    if (!path || path.length > 512 || normalized.has(path)) {
      throw new RepositorySupervisorError(400, "conflict_resolution_path_invalid_or_duplicate");
    }
    const blocker = blockerByPath.get(path);
    if (!blocker) throw new RepositorySupervisorError(400, "conflict_resolution_path_not_blocking");
    const resolution = raw.resolution;
    if (resolution !== "keep_target" && resolution !== "use_release") {
      throw new RepositorySupervisorError(400, "conflict_resolution_choice_invalid");
    }
    const expectedTarget = normalizedResolutionTarget(raw.expected_target_git_object);
    const actualTarget = blocker.target_git_object?.toLowerCase() ?? null;
    if (expectedTarget !== actualTarget) {
      throw new RepositorySupervisorError(409, "conflict_resolution_target_object_changed");
    }
    const acknowledge = raw.acknowledge_project_state_replacement === true;
    if (resolution === "keep_target" && !actualTarget) {
      throw new RepositorySupervisorError(409, "conflict_resolution_keep_target_missing_target");
    }
    if (resolution === "use_release" && blocker.action === "migration_review" && !acknowledge) {
      throw new RepositorySupervisorError(409, "project_state_replacement_acknowledgement_required");
    }
    normalized.set(path, {
      path,
      resolution,
      expected_target_git_object: expectedTarget,
      acknowledge_project_state_replacement: acknowledge,
    });
  }

  const actions = source.actions.map((action): PlannerAction => {
    if (action.action !== "manual_merge" && action.action !== "migration_review") return { ...action };
    const decision = normalized.get(action.path);
    if (!decision) throw new RepositorySupervisorError(400, "all_plan_conflicts_require_exact_resolution");
    if (decision.resolution === "keep_target") {
      return {
        ...action,
        action: "preserve_project_state",
        reason: "explicit_conflict_resolution_keep_target",
        confirmation_required: false,
      };
    }
    const useBootstrapTransform = ["bootstrap_child", "adopt_existing"].includes(source.mode) && isBootstrapTransform(action.path);
    return {
      ...action,
      action: useBootstrapTransform
        ? "bootstrap_transform"
        : action.target_git_object
          ? "replace_from_release"
          : "add_from_release",
      reason: action.action === "migration_review"
        ? "explicit_conflict_resolution_use_release_with_project_state_acknowledgement"
        : "explicit_conflict_resolution_use_release",
      confirmation_required: false,
    };
  });

  const counts = summarizeResolvedActions(actions);
  if (counts.manual_merge !== 0 || counts.migration_review !== 0) {
    throw new RepositorySupervisorError(500, "resolved_plan_still_contains_conflicts");
  }
  const writeCount = counts.add_from_release + counts.replace_from_release + counts.bootstrap_transform;
  return {
    ...source,
    actions,
    summary: {
      ...source.summary,
      unchanged: counts.unchanged,
      add_from_release: counts.add_from_release,
      replace_from_release: counts.replace_from_release,
      bootstrap_transform: counts.bootstrap_transform,
      manual_merge: 0,
      preserve_project_state: counts.preserve_project_state,
      migration_review: 0,
    },
    resolution: {
      source_plan_id: input.source_plan_id,
      source_plan_hash: input.source_plan_hash,
      resolved_by_github_login: resolver,
      decisions: blockers.map((blocker) => normalized.get(blocker.path)!),
    },
    conflict_free: true,
    safe_to_apply: writeCount > 0,
    apply_implementation: writeCount > 0 ? "sandbox_full_plan_v1" : "no_changes",
  };
}

function releaseStillMatches(
  payload: FullPlannerPayload,
  release: CommercialReleasePlanSnapshot,
): boolean {
  return (
    payload.release.repository === release.repository
    && payload.release.release_ref === release.release_ref
    && payload.release.source_revision === release.source_revision
    && payload.release.source_tree === release.source_tree
    && payload.release.file_count === release.file_count
    && payload.release.total_bytes === release.total_bytes
  );
}

export async function resolveGithubFullAnposPlan(input: {
  source_plan_id: unknown;
  source_plan_hash: unknown;
  resolutions: ConflictResolutionInput[];
}, principal: { id: number; login: string }, billingAccountId: number, token: string, fetchImpl: typeof fetch = fetch) {
  const sourcePlanId = typeof input.source_plan_id === "string" ? input.source_plan_id.trim() : "";
  const sourcePlanHash = typeof input.source_plan_hash === "string" ? input.source_plan_hash.trim().toLowerCase() : "";
  const record = await loadGithubSupervisorPlanForApply(
    { plan_id: sourcePlanId, plan_hash: sourcePlanHash },
    principal,
    billingAccountId,
  );
  if (record.mode === "bounded_change") {
    throw new RepositorySupervisorError(409, "bounded_change_conflict_resolution_not_supported");
  }
  if (record.status !== "planned") {
    throw new RepositorySupervisorError(409, "source_plan_not_resolvable");
  }
  const source = validateStoredFullPlannerPayload(record.payload);
  const current = await resolveGithubRepository(record.repository_full_name, token, fetchImpl);
  if (
    current.canonical_repository_id !== record.canonical_repository_id
    || current.default_branch !== record.default_branch
    || current.head_sha?.toLowerCase() !== record.expected_target_head_sha?.toLowerCase()
  ) throw new RepositorySupervisorError(409, "target_head_changed_replan_required");
  if (!current.write_capability) throw new RepositorySupervisorError(403, "repository_write_permission_required");

  const release = await templateReleasePlanSnapshot();
  if (!releaseStillMatches(source, release)) {
    throw new RepositorySupervisorError(409, "verified_release_changed_replan_required");
  }

  const payload = buildResolvedFullPlannerPayload({
    source_payload: source,
    source_plan_id: sourcePlanId,
    source_plan_hash: sourcePlanHash,
    resolutions: input.resolutions,
    resolved_by_github_login: principal.login,
  });
  const stored = await persistGithubSupervisorPlan({
    mode: source.mode,
    canonical_repository_id: record.canonical_repository_id,
    repository_full_name: record.repository_full_name,
    default_branch: record.default_branch,
    expected_target_head_sha: record.expected_target_head_sha,
    payload,
  }, principal, billingAccountId);

  const actionable = payload.actions.filter((row) => row.action !== "unchanged");
  const preview = actionable.slice(0, 200);
  return {
    ...stored,
    supersedes: { plan_id: sourcePlanId, plan_hash: sourcePlanHash },
    release: payload.release,
    target: payload.target,
    summary: payload.summary,
    requirements_83_96: payload.requirements_83_96,
    resolution: payload.resolution,
    conflict_free: payload.conflict_free,
    planning_complete: payload.planning_complete,
    safe_to_apply: payload.safe_to_apply,
    apply_implementation: payload.apply_implementation,
    action_preview: preview,
    action_preview_truncated: actionable.length > preview.length,
    full_action_count: payload.actions.length,
  };
}

export function validateStoredFullPlannerPayload(value: StoredSupervisorPlanEnvelope): FullPlannerPayload {
  const modes: FullPlannerMode[] = [
    "bootstrap_empty",
    "bootstrap_child",
    "adopt_existing",
    "repair_partial",
    "upgrade_active",
  ];
  if (!value || value.v !== 1 || !modes.includes(value.mode as FullPlannerMode)) {
    throw new RepositorySupervisorError(500, "full_plan_payload_invalid");
  }
  const payload = value as FullPlannerPayload;
  if (
    !payload.release
    || !/^[0-9a-f]{40}$/i.test(payload.release.release_ref)
    || !/^[0-9a-f]{40}$/i.test(payload.release.source_revision)
    || !/^[0-9a-f]{40}$/i.test(payload.release.source_tree)
    || !payload.target
    || typeof payload.target.canonical_repository_id !== "string"
    || typeof payload.target.repository_full_name !== "string"
    || typeof payload.target.default_branch !== "string"
    || !Array.isArray(payload.actions)
    || payload.actions.length > MAX_ACTIONS
    || typeof payload.conflict_free !== "boolean"
    || typeof payload.safe_to_apply !== "boolean"
    || ![
      "sandbox_full_plan_v1",
      "guarded_empty_repository_v1",
      "conflict_resolution_required",
      "no_changes",
    ].includes(payload.apply_implementation)
  ) throw new RepositorySupervisorError(500, "full_plan_payload_invalid");

  if (payload.resolution != null) {
    if (
      !payload.resolution
      || !/^[0-9a-f-]{36}$/.test(payload.resolution.source_plan_id)
      || !/^[0-9a-f]{64}$/.test(payload.resolution.source_plan_hash)
      || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(payload.resolution.resolved_by_github_login)
      || !Array.isArray(payload.resolution.decisions)
      || payload.resolution.decisions.length < 1
    ) throw new RepositorySupervisorError(500, "resolved_plan_lineage_invalid");
  }

  const seen = new Set<string>();
  const allowedActions: PlannerActionKind[] = [
    "unchanged",
    "add_from_release",
    "replace_from_release",
    "bootstrap_transform",
    "manual_merge",
    "preserve_project_state",
    "migration_review",
  ];
  for (const action of payload.actions) {
    if (
      !action
      || typeof action.path !== "string"
      || !action.path
      || action.path.length > 512
      || action.path.startsWith("/")
      || action.path.includes("\\")
      || action.path.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")
      || seen.has(action.path)
      || !allowedActions.includes(action.action)
      || !/^[0-9a-f]{40}$/i.test(String(action.release_git_object ?? ""))
      || !/^[0-9a-f]{64}$/i.test(action.release_sha256)
      || !["100644", "100755"].includes(action.release_mode)
      || !Number.isSafeInteger(action.release_bytes)
      || action.release_bytes < 0
      || (action.target_git_object !== null && !/^[0-9a-f]{40}$/i.test(action.target_git_object))
    ) throw new RepositorySupervisorError(500, "full_plan_action_invalid");
    seen.add(action.path);
  }
  return payload;
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
