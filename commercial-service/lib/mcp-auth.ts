import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { db, ensureSchema, transaction } from "./db";
import { marketplaceAppConfig, mcpOAuthConfig } from "./env";

export const MCP_OAUTH_STATE_COOKIE_NAME = "__Host-anpos_mcp_oauth_state";
export const MCP_SCOPES = ["anpos:profile", "anpos:repo:read", "anpos:repo:write"] as const;
export type McpScope = typeof MCP_SCOPES[number];

const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const TOKEN_PREFIX = "anpos_mcp_";
const SEALED_VERSION = 1;

export type PendingAuthorization = {
  v: 1;
  github_state: string;
  github_code_verifier: string;
  client_id: string;
  redirect_uri: string;
  resource: string;
  scopes: McpScope[];
  downstream_state: string | null;
  code_challenge: string;
  expires_at: number;
};

export type McpPrincipal = {
  github_user_id: number;
  github_login: string;
  github_token: string;
  scopes: McpScope[];
  resource: string;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function secretKey(label: string): Buffer {
  return createHash("sha256")
    .update(marketplaceAppConfig().sessionSecret, "utf8")
    .update("\0", "utf8")
    .update(label, "utf8")
    .digest();
}

function seal(value: string, label: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(label), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([SEALED_VERSION]), iv, tag, encrypted]).toString("base64url");
}

function unseal(value: string, label: string): string {
  let raw: Buffer;
  try { raw = Buffer.from(value, "base64url"); }
  catch { throw new Error("MCP_SECRET_INVALID"); }
  if (raw.length < 31 || raw[0] !== SEALED_VERSION) throw new Error("MCP_SECRET_INVALID");
  try {
    const decipher = createDecipheriv("aes-256-gcm", secretKey(label), raw.subarray(1, 13));
    decipher.setAuthTag(raw.subarray(13, 29));
    return Buffer.concat([decipher.update(raw.subarray(29)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("MCP_SECRET_INVALID");
  }
}

function secureCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearMcpOAuthCookie(): string {
  return `${MCP_OAUTH_STATE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return rest.join("=") || null;
  }
  return null;
}

function safeString(value: string | null, max = 2048): string {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error("MCP_OAUTH_PARAMETER_INVALID");
  return normalized;
}

function parseScopes(raw: string | null): McpScope[] {
  const values = [...new Set((raw ?? "").trim().split(/\s+/).filter(Boolean))];
  if (!values.length) return ["anpos:profile"];
  if (values.some((scope) => !MCP_SCOPES.includes(scope as McpScope))) throw new Error("MCP_OAUTH_SCOPE_INVALID");
  return values as McpScope[];
}

function equalText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function pkceChallenge(verifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error("MCP_PKCE_VERIFIER_INVALID");
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createMcpAuthorizationStart(url: URL): {
  githubAuthorizeUrl: string;
  stateCookie: string;
} {
  const cfg = mcpOAuthConfig();
  if (url.searchParams.get("response_type") !== "code") throw new Error("MCP_OAUTH_RESPONSE_TYPE_UNSUPPORTED");
  const clientId = safeString(url.searchParams.get("client_id"));
  const redirectUri = safeString(url.searchParams.get("redirect_uri"));
  const resource = safeString(url.searchParams.get("resource"));
  const codeChallenge = safeString(url.searchParams.get("code_challenge"), 256);
  if (url.searchParams.get("code_challenge_method") !== "S256") throw new Error("MCP_OAUTH_PKCE_S256_REQUIRED");
  if (!cfg.allowedClientIds.includes(clientId)) throw new Error("MCP_OAUTH_CLIENT_NOT_ALLOWED");
  if (!cfg.allowedRedirectUris.includes(redirectUri)) throw new Error("MCP_OAUTH_REDIRECT_NOT_ALLOWED");
  if (resource !== cfg.resourceUrl) throw new Error("MCP_OAUTH_RESOURCE_MISMATCH");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new Error("MCP_OAUTH_CODE_CHALLENGE_INVALID");

  const downstreamState = url.searchParams.get("state");
  if (downstreamState && (downstreamState.length > 2048 || /[\r\n\0]/.test(downstreamState))) {
    throw new Error("MCP_OAUTH_STATE_INVALID");
  }

  const githubState = randomBytes(24).toString("base64url");
  const githubVerifier = randomBytes(32).toString("base64url");
  const pending: PendingAuthorization = {
    v: 1,
    github_state: githubState,
    github_code_verifier: githubVerifier,
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    scopes: parseScopes(url.searchParams.get("scope")),
    downstream_state: downstreamState,
    code_challenge: codeChallenge,
    expires_at: nowSeconds() + OAUTH_STATE_TTL_SECONDS,
  };
  const sealed = seal(JSON.stringify(pending), "mcp-oauth-state");
  const app = marketplaceAppConfig();
  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", app.githubMarketplaceClientId);
  githubUrl.searchParams.set("redirect_uri", `${app.publicBaseUrl}/api/auth/mcp/github/callback`);
  githubUrl.searchParams.set("state", githubState);
  githubUrl.searchParams.set("code_challenge", pkceChallenge(githubVerifier));
  githubUrl.searchParams.set("code_challenge_method", "S256");
  return {
    githubAuthorizeUrl: githubUrl.toString(),
    stateCookie: secureCookie(MCP_OAUTH_STATE_COOKIE_NAME, sealed, OAUTH_STATE_TTL_SECONDS),
  };
}

export function consumeMcpAuthorizationState(request: Request, suppliedState: string): PendingAuthorization {
  const cookie = cookieValue(request, MCP_OAUTH_STATE_COOKIE_NAME);
  if (!cookie) throw new Error("MCP_OAUTH_STATE_MISSING");
  let pending: PendingAuthorization;
  try { pending = JSON.parse(unseal(cookie, "mcp-oauth-state")) as PendingAuthorization; }
  catch { throw new Error("MCP_OAUTH_STATE_INVALID"); }
  if (
    pending.v !== 1
    || pending.expires_at < nowSeconds()
    || !equalText(pending.github_state, suppliedState)
    || !pending.github_code_verifier
  ) throw new Error("MCP_OAUTH_STATE_INVALID");
  return pending;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function audit(client: PoolClient, eventType: string, metadata: object): Promise<void> {
  await client.query(
    "INSERT INTO commercial_audit_log(request_id,event_type,github_account_id,metadata) VALUES ($1,$2,NULL,$3::jsonb)",
    [randomBytes(16).toString("hex"), eventType, JSON.stringify(metadata)],
  );
}

export async function issueMcpAuthorizationCode(
  pending: PendingAuthorization,
  github: { id: number; login: string; accessToken: string },
): Promise<string> {
  if (!Number.isSafeInteger(github.id) || github.id <= 0 || !github.login || !github.accessToken) {
    throw new Error("MCP_GITHUB_IDENTITY_INVALID");
  }
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000);
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO mcp_oauth_authorization_codes(
        code_hash,client_id,redirect_uri,resource,scopes,code_challenge,
        github_user_id,github_login,github_access_token_ciphertext,expires_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
      [
        tokenHash(code),
        pending.client_id,
        pending.redirect_uri,
        pending.resource,
        JSON.stringify(pending.scopes),
        pending.code_challenge,
        github.id,
        github.login,
        seal(github.accessToken, "mcp-github-token"),
        expiresAt,
      ],
    );
    await audit(client, "mcp_oauth_authorization_code_issued", {
      github_user_id: github.id,
      github_login: github.login,
      client_id: pending.client_id,
      resource: pending.resource,
      scopes: pending.scopes,
    });
  });
  return code;
}

export async function redeemMcpAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; expiresIn: number; scopes: McpScope[] }> {
  const cfg = mcpOAuthConfig();
  const accessToken = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return transaction(async (client) => {
    const result = await client.query(
      "SELECT * FROM mcp_oauth_authorization_codes WHERE code_hash=$1 FOR UPDATE",
      [tokenHash(input.code)],
    );
    if (!result.rowCount) throw new Error("MCP_OAUTH_CODE_INVALID");
    const row = result.rows[0];
    if (row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) throw new Error("MCP_OAUTH_CODE_INVALID");
    if (
      !equalText(String(row.client_id), input.clientId)
      || !equalText(String(row.redirect_uri), input.redirectUri)
      || !equalText(String(row.resource), input.resource)
      || !equalText(String(row.code_challenge), pkceChallenge(input.codeVerifier))
    ) throw new Error("MCP_OAUTH_CODE_BINDING_MISMATCH");

    const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) as McpScope[] : [];
    const expiresAt = new Date(Date.now() + cfg.accessTokenTtlSeconds * 1000);
    await client.query(
      "UPDATE mcp_oauth_authorization_codes SET consumed_at=NOW() WHERE code_hash=$1",
      [tokenHash(input.code)],
    );
    await client.query(
      `INSERT INTO mcp_oauth_access_tokens(
        token_hash,resource,scopes,github_user_id,github_login,github_access_token_ciphertext,expires_at
      ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [
        tokenHash(accessToken),
        row.resource,
        JSON.stringify(scopes),
        row.github_user_id,
        row.github_login,
        row.github_access_token_ciphertext,
        expiresAt,
      ],
    );
    await audit(client, "mcp_oauth_access_token_issued", {
      github_user_id: Number(row.github_user_id),
      github_login: String(row.github_login),
      client_id: String(row.client_id),
      resource: String(row.resource),
      scopes,
    });
    return { accessToken, expiresIn: cfg.accessTokenTtlSeconds, scopes };
  });
}

export async function authenticateMcpRequest(request: Request): Promise<McpPrincipal> {
  await ensureSchema();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new Error("MCP_ACCESS_TOKEN_REQUIRED");
  }
  const result = await db().query(
    `SELECT resource,scopes,github_user_id,github_login,github_access_token_ciphertext,expires_at,revoked_at
       FROM mcp_oauth_access_tokens WHERE token_hash=$1`,
    [tokenHash(token)],
  );
  if (!result.rowCount) throw new Error("MCP_ACCESS_TOKEN_INVALID");
  const row = result.rows[0];
  const cfg = mcpOAuthConfig();
  if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now() || String(row.resource) !== cfg.resourceUrl) {
    throw new Error("MCP_ACCESS_TOKEN_INVALID");
  }
  const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) as McpScope[] : [];
  if (scopes.some((scope) => !MCP_SCOPES.includes(scope))) throw new Error("MCP_ACCESS_TOKEN_INVALID");
  return {
    github_user_id: Number(row.github_user_id),
    github_login: String(row.github_login),
    github_token: unseal(String(row.github_access_token_ciphertext), "mcp-github-token"),
    scopes,
    resource: String(row.resource),
  };
}

export function requireMcpScope(principal: McpPrincipal, required: McpScope): void {
  if (!principal.scopes.includes(required)) throw new Error("MCP_INSUFFICIENT_SCOPE");
}

export function mcpBearerChallenge(error = "invalid_token", description = "Authentication is required"): string {
  const metadata = `${mcpOAuthConfig().publicBaseUrl}/.well-known/oauth-protected-resource`;
  const safeDescription = description.replace(/[\r\n"]/g, " ").slice(0, 200);
  return `Bearer resource_metadata="${metadata}", error="${error}", error_description="${safeDescription}"`;
}
