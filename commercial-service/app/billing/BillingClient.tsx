"use client";

import { useState } from "react";

type PlanId = "developer" | "pro";
type BillingCycle = "month" | "year";

type CheckoutResponse = {
  ok?: boolean;
  error?: string;
  checkout_url?: string;
};

const PLANS: Array<{ id: PlanId; name: string; summary: string }> = [
  {
    id: "developer",
    name: "ANPOS Developer",
    summary: "Private template access, protocol updates, and paid Repository Supervisor capabilities allowed by your entitlement.",
  },
  {
    id: "pro",
    name: "ANPOS Pro",
    summary: "Developer capabilities plus premium blueprints/adapters when the configured premium release is production-ready.",
  },
];

export default function BillingClient() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function checkout(planId: PlanId, billingCycle: BillingCycle) {
    const key = `${planId}:${billingCycle}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }),
      });
      const body = await response.json() as CheckoutResponse;
      if (response.status === 401) {
        window.location.assign("/billing/login");
        return;
      }
      if (!response.ok || body.ok !== true || !body.checkout_url) {
        throw new Error(body.error ?? "checkout_unavailable");
      }
      window.location.assign(body.checkout_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replaceAll("_", " ") : "checkout unavailable");
    } finally {
      setBusy("");
    }
  }

  return <main style={{ maxWidth: 920, margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <p style={{ fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>ANPOS Subscription</p>
    <h1>Choose your plan</h1>
    <p>Sign in with GitHub to bind the subscription to your verified GitHub account. The checkout provider remains the billing authority; ANPOS never accepts a browser-supplied GitHub account ID as entitlement authority.</p>
    <p><a href="/billing/login">Sign in with GitHub</a></p>
    {error ? <p role="alert"><strong>Checkout error:</strong> {error}</p> : null}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 28 }}>
      {PLANS.map((plan) => <section key={plan.id} style={{ border: "1px solid #d1d5db", borderRadius: 12, padding: 20 }}>
        <h2>{plan.name}</h2>
        <p>{plan.summary}</p>
        <p>Current price and taxes are shown by the checkout provider before payment.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" disabled={Boolean(busy)} onClick={() => void checkout(plan.id, "month")}>
            {busy === `${plan.id}:month` ? "Opening…" : "Monthly"}
          </button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void checkout(plan.id, "year")}>
            {busy === `${plan.id}:year` ? "Opening…" : "Annual"}
          </button>
        </div>
      </section>)}
    </div>

    <p style={{ marginTop: 28 }}>Team and Enterprise require organization-specific onboarding and are not created from a personal checkout.</p>
  </main>;
}
