# ANPOS Commercial Service

Vendor-only deployable reference backend for ANPOS GitHub Marketplace billing, licensing, seat control, private distribution, and the source-implemented ANPOS Community repository-readiness surface.

## Product-state boundary

The Community Repository Readiness / Conformance Audit is implemented in source but is **not** proof of Marketplace activation. A live Community claim still requires a real public Marketplace App, production secrets/configuration, deployment, Marketplace Setup/OAuth E2E evidence, and explicit operator activation.

Paid Developer/Pro/Team/Enterprise plans remain draft product configuration until their separate commercial-readiness gates pass.

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
- implement the Community Marketplace Setup URL -> PKCE GitHub App OAuth -> encrypted short-lived browser session -> installation-bound repository discovery -> read-only readiness audit flow;
- read only the ten approved ANPOS Community control files and never treat the free readiness audit as permission to inspect application source code;
- never delete, encrypt, modify, or intentionally break already-generated customer projects because a commercial entitlement ends.

## ANPOS Community flow

Community v1 uses the public Marketplace App as the consent boundary and a GitHub **user access token** as the repository-read authority.

1. GitHub Marketplace redirects a new/updated installation to `/setup/github?installation_id=...`.
2. The Setup route treats `installation_id` as untrusted, creates encrypted short-lived state plus a PKCE verifier, and redirects to `https://github.com/login/oauth/authorize`.
3. `/api/auth/github/callback` exchanges the authorization code with PKCE, verifies the GitHub user, and verifies that user against the selected installation.
4. The service creates an encrypted `HttpOnly; Secure; SameSite=Lax` browser session, capped to the short-lived GitHub access-token lifetime. Community v1 deliberately does not persist the GitHub refresh token.
5. `/community` discovers repositories through `/api/v1/audit/repositories` for that verified installation/user.
6. `POST /api/v1/audit/repository` verifies the target Marketplace installation has the exact ten-file `single_file: read` permission set, then reads those ten control files with the authenticated user token.

The approved Community audit files are documented in `docs/commercial/community-readiness-audit.md`. Audit results are not persisted by the repository-audit endpoint; application source is not read.

## Two-App trust architecture

Production uses two distinct GitHub App registrations and the service fails closed if their App IDs or private keys are reused.

### Marketplace App — public/customer-facing

The Marketplace App owns the GitHub Marketplace listing and handles Marketplace account reconciliation plus the Community consent surface. It must be installable by customer accounts when the listing is published.

Community permission set:

- baseline repository metadata read;
- **single file: read** for exactly the ten approved ANPOS control paths;
- no broad repository Contents permission for Community readiness;
- no vendor-template Administration permission.

Marketplace Setup/OAuth configuration:

- Setup URL: `/setup/github` on the deployed public HTTPS origin;
- callback URL: `/api/auth/github/callback` on the same origin;
- `request_oauth_on_install=false` so the Marketplace Setup URL remains the explicit entrypoint;
- Setup on update enabled;
- OAuth protected with PKCE and encrypted state.

Runtime credentials/configuration:

- `GITHUB_MARKETPLACE_APP_ID`
- `GITHUB_MARKETPLACE_APP_PRIVATE_KEY`
- `GITHUB_MARKETPLACE_CLIENT_ID`
- `GITHUB_MARKETPLACE_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `ANPOS_PUBLIC_BASE_URL`
- `ANPOS_SESSION_SECRET`

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

Generate exact expected values and GitHub App registration settings from the canonical vendor/operator handoff instead of copying release numbers or URLs manually:

```bash
python scripts/render_operator_launch_bootstrap.py \
  --organization YOUR_GITHUB_ORG \
  --service-base-url https://YOUR-SERVICE.example.com \
  --homepage-url https://YOUR-PRODUCT.example.com
```

The generated public Marketplace App registration URL includes the Setup URL, OAuth callback URL, Setup-on-update behavior, and exact ten-file Community permission scope. It contains no credentials.

## Recommended distribution architecture

Use `GET /api/v1/template/archive` as the default paid delivery mechanism. GitHub returns a temporary private-repository archive URL that expires after roughly five minutes. This avoids permanent repository access and avoids relying on collaborator invitations as the primary scale path.

`POST /api/v1/provision` is an optional collaborator fallback and is disabled unless `ANPOS_COLLABORATOR_PROVISIONING_ENABLED=true`. GitHub limits repository invitations and collaborator mutations require stronger repository permissions, so this mode should not be the default sales path.

## GitHub permissions

Use the minimum permissions needed for each trust boundary:

- Community Marketplace installation: metadata plus `single_file: read` for the exact ten ANPOS control files; actual file reads remain authenticated-user-token-bound.
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

The migrator takes a PostgreSQL advisory lock, applies ordered migrations transactionally, records SHA-256 checksums, and refuses edited applied migrations. Never edit an applied migration in place.

## Deploy

1. Create a durable PostgreSQL database.
2. Configure environment variables from `.env.example` in the deployment platform secret store. Never commit real values.
3. Run `npm run migrate` against the target database.
4. Create a **public Marketplace GitHub App** under the intended publisher organization using the generated registration URL; review Setup URL, callback URL, single-file paths, webhook, and visibility before saving.
5. Generate the Marketplace App OAuth client secret in GitHub and store it only in the deployment secret manager.
6. Create a separate **private Vendor Distribution GitHub App** under the vendor organization.
7. Map real paid Marketplace plan IDs in `ANPOS_MARKETPLACE_PLAN_MAP` only when those plans actually exist; do not invent them to make Community look launched.
8. Set real organization capacity policy in `ANPOS_ORG_SEAT_LIMITS` before paid organization sales.
9. Install only the Vendor App on the vendor private-template repository with **Contents: read**. Add **Administration: write** only if collaborator provisioning is deliberately enabled.
10. Set the Marketplace App webhook URL to `/api/webhooks/github/marketplace` and use the same secret as `GITHUB_WEBHOOK_SECRET`.
11. Verify `/api/health`, exact `/api/version` identity, and applicable readiness gates.
12. Exercise the real Community Setup -> OAuth -> repository discovery -> audit flow before activating Community.
13. Exercise purchase, plan-change, cancellation, duplicate delivery, failed-delivery retry, archive delivery, seat assignment/revocation, and access-reconciliation before enabling paid sales.

## API

- `GET /api/health` — process liveness; does not imply artifact identity or billing readiness.
- `GET /api/version` — public, secret-free service/protocol/runtime-contract identity for deployment attestation.
- `GET /api/ready` — full commercial configuration, split GitHub App key types/role separation, plan/seat policy, migration/schema, and database readiness.
- `POST /api/webhooks/github/marketplace` — GitHub Marketplace webhook receiver.
- `GET /setup/github` — Marketplace Setup entrypoint; starts PKCE GitHub App OAuth from an untrusted setup installation ID.
- `GET /api/auth/github/callback` — OAuth callback; verifies user + installation and creates encrypted short-lived browser session.
- `GET /api/v1/audit/repositories` — list repositories available to the authenticated user for the selected Marketplace installation.
- `POST /api/v1/audit/repository` — run the bounded ten-control-file Community readiness audit; no paid entitlement required.
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

This backend implements technical distribution/entitlement controls and the source implementation of Community readiness. Product prices, Marketplace plan IDs, taxes, refunds, legal license terms, privacy terms, SLA/support commitments, actual listing publication, external installation evidence, and plan activation remain operator-controlled business reality.
