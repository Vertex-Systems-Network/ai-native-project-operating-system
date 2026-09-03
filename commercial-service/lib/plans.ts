export const PLAN_FEATURES: Record<string, string[]> = {
  developer: ["private_template_access", "protocol_update_channel", "standard_provider_adapters"],
  pro: ["private_template_access", "protocol_update_channel", "standard_provider_adapters", "premium_blueprints", "premium_provider_adapters", "hosted_orchestrator_when_offered"],
  team: ["private_template_access", "protocol_update_channel", "standard_provider_adapters", "premium_blueprints", "premium_provider_adapters", "hosted_orchestrator_when_offered", "organization_team_features", "commercial_support"],
  enterprise: ["private_template_access", "protocol_update_channel", "standard_provider_adapters", "premium_blueprints", "premium_provider_adapters", "hosted_or_self_hosted_orchestrator_when_offered", "organization_team_features", "enterprise_policy_controls", "priority_support_or_sla_when_contracted"],
};

export function marketplacePlanMap(): Record<string, string> {
  const raw = process.env.ANPOS_MARKETPLACE_PLAN_MAP;
  if (!raw) throw new Error("ANPOS_MARKETPLACE_PLAN_MAP is not configured");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Invalid ANPOS_MARKETPLACE_PLAN_MAP"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid ANPOS_MARKETPLACE_PLAN_MAP");
  const result = parsed as Record<string, string>;
  for (const [marketplaceId, planId] of Object.entries(result)) {
    if (!/^\d+$/.test(marketplaceId) || !PLAN_FEATURES[planId]) throw new Error("Invalid ANPOS_MARKETPLACE_PLAN_MAP");
  }
  return result;
}

export function organizationSeatCapacity(planId: string, marketplaceUnitCount: number | null): number {
  if (Number.isInteger(marketplaceUnitCount) && Number(marketplaceUnitCount) > 0) return Number(marketplaceUnitCount);
  const raw = process.env.ANPOS_ORG_SEAT_LIMITS;
  if (!raw) throw new Error("ORGANIZATION_SEAT_CAPACITY_NOT_CONFIGURED");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("INVALID_ORGANIZATION_SEAT_LIMITS"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_ORGANIZATION_SEAT_LIMITS");
  const configured = Number((parsed as Record<string, unknown>)[planId]);
  if (!Number.isInteger(configured) || configured < 1 || configured > 100_000) {
    throw new Error("ORGANIZATION_SEAT_CAPACITY_NOT_CONFIGURED");
  }
  return configured;
}
