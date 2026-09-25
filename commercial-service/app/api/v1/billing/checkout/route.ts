import { authenticatedGithubContext } from "@/lib/auth";
import { paidBillingProvider } from "@/lib/env";
import { getEntitlement } from "@/lib/entitlements";
import { inputErrorResponse, readJsonBody } from "@/lib/http";
import { createPaddleCheckoutTransaction } from "@/lib/paddle";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

type CheckoutBody = {
  plan_id?: unknown;
  billing_cycle?: unknown;
};

export async function POST(request: Request) {
  if (paidBillingProvider() !== "paddle") {
    return Response.json(
      { ok: false, error: "direct_checkout_not_enabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: CheckoutBody;
  try { body = await readJsonBody<CheckoutBody>(request, 4096); }
  catch (error) { return inputErrorResponse(error) ?? Response.json({ ok: false, error: "invalid_checkout_request" }, { status: 400 }); }

  const planId = typeof body.plan_id === "string" ? body.plan_id.trim() : "";
  const billingCycle = body.billing_cycle === "month" || body.billing_cycle === "year" ? body.billing_cycle : null;
  if (!["developer", "pro"].includes(planId)) {
    return Response.json(
      { ok: false, error: ["team", "enterprise"].includes(planId) ? "organization_checkout_required" : "invalid_plan_id" },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!billingCycle) {
    return Response.json({ ok: false, error: "invalid_billing_cycle" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  let context;
  try {
    context = await authenticatedGithubContext(request);
  } catch {
    return Response.json({ ok: false, error: "unauthorized_github" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const rate = await consumeRateLimit("paddle_checkout", String(context.user.id), 10, 60);
  if (!rate.allowed) return rateLimitResponse(rate);

  const existing = await getEntitlement(context.user.id);
  if (existing && ["active", "trial", "grace"].includes(String(existing.state))) {
    return Response.json({
      ok: false,
      error: "active_subscription_exists",
      billing_provider: existing.billing_provider ?? null,
      plan_id: existing.plan_id ?? null,
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const transaction = await createPaddleCheckoutTransaction({
      githubAccountId: context.user.id,
      githubAccountType: "User",
      githubLogin: context.user.login,
      planId,
      billingCycle,
    });
    return Response.json({
      ok: true,
      billing_provider: "paddle",
      account: {
        github_account_id: context.user.id,
        github_account_type: "User",
        github_login: context.user.login,
      },
      plan: { id: planId, billing_cycle: billingCycle },
      transaction_id: transaction.transactionId,
      checkout_url: transaction.checkoutUrl,
    }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PADDLE_CHECKOUT_FAILED";
    const safe = [
      "PADDLE_PRICE_NOT_CONFIGURED",
      "INVALID_PLAN_ID",
      "INVALID_CHECKOUT_QUANTITY",
    ].includes(code) ? code.toLowerCase() : "checkout_unavailable";
    return Response.json({ ok: false, error: safe }, { status: safe === "checkout_unavailable" ? 503 : 422, headers: { "Cache-Control": "no-store" } });
  }
}
