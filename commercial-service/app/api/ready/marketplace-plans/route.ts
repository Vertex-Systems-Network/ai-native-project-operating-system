import { listMarketplacePlans } from "@/lib/github";
import { communityMarketplacePlanId } from "@/lib/plans";

export const runtime = "nodejs";

export async function GET() {
  try {
    const communityId = communityMarketplacePlanId();
    const all = await listMarketplacePlans();
    const published = all
      .filter((plan) => plan.state === "published")
      .map((plan) => ({
        id: plan.id,
        number: plan.number,
        name: plan.name,
        state: plan.state,
        price_model: plan.price_model,
        community: plan.id === communityId,
        paid: plan.id !== communityId
          && Number(plan.monthly_price_in_cents ?? 0) > 0
          && Number(plan.yearly_price_in_cents ?? 0) > 0,
        monthly_billing_configured: Number(plan.monthly_price_in_cents ?? 0) > 0,
        annual_billing_configured: Number(plan.yearly_price_in_cents ?? 0) > 0,
        has_free_trial: plan.has_free_trial,
      }));
    return Response.json({
      ok: true,
      source: "github_marketplace_live_listing",
      published_plans: published,
      unpublished_plan_count: all.length - published.length,
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "marketplace_plan_discovery_failed";
    return Response.json({ ok: false, status: "not_ready", detail }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
