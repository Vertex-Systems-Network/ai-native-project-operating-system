import { createHmac, timingSafeEqual } from "node:crypto";
import { paddleConfig } from "./env";
import { paddlePriceForPlan, resolvePaddlePrice, type PaddleBillingCycle } from "./plans";

type PaddleApiEnvelope<T> = { data?: T; error?: { code?: string; detail?: string } };

export type PaddleSubscription = {
  id: string;
  customer_id?: string | null;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  next_billed_at?: string | null;
  updated_at?: string | null;
  custom_data?: Record<string, unknown> | null;
  items?: Array<{
    status?: string;
    quantity?: number;
    recurring?: boolean;
    trial_dates?: { starts_at?: string; ends_at?: string } | null;
    price?: { id?: string; product_id?: string };
  }>;
};

export type PaddleSubscriptionSnapshot = {
  githubAccountId: number;
  githubAccountType: "User" | "Organization";
  githubLogin: string;
  planId: string;
  features: string[];
  billingCycle: PaddleBillingCycle;
  priceId: string;
  seats: number | null;
  state: "cancelled" | "trial" | "active" | "grace";
  providerStatus: string;
  providerAccountId: string | null;
  providerSubscriptionId: string;
  nextBillingDate: string | null;
  freeTrialEndsOn: string | null;
  updatedAt: string | null;
};

function paddleApiBase(): string {
  return paddleConfig().environment === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

async function paddleApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = paddleConfig();
  const response = await fetch(`${paddleApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({})) as PaddleApiEnvelope<T>;
  if (!response.ok || body.data == null) {
    const code = body.error?.code ? String(body.error.code).slice(0, 100) : String(response.status);
    throw new Error(`PADDLE_API_FAILED_${code}`);
  }
  return body.data;
}

export function verifyPaddleWebhook(
  raw: Buffer,
  signatureHeader: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || signatureHeader.length > 2048) return false;
  const fields = signatureHeader.split(";").map((part) => part.trim()).filter(Boolean);
  const tsValues = fields.filter((part) => part.startsWith("ts=")).map((part) => part.slice(3));
  const signatures = fields.filter((part) => part.startsWith("h1=")).map((part) => part.slice(3));
  if (tsValues.length !== 1 || !signatures.length || !/^\d{10,13}$/.test(tsValues[0])) return false;

  const ts = Number(tsValues[0]);
  if (!Number.isSafeInteger(ts)) return false;
  const tolerance = paddleConfig().webhookToleranceSeconds;
  if (Math.abs(nowSeconds - ts) > tolerance) return false;

  const expected = createHmac("sha256", paddleConfig().webhookSecret)
    .update(`${ts}:`)
    .update(raw)
    .digest("hex");

  const left = Buffer.from(expected, "hex");
  return signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const right = Buffer.from(candidate, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export async function createPaddleCheckoutTransaction(input: {
  githubAccountId: number;
  githubAccountType: "User" | "Organization";
  githubLogin: string;
  planId: string;
  billingCycle: PaddleBillingCycle;
  quantity?: number;
}): Promise<{ transactionId: string; checkoutUrl: string }> {
  if (!Number.isSafeInteger(input.githubAccountId) || input.githubAccountId <= 0) {
    throw new Error("INVALID_GITHUB_ACCOUNT_ID");
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(input.githubLogin)) {
    throw new Error("INVALID_GITHUB_LOGIN");
  }
  const quantity = input.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) throw new Error("INVALID_CHECKOUT_QUANTITY");

  const priceId = paddlePriceForPlan(input.planId, input.billingCycle);
  const cfg = paddleConfig();
  const data = await paddleApi<{
    id?: string;
    checkout?: { url?: string | null } | null;
  }>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity }],
      custom_data: {
        anpos_github_account_id: input.githubAccountId,
        anpos_github_account_type: input.githubAccountType,
        anpos_github_login: input.githubLogin,
        anpos_plan_id: input.planId,
        anpos_billing_cycle: input.billingCycle,
      },
      checkout: { url: cfg.checkoutUrl },
    }),
  });
  if (!data.id || !/^txn_[a-z\d]{26}$/.test(data.id) || !data.checkout?.url) {
    throw new Error("PADDLE_CHECKOUT_TRANSACTION_INVALID");
  }
  const checkout = new URL(data.checkout.url);
  const allowed = new URL(cfg.checkoutUrl);
  if (checkout.protocol !== "https:" || checkout.origin !== allowed.origin || checkout.pathname !== allowed.pathname) {
    throw new Error("PADDLE_CHECKOUT_URL_UNTRUSTED");
  }
  return { transactionId: data.id, checkoutUrl: checkout.toString() };
}

export async function getPaddleSubscription(subscriptionId: string): Promise<PaddleSubscription> {
  if (!/^sub_[a-z\d]{26}$/.test(subscriptionId)) throw new Error("INVALID_PADDLE_SUBSCRIPTION_ID");
  return paddleApi<PaddleSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export function paddleSubscriptionSnapshot(subscription: PaddleSubscription): PaddleSubscriptionSnapshot {
  if (!/^sub_[a-z\d]{26}$/.test(subscription.id)) throw new Error("INVALID_PADDLE_SUBSCRIPTION");
  const custom = subscription.custom_data ?? {};
  const githubAccountId = Number(custom.anpos_github_account_id);
  const githubAccountType = String(custom.anpos_github_account_type ?? "");
  const githubLogin = String(custom.anpos_github_login ?? "");
  if (!Number.isSafeInteger(githubAccountId) || githubAccountId <= 0) throw new Error("PADDLE_GITHUB_ACCOUNT_ID_MISSING");
  if (!["User", "Organization"].includes(githubAccountType)) throw new Error("PADDLE_GITHUB_ACCOUNT_TYPE_INVALID");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(githubLogin)) throw new Error("PADDLE_GITHUB_LOGIN_INVALID");

  const recurring = (subscription.items ?? []).filter((item) => item?.recurring !== false && item?.price?.id);
  if (recurring.length !== 1) throw new Error("PADDLE_SUBSCRIPTION_ITEM_COUNT_INVALID");
  const priceId = String(recurring[0].price?.id ?? "");
  const resolved = resolvePaddlePrice(priceId);
  if (custom.anpos_plan_id != null && String(custom.anpos_plan_id) !== resolved.planId) {
    throw new Error("PADDLE_PLAN_BINDING_MISMATCH");
  }
  if (custom.anpos_billing_cycle != null && String(custom.anpos_billing_cycle) !== resolved.billingCycle) {
    throw new Error("PADDLE_BILLING_CYCLE_BINDING_MISMATCH");
  }

  const quantity = Number(recurring[0].quantity ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) throw new Error("PADDLE_SUBSCRIPTION_QUANTITY_INVALID");

  const state = subscription.status === "trialing"
    ? "trial"
    : subscription.status === "active"
      ? "active"
      : subscription.status === "past_due"
        ? "grace"
        : "cancelled";

  return {
    githubAccountId,
    githubAccountType: githubAccountType as "User" | "Organization",
    githubLogin,
    planId: resolved.planId,
    features: resolved.features,
    billingCycle: resolved.billingCycle,
    priceId,
    seats: githubAccountType === "Organization" ? quantity : null,
    state,
    providerStatus: subscription.status,
    providerAccountId: subscription.customer_id ?? null,
    providerSubscriptionId: subscription.id,
    nextBillingDate: subscription.next_billed_at ?? null,
    freeTrialEndsOn: recurring[0].trial_dates?.ends_at ?? null,
    updatedAt: subscription.updated_at ?? null,
  };
}
