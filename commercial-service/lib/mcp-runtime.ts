import { createHash, randomUUID } from "node:crypto";
import { requireGithubAccountAccessForContext, type GitHubAuthContext } from "./auth";
import { getEntitlement, listBillingAccountsForPrincipal, reconcileEntitlement } from "./entitlements";
import { internalSupervisorReadTestGrantActiveForLogin } from "./env";
import {
  mcpBearerChallenge,
  requireMcpScope,
  type McpPrincipal,
} from "./mcp-auth";
import { buildPluginCapabilityMatrix, requirePluginCapability, type PluginEntitlementSnapshot } from "./plugin-entitlements";
import {
  auditGithubRepository,
  getGithubRepositoryAssurance,
  profileGithubAccount,
  resolveGithubRepository,
} from "./repository-supervisor-runtime";
import {
  createGithubWritePlan,
  getGithubWritePlanCi,
  getGithubWritePlanPullRequest,
  mergeGithubWritePlanPullRequest,
  openGithubWritePlanPullRequest,
  type PlannedChange,
} from "./repository-supervisor-write";
import { applyGithubSupervisorPlan } from "./repository-supervisor-full-apply";
import {
  createGithubFullAnposPlan,
  resolveGithubFullAnposPlan,
  type ConflictResolutionInput,
  type FullPlannerMode,
} from "./repository-supervisor-planner";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

const MODERN_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOLS = new Set(["2025-11-25", "2025-06-18", "2025-03-26"]);

const profileSecurity = [{ type: "oauth2", scopes: ["anpos:profile"] }];
const readSecurity = [{ type: "oauth2", scopes: ["anpos:profile", "anpos:repo:read"] }];
const writeSecurity = [{ type: "oauth2", scopes: ["anpos:profile", "anpos:repo:read", "anpos:repo:write"] }];

const profileOutputSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, pattern: "\\S" },
    name: { type: "string" },
    nickname: { type: "string" },
  },
  required: ["id"],
  additionalProperties: false,
};

const billingAccountsOutputSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    accounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          billing_account_id: { type: "integer", minimum: 1 },
          github_login: { type: "string", minLength: 1 },
          github_account_type: { type: "string", enum: ["User", "Organization"] },
          state: { type: "string", minLength: 1 },
          plan_id: { anyOf: [{ type: "string" }, { type: "null" }] },
          capabilities: {
            type: "object",
            properties: {
              repository_supervisor_read: {
                type: "object",
                properties: {
                  allowed: { type: "boolean" },
                  reason: { type: "string", minLength: 1 },
                },
                required: ["allowed", "reason"],
                additionalProperties: false,
              },
              repository_supervisor_write: {
                type: "object",
                properties: {
                  allowed: { type: "boolean" },
                  reason: { type: "string", minLength: 1 },
                },
                required: ["allowed", "reason"],
                additionalProperties: false,
              },
            },
            required: ["repository_supervisor_read", "repository_supervisor_write"],
            additionalProperties: false,
          },
        },
        required: ["billing_account_id", "github_login", "github_account_type", "state", "plan_id", "capabilities"],
        additionalProperties: false,
      },
    },
  },
  required: ["accounts"],
  additionalProperties: false,
};

export const MCP_TOOL_DEFINITIONS = [
  {
    name: "repository_profile",
    title: "Repository account profile",
    description: "Return the GitHub profile represented by the current authenticated MCP connection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: profileOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: profileSecurity,
    _meta: {
      "openai/profile": true,
      securitySchemes: profileSecurity,
    },
  },
  {
    name: "repository_list_billing_accounts",
    title: "List authorized billing accounts",
    description: "Return only billing accounts bound to the authenticated GitHub principal: the principal's own user account and organization accounts with an active assigned seat, re-verified against current GitHub account access. Includes current Repository Supervisor capability decisions so callers never need to guess billing_account_id.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: billingAccountsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: readSecurity,
    _meta: { securitySchemes: readSecurity },
  },
  {
    name: "repository_resolve",
    title: "Resolve repository",
    description: "Resolve a GitHub repository URL to canonical identity and current default-branch head after paid Repository Supervisor authorization.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: { type: "string", minLength: 1, maxLength: 512 },
        billing_account_id: { type: "integer", minimum: 1 },
      },
      required: ["repository_url", "billing_account_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: readSecurity,
    _meta: { securitySchemes: readSecurity },
  },
  {
    name: "repository_audit",
    title: "Audit repository",
    description: "Perform the bounded ANPOS Repository Supervisor audit after server-side paid entitlement authorization.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: { type: "string", minLength: 1, maxLength: 512 },
        billing_account_id: { type: "integer", minimum: 1 },
      },
      required: ["repository_url", "billing_account_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: readSecurity,
    _meta: { securitySchemes: readSecurity },
  },
  {
    name: "repository_get_assurance",
    title: "Read repository assurance",
    description: "Read ANPOS assurance/governance evidence at an immutable commit SHA after server-side paid entitlement authorization.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: { type: "string", minLength: 1, maxLength: 512 },
        ref: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
        billing_account_id: { type: "integer", minimum: 1 },
      },
      required: ["repository_url", "ref", "billing_account_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: readSecurity,
    _meta: { securitySchemes: readSecurity },
  },
  {
    name: "repository_plan_anpos_change",
    title: "Plan ANPOS repository change",
    description: "Create an encrypted no-write plan bound to the exact repository identity and verified ANPOS release. bounded_change accepts explicit file content; full bootstrap/adoption/repair/upgrade modes compare the immutable target tree with the verified private template release and preserve project evidence.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["bounded_change", "bootstrap_empty", "bootstrap_child", "adopt_existing", "repair_partial", "upgrade_active"],
        },
        repository_url: { type: "string", minLength: 1, maxLength: 512 },
        billing_account_id: { type: "integer", minimum: 1 },
        expected_target_head_sha: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
        commit_message: { type: "string", minLength: 1, maxLength: 160 },
        project_name: { type: "string", minLength: 1, maxLength: 120 },
        github_owner: { type: "string", minLength: 1, maxLength: 39 },
        github_security_capability: { type: "string", enum: ["enabled", "unavailable", "unknown"] },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            properties: {
              path: { type: "string", minLength: 1, maxLength: 512 },
              operation: { type: "string", enum: ["upsert", "delete"] },
              content: { type: "string" },
            },
            required: ["path", "operation"],
            additionalProperties: false,
          },
        },
      },
      required: ["mode", "repository_url", "billing_account_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_resolve_plan_conflicts",
    title: "Resolve full-plan conflicts",
    description: "Derive a new no-write full ANPOS plan from one exact conflict-blocked source plan. Every manual_merge or migration_review path requires an explicit decision bound to the observed target Git object. Project-state replacement additionally requires acknowledgement.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: { type: "integer", minimum: 1 },
        source_plan_id: { type: "string", minLength: 36, maxLength: 36 },
        source_plan_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
        resolutions: {
          type: "array",
          minItems: 1,
          maxItems: 5000,
          items: {
            type: "object",
            properties: {
              path: { type: "string", minLength: 1, maxLength: 512 },
              resolution: { type: "string", enum: ["keep_target", "use_release"] },
              expected_target_git_object: {
                anyOf: [
                  { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
                  { type: "null" },
                ],
              },
              acknowledge_project_state_replacement: { type: "boolean" },
            },
            required: ["path", "resolution", "expected_target_git_object"],
            additionalProperties: false,
          },
        },
      },
      required: ["billing_account_id", "source_plan_id", "source_plan_hash", "resolutions"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_apply_anpos_change",
    title: "Apply planned repository change",
    description: "Apply one exact server-issued plan. Normal plans create a new anpos/* feature branch only. bootstrap_empty requires explicit confirmation and may create one deterministic root seed commit solely to initialize GitHub's empty repository before the full ANPOS feature-branch/PR flow.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: { type: "integer", minimum: 1 },
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        plan_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
        branch_name: { type: "string", pattern: "^anpos/[a-z0-9][a-z0-9._-]{1,79}$" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 100 },
        confirm_empty_repository_initialization: { type: "boolean" },
      },
      required: ["billing_account_id", "plan_id", "plan_hash", "branch_name", "idempotency_key"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_open_change_request",
    title: "Open pull request for planned change",
    description: "Open a pull request only for the exact applied feature-branch head recorded by the server-side plan ledger.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: { type: "integer", minimum: 1 },
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        expected_head_sha: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
        title: { type: "string", minLength: 1, maxLength: 200 },
        body: { type: "string", maxLength: 20000 },
        idempotency_key: { type: "string", minLength: 8, maxLength: 100 },
      },
      required: ["billing_account_id", "plan_id", "expected_head_sha", "title", "body", "idempotency_key"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_get_change_request",
    title: "Inspect planned pull request",
    description: "Re-read the pull request linked to a server-side write plan and return current head/base/mergeability state.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: { type: "integer", minimum: 1 },
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
      },
      required: ["billing_account_id", "plan_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_get_ci",
    title: "Inspect planned commit checks",
    description: "Read GitHub checks and legacy statuses for the exact applied plan commit.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: { type: "integer", minimum: 1 },
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        commit_sha: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
      },
      required: ["billing_account_id", "plan_id", "commit_sha"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_merge_change_request",
    title: "Guarded merge planned pull request",
    description: "Merge only the exact planned pull-request head after fresh mergeability, CI, entitlement, permission, default-branch-head, and resulting-main verification.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: { type: "integer", minimum: 1 },
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        expected_head_sha: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 100 },
      },
      required: ["billing_account_id", "plan_id", "expected_head_sha", "idempotency_key"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },

] as const;

function rpcResult(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcId | undefined, code: number, message: string, data?: object) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

function positiveAccountId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("VALID_BILLING_ACCOUNT_ID_REQUIRED");
  return id;
}

function requiredString(value: unknown, code: string, maxLength = 512): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\r\n\0]/.test(value)) {
    throw new Error(code);
  }
  return value.trim();
}

async function authorizeRepositorySupervisorCapability(
  principal: McpPrincipal,
  billingAccountId: number,
  requestId: string,
  capability: "repository_supervisor_read" | "repository_supervisor_write",
): Promise<void> {
  if (
    capability === "repository_supervisor_read"
    && billingAccountId === principal.github_user_id
    && internalSupervisorReadTestGrantActiveForLogin(principal.github_login)
  ) {
    return;
  }

  const current = await getEntitlement(billingAccountId);
  if (!current) throw new Error("ENTITLEMENT_NOT_FOUND");

  const context: GitHubAuthContext = {
    user: {
      id: principal.github_user_id,
      login: principal.github_login,
      type: "User",
    },
    token: principal.github_token,
  };
  await requireGithubAccountAccessForContext(context, current);

  const refreshed = await reconcileEntitlement(billingAccountId, requestId);
  const snapshot: PluginEntitlementSnapshot = {
    state: refreshed.state,
    github_account_id: billingAccountId,
    github_account_type: refreshed.github_account_type ?? String(current.github_account_type) as "User" | "Organization",
    github_login: refreshed.github_login ?? String(current.github_login),
    plan_id: refreshed.plan_id,
    entitlements: refreshed.entitlements,
  };
  await requirePluginCapability(
    snapshot,
    { id: principal.github_user_id, login: principal.github_login },
    capability,
  );
}

function toolSuccess(value: object) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}

function toolError(error: unknown) {
  const raw = error instanceof Error ? error.message : "TOOL_EXECUTION_FAILED";
  if (raw === "MCP_INSUFFICIENT_SCOPE") {
    const challenge = mcpBearerChallenge("insufficient_scope", "Reconnect with the required Repository Supervisor scope.");
    return {
      content: [{ type: "text", text: "Authentication scope is insufficient for this tool." }],
      structuredContent: { error: "insufficient_scope" },
      _meta: { "mcp/www_authenticate": [challenge] },
      isError: true,
    };
  }
  const subscriptionReason = raw.startsWith("PLUGIN_CAPABILITY_DENIED:")
    ? raw.slice("PLUGIN_CAPABILITY_DENIED:".length)
    : null;
  if (subscriptionReason || raw === "ENTITLEMENT_NOT_FOUND" || raw === "FORBIDDEN_GITHUB_ACCOUNT") {
    return {
      content: [{ type: "text", text: "Repository Supervisor access is not authorized for this billing account and GitHub principal." }],
      structuredContent: {
        error: "repository_supervisor_not_authorized",
        reason: subscriptionReason ?? raw.toLowerCase(),
      },
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: "The Repository Supervisor tool could not complete the request." }],
    structuredContent: { error: raw.toLowerCase().slice(0, 120) },
    isError: true,
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  principal: McpPrincipal,
  fetchImpl: typeof fetch,
) {
  try {
    if (name === "repository_profile") {
      requireMcpScope(principal, "anpos:profile");
      const observed = await profileGithubAccount(principal.github_token, fetchImpl);
      if (observed.account_id !== `github:${principal.github_user_id}`) throw new Error("MCP_GITHUB_PRINCIPAL_MISMATCH");
      const profile = {
        id: `prf_${createHash("sha256").update(`anpos-profile-v1:${principal.github_user_id}`).digest("hex").slice(0, 32)}`,
        name: observed.account_display_name,
        nickname: observed.account_login,
      };
      return toolSuccess(profile);
    }

    if (name === "repository_list_billing_accounts") {
      requireMcpScope(principal, "anpos:profile");
      requireMcpScope(principal, "anpos:repo:read");
      const candidates = await listBillingAccountsForPrincipal(principal.github_user_id);
      const context: GitHubAuthContext = {
        user: {
          id: principal.github_user_id,
          login: principal.github_login,
          type: "User",
        },
        token: principal.github_token,
      };
      const accounts = [];
      for (const candidate of candidates) {
        try {
          await requireGithubAccountAccessForContext(context, candidate);
        } catch {
          continue;
        }
        const snapshot: PluginEntitlementSnapshot = {
          state: candidate.state,
          github_account_id: candidate.github_account_id,
          github_account_type: candidate.github_account_type,
          github_login: candidate.github_login,
          plan_id: candidate.plan_id,
          entitlements: candidate.entitlements,
        };
        const matrix = await buildPluginCapabilityMatrix(
          snapshot,
          { id: principal.github_user_id, login: principal.github_login },
        );
        accounts.push({
          billing_account_id: candidate.github_account_id,
          github_login: candidate.github_login,
          github_account_type: candidate.github_account_type,
          state: candidate.state,
          plan_id: candidate.plan_id,
          capabilities: {
            repository_supervisor_read: {
              allowed: matrix.repository_supervisor_read.allowed,
              reason: matrix.repository_supervisor_read.reason,
            },
            repository_supervisor_write: {
              allowed: matrix.repository_supervisor_write.allowed,
              reason: matrix.repository_supervisor_write.reason,
            },
          },
        });
      }
      if (internalSupervisorReadTestGrantActiveForLogin(principal.github_login)) {
        const internalAccount = {
          billing_account_id: principal.github_user_id,
          github_login: principal.github_login,
          github_account_type: "User" as const,
          state: "internal_test",
          plan_id: "internal_read_test",
          capabilities: {
            repository_supervisor_read: {
              allowed: true,
              reason: "internal_read_test_grant",
            },
            repository_supervisor_write: {
              allowed: false,
              reason: "internal_read_test_grant_read_only",
            },
          },
        };
        const ownIndex = accounts.findIndex((account) => account.billing_account_id === principal.github_user_id);
        if (ownIndex >= 0) accounts.splice(ownIndex, 1);
        accounts.unshift(internalAccount);
      }
      return toolSuccess({ accounts });
    }

    requireMcpScope(principal, "anpos:profile");
    requireMcpScope(principal, "anpos:repo:read");
    const billingAccountId = positiveAccountId(args.billing_account_id);
    await authorizeRepositorySupervisorCapability(principal, billingAccountId, randomUUID(), "repository_supervisor_read");

    if (name === "repository_resolve") {
      const repository = requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED");
      return toolSuccess(await resolveGithubRepository(repository, principal.github_token, fetchImpl));
    }
    if (name === "repository_audit") {
      const repository = requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED");
      return toolSuccess(await auditGithubRepository(repository, principal.github_token, fetchImpl));
    }
    if (name === "repository_get_assurance") {
      const repository = requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED");
      const ref = requiredString(args.ref, "IMMUTABLE_REF_REQUIRED", 40);
      return toolSuccess(await getGithubRepositoryAssurance(repository, ref, principal.github_token, fetchImpl));
    }

    if ([
      "repository_plan_anpos_change",
      "repository_resolve_plan_conflicts",
      "repository_apply_anpos_change",
      "repository_open_change_request",
      "repository_get_change_request",
      "repository_get_ci",
      "repository_merge_change_request",
    ].includes(name)) {
      requireMcpScope(principal, "anpos:repo:write");
      await authorizeRepositorySupervisorCapability(principal, billingAccountId, randomUUID(), "repository_supervisor_write");

      const identity = { id: principal.github_user_id, login: principal.github_login };
      if (name === "repository_plan_anpos_change") {
        const mode = typeof args.mode === "string" ? args.mode : "";
        if (mode === "bounded_change") {
          return toolSuccess(await createGithubWritePlan({
            repository_url: args.repository_url,
            expected_target_head_sha: args.expected_target_head_sha,
            commit_message: args.commit_message,
            changes: args.changes as PlannedChange[],
          }, identity, billingAccountId, principal.github_token, fetchImpl));
        }
        if (!["bootstrap_empty", "bootstrap_child", "adopt_existing", "repair_partial", "upgrade_active"].includes(mode)) {
          throw new Error("PLANNER_MODE_REQUIRED");
        }
        return toolSuccess(await createGithubFullAnposPlan({
          mode: mode as FullPlannerMode,
          repository_url: args.repository_url,
          expected_target_head_sha: args.expected_target_head_sha,
          project_name: args.project_name,
          github_owner: args.github_owner,
          github_security_capability: args.github_security_capability,
        }, identity, billingAccountId, principal.github_token, fetchImpl));
      }
      if (name === "repository_resolve_plan_conflicts") {
        return toolSuccess(await resolveGithubFullAnposPlan({
          source_plan_id: requiredString(args.source_plan_id, "SOURCE_PLAN_ID_REQUIRED", 36),
          source_plan_hash: requiredString(args.source_plan_hash, "SOURCE_PLAN_HASH_REQUIRED", 64),
          resolutions: args.resolutions as ConflictResolutionInput[],
        }, identity, billingAccountId, principal.github_token, fetchImpl));
      }
      if (name === "repository_apply_anpos_change") {
        return toolSuccess(await applyGithubSupervisorPlan({
          plan_id: requiredString(args.plan_id, "PLAN_ID_REQUIRED", 36),
          plan_hash: requiredString(args.plan_hash, "PLAN_HASH_REQUIRED", 64),
          branch_name: args.branch_name,
          idempotency_key: args.idempotency_key,
          confirm_empty_repository_initialization: args.confirm_empty_repository_initialization,
        }, identity, billingAccountId, principal.github_token, fetchImpl));
      }
      if (name === "repository_open_change_request") {
        return toolSuccess(await openGithubWritePlanPullRequest({
          plan_id: requiredString(args.plan_id, "PLAN_ID_REQUIRED", 36),
          expected_head_sha: requiredString(args.expected_head_sha, "EXPECTED_HEAD_SHA_REQUIRED", 40),
          title: requiredString(args.title, "PULL_REQUEST_TITLE_REQUIRED", 200),
          body: typeof args.body === "string" ? args.body : "",
          idempotency_key: args.idempotency_key,
        }, identity, billingAccountId, principal.github_token, fetchImpl));
      }
      if (name === "repository_get_change_request") {
        return toolSuccess(await getGithubWritePlanPullRequest(
          requiredString(args.plan_id, "PLAN_ID_REQUIRED", 36),
          identity,
          billingAccountId,
          principal.github_token,
          fetchImpl,
        ));
      }
      if (name === "repository_get_ci") {
        return toolSuccess(await getGithubWritePlanCi(
          requiredString(args.plan_id, "PLAN_ID_REQUIRED", 36),
          requiredString(args.commit_sha, "COMMIT_SHA_REQUIRED", 40),
          identity,
          billingAccountId,
          principal.github_token,
          fetchImpl,
        ));
      }
      return toolSuccess(await mergeGithubWritePlanPullRequest({
        plan_id: requiredString(args.plan_id, "PLAN_ID_REQUIRED", 36),
        expected_head_sha: requiredString(args.expected_head_sha, "EXPECTED_HEAD_SHA_REQUIRED", 40),
        idempotency_key: args.idempotency_key,
      }, identity, billingAccountId, principal.github_token, fetchImpl));
    }
    throw new Error("MCP_TOOL_NOT_FOUND");
  } catch (error) {
    return toolError(error);
  }
}

export async function handleMcpRpc(
  body: unknown,
  principal: McpPrincipal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body?: object }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: rpcError(null, -32600, "Invalid Request") };
  }
  const request = body as JsonRpcRequest;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return { status: 400, body: rpcError(request.id, -32600, "Invalid Request") };
  }

  if (request.method === "server/discover") {
    return {
      status: 200,
      body: rpcResult(request.id, {
        resultType: "complete",
        supportedVersions: [MODERN_PROTOCOL],
        capabilities: { tools: {} },
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "anpos-repository-supervisor",
            version: "0.4.9",
          },
        },
        instructions: "Use repository_profile first when account identity is unclear, then repository_list_billing_accounts to select a server-authorized billing_account_id. Paid repository tools remain re-authorized server-side.",
        ttlMs: 300_000,
        cacheScope: "private",
      }),
    };
  }

  if (request.method === "initialize") {
    const requested = typeof request.params?.protocolVersion === "string"
      ? request.params.protocolVersion
      : "2025-11-25";
    const protocolVersion = LEGACY_PROTOCOLS.has(requested) ? requested : "2025-11-25";
    return {
      status: 200,
      body: rpcResult(request.id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "anpos-repository-supervisor", version: "0.4.9" },
        instructions: "Repository Supervisor tools are authenticated and server-authorized.",
      }),
    };
  }

  if (request.method === "notifications/initialized" || request.method === "notifications/cancelled") {
    return { status: 202 };
  }

  if (request.method === "tools/list") {
    return { status: 200, body: rpcResult(request.id, { tools: MCP_TOOL_DEFINITIONS }) };
  }

  if (request.method === "tools/call") {
    const name = typeof request.params?.name === "string" ? request.params.name : "";
    const args = request.params?.arguments;
    if (!name || !args || typeof args !== "object" || Array.isArray(args)) {
      return { status: 200, body: rpcError(request.id, -32602, "Invalid params") };
    }
    return {
      status: 200,
      body: rpcResult(request.id, await callTool(name, args as Record<string, unknown>, principal, fetchImpl)),
    };
  }

  return { status: 404, body: rpcError(request.id, -32601, "Method not found") };
}
