import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeMcpAuthorizationState,
  createMcpAuthorizationStart,
  MCP_SCOPES,
  pkceChallenge,
} from "../lib/mcp-auth";

function configure() {
  process.env.ANPOS_PUBLIC_BASE_URL = "https://license.example.test";
  process.env.ANPOS_SESSION_SECRET = "s".repeat(48);
  process.env.GITHUB_MARKETPLACE_APP_ID = "123456";
  process.env.GITHUB_MARKETPLACE_APP_PRIVATE_KEY =
    "-----BEGIN RSA PRIVATE KEY-----\nplaceholder\n-----END RSA PRIVATE KEY-----";
  process.env.GITHUB_MARKETPLACE_CLIENT_ID = "Iv1.community-client-123456";
  process.env.GITHUB_MARKETPLACE_CLIENT_SECRET = "c".repeat(48);
  process.env.GITHUB_SUPERVISOR_APP_ID = "234567";
  process.env.GITHUB_SUPERVISOR_CLIENT_ID = "Iv1.supervisor-client-234567";
  process.env.GITHUB_SUPERVISOR_CLIENT_SECRET = "u".repeat(48);
  process.env.ANPOS_MCP_ALLOWED_CLIENT_IDS = "https://chatgpt.com/oauth/client.json";
  process.env.ANPOS_MCP_ALLOWED_REDIRECT_URIS = "https://chatgpt.com/connector_platform_oauth_redirect";
  process.env.ANPOS_MCP_ACCESS_TOKEN_TTL_SECONDS = "3600";
}

test("MCP OAuth start enforces exact client, redirect, resource and PKCE S256", () => {
  configure();
  const verifier = "v".repeat(43);
  const url = new URL("https://license.example.test/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "https://chatgpt.com/oauth/client.json");
  url.searchParams.set("redirect_uri", "https://chatgpt.com/connector_platform_oauth_redirect");
  url.searchParams.set("resource", "https://license.example.test/mcp");
  url.searchParams.set("scope", "anpos:profile anpos:repo:read");
  url.searchParams.set("state", "downstream-state");
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  const start = createMcpAuthorizationStart(url);
  const github = new URL(start.githubAuthorizeUrl);
  assert.equal(github.origin, "https://github.com");
  assert.equal(github.pathname, "/login/oauth/authorize");
  assert.equal(github.searchParams.get("client_id"), "Iv1.supervisor-client-234567");
  assert.equal(github.searchParams.get("redirect_uri"), "https://license.example.test/api/auth/mcp/github/callback");
  assert.equal(github.searchParams.get("code_challenge_method"), "S256");
  assert.ok(github.searchParams.get("state"));
  assert.match(start.stateCookie, /HttpOnly; Secure; SameSite=Lax/);

  const cookiePair = start.stateCookie.split(";", 1)[0];
  const request = new Request("https://license.example.test/callback", {
    headers: { Cookie: cookiePair },
  });
  const pending = consumeMcpAuthorizationState(request, github.searchParams.get("state")!);
  assert.equal(pending.client_id, "https://chatgpt.com/oauth/client.json");
  assert.equal(pending.redirect_uri, "https://chatgpt.com/connector_platform_oauth_redirect");
  assert.equal(pending.resource, "https://license.example.test/mcp");
  assert.deepEqual(pending.scopes, ["anpos:profile", "anpos:repo:read"]);

  const badClient = new URL(url);
  badClient.searchParams.set("client_id", "https://attacker.example/client.json");
  assert.throws(() => createMcpAuthorizationStart(badClient), /MCP_OAUTH_CLIENT_NOT_ALLOWED/);

  const badResource = new URL(url);
  badResource.searchParams.set("resource", "https://other.example/mcp");
  assert.throws(() => createMcpAuthorizationStart(badResource), /MCP_OAUTH_RESOURCE_MISMATCH/);
});

test("MCP OAuth write scope is available only after guarded write runtime exists", () => {
  assert.deepEqual(MCP_SCOPES, ["anpos:profile", "anpos:repo:read", "anpos:repo:write"]);
  configure();
  const url = new URL("https://license.example.test/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "https://chatgpt.com/oauth/client.json");
  url.searchParams.set("redirect_uri", "https://chatgpt.com/connector_platform_oauth_redirect");
  url.searchParams.set("resource", "https://license.example.test/mcp");
  url.searchParams.set("scope", "anpos:profile anpos:repo:read anpos:repo:write");
  url.searchParams.set("code_challenge", "a".repeat(43));
  url.searchParams.set("code_challenge_method", "S256");
  const start = createMcpAuthorizationStart(url);
  const request = new Request("https://license.example.test/callback", {
    headers: { Cookie: start.stateCookie.split(";", 1)[0] },
  });
  const state = new URL(start.githubAuthorizeUrl).searchParams.get("state")!;
  const pending = consumeMcpAuthorizationState(request, state);
  assert.deepEqual(pending.scopes, ["anpos:profile", "anpos:repo:read", "anpos:repo:write"]);

  const unknown = new URL(url);
  unknown.searchParams.set("scope", "anpos:repo:admin");
  assert.throws(() => createMcpAuthorizationStart(unknown), /MCP_OAUTH_SCOPE_INVALID/);
});
