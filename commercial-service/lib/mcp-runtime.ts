import { createHash, randomUUID } from "node:crypto";
import { requireGithubAccountAccessForContext, type GitHubAuthContext } from "./auth";
import { getEntitlement, reconcileEntitlement } from "./entitlements";
import {
  mcpBearerChallenge,
  requireMcpScope,
  type McpPrincipal,
} from "./mcp-auth";
import {
  requirePluginCapability,
  type PluginCapability,
  type PluginEntitlementSnapshot,
} from "./plugin-entitlements";
import {
  auditGithubRepository,
  getGithubRepositoryAssurance,
  profileGithubAccount,
  resolveGithubRepository,
} from "./repository-supervisor-runtime";
import {
  applyRepositoryWritePlan,
  createRepositoryWritePlan,
  getRepositoryChangeRequest,
  getRepositoryCi,
  mergeRepositoryChangeRequest,
  openRepositoryChangeRequest,
} from "./repository-write-runtime";

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
const writeSecurity = [{
  type: "oauth2",
  scopes: ["anpos:profile", "anpos:repo:read", "anpos:repo:write"],
}];

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

const billingProperty = { type: "integer", minimum: 1 };
const repositoryProperty = { type: "string", minLength: 1, maxLength: 512 };
const shaProperty = { type: "string", pattern: "^[0-9a-fA-F]{40}$" };
const idempotencyProperty = { type: "string", pattern: "^[A-Za-z0-9._:-]{8,100}$" };

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
    name: "repository_resolve",
    title: "Resolve repository",
    description: "Resolve a GitHub repository URL to canonical identity and current default-branch head after paid Repository Supervisor authorization.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
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
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
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
        repository_url: repositoryProperty,
        ref: shaProperty,
        billing_account_id: billingProperty,
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
    name: "repository_plan_change",
    title: "Plan active-project change",
    description: "Create a short-lived deterministic write plan for an active ANPOS project, bound to the exact default-branch head and observed file/blob modes. This does not mutate the repository.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
        expected_target_head_sha: shaProperty,
        commit_message: { type: "string", minLength: 1, maxLength: 200 },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 40,
          items: {
            type: "object",
            properties: {
              path: { type: "string", minLength: 1, maxLength: 512 },
              action: { type: "string", enum: ["upsert", "delete"] },
              content: { type: "string", maxLength: 262144 },
            },
            required: ["path", "action"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "repository_url",
        "billing_account_id",
        "expected_target_head_sha",
        "commit_message",
        "changes",
      ],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_apply_change",
    title: "Apply planned change to feature branch",
    description: "Apply one unexpired server-stored plan to a new anpos/* feature branch only, after exact-head and per-path precondition revalidation.",
    inputSchema: {
      type: "object",
      properties: {
        billing_account_id: billingProperty,
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        branch_name: { type: "string", pattern: "^anpos/[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$" },
        idempotency_key: idempotencyProperty,
        confirm_deletions: { type: "boolean" },
      },
      required: ["billing_account_id", "plan_id", "branch_name", "idempotency_key", "confirm_deletions"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_open_change_request",
    title: "Open pull request",
    description: "Open a pull request only for the exact branch/head produced by an applied Repository Supervisor plan.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        head_branch: { type: "string", pattern: "^anpos/[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$" },
        expected_head_sha: shaProperty,
        title: { type: "string", minLength: 1, maxLength: 256 },
        body: { type: "string", maxLength: 64000 },
        idempotency_key: idempotencyProperty,
      },
      required: [
        "repository_url",
        "billing_account_id",
        "plan_id",
        "head_branch",
        "expected_head_sha",
        "title",
        "body",
        "idempotency_key",
      ],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    securitySchemes: writeSecurity,
    _meta: { securitySchemes: writeSecurity },
  },
  {
    name: "repository_get_change_request",
    title: "Read pull request state",
    description: "Read the current pull-request state, exact head/base identity and provider mergeability.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
        change_request_id: { type: "integer", minimum: 1 },
      },
      required: ["repository_url", "billing_account_id", "change_request_id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: readSecurity,
    _meta: { securitySchemes: readSecurity },
  },
  {
    name: "repository_get_ci",
    title: "Read commit checks",
    description: "Read GitHub check runs for one exact commit SHA.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
        commit_sha: shaProperty,
      },
      required: ["repository_url", "billing_account_id", "commit_sha"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: readSecurity,
    _meta: { securitySchemes: readSecurity },
  },
  {
    name: "repository_merge_change_request",
    title: "Guarded pull request merge",
    description: "Merge only an open non-draft PR with exact expected head, default-branch base, provider mergeability=clean, green observed checks and explicit merge confirmation. GitHub branch/review policy remains final authority.",
    inputSchema: {
      type: "object",
      properties: {
        repository_url: repositoryProperty,
        billing_account_id: billingProperty,
        plan_id: { type: "string", minLength: 36, maxLength: 36 },
        change_request_id: { type: "integer", minimum: 1 },
        expected_head_sha: shaProperty,
        merge_method: { type: "string", enum: ["merge", "squash", "rebase"] },
        confirm_merge: { type: "boolean", const: true },
        idempotency_key: idempotencyProperty,
      },
      required: [
        "repository_url",
        "billing_account_id",
        "plan_id",
        "change_request_id",
        "expected_head_sha",
        "merge_method",
        "confirm_merge",
        "idempotency_key",
      ],
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

function positiveInteger(value: unknown, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(code);
  return parsed;
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
  capability: PluginCapability,
  requestId: string,
): Promise<void> {
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

const WRITE_TOOLS = new Set([
  "repository_plan_change",
  "repository_apply_change",
  "repository_open_change_request",
  "repository_merge_change_request",
]);

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

    requireMcpScope(principal, "anpos:profile");
    requireMcpScope(principal, "anpos:repo:read");
    const billingAccountId = positiveAccountId(args.billing_account_id);
    const writeTool = WRITE_TOOLS.has(name);
    if (writeTool) requireMcpScope(principal, "anpos:repo:write");
    await authorizeRepositorySupervisorCapability(
      principal,
      billingAccountId,
      writeTool ? "repository_supervisor_write" : "repository_supervisor_read",
      randomUUID(),
    );

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
    if (name === "repository_plan_change") {
      return toolSuccess(await createRepositoryWritePlan({
        repository: requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED"),
        expectedTargetHeadSha: requiredString(args.expected_target_head_sha, "IMMUTABLE_HEAD_SHA_REQUIRED", 40),
        changes: args.changes,
        commitMessage: args.commit_message,
        githubUserId: principal.github_user_id,
        billingAccountId,
        token: principal.github_token,
      }, undefined, fetchImpl));
    }
    if (name === "repository_apply_change") {
      return toolSuccess(await applyRepositoryWritePlan({
        planId: requiredString(args.plan_id, "VALID_WRITE_PLAN_ID_REQUIRED", 36),
        branchName: requiredString(args.branch_name, "INVALID_FEATURE_BRANCH", 110),
        idempotencyKey: requiredString(args.idempotency_key, "VALID_IDEMPOTENCY_KEY_REQUIRED", 100),
        confirmDeletions: args.confirm_deletions === true,
        githubUserId: principal.github_user_id,
        billingAccountId,
        token: principal.github_token,
      }, undefined, fetchImpl));
    }
    if (name === "repository_open_change_request") {
      return toolSuccess(await openRepositoryChangeRequest({
        repository: requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED"),
        planId: requiredString(args.plan_id, "VALID_WRITE_PLAN_ID_REQUIRED", 36),
        headBranch: requiredString(args.head_branch, "INVALID_FEATURE_BRANCH", 110),
        expectedHeadSha: requiredString(args.expected_head_sha, "VALID_COMMIT_SHA_REQUIRED", 40),
        title: requiredString(args.title, "INVALID_CHANGE_REQUEST_METADATA", 256),
        body: typeof args.body === "string" ? args.body : "",
        idempotencyKey: requiredString(args.idempotency_key, "VALID_IDEMPOTENCY_KEY_REQUIRED", 100),
        githubUserId: principal.github_user_id,
        billingAccountId,
        token: principal.github_token,
      }, undefined, fetchImpl));
    }
    if (name === "repository_get_change_request") {
      return toolSuccess(await getRepositoryChangeRequest({
        repository: requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED"),
        changeRequestId: positiveInteger(args.change_request_id, "VALID_CHANGE_REQUEST_ID_REQUIRED"),
        token: principal.github_token,
      }, fetchImpl));
    }
    if (name === "repository_get_ci") {
      return toolSuccess(await getRepositoryCi({
        repository: requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED"),
        commitSha: requiredString(args.commit_sha, "VALID_COMMIT_SHA_REQUIRED", 40),
        token: principal.github_token,
      }, fetchImpl));
    }
    if (name === "repository_merge_change_request") {
      const mergeMethod = requiredString(args.merge_method, "INVALID_MERGE_METHOD", 16);
      if (!["merge", "squash", "rebase"].includes(mergeMethod)) throw new Error("INVALID_MERGE_METHOD");
      return toolSuccess(await mergeRepositoryChangeRequest({
        repository: requiredString(args.repository_url, "REPOSITORY_URL_REQUIRED"),
        planId: requiredString(args.plan_id, "VALID_WRITE_PLAN_ID_REQUIRED", 36),
        billingAccountId,
        changeRequestId: positiveInteger(args.change_request_id, "VALID_CHANGE_REQUEST_ID_REQUIRED"),
        expectedHeadSha: requiredString(args.expected_head_sha, "VALID_COMMIT_SHA_REQUIRED", 40),
        mergeMethod: mergeMethod as "merge" | "squash" | "rebase",
        confirmMerge: args.confirm_merge === true,
        idempotencyKey: requiredString(args.idempotency_key, "VALID_IDEMPOTENCY_KEY_REQUIRED", 100),
        githubUserId: principal.github_user_id,
        token: principal.github_token,
      }, undefined, fetchImpl));
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
            version: "0.4.3",
          },
        },
        instructions: "Use the authenticated profile first when account identity is unclear. Paid repository tools require an explicit billing_account_id and are always re-authorized server-side. Writes are limited to active ANPOS projects, server-stored plans and anpos/* feature branches.",
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
        serverInfo: { name: "anpos-repository-supervisor", version: "0.4.3" },
        instructions: "Repository Supervisor tools are authenticated, entitlement-gated and server-authorized.",
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
