import { db, ensureSchema } from "@/lib/db";
import { mcpOAuthConfig, mcpOAuthConfigurationProblems } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const problems = mcpOAuthConfigurationProblems();
  if (problems.length) {
    return Response.json({ ok: false, mode: "repository_supervisor_mcp", problems }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    await ensureSchema();
    await db().query("SELECT 1");
    const cfg = mcpOAuthConfig();
    return Response.json({
      ok: true,
      mode: "repository_supervisor_mcp",
      resource: cfg.resourceUrl,
      oauth: {
        protected_resource_metadata: `${cfg.publicBaseUrl}/.well-known/oauth-protected-resource`,
        authorization_server_metadata: `${cfg.publicBaseUrl}/.well-known/oauth-authorization-server`,
        authorization_endpoint: `${cfg.publicBaseUrl}/oauth/authorize`,
        token_endpoint: `${cfg.publicBaseUrl}/oauth/token`,
        pkce: "S256",
        scopes: ["anpos:profile", "anpos:repo:read"],
      },
      write_scope_available: false,
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, mode: "repository_supervisor_mcp", error: "mcp_runtime_not_ready" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
