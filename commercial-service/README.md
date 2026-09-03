# ANPOS Commercial Service

Vendor-only deployable reference backend for ANPOS GitHub Marketplace billing, licensing, seat control, and private distribution.

## Responsibilities

- receive and HMAC-verify bounded `marketplace_purchase` webhook bodies;
- bind `X-GitHub-Delivery` to a payload hash, deduplicate concurrent delivery, and safely retry failed/stale processing;
- reconcile account subscription state against GitHub Marketplace REST using the customer-facing Marketplace GitHub App JWT;
- persist a PostgreSQL entitlement, audit, rate-limit, seat, provisioning, and access-reconciliation ledger;
- use explicit checksum-locked database migrations instead of request-path schema mutation;
- issue short-lived Ed25519 signed entitlement envelopes;
- issue format-v2 seat-bound signed entitlements for organization users so an organization token is not freely shareable between members;
- expose public verification keys;
- expose non-secret deployment identity so stale/wrong service artifacts cannot pass production verification merely because health is green;
- allow authenticated customers to refresh current entitlement;
- let verified organization admins assign/list/revoke seats, with active-member verification and capacity enforcement;
- provide operator reconciliation for missed/ambiguous webhook deliveries and failed collaborator revocations;
- deliver the private template through a short-lived GitHub archive redirect using a separate vendor-only GitHub App;
- optionally provision users as private-template collaborators when explicitly enabled on the vendor App only;
- reference-count collaborator grants before revocation so another active purchase/seat is not accidentally removed;
- never delete, encrypt, modify, or intentionally break already-generated customer projects because a commercial entitlement ends.

## Two-App trust architecture

Production uses two distinct GitHub App registrations and the service fails closed if their App IDs or private keys are reused.

### Marketplace App — public/customer-facing

The Marketplace App owns the GitHub Marketplace listing and handles Marketplace account reconciliation. It must be installable by customer accounts when the listing is published. Keep its permissions limited to the customer-facing product capabilities actually offered; do **not** grant vendor-template Administration permission to this App.

Runtime credentials:

- `GITHUB_MARKETPLACE_APP_ID`
- `GITHUB_MARKETPLACE_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`

### Vendor Distribution App — private/vendor-only

The Vendor App exists only to access the vendor-controlled private commercial template. Keep it private to the publisher account/organization and install it only on the vendor template repository.

Runtime credentials:

- `GITHUB_VENDOR_APP_ID`
- `GITHUB_VENDOR_APP_PRIVATE_KEY`
- `GITHUB_VENDOR_INSTALLATION_ID`
- `ANPOS_PRIVATE_TEMPLATE_REPO`

Minimum permissions:

- archive-first delivery: **Contents: read** on the private template repository;
- optional collaborator provision/revoke: **Administration: write** on the private template repository only when that fallback is explicitly enabled.

This split prevents a customer-facing Marketplace installation from inheriting vendor repository administration capability and prevents a compromise of the Marketplace App credential from automatically granting access to the private template repository.

## Deployment identity

`GET /api/version` is public and intentionally secret-free. It reports the commercial-service package version, the ANPOS source protocol version embedded into the exported artifact, and the runtime-contract identifier. The response is `Cache-Control: no-store` and does not read deployment secrets.

Production verification must not treat `/api/health` alone as proof that the intended artifact is deployed. `scripts/verify_commercial_production.py --require-ready` requires both `--expected-service-version` and `--expected-protocol-version`; it checks `/api/version` before readiness so a healthy but stale/wrong artifact fails certification.

Example after deploying a certified artifact:

```bash
python scripts/verify_commercial_production.py \
  --base-url https://YOUR-SERVICE.example.com \
  --require-ready \
  --expected-service-version 0.3.1 \
  --expected-protocol-version 1.3.8
```

The production verifier uses the actual Next.js API route prefixes (`/api/v1/...`). There is no implicit `/v1/*` rewrite.

## Recommended distribution architecture

Use `GET /api/v1/template/archive` as the default paid delivery mechanism. GitHub returns a temporary private-repository archive URL that expires after roughly five minutes. This avoids permanent repository access and avoids relying on collaborator invitations as the primary scale path.

`POST /api/v1/provision` is an optional collaborator fallback and is disabled unless `ANPOS_COLLABORATOR_PROVISIONING_ENABLED=true`. GitHub limits repository invitations and collaborator mutations require stronger repository permissions, so this mode should not be the default sales path.

## GitHub permissions

Use the minimum permissions needed for each trust boundary:

- Marketplace billing reconciliation: Marketplace App authorization required by GitHub Marketplace.
- Customer identity: GitHub user access token; organization seat administration also requires **Members: read** when that customer-facing capability is used so active organization membership can be verified.
- Vendor private-template archive: Vendor App **Contents: read** on the private template repository.
- Optional collaborator provision/revoke: Vendor App **Administration: write** on the private template repository. The service requests operation-scoped installation tokens instead of using the full installation permission set.

Never add vendor-template Administration permission to the Marketplace App merely to support vendor-side provisioning.

## Database migrations

Database DDL is never run by normal API requests. Run migrations explicitly from `commercial-service/`:

```bash
npm run migrate
```

The migrator:

- takes a PostgreSQL advisory lock so two deploys cannot migrate concurrently;
- applies ordered `migrations/*.sql` files transactionally;
- records a SHA-256 checksum for every applied migration;
- refuses to continue if an already-applied migration file was edited;
- leaves request handlers/readiness fail-closed until the required migration is present.

Never edit an applied migration in place. Add a new numbered migration.

## Deploy

1. Create a durable PostgreSQL database.
2. Configure environment variables from `.env.example` in the deployment platform secret store. Never commit real values.
3. Run `npm run migrate` against the target database.
4. Create a **public Marketplace GitHub App** under the intended publisher organization for customer installations/Marketplace listing.
5. Create a separate **private Vendor Distribution GitHub App** under the vendor organization.
6. Map real Marketplace plan IDs in `ANPOS_MARKETPLACE_PLAN_MAP`.
7. Set real organization capacity policy in `ANPOS_ORG_SEAT_LIMITS`; Marketplace `unit_count` wins when GitHub supplies one.
8. Install only the Vendor App on the vendor private-template repository with **Contents: read**. Add **Administration: write** only if collaborator provisioning is deliberately enabled.
9. Set the Marketplace App webhook URL to `/api/webhooks/github/marketplace` and use the same secret as `GITHUB_WEBHOOK_SECRET`.
10. Verify `/api/health` returns 200, `/api/version` matches the exact certified artifact, and `/api/ready` returns 200 before enabling sales.
11. Run the production verifier with `--require-ready`, `--expected-service-version`, and `--expected-protocol-version`.
12. Exercise purchase, plan-change, cancellation, duplicate delivery, failed-delivery retry, archive delivery, seat assignment/revocation, and access-reconciliation tests before go-live.

## API

- `GET /api/health` — process liveness; does not imply artifact identity or billing readiness.
- `GET /api/version` — public, secret-free service/protocol/runtime-contract identity for deployment attestation.
- `GET /api/ready` — configuration, split GitHub App key types/role separation, plan/seat policy, migration/schema, and database readiness.
- `POST /api/webhooks/github/marketplace` — GitHub Marketplace webhook receiver.
- `GET /api/v1/keys` — public entitlement verification key.
- `GET /api/v1/entitlements/current` — refresh entitlement after GitHub identity verification; send `X-ANPOS-Account-Id`. Organization callers need an active assigned seat to receive a signed consumption token.
- `GET /api/v1/template/archive` — recommended short-lived private-template archive delivery.
- `GET /api/v1/seats` — organization-admin seat list.
- `POST /api/v1/seats` — organization-admin seat assignment by GitHub username.
- `DELETE /api/v1/seats` — organization-admin seat revocation by assigned GitHub user ID.
- `POST /api/v1/reconcile` — operator-only billing reconciliation with `ANPOS_OPERATOR_TOKEN`.
- `POST /api/v1/access/reconcile` — operator-only retry of pending collaborator access revocations.
- `POST /api/v1/provision` — optional authenticated/idempotent collaborator provisioning; disabled by default.

## Organization seats

Organization membership alone is not a paid seat. An organization admin must explicitly assign an active organization member. Seat capacity is taken from GitHub Marketplace `unit_count` when present; otherwise the operator-defined `ANPOS_ORG_SEAT_LIMITS` mapping is required and the service fails closed if capacity cannot be determined.

Organization consumption entitlements use signed envelope format v2, containing both the canonical organization `subject` and the assigned GitHub user `principal`.

## Expiry and revocation boundary

Cancellation, expiry, or seat revocation may stop future entitlement refresh, private archives, hosted capabilities, premium updates, support, and vendor-template access. They must not remotely modify, delete, encrypt, or intentionally break repositories/code already generated for the customer.

## Commercial boundary

This backend implements technical entitlement enforcement. Product prices, Marketplace plan IDs, taxes, refunds, legal license terms, privacy terms, SLA/support commitments, free-plan product value, and Marketplace publication remain operator-controlled business configuration.
