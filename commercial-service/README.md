# ANPOS Commercial Service

Vendor-only deployable reference backend for ANPOS GitHub Marketplace billing, licensing, seat control, and private distribution.

## Responsibilities

- receive and HMAC-verify bounded `marketplace_purchase` webhook bodies;
- bind `X-GitHub-Delivery` to a payload hash, deduplicate concurrent delivery, and safely retry failed/stale processing;
- reconcile account subscription state against GitHub Marketplace REST using a GitHub App JWT;
- persist a PostgreSQL entitlement, audit, rate-limit, seat, provisioning, and access-reconciliation ledger;
- issue short-lived Ed25519 signed entitlement envelopes;
- issue format-v2 seat-bound signed entitlements for organization users so an organization token is not freely shareable between members;
- expose public verification keys;
- allow authenticated customers to refresh current entitlement;
- let verified organization admins assign/list/revoke seats, with active-member verification and capacity enforcement;
- provide operator reconciliation for missed/ambiguous webhook deliveries and failed collaborator revocations;
- deliver the private template through a short-lived GitHub archive redirect as the recommended scalable distribution path;
- optionally provision users as private-template collaborators when explicitly enabled;
- reference-count collaborator grants before revocation so another active purchase/seat is not accidentally removed;
- never delete, encrypt, modify, or intentionally break already-generated customer projects because a commercial entitlement ends.

## Recommended distribution architecture

Use `GET /api/v1/template/archive` as the default paid delivery mechanism. GitHub returns a temporary private-repository archive URL that expires after roughly five minutes. This avoids permanent repository access and avoids relying on collaborator invitations as the primary scale path.

`POST /api/v1/provision` is an optional collaborator fallback and is disabled unless `ANPOS_COLLABORATOR_PROVISIONING_ENABLED=true`. GitHub limits repository invitations and collaborator mutations require stronger repository permissions, so this mode should not be the default sales path.

## GitHub App permissions

Use the minimum permissions needed for each trust boundary:

- Marketplace billing reconciliation: GitHub App/Marketplace authorization required by GitHub Marketplace.
- Customer identity: GitHub App user access token; organization seat administration also requires **Members: read** so active organization membership can be verified.
- Vendor private-template archive: **Contents: read** on the private template repository.
- Optional collaborator provision/revoke: **Administration: write** on the private template repository. The service requests operation-scoped installation tokens instead of using the full installation permission set.

Do not grant collaborator administration permission if archive-only distribution is used.

## Deploy

1. Create a durable PostgreSQL database.
2. Configure environment variables from `.env.example` in the deployment platform secret store. Never commit real values.
3. Create/install the GitHub App and configure its Marketplace listing.
4. Map real Marketplace plan IDs in `ANPOS_MARKETPLACE_PLAN_MAP`.
5. Set real organization capacity policy in `ANPOS_ORG_SEAT_LIMITS`; Marketplace `unit_count` wins when GitHub supplies one.
6. Install the App on the vendor private-template repository with **Contents: read**. Add **Administration: write** only if collaborator provisioning is deliberately enabled.
7. Set the Marketplace webhook URL to `/api/webhooks/github/marketplace` and use the same secret as `GITHUB_WEBHOOK_SECRET`.
8. Verify `/api/health` returns 200 and `/api/ready` returns 200 before enabling sales.
9. Exercise purchase, plan-change, cancellation, duplicate delivery, failed-delivery retry, archive delivery, seat assignment/revocation, and access-reconciliation tests before go-live.

## API

- `GET /api/health` — process liveness; does not imply billing readiness.
- `GET /api/ready` — configuration, key-type, plan/seat policy, schema, and database readiness.
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

This backend implements technical entitlement enforcement. Product prices, Marketplace plan IDs, taxes, refunds, legal license terms, privacy terms, SLA/support commitments, and Marketplace publication remain operator-controlled business configuration.
