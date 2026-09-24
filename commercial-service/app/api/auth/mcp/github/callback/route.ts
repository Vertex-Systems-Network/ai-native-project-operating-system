import { githubUserFromToken } from "@/lib/auth";
import { marketplaceAppConfig, mcpOAuthConfig } from "@/lib/env";
import {
  clearMcpOAuthCookie,
  consumeMcpAuthorizationState,
  issueMcpAuthorizationCode,
} from "@/lib/mcp-auth";

export const runtime = "nodejs";

type OAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (!code || code.length > 4096 || !state || state.length > 512) {
    return Response.json({ ok: false, error: "oauth_callback_parameters_required" }, {
      status: 400,
      headers: { "Cache-Control": "no-store", "Set-Cookie": clearMcpOAuthCookie() },
    });
  }

  let pending;
  try {
    pending = consumeMcpAuthorizationState(request, state);
  } catch {
    return Response.json({ ok: false, error: "mcp_oauth_state_invalid_or_expired" }, {
      status: 400,
      headers: { "Cache-Control": "no-store", "Set-Cookie": clearMcpOAuthCookie() },
    });
  }

  try {
    const app = marketplaceAppConfig();
    const callbackUrl = `${app.publicBaseUrl}/api/auth/mcp/github/callback`;
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.githubMarketplaceClientId,
        client_secret: app.githubMarketplaceClientSecret,
        code,
        redirect_uri: callbackUrl,
        code_verifier: pending.github_code_verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("GITHUB_OAUTH_TOKEN_EXCHANGE_FAILED");
    const token = await response.json() as OAuthTokenResponse;
    if (token.error || !token.access_token || token.access_token.length > 4096) {
      throw new Error("GITHUB_OAUTH_TOKEN_EXCHANGE_FAILED");
    }
    if ((token.token_type ?? "bearer").toLowerCase() !== "bearer") {
      throw new Error("GITHUB_OAUTH_TOKEN_TYPE_INVALID");
    }

    const user = await githubUserFromToken(token.access_token);
    const authorizationCode = await issueMcpAuthorizationCode(pending, {
      id: user.id,
      login: user.login,
      accessToken: token.access_token,
    });

    const destination = new URL(pending.redirect_uri);
    destination.searchParams.set("code", authorizationCode);
    if (pending.downstream_state) destination.searchParams.set("state", pending.downstream_state);
    destination.searchParams.set("iss", mcpOAuthConfig().publicBaseUrl);

    // MCP v1 deliberately does not persist GitHub refresh_token values.
    return new Response(null, {
      status: 303,
      headers: {
        Location: destination.toString(),
        "Set-Cookie": clearMcpOAuthCookie(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "mcp_github_authorization_failed" }, {
      status: 401,
      headers: { "Cache-Control": "no-store", "Set-Cookie": clearMcpOAuthCookie() },
    });
  }
}
