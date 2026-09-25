import { paddleConfig, paidBillingProvider } from "@/lib/env";
import CheckoutClient from "./CheckoutClient";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  if (paidBillingProvider() !== "paddle") {
    return <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Direct checkout is not enabled</h1>
      <p><a href="/billing">Return to plans</a></p>
    </main>;
  }
  const cfg = paddleConfig();
  return <CheckoutClient clientToken={cfg.clientToken} environment={cfg.environment} />;
}
