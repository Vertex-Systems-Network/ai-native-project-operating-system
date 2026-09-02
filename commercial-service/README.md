# ANPOS Commercial Service

Deployable reference backend for ANPOS GitHub Marketplace sales and licensing.

## Responsibilities

- receive and HMAC-verify `marketplace_purchase` webhooks;
- deduplicate deliveries with `X-GitHub-Delivery`;
- reconcile account subscription state against GitHub Marketplace REST using a GitHub App JWT;
- persist a PostgreSQL entitlement/audit ledger;
- issue short-lived Ed25519 signed entitlement envelopes;
- expose public verification keys;
- allow authenticated customers to refresh their current entitlement;
- provide operator reconciliation for missed/ambiguous webhook deliveries;
- provision entitled personal GitHub accounts as read-only collaborators on the private commercial template repository;
- never delete, encrypt, modify, or intentionally break already-generated customer projects because a commercial entitlement ends.

## Deploy

1. Create a PostgreSQL database.
2. Configure the environment variables from `.env.example` in the deployment platform's secret store. Never commit real values.
3. Create/install the GitHub App and configure its Marketplace listing.
4. Map real Marketplace plan IDs in `ANPOS_MARKETPLACE_PLAN_MAP`.
5. Install the App on the vendor private-template repository with the minimum administration permission required for collaborator invitations.
6. Set the Marketplace webhook URL to `/api/webhooks/github/marketplace` and use the same secret as `GITHUB_WEBHOOK_SECRET`.
7. Verify `/api/health` returns 200 and `/api/ready` returns 200 before enabling sales.

## API

- `GET /api/health` — process liveness; does not imply billing readiness.
- `GET /api/ready` — required configuration + database readiness.
- `POST /api/webhooks/github/marketplace` — GitHub Marketplace webhook receiver.
- `GET /api/v1/keys` — public entitlement verification key.
- `GET /api/v1/entitlements/current` — refresh entitlement after GitHub OAuth identity verification; send `X-ANPOS-Account-Id`.
- `POST /api/v1/reconcile` — operator-only reconciliation with `ANPOS_OPERATOR_TOKEN`.
- `POST /api/v1/provision` — authenticated, idempotent private-template access provisioning.

## Commercial boundary

This backend implements technical entitlement enforcement. Product prices, Marketplace plan IDs, taxes, refunds, legal license terms, privacy terms, SLA/support commitments, and Marketplace publication remain operator-controlled business configuration.
