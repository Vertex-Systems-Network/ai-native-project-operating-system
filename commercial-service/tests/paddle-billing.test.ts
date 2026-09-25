import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { mock } from "node:test";
import {
  createPaddleCheckoutTransaction,
  paddleSubscriptionSnapshot,
  verifyPaddleWebhook,
  type PaddleSubscription,
} from "../lib/paddle";
import { paddlePriceForPlan, resolvePaddlePrice } from "../lib/plans";

const MONTHLY = "pri_" + "a".repeat(26);
const ANNUAL = "pri_" + "b".repeat(26);

function configurePaddle() {
  process.env.ANPOS_PAID_BILLING_PROVIDER = "paddle";
  process.env.ANPOS_PUBLIC_BASE_URL = "https://license.example.test";
  process.env.ANPOS_PADDLE_ENVIRONMENT = "sandbox";
  process.env.ANPOS_PADDLE_API_KEY = "pdl_sdbx_apikey_" + "x".repeat(32);
  process.env.ANPOS_PADDLE_WEBHOOK_SECRET = "w".repeat(48);
  process.env.ANPOS_PADDLE_CLIENT_TOKEN = "test_" + "c".repeat(32);
  process.env.ANPOS_PADDLE_CHECKOUT_URL = "https://license.example.test/billing/checkout";
  process.env.ANPOS_PADDLE_WEBHOOK_TOLERANCE_SECONDS = "30";
  process.env.ANPOS_PADDLE_PRICE_MAP = JSON.stringify({
    "developer:month": MONTHLY,
    "developer:year": ANNUAL,
  });
}

test("Paddle price map binds plan and billing cycle", () => {
  configurePaddle();
  assert.equal(paddlePriceForPlan("developer", "month"), MONTHLY);
  assert.deepEqual(resolvePaddlePrice(ANNUAL), {
    planId: "developer",
    billingCycle: "year",
    features: ["private_template_access", "protocol_update_channel"],
  });
  assert.throws(() => resolvePaddlePrice("pri_" + "z".repeat(26)), /PADDLE_PRICE_NOT_MAPPED/);
});

test("Paddle webhook signature binds timestamp and exact raw body", () => {
  configurePaddle();
  const now = 1_790_371_000;
  const raw = Buffer.from(JSON.stringify({ event_id: "evt_" + "a".repeat(26) }), "utf8");
  const digest = createHmac("sha256", process.env.ANPOS_PADDLE_WEBHOOK_SECRET!)
    .update(`${now}:`)
    .update(raw)
    .digest("hex");
  assert.equal(verifyPaddleWebhook(raw, `ts=${now};h1=${digest}`, now), true);
  assert.equal(verifyPaddleWebhook(Buffer.from(raw.toString("utf8") + " "), `ts=${now};h1=${digest}`, now), false);
  assert.equal(verifyPaddleWebhook(raw, `ts=${now - 31};h1=${digest}`, now), false);
});

test("Paddle subscription snapshot is GitHub-account and price bound", () => {
  configurePaddle();
  const snapshot = paddleSubscriptionSnapshot({
    id: "sub_" + "s".repeat(26),
    customer_id: "ctm_" + "c".repeat(26),
    status: "trialing",
    next_billed_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-09-25T20:00:00Z",
    custom_data: {
      anpos_github_account_id: 24288930,
      anpos_github_account_type: "User",
      anpos_github_login: "wpessential",
      anpos_plan_id: "developer",
      anpos_billing_cycle: "month",
    },
    items: [{
      status: "trialing",
      quantity: 1,
      recurring: true,
      trial_dates: { starts_at: "2026-09-25T00:00:00Z", ends_at: "2026-10-02T00:00:00Z" },
      price: { id: MONTHLY, product_id: "pro_" + "p".repeat(26) },
    }],
  });
  assert.equal(snapshot.githubAccountId, 24288930);
  assert.equal(snapshot.planId, "developer");
  assert.equal(snapshot.state, "trial");
  assert.equal(snapshot.billingCycle, "month");
  assert.equal(snapshot.freeTrialEndsOn, "2026-10-02T00:00:00Z");
  assert.equal(snapshot.providerSubscriptionId, "sub_" + "s".repeat(26));
});

test("Paddle status mapping fails closed for paused/canceled and keeps past-due grace", () => {
  configurePaddle();
  const base: Omit<PaddleSubscription, "status"> = {
    id: "sub_" + "s".repeat(26),
    customer_id: "ctm_" + "c".repeat(26),
    next_billed_at: null,
    updated_at: "2026-09-25T20:00:00Z",
    custom_data: {
      anpos_github_account_id: 101,
      anpos_github_account_type: "User",
      anpos_github_login: "alice",
      anpos_plan_id: "developer",
      anpos_billing_cycle: "month",
    },
    items: [{ status: "active", quantity: 1, recurring: true, trial_dates: null, price: { id: MONTHLY } }],
  };
  assert.equal(paddleSubscriptionSnapshot({ ...base, status: "past_due" }).state, "grace");
  assert.equal(paddleSubscriptionSnapshot({ ...base, status: "paused" }).state, "cancelled");
  assert.equal(paddleSubscriptionSnapshot({ ...base, status: "canceled" }).state, "cancelled");
});

test("Paddle checkout transaction uses server-selected price and GitHub identity custom data", async () => {
  configurePaddle();
  const transactionId = "txn_" + "t".repeat(26);
  mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    assert.match(headers.get("Authorization") ?? "", /^Bearer pdl_sdbx_apikey_/);
    const body = JSON.parse(String(init?.body)) as any;
    assert.deepEqual(body.items, [{ price_id: MONTHLY, quantity: 1 }]);
    assert.equal(body.custom_data.anpos_github_account_id, 101);
    assert.equal(body.custom_data.anpos_github_login, "alice");
    assert.equal(body.custom_data.anpos_plan_id, "developer");
    assert.equal(body.custom_data.anpos_billing_cycle, "month");
    return Response.json({
      data: {
        id: transactionId,
        checkout: { url: `https://license.example.test/billing/checkout?_ptxn=${transactionId}` },
      },
    });
  });

  const checkout = await createPaddleCheckoutTransaction({
    githubAccountId: 101,
    githubAccountType: "User",
    githubLogin: "alice",
    planId: "developer",
    billingCycle: "month",
  });
  assert.equal(checkout.transactionId, transactionId);
  assert.match(checkout.checkoutUrl, /_ptxn=/);
  mock.reset();
});
