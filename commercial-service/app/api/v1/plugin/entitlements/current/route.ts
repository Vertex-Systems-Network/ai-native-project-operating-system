import { requireGithubAccountAccess } from "@/lib/auth";
import { getEntitlement, reconcileEntitlement } from "@/lib/entitlements";
import { requestIdFrom } from "@/lib/http";
import { buildPluginCapabilityMatrix, type PluginEntitlementSnapshot } from "@/lib/plugin-entitlements";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accountId = Number(request.headers.get("x-anpos-account-id") ?? "0");
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return Response.json({ ok: false, error: "x-anpos-account-id_required" }, { status: 400 });
  }

  const current = await getEntitlement(accountId);
  if (!current) {
    return Response.json({ ok: false, error: "entitlement_not_found" }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let user;
  try {
    user = await requireGithubAccountAccess(request, current);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED_GITHUB";
    return Response.json(
      { ok: false, error: code.toLowerCase() },
      { status: code.startsWith("FORBIDDEN") ? 403 : 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rate = await consumeRateLimit("plugin_entitlement_bridge", `${accountId}:${user.id}`, 30, 60);
  if (!rate.allowed) return rateLimitResponse(rate);

  const requestId = requestIdFrom(request);
  try {
    const refreshed = await reconcileEntitlement(accountId, requestId);
    const snapshot: PluginEntitlementSnapshot = {
      state: refreshed.state,
      github_account_id: accountId,
      github_account_type: refreshed.github_account_type ?? String(current.github_account_type) as "User" | "Organization",
      github_login: refreshed.github_login ?? String(current.github_login),
      plan_id: refreshed.plan_id,
      entitlements: refreshed.entitlements,
    };
    const capabilities = await buildPluginCapabilityMatrix(snapshot, { id: user.id, login: user.login });

    return Response.json({
      ok: true,
      billing_authority: refreshed.billing_provider,
      account_binding: "authenticated_github_principal_plus_x_anpos_account_id",
      account: {
        github_account_id: accountId,
        github_account_type: snapshot.github_account_type,
        github_login: snapshot.github_login,
      },
      principal: {
        github_user_id: user.id,
        github_login: user.login,
      },
      plan: {
        id: snapshot.plan_id,
        state: snapshot.state,
      },
      capabilities,
    }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { ok: false, error: "billing_reconciliation_unavailable", request_id: requestId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
