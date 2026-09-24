import { mcpOAuthConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const cfg = mcpOAuthConfig();
  return Response.json({
    resource: cfg.resourceUrl,
    authorization_servers: [cfg.publicBaseUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: ["anpos:profile", "anpos:repo:read", "anpos:repo:write"],
  }, {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
