import { createHash, randomUUID } from "node:crypto";
import { requireGithubAccountAccessForContext, type GitHubAuthContext } from "./auth";
import { getEntitlement, reconcileEntitlement } from "./entitlements";
import {
  mcpBearerChallenge,
  requireMcpScope,
  type McpPrincipal,
} from "./mcp-auth";
import { requirePluginCapability, type PluginEntitlementSnapshot } from "./plugin-entitlements";
import {
  auditGithubRepository,
  getGithubRepositoryAssurance,
  profileGithubAccount,
  resolveGithubRepository,
} from "./repository-supervisor-runtime";

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

async function authorizeRepositorySupervisorRead(
  principal: McpPrincipal,
  billingAccountId: number,
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
    "repository_supervisor_read",
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

    requireMcpScope(principal, "anpos:profile");
    requireMcpScope(principal, "anpos:repo:read");
    const billingAccountId = positiveAccountId(args.billing_account_id);
    await authorizeRepositorySupervisorRead(principal, billingAccountId, randomUUID());

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
            version: "0.4.2",
          },
        },
        instructions: "Use the authenticated profile first when account identity is unclear. Paid repository tools require an explicit billing_account_id and are always re-authorized server-side.",
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
        serverInfo: { name: "anpos-repository-supervisor", version: "0.4.2" },
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
