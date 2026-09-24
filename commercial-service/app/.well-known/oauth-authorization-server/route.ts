import { mcpOAuthConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const cfg = mcpOAuthConfig();
  return Response.json({
    issuer: cfg.publicBaseUrl,
    authorization_endpoint: `${cfg.publicBaseUrl}/oauth/authorize`,
    token_endpoint: `${cfg.publicBaseUrl}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["anpos:profile", "anpos:repo:read", "anpos:repo:write"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }, {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
