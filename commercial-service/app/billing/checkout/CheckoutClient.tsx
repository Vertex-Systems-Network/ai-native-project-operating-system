"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set(environment: "sandbox"): void };
      Initialize(options: { token: string }): void;
      Checkout: { open(options: { transactionId: string }): void };
    };
  }
}

export default function CheckoutClient(props: { clientToken: string; environment: "sandbox" | "production" }) {
  const [error, setError] = useState("");

  function initialize() {
    try {
      if (!window.Paddle) throw new Error("Paddle.js unavailable");
      if (props.environment === "sandbox") window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({ token: props.clientToken });
      const transactionId = new URL(window.location.href).searchParams.get("_ptxn") ?? "";
      if (/^txn_[a-z\d]{26}$/.test(transactionId)) {
        window.Paddle.Checkout.open({ transactionId });
      }
    } catch {
      setError("Checkout could not be initialized. Return to the billing page and try again.");
    }
  }

  return <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
    <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onLoad={initialize} />
    <h1>ANPOS secure checkout</h1>
    <p>Your checkout should open automatically. Payment details are handled by the payment provider and are not stored by ANPOS.</p>
    {error ? <p role="alert">{error}</p> : null}
    <p><a href="/billing">Return to plans</a></p>
  </main>;
}
