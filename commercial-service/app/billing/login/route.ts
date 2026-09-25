import { marketplaceAppConfig, paidBillingProvider } from "@/lib/env";
import { createBillingOAuthFlowState } from "@/lib/billing-session";

export const runtime = "nodejs";

export async function GET() {
  if (paidBillingProvider() !== "paddle") {
    return Response.json({ ok: false, error: "direct_checkout_not_enabled" }, { status: 503 });
  }
  try {
    const cfg = marketplaceAppConfig();
    const flow = createBillingOAuthFlowState();
    const callbackUrl = `${cfg.publicBaseUrl}/api/auth/billing/github/callback`;
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", cfg.githubMarketplaceClientId);
    authorize.searchParams.set("redirect_uri", callbackUrl);
    authorize.searchParams.set("state", flow.state);
    authorize.searchParams.set("code_challenge", flow.codeChallenge);
    authorize.searchParams.set("code_challenge_method", "S256");

    return new Response(null, {
      status: 302,
      headers: {
        Location: authorize.toString(),
        "Set-Cookie": flow.cookie,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "billing_oauth_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
