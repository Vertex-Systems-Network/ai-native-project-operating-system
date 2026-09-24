import { mcpOAuthConfig } from "@/lib/env";
import { readRawBody } from "@/lib/http";
import { redeemMcpAuthorizationCode } from "@/lib/mcp-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") {
      return Response.json({ error: "invalid_request" }, { status: 415, headers: { "Cache-Control": "no-store" } });
    }
    const raw = await readRawBody(request, 16_384);
    const form = new URLSearchParams(raw.toString("utf8"));
    if (form.get("grant_type") !== "authorization_code") {
      return Response.json({ error: "unsupported_grant_type" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const code = form.get("code")?.trim() ?? "";
    const clientId = form.get("client_id")?.trim() ?? "";
    const redirectUri = form.get("redirect_uri")?.trim() ?? "";
    const resource = form.get("resource")?.trim() ?? "";
    const codeVerifier = form.get("code_verifier")?.trim() ?? "";
    const cfg = mcpOAuthConfig();
    if (
      !code || code.length > 4096
      || !cfg.allowedClientIds.includes(clientId)
      || !cfg.allowedRedirectUris.includes(redirectUri)
      || resource !== cfg.resourceUrl
      || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)
    ) {
      return Response.json({ error: "invalid_grant" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const issued = await redeemMcpAuthorizationCode({ code, clientId, redirectUri, resource, codeVerifier });
    return Response.json({
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: issued.expiresIn,
      scope: issued.scopes.join(" "),
    }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch {
    return Response.json({ error: "invalid_grant" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
