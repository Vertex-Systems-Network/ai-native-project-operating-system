import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeMcpAuthorizationState,
  createMcpAuthorizationStart,
  MCP_SCOPES,
  pkceChallenge,
  validateMcpClientMetadata,
} from "../lib/mcp-auth";

function configure() {
  process.env.ANPOS_PUBLIC_BASE_URL = "https://license.example.test";
  process.env.ANPOS_SESSION_SECRET = "s".repeat(48);
  process.env.ANPOS_MARKETPLACE_APP_ID = "123456";
  process.env.ANPOS_MARKETPLACE_APP_PRIVATE_KEY =
    "-----BEGIN RSA PRIVATE KEY-----\nplaceholder\n-----END RSA PRIVATE KEY-----";
  process.env.ANPOS_MARKETPLACE_CLIENT_ID = "Iv1.community-client-123456";
  process.env.ANPOS_MARKETPLACE_CLIENT_SECRET = "c".repeat(48);
  process.env.ANPOS_GITHUB_SUPERVISOR_APP_ID = "777777";
  process.env.ANPOS_GITHUB_SUPERVISOR_CLIENT_ID = "Iv1.supervisor-client-123456";
  process.env.ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET = "s".repeat(48);
  process.env.ANPOS_MCP_ALLOWED_CLIENT_IDS = "https://chatgpt.com/oauth/client.json";
  process.env.ANPOS_MCP_ALLOWED_REDIRECT_URIS = "https://chatgpt.com/connector_platform_oauth_redirect";
  process.env.ANPOS_MCP_ACCESS_TOKEN_TTL_SECONDS = "3600";
}

function clientMetadata(overrides: Record<string, unknown> = {}) {
  return {
    client_id: "https://chatgpt.com/oauth/client.json",
    client_uri: "https://chatgpt.com/",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    ...overrides,
  };
}

function metadataFetcher(metadata = clientMetadata()): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://chatgpt.com/oauth/client.json");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(JSON.stringify(metadata))),
      },
    });
  }) as typeof fetch;
}

function authorizationUrl(scope = "anpos:profile anpos:repo:read"): URL {
  const verifier = "v".repeat(43);
  const url = new URL("https://license.example.test/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "https://chatgpt.com/oauth/client.json");
  url.searchParams.set("redirect_uri", "https://chatgpt.com/connector_platform_oauth_redirect");
  url.searchParams.set("resource", "https://license.example.test/mcp");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", "downstream-state");
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

test("MCP OAuth start enforces exact allowlist, CIMD metadata, resource and PKCE S256", async () => {
  configure();
  const url = authorizationUrl();

  const start = await createMcpAuthorizationStart(url, metadataFetcher());
  const github = new URL(start.githubAuthorizeUrl);
  assert.equal(github.origin, "https://github.com");
  assert.equal(github.pathname, "/login/oauth/authorize");
  assert.equal(github.searchParams.get("client_id"), "Iv1.supervisor-client-123456");
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
  await assert.rejects(
    createMcpAuthorizationStart(badClient, metadataFetcher()),
    /MCP_OAUTH_CLIENT_NOT_ALLOWED/,
  );

  const badResource = new URL(url);
  badResource.searchParams.set("resource", "https://other.example/mcp");
  await assert.rejects(
    createMcpAuthorizationStart(badResource, metadataFetcher()),
    /MCP_OAUTH_RESOURCE_MISMATCH/,
  );
});

test("MCP CIMD validation binds exact client identity, redirect and public-client token method", async () => {
  configure();

  await validateMcpClientMetadata(
    "https://chatgpt.com/oauth/client.json",
    "https://chatgpt.com/connector_platform_oauth_redirect",
    metadataFetcher(),
  );

  await assert.rejects(
    validateMcpClientMetadata(
      "https://chatgpt.com/oauth/client.json",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      metadataFetcher(clientMetadata({ client_id: "https://other.example/client.json" })),
    ),
    /MCP_OAUTH_CLIENT_METADATA_ID_MISMATCH/,
  );

  await assert.rejects(
    validateMcpClientMetadata(
      "https://chatgpt.com/oauth/client.json",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      metadataFetcher(clientMetadata({ redirect_uris: ["https://chatgpt.com/connector/oauth/other"] })),
    ),
    /MCP_OAUTH_CLIENT_METADATA_REDIRECT_MISMATCH/,
  );

  await assert.rejects(
    validateMcpClientMetadata(
      "https://chatgpt.com/oauth/client.json",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      metadataFetcher(clientMetadata({ token_endpoint_auth_methods_supported: ["private_key_jwt"] })),
    ),
    /MCP_OAUTH_CLIENT_METADATA_TOKEN_AUTH_UNSUPPORTED/,
  );
});

test("MCP OAuth write scope is available only through the dedicated Supervisor App flow", async () => {
  assert.deepEqual(MCP_SCOPES, ["anpos:profile", "anpos:repo:read", "anpos:repo:write"]);
  configure();
  const url = authorizationUrl("anpos:profile anpos:repo:read anpos:repo:write");
  const start = await createMcpAuthorizationStart(url, metadataFetcher());
  const github = new URL(start.githubAuthorizeUrl);
  assert.equal(github.searchParams.get("client_id"), "Iv1.supervisor-client-123456");
});
