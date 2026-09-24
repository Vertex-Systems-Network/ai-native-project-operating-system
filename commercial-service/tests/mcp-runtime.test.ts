import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpRpc, MCP_TOOL_DEFINITIONS } from "../lib/mcp-runtime";
import type { McpPrincipal } from "../lib/mcp-auth";

const principal: McpPrincipal = {
  github_user_id: 42,
  github_login: "octo",
  github_token: "token",
  scopes: ["anpos:profile", "anpos:repo:read"],
  resource: "https://license.example.test/mcp",
};

function mockProfileFetch(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
    if (url.pathname === "/user") {
      return Response.json({ id: 42, login: "octo", name: "Octo User" });
    }
    return Response.json({ message: "unexpected" }, { status: 500 });
  }) as typeof fetch;
}

test("MCP discovery advertises modern stateless tool capability", async () => {
  const result = await handleMcpRpc({
    jsonrpc: "2.0",
    id: "d1",
    method: "server/discover",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      },
    },
  }, principal, mockProfileFetch());

  assert.equal(result.status, 200);
  const body = result.body as any;
  assert.deepEqual(body.result.supportedVersions, ["2026-07-28"]);
  assert.deepEqual(body.result.capabilities, { tools: {} });
  assert.equal(body.result._meta["io.modelcontextprotocol/serverInfo"].name, "anpos-repository-supervisor");
});

test("tool list exposes profile plus bounded guarded-write tools", async () => {
  const result = await handleMcpRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }, principal, mockProfileFetch());

  const body = result.body as any;
  const tools = body.result.tools;
  const profile = tools.find((tool: any) => tool.name === "repository_profile");
  assert.equal(profile._meta["openai/profile"], true);
  assert.equal(profile.annotations.readOnlyHint, true);
  assert.deepEqual(profile.securitySchemes, [{ type: "oauth2", scopes: ["anpos:profile"] }]);
  const plan = tools.find((tool: any) => tool.name === "repository_plan_change");
  const apply = tools.find((tool: any) => tool.name === "repository_apply_change");
  const merge = tools.find((tool: any) => tool.name === "repository_merge_change_request");
  assert.ok(plan);
  assert.ok(apply);
  assert.ok(merge);
  assert.equal(plan.annotations.destructiveHint, false);
  assert.equal(apply.annotations.destructiveHint, false);
  assert.equal(merge.annotations.destructiveHint, true);
  assert.deepEqual(merge.securitySchemes, [{
    type: "oauth2",
    scopes: ["anpos:profile", "anpos:repo:read", "anpos:repo:write"],
  }]);
  assert.equal(MCP_TOOL_DEFINITIONS.length, 10);
});

test("repository_profile returns one stable opaque profile from validated credentials", async () => {
  const call = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "repository_profile", arguments: {} },
  };
  const first = await handleMcpRpc(call, principal, mockProfileFetch());
  const second = await handleMcpRpc(call, principal, mockProfileFetch());
  const a = (first.body as any).result.structuredContent;
  const b = (second.body as any).result.structuredContent;
  assert.match(a.id, /^prf_[0-9a-f]{32}$/);
  assert.equal(a.id, b.id);
  assert.equal(a.name, "Octo User");
  assert.equal(a.nickname, "octo");
});

test("profile tool returns OAuth challenge metadata on insufficient scope", async () => {
  process.env.ANPOS_PUBLIC_BASE_URL = "https://license.example.test";
  process.env.ANPOS_MCP_ALLOWED_CLIENT_IDS = "https://chatgpt.com/oauth/client.json";
  process.env.ANPOS_MCP_ALLOWED_REDIRECT_URIS = "https://chatgpt.com/connector_platform_oauth_redirect";
  process.env.ANPOS_SESSION_SECRET = "s".repeat(48);
  process.env.GITHUB_MARKETPLACE_APP_ID = "123456";
  process.env.GITHUB_MARKETPLACE_APP_PRIVATE_KEY =
    "-----BEGIN RSA PRIVATE KEY-----\nplaceholder\n-----END RSA PRIVATE KEY-----";
  process.env.GITHUB_MARKETPLACE_CLIENT_ID = "Iv1.community-client-123456";
  process.env.GITHUB_MARKETPLACE_CLIENT_SECRET = "c".repeat(48);
  process.env.GITHUB_SUPERVISOR_APP_ID = "234567";
  process.env.GITHUB_SUPERVISOR_CLIENT_ID = "Iv1.supervisor-client-234567";
  process.env.GITHUB_SUPERVISOR_CLIENT_SECRET = "u".repeat(48);

  const result = await handleMcpRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "repository_profile", arguments: {} },
  }, { ...principal, scopes: [] }, mockProfileFetch());

  const tool = (result.body as any).result;
  assert.equal(tool.isError, true);
  assert.equal(tool.structuredContent.error, "insufficient_scope");
  assert.ok(Array.isArray(tool._meta["mcp/www_authenticate"]));
});
