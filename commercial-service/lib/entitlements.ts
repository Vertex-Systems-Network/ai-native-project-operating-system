import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getMarketplaceSubscription } from "./github";
import { signEntitlement } from "./crypto";
import { transaction } from "./db";
import { serviceConfig } from "./env";

const FEATURES: Record<string, string[]> = {
  developer: ["private_template_access", "protocol_update_channel", "standard_provider_adapters"],
  pro: ["private_template_access", "protocol_update_channel", "standard_provider_adapters", "premium_blueprints", "premium_provider_adapters", "hosted_orchestrator_when_offered"],
  team: ["private_template_access", "protocol_update_channel", "standard_provider_adapters", "premium_blueprints", "premium_provider_adapters", "hosted_orchestrator_when_offered", "organization_team_features", "commercial_support"],
  enterprise: ["private_template_access", "protocol_update_channel", "standard_provider_adapters", "premium_blueprints", "premium_provider_adapters", "hosted_or_self_hosted_orchestrator_when_offered", "organization_team_features", "enterprise_policy_controls", "priority_support_or_sla_when_contracted"],
};

function planMap(): Record<string, string> {
  const raw = process.env.ANPOS_MARKETPLACE_PLAN_MAP;
  if (!raw) throw new Error("ANPOS_MARKETPLACE_PLAN_MAP is not configured");
  const parsed = JSON.parse(raw) as Record<string, string>;
  for (const [marketplaceId, planId] of Object.entries(parsed)) {
    if (!/^\d+$/.test(marketplaceId) || !FEATURES[planId]) throw new Error("Invalid ANPOS_MARKETPLACE_PLAN_MAP");
  }
  return parsed;
}

function tokenExpiry(now: Date): string {
  const configured = Number(process.env.ANPOS_ENTITLEMENT_TTL_SECONDS ?? "86400");
  const seconds = Number.isFinite(configured) ? Math.min(Math.max(configured, 900), 604800) : 86400;
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

async function audit(client: PoolClient, requestId: string, eventType: string, accountId: number, metadata: object = {}) {
  await client.query(
    "INSERT INTO commercial_audit_log(request_id,event_type,github_account_id,metadata) VALUES ($1,$2,$3,$4::jsonb)",
    [requestId, eventType, accountId, JSON.stringify(metadata)],
  );
}

export async function reconcileEntitlement(accountId: number, requestId: string) {
  const subscription = await getMarketplaceSubscription(accountId);
  return transaction(async (client) => {
    const existing = await client.query("SELECT * FROM entitlements WHERE github_account_id=$1 FOR UPDATE", [accountId]);
    if (!subscription?.marketplace_purchase?.plan?.id) {
      if (existing.rowCount) {
        await client.query("UPDATE entitlements SET state='cancelled', signed_envelope=NULL, expires_at=NOW(), updated_at=NOW() WHERE github_account_id=$1", [accountId]);
      }
      await audit(client, requestId, "entitlement_cancelled_or_absent", accountId);
      return { state: "cancelled", github_account_id: accountId, signed_entitlement: null };
    }

    const marketplacePlanId = subscription.marketplace_purchase.plan.id;
    const planId = planMap()[String(marketplacePlanId)];
    if (!planId) throw new Error(`Marketplace plan ${marketplacePlanId} is not mapped`);

    const now = new Date();
    const licenseId = existing.rows[0]?.license_id ?? randomUUID();
    const seats = subscription.marketplace_purchase.unit_count ?? null;
    const state = subscription.marketplace_purchase.on_free_trial ? "trial" : "active";
    const features = FEATURES[planId];
    const issuedAt = now.toISOString();
    const envelopeExpiresAt = tokenExpiry(now);
    const envelope = signEntitlement({
      issuer: serviceConfig().entitlementIssuer,
      subject: { github_account_id: subscription.id, github_account_type: subscription.type, github_login: subscription.login },
      license_id: licenseId,
      plan_id: planId,
      seats,
      entitlements: features,
      issued_at: issuedAt,
      not_before: issuedAt,
      expires_at: envelopeExpiresAt,
    });

    await client.query(`
      INSERT INTO entitlements(
        github_account_id,github_login,github_account_type,license_id,plan_id,marketplace_plan_id,seats,state,features,billing_cycle,
        issued_at,not_before,expires_at,billing_updated_at,signed_envelope,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$11,$12,$13,$14::jsonb,NOW())
      ON CONFLICT (github_account_id) DO UPDATE SET
        github_login=EXCLUDED.github_login, github_account_type=EXCLUDED.github_account_type, plan_id=EXCLUDED.plan_id,
        marketplace_plan_id=EXCLUDED.marketplace_plan_id, seats=EXCLUDED.seats, state=EXCLUDED.state, features=EXCLUDED.features,
        billing_cycle=EXCLUDED.billing_cycle, issued_at=EXCLUDED.issued_at, not_before=EXCLUDED.not_before,
        expires_at=EXCLUDED.expires_at, billing_updated_at=EXCLUDED.billing_updated_at,
        signed_envelope=EXCLUDED.signed_envelope, updated_at=NOW()
    `, [
      subscription.id, subscription.login, subscription.type, licenseId, planId, marketplacePlanId, seats, state,
      JSON.stringify(features), subscription.marketplace_purchase.billing_cycle ?? null, issuedAt, envelopeExpiresAt,
      subscription.marketplace_purchase.updated_at ?? null, JSON.stringify(envelope),
    ]);
    await audit(client, requestId, "entitlement_reconciled", accountId, { plan_id: planId, marketplace_plan_id: marketplacePlanId, state });
    return { state, github_account_id: accountId, plan_id: planId, seats, entitlements: features, signed_entitlement: envelope };
  });
}

export async function getEntitlement(accountId: number) {
  const { db, ensureSchema } = await import("./db");
  await ensureSchema();
  const result = await db().query(
    "SELECT github_account_id,github_login,github_account_type,license_id,plan_id,seats,state,features,issued_at,not_before,expires_at,signed_envelope,updated_at FROM entitlements WHERE github_account_id=$1",
    [accountId],
  );
  return result.rows[0] ?? null;
}
