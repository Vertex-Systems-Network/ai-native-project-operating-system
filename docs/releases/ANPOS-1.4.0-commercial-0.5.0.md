# ANPOS 1.4.0 / Commercial Service 0.5.0

Status: **customer-facing release draft; not publication or live-sale evidence**.

Commercial service 0.5.0 adds a provider-neutral paid billing foundation while preserving GitHub Marketplace support. The first direct checkout adapter targets Paddle and keeps GitHub as the customer identity authority: a purchaser authenticates through GitHub App OAuth, ANPOS derives the numeric GitHub account identity server-side, and the browser may select only an allowed plan and billing cycle.

## Direct subscription foundation

- Adds `ANPOS_PAID_BILLING_PROVIDER` with `github_marketplace` and `paddle` modes.
- Adds ANPOS-prefixed Paddle configuration only; production configuration may not advertise environment keys beginning with `GITHUB_`.
- Adds server-created Paddle checkout transactions bound to configured recurring price IDs and server-verified GitHub identity.
- Adds an approved same-origin Paddle checkout page that exposes only the provider-issued client-side token; API keys and webhook secrets remain server-side.
- Adds exact-raw-body Paddle webhook HMAC verification with timestamp tolerance, provider/event replay protection, payload-hash conflict detection, and authenticated subscription reconciliation.
- Adds migration `009_external_billing_provider.sql` so the entitlement ledger records its billing provider, provider subscription/price identity, and replay-safe provider deliveries.
- Makes paid entitlement reconciliation provider-aware so a GitHub Marketplace lookup cannot silently cancel a Paddle-backed entitlement.
- Blocks duplicate active personal subscriptions and prevents stale events from a different Paddle subscription from overwriting an active entitlement.
- Preserves billing cycle, next billing date, free-trial end time, and provider authority in customer-facing billing state.
- Adds self-service personal Developer/Pro checkout for monthly or annual billing. Team and Enterprise remain organization-onboarding flows rather than personal checkout.
- Adds source certification and regression coverage for price mapping, GitHub identity binding, Paddle status mapping, webhook signatures, checkout transaction creation, and the `GITHUB_` environment-prefix prohibition.

## Security and authority boundaries

Payment-card data remains with the payment processor and is not stored by ANPOS. Repository state, browser-supplied GitHub account IDs, and local entitlement caches cannot grant commercial authority. Paid capabilities remain server-authorized against the reconciled entitlement ledger, organization seats where applicable, and current provider state.

GitHub Marketplace remains a supported billing adapter and the Community installation/readiness surface remains unchanged. Direct Paddle checkout does not claim GitHub Marketplace paid-listing eligibility and does not bypass GitHub Marketplace publisher requirements.

## External launch gates still required

This source release does **not** prove that a Paddle seller account, live Paddle product/price IDs, webhook destination, checkout domain approval, business verification, identity verification, private vendor repository, Vendor Distribution App, signing keys, legal terms, tax/accounting review, or a successful live purchase/cancel/refund flow exists.

Before live sales, an eligible company representative must complete the payment provider's required seller/business/identity verification, configure real production credentials and price IDs, create the verified private distribution assets, apply migration 009, deploy the exact certified artifact, and retain real purchase/cancellation and entitlement-delivery E2E evidence.

The release remains fail-closed until production readiness and the applicable external evidence gates are satisfied.
