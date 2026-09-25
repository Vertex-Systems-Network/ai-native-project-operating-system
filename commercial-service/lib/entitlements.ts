import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getMarketplaceSubscription } from "./github";
import { signEntitlement } from "./crypto";
import { db, ensureSchema, transaction } from "./db";
import { paidBillingProvider, serviceConfig } from "./env";
import { getPaddleSubscription, paddleSubscriptionSnapshot } from "./paddle";
import { resolveMarketplacePlan } from "./plans";
import { requireActiveSeat } from "./seats";
import { processPendingTemplateAccessJobs, revokeAllTemplateGrantsForSource } from "./template-access";

const ACTIVE_STATES = new Set(["active", "trial", "grace"]);

export type ReconciledEntitlement = {
  state: "cancelled" | "trial" | "active" | "grace";
  github_account_id: number;
  github_account_type: "User" | "Organization" | null;
  github_login: string | null;
  plan_id: string | null;
  seats: number | null;
  entitlements: string[];
  signed_entitlement: ReturnType<typeof signEntitlement> | null;
  seat_assignment_required: boolean;
  billing_provider: "github_marketplace" | "paddle";
};

type NormalizedBillingSubscription = {
  githubAccountId: number;
  githubAccountType: "User" | "Organization";
  githubLogin: string;
  planId: string;
  seats: number | null;
  state: "cancelled" | "trial" | "active" | "grace";
  features: string[];
  paid: boolean;
  billingCycle: string | null;
  nextBillingDate: string | null;
  freeTrialEndsOn: string | null;
  billingUpdatedAt: string | null;
  marketplacePlanId: number | null;
  billingProvider: "github_marketplace" | "paddle";
  providerAccountId: string | null;
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  providerStatus: string | null;
};

function tokenExpiry(now: Date): string {
  const configured = Number(process.env.ANPOS_ENTITLEMENT_TTL_SECONDS ?? "86400");
  const seconds = Number.isFinite(configured) ? Math.min(Math.max(configured, 900), 604800) : 86400;
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function audit(client: PoolClient, requestId: string, eventType: string, accountId: number, metadata: object = {}) {
  await client.query(
    "INSERT INTO commercial_audit_log(request_id,event_type,github_account_id,metadata) VALUES ($1,$2,$3,$4::jsonb)",
    [requestId, eventType, accountId, JSON.stringify(metadata)],
  );
}

function storedEntitlementResult(row: any): ReconciledEntitlement {
  const rawState = String(row?.state ?? "cancelled");
  const state: ReconciledEntitlement["state"] = ["active", "trial", "grace"].includes(rawState)
    ? rawState as ReconciledEntitlement["state"]
    : "cancelled";
  const accountType = row?.github_account_type === "Organization"
    ? "Organization"
    : row?.github_account_type === "User"
      ? "User"
      : null;
  const provider = row?.billing_provider === "paddle" ? "paddle" : "github_marketplace";
  const features = Array.isArray(row?.features) ? row.features.map(String) : [];
  return {
    state,
    github_account_id: Number(row?.github_account_id ?? 0),
    github_account_type: accountType,
    github_login: row?.github_login == null ? null : String(row.github_login),
    plan_id: row?.plan_id == null ? null : String(row.plan_id),
    seats: row?.seats == null ? null : Number(row.seats),
    entitlements: features,
    signed_entitlement: row?.signed_envelope ?? null,
    seat_assignment_required: accountType === "Organization" && state !== "cancelled" && features.length > 0,
    billing_provider: provider,
  };
}

async function applyAccessRevocation(result: ReconciledEntitlement, requestId: string): Promise<void> {
  if (result.state !== "cancelled" && result.entitlements.includes("private_template_access")) return;
  const revoked = await revokeAllTemplateGrantsForSource(result.github_account_id, requestId);
  if (revoked > 0) await processPendingTemplateAccessJobs(10, requestId).catch(() => []);
}

async function persistNormalizedEntitlement(
  normalized: NormalizedBillingSubscription,
  requestId: string,
): Promise<ReconciledEntitlement> {
  const result = await transaction<ReconciledEntitlement>(async (client) => {
    const existing = await client.query(
      "SELECT * FROM entitlements WHERE github_account_id=$1 FOR UPDATE",
      [normalized.githubAccountId],
    );
    const now = new Date();
    const licenseId = existing.rows[0]?.license_id ?? randomUUID();
    const issuedAt = now.toISOString();
    const envelopeExpiresAt = normalized.state === "cancelled" ? issuedAt : tokenExpiry(now);
    const envelope = (
      normalized.state === "cancelled"
      || !normalized.paid
      || normalized.githubAccountType === "Organization"
    ) ? null : signEntitlement({
      issuer: serviceConfig().entitlementIssuer,
      subject: {
        github_account_id: normalized.githubAccountId,
        github_account_type: normalized.githubAccountType,
        github_login: normalized.githubLogin,
      },
      license_id: licenseId,
      plan_id: normalized.planId,
      seats: normalized.seats,
      entitlements: normalized.features,
      issued_at: issuedAt,
      not_before: issuedAt,
      expires_at: envelopeExpiresAt,
    });

    await client.query(`
      INSERT INTO entitlements(
        github_account_id,github_login,github_account_type,license_id,plan_id,marketplace_plan_id,seats,state,features,billing_cycle,
        next_billing_date,free_trial_ends_on,issued_at,not_before,expires_at,billing_updated_at,signed_envelope,
        billing_provider,billing_provider_account_id,billing_provider_subscription_id,billing_provider_price_id,billing_provider_status,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,NOW())
      ON CONFLICT (github_account_id) DO UPDATE SET
        github_login=EXCLUDED.github_login,github_account_type=EXCLUDED.github_account_type,plan_id=EXCLUDED.plan_id,
        marketplace_plan_id=EXCLUDED.marketplace_plan_id,seats=EXCLUDED.seats,state=EXCLUDED.state,features=EXCLUDED.features,
        billing_cycle=EXCLUDED.billing_cycle,next_billing_date=EXCLUDED.next_billing_date,
        free_trial_ends_on=EXCLUDED.free_trial_ends_on,issued_at=EXCLUDED.issued_at,not_before=EXCLUDED.not_before,
        expires_at=EXCLUDED.expires_at,billing_updated_at=EXCLUDED.billing_updated_at,signed_envelope=EXCLUDED.signed_envelope,
        billing_provider=EXCLUDED.billing_provider,billing_provider_account_id=EXCLUDED.billing_provider_account_id,
        billing_provider_subscription_id=EXCLUDED.billing_provider_subscription_id,
        billing_provider_price_id=EXCLUDED.billing_provider_price_id,billing_provider_status=EXCLUDED.billing_provider_status,
        updated_at=NOW()
    `, [
      normalized.githubAccountId,
      normalized.githubLogin,
      normalized.githubAccountType,
      licenseId,
      normalized.planId,
      normalized.marketplacePlanId,
      normalized.seats,
      normalized.state,
      JSON.stringify(normalized.features),
      normalized.billingCycle,
      normalized.nextBillingDate,
      normalized.freeTrialEndsOn,
      issuedAt,
      envelopeExpiresAt,
      normalized.billingUpdatedAt,
      JSON.stringify(envelope),
      normalized.billingProvider,
      normalized.providerAccountId,
      normalized.providerSubscriptionId,
      normalized.providerPriceId,
      normalized.providerStatus,
    ]);

    await audit(client, requestId, "entitlement_reconciled", normalized.githubAccountId, {
      plan_id: normalized.planId,
      marketplace_plan_id: normalized.marketplacePlanId,
      state: normalized.state,
      account_type: normalized.githubAccountType,
      paid: normalized.paid,
      billing_provider: normalized.billingProvider,
      billing_provider_status: normalized.providerStatus,
    });

    return {
      state: normalized.state,
      github_account_id: normalized.githubAccountId,
      github_account_type: normalized.githubAccountType,
      github_login: normalized.githubLogin,
      plan_id: normalized.planId,
      seats: normalized.seats,
      entitlements: normalized.features,
      signed_entitlement: envelope,
      seat_assignment_required: normalized.paid && normalized.githubAccountType === "Organization",
      billing_provider: normalized.billingProvider,
    };
  });
  await applyAccessRevocation(result, requestId);
  return result;
}

async function cancelMarketplaceEntitlement(accountId: number, requestId: string): Promise<ReconciledEntitlement> {
  const existing = await getEntitlement(accountId);
  if (existing?.billing_provider && existing.billing_provider !== "github_marketplace") {
    return storedEntitlementResult(existing);
  }
  await db().query(
    "UPDATE entitlements SET state='cancelled',signed_envelope=NULL,expires_at=NOW(),billing_provider_status='absent',updated_at=NOW() WHERE github_account_id=$1 AND billing_provider='github_marketplace'",
    [accountId],
  );
  await db().query(
    "INSERT INTO commercial_audit_log(request_id,event_type,github_account_id,metadata) VALUES ($1,'entitlement_cancelled_or_absent',$2,$3::jsonb)",
    [requestId, accountId, JSON.stringify({ billing_provider: "github_marketplace" })],
  );
  const result: ReconciledEntitlement = {
    state: "cancelled",
    github_account_id: accountId,
    github_account_type: existing?.github_account_type === "Organization" ? "Organization" : existing?.github_account_type === "User" ? "User" : null,
    github_login: existing?.github_login ? String(existing.github_login) : null,
    plan_id: null,
    seats: null,
    signed_entitlement: null,
    entitlements: [],
    seat_assignment_required: false,
    billing_provider: "github_marketplace",
  };
  await applyAccessRevocation(result, requestId);
  return result;
}

export async function reconcileMarketplaceEntitlement(
  accountId: number,
  requestId: string,
): Promise<ReconciledEntitlement> {
  const subscription = await getMarketplaceSubscription(accountId);
  if (!subscription?.marketplace_purchase?.plan?.id) {
    return cancelMarketplaceEntitlement(accountId, requestId);
  }
  if (!Number.isSafeInteger(subscription.id) || subscription.id <= 0 || subscription.id !== accountId) {
    throw new Error("Marketplace account identity mismatch");
  }
  if (!new Set(["User", "Organization"]).has(subscription.type) || !subscription.login) {
    throw new Error("Unsupported Marketplace account type");
  }
  const marketplacePlanId = subscription.marketplace_purchase.plan.id;
  const resolvedPlan = resolveMarketplacePlan(marketplacePlanId);
  const existing = await getEntitlement(accountId);
  if (paidBillingProvider() !== "github_marketplace") {
    if (resolvedPlan.paid) throw new Error("BILLING_PROVIDER_MISMATCH");
    if (existing?.billing_provider === "paddle") return storedEntitlementResult(existing);
  }
  return persistNormalizedEntitlement({
    githubAccountId: subscription.id,
    githubAccountType: subscription.type as "User" | "Organization",
    githubLogin: subscription.login,
    planId: resolvedPlan.planId,
    seats: subscription.marketplace_purchase.unit_count ?? null,
    state: subscription.marketplace_purchase.on_free_trial ? "trial" : "active",
    features: resolvedPlan.features,
    paid: resolvedPlan.paid,
    billingCycle: subscription.marketplace_purchase.billing_cycle ?? null,
    nextBillingDate: subscription.marketplace_purchase.next_billing_date ?? null,
    freeTrialEndsOn: subscription.marketplace_purchase.free_trial_ends_on ?? null,
    billingUpdatedAt: subscription.marketplace_purchase.updated_at ?? null,
    marketplacePlanId,
    billingProvider: "github_marketplace",
    providerAccountId: String(subscription.id),
    providerSubscriptionId: null,
    providerPriceId: null,
    providerStatus: subscription.marketplace_purchase.on_free_trial ? "trial" : "active",
  }, requestId);
}

export async function reconcilePaddleSubscription(
  subscriptionId: string,
  requestId: string,
  expectedAccountId?: number,
): Promise<ReconciledEntitlement> {
  const snapshot = paddleSubscriptionSnapshot(await getPaddleSubscription(subscriptionId));
  if (expectedAccountId != null && snapshot.githubAccountId !== expectedAccountId) {
    throw new Error("PADDLE_ACCOUNT_BINDING_MISMATCH");
  }
  const existing = await getEntitlement(snapshot.githubAccountId);
  if (
    existing?.billing_provider === "paddle"
    && existing.billing_provider_subscription_id
    && String(existing.billing_provider_subscription_id) !== snapshot.providerSubscriptionId
    && ACTIVE_STATES.has(String(existing.state))
  ) {
    return storedEntitlementResult(existing);
  }
  return persistNormalizedEntitlement({
    githubAccountId: snapshot.githubAccountId,
    githubAccountType: snapshot.githubAccountType,
    githubLogin: snapshot.githubLogin,
    planId: snapshot.planId,
    seats: snapshot.seats,
    state: snapshot.state,
    features: snapshot.features,
    paid: true,
    billingCycle: snapshot.billingCycle,
    nextBillingDate: snapshot.nextBillingDate,
    freeTrialEndsOn: snapshot.freeTrialEndsOn,
    billingUpdatedAt: snapshot.updatedAt,
    marketplacePlanId: null,
    billingProvider: "paddle",
    providerAccountId: snapshot.providerAccountId,
    providerSubscriptionId: snapshot.providerSubscriptionId,
    providerPriceId: snapshot.priceId,
    providerStatus: snapshot.providerStatus,
  }, requestId);
}

export async function reconcileEntitlement(accountId: number, requestId: string): Promise<ReconciledEntitlement> {
  const current = await getEntitlement(accountId);
  const provider = current?.billing_provider ? String(current.billing_provider) : paidBillingProvider();
  if (provider === "paddle") {
    const subscriptionId = current?.billing_provider_subscription_id == null
      ? ""
      : String(current.billing_provider_subscription_id);
    if (!subscriptionId) throw new Error("PADDLE_SUBSCRIPTION_NOT_FOUND");
    return reconcilePaddleSubscription(subscriptionId, requestId, accountId);
  }
  if (provider === "github_marketplace") return reconcileMarketplaceEntitlement(accountId, requestId);
  throw new Error("UNSUPPORTED_BILLING_PROVIDER");
}

export type BillingAccountDiscoveryRecord = {
  github_account_id: number;
  github_login: string;
  github_account_type: "User" | "Organization";
  plan_id: string | null;
  state: string;
  entitlements: string[];
};

export async function listBillingAccountsForPrincipal(githubUserId: number): Promise<BillingAccountDiscoveryRecord[]> {
  if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0) throw new Error("VALID_GITHUB_USER_ID_REQUIRED");
  await ensureSchema();
  const result = await db().query(
    `SELECT
       e.github_account_id,e.github_login,e.github_account_type,e.plan_id,e.state,e.features
     FROM entitlements e
     LEFT JOIN organization_seat_assignments s
       ON s.github_account_id=e.github_account_id
      AND s.github_user_id=$1
      AND s.status='active'
     WHERE
       (e.github_account_type='User' AND e.github_account_id=$1)
       OR
       (e.github_account_type='Organization' AND s.github_user_id=$1)
     ORDER BY e.github_account_type ASC, LOWER(e.github_login) ASC, e.github_account_id ASC`,
    [githubUserId],
  );
  return result.rows
    .filter((row) =>
      Number.isSafeInteger(Number(row.github_account_id))
      && Number(row.github_account_id) > 0
      && (row.github_account_type === "User" || row.github_account_type === "Organization")
      && typeof row.github_login === "string"
      && Boolean(row.github_login.trim()))
    .map((row) => ({
      github_account_id: Number(row.github_account_id),
      github_login: String(row.github_login),
      github_account_type: row.github_account_type as "User" | "Organization",
      plan_id: row.plan_id == null ? null : String(row.plan_id),
      state: String(row.state),
      entitlements: Array.isArray(row.features) ? row.features.map(String) : [],
    }));
}

export async function getEntitlement(accountId: number) {
  await ensureSchema();
  const result = await db().query(
    "SELECT github_account_id,github_login,github_account_type,license_id,plan_id,marketplace_plan_id,seats,state,features,billing_cycle,next_billing_date,free_trial_ends_on,billing_provider,billing_provider_account_id,billing_provider_subscription_id,billing_provider_price_id,billing_provider_status,issued_at,not_before,expires_at,signed_envelope,updated_at FROM entitlements WHERE github_account_id=$1",
    [accountId],
  );
  return result.rows[0] ?? null;
}

export async function issueEntitlementForPrincipal(accountId: number, user: { id: number; login: string }, requestId: string) {
  const entitlement = await getEntitlement(accountId);
  if (!entitlement) throw new Error("ENTITLEMENT_NOT_FOUND");
  if (!ACTIVE_STATES.has(String(entitlement.state))) throw new Error("ENTITLEMENT_NOT_ACTIVE");
  const features = Array.isArray(entitlement.features) ? entitlement.features.map(String) : [];
  if (!features.length) throw new Error("ENTITLEMENT_FEATURES_MISSING");

  const subject = {
    github_account_id: Number(entitlement.github_account_id),
    github_account_type: String(entitlement.github_account_type),
    github_login: String(entitlement.github_login),
  };
  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = tokenExpiry(now);

  let envelope;
  if (subject.github_account_type === "Organization") {
    await requireActiveSeat(accountId, user.id);
    envelope = signEntitlement({
      issuer: serviceConfig().entitlementIssuer,
      subject,
      principal: { github_user_id: user.id, github_login: user.login },
      license_id: String(entitlement.license_id),
      plan_id: String(entitlement.plan_id),
      seats: entitlement.seats == null ? null : Number(entitlement.seats),
      entitlements: features,
      issued_at: issuedAt,
      not_before: issuedAt,
      expires_at: expiresAt,
    });
  } else {
    if (user.id !== accountId) throw new Error("FORBIDDEN_GITHUB_ACCOUNT");
    envelope = signEntitlement({
      issuer: serviceConfig().entitlementIssuer,
      subject,
      license_id: String(entitlement.license_id),
      plan_id: String(entitlement.plan_id),
      seats: entitlement.seats == null ? null : Number(entitlement.seats),
      entitlements: features,
      issued_at: issuedAt,
      not_before: issuedAt,
      expires_at: expiresAt,
    });
  }

  await db().query(
    "INSERT INTO commercial_audit_log(request_id,event_type,github_account_id,metadata) VALUES ($1,'entitlement_token_issued',$2,$3::jsonb)",
    [requestId, accountId, JSON.stringify({ github_user_id: user.id, github_login: user.login, format_version: envelope.format_version })],
  );
  return {
    state: String(entitlement.state),
    github_account_id: accountId,
    github_account_type: subject.github_account_type,
    github_login: subject.github_login,
    plan_id: String(entitlement.plan_id),
    seats: entitlement.seats == null ? null : Number(entitlement.seats),
    entitlements: features,
    issued_at: issuedAt,
    not_before: issuedAt,
    expires_at: expiresAt,
    billing_record_updated_at: iso(entitlement.updated_at),
    signed_entitlement: envelope,
  };
}
