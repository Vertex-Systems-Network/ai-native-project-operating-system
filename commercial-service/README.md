# ANPOS Commercial Service

Vendor-only deployable reference backend for ANPOS GitHub Marketplace or direct Paddle billing, licensing, seat control, private distribution, and the source-implemented ANPOS Community repository-readiness surface.

## Product-state boundary

The Community Repository Readiness / Conformance Audit is implemented in source but is **not** proof of Marketplace activation. A live Community claim still requires a real public Marketplace App, a real operator-approved free Marketplace plan ID, production Community configuration, deployment, Marketplace Setup/OAuth E2E evidence, and explicit operator activation.

Developer now has evidence-backed source value through verified private-template delivery and a certified protocol release/update channel, but it remains **draft/not for sale** until the external Marketplace, legal, pricing, private-vendor, deployment, and production-E2E gates pass. Pro/Team/Enterprise remain draft and their additional premium/orchestration/support claims must not be marketed as implemented until separately evidenced.

## Responsibilities

- receive and HMAC-verify bounded `marketplace_purchase` webhook bodies;
- create direct Paddle checkout transactions only after verified GitHub user OAuth, with GitHub numeric account identity and selected plan bound server-side rather than accepted from browser input;
- HMAC-verify exact raw Paddle webhook bodies with timestamp tolerance and replay-safe provider/event IDs, then reconcile subscription lifecycle state against the Paddle API;
- keep Paddle API keys/webhook secrets server-side while exposing only the provider-issued client-side token on the approved checkout page;
- bind `X-GitHub-Delivery` to a payload hash, deduplicate concurrent delivery, and safely retry failed/stale processing;
- reconcile account subscription state against GitHub Marketplace REST using the customer-facing Marketplace GitHub App JWT;
- persist a PostgreSQL entitlement, audit, rate-limit, seat, provisioning, and access-reconciliation ledger;
- use explicit checksum-locked database migrations instead of request-path schema mutation;
- issue short-lived Ed25519 signed entitlement envelopes for paid entitlements only;
- issue format-v2 seat-bound signed entitlements for paid organization users so an organization token is not freely shareable between members;
- expose public verification keys;
- expose non-secret deployment identity so stale/wrong service artifacts cannot pass production verification merely because health is green;
- allow authenticated paid customers to refresh current entitlement;
- let verified organization admins assign/list/revoke seats, with active-member verification and capacity enforcement;
- provide operator reconciliation for missed/ambiguous webhook deliveries and failed collaborator revocations;
- expose entitlement-gated certified release metadata from an immutable, manifest-verified private vendor-template commit;
- deliver the same verified private release through a short-lived GitHub archive redirect using a separate vendor-only GitHub App;
- optionally provision users as private-template collaborators when explicitly enabled on the vendor App only;
- reference-count collaborator grants before revocation so another active purchase/seat is not accidentally removed;
- implement the Community Marketplace Setup URL -> PKCE GitHub App OAuth -> encrypted short-lived browser session -> installation-bound repository discovery -> read-only readiness audit flow;
- reconcile the real Community Marketplace plan as `plan_id=community` with zero paid entitlements, no signed license token, and no organization-seat requirement;
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

### Community plan identity

Community is deliberately outside the paid `ANPOS_MARKETPLACE_PLAN_MAP`. After the genuine free Marketplace plan exists, configure its real numeric ID as:

- `ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID`

The service resolves that ID to `plan_id=community`, `entitlements=[]`, and `paid=false`. The same Marketplace plan ID cannot also appear in `ANPOS_MARKETPLACE_PLAN_MAP`, and `community` is not accepted as a paid-map target. Do not invent a placeholder production plan ID merely to make readiness pass.

## Repository Supervisor billing-account discovery

Commercial service 0.4.8 adds the read-only MCP tool `repository_list_billing_accounts`. It removes the need for users or models to guess numeric `billing_account_id` values.

The server candidate set is deliberately narrow: the authenticated GitHub user's own entitlement account plus organization entitlement accounts for which that user has an active server-side seat assignment. Organization candidates are then re-verified against current GitHub membership before they are returned. The response includes the current server-side `repository_supervisor_read` and `repository_supervisor_write` capability decisions and reasons. It never enumerates the global entitlement ledger, and a returned billing account ID remains only a selector; every paid repository tool re-authorizes the principal, entitlement, organization seat and provider access.

## Protected sandbox live verification

The configured sandbox readiness endpoint proves configuration only. A separate production-only `POST /api/ready/sandbox/live` route runs one bounded explicit-empty workspace probe through the real signed gateway. It is intended to remain behind Vercel Deployment Protection and requires the explicit `x-anpos-sandbox-live-probe: 1` trigger.

The probe is intentionally separate from normal configuration readiness so routine health checks do not launch billable microVMs. The probe keeps `ANPOS_SANDBOX_SIGNING_SECRET` inside the Vercel service. When the configured gateway shares the exact `ANPOS_PUBLIC_BASE_URL` origin, the driver forwards the Vercel project OIDC token only to that same origin so Deployment Protection is preserved without leaking the token to arbitrary remote gateways. The probe verifies Python >=3.12, deny-all networking, request HMAC acceptance, signed response validation, exact input/output SHA-256, exact output allowlisting, workspace destruction, and durable replay rejection. The dedicated `commercial-sandbox-live-e2e.yml` workflow records only secret-free evidence.

## Internal Repository Supervisor read E2E grant

Commercial service 0.4.9 can temporarily enable one internal read-only Repository Supervisor E2E grant before real paid Marketplace plans are live. Configure both `ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN` and `ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT`; the expiry must be no more than 48 hours ahead.

This control does not create a Marketplace purchase and does not authorize planning or mutation tools. It only allows the matching authenticated GitHub principal to exercise the read path using its own GitHub account selector. Full commercial readiness deliberately fails closed while either test variable is present. Remove both variables immediately after the live read E2E.

## Vercel-native Repository Supervisor sandbox gateway

Commercial service 0.4.10 implements the signed remote-ephemeral gateway at `POST /v1/execute` using `@vercel/sandbox` 3.5.0. The gateway authenticates exact request bytes with the existing timestamp/nonce HMAC contract, claims the nonce in PostgreSQL before execution, starts a Python 3.13 Vercel Sandbox Firecracker microVM with `deny-all` networking, verifies the runtime/network policy, writes only SHA-256-verified input artifacts into the explicit-empty workspace, runs argv without shell interpolation, returns only exact allowlisted regular output files after mode/size/SHA-256 verification, stops the sandbox, and only then signs the response body.

The first live gateway contract deliberately accepts only the explicit-empty workspace mode used by the current full-plan apply path. `github_commit` source mode remains protocol-defined but fail-closed until private-source credential handling is separately certified. Environment-variable forwarding is also fail-closed in this first live gateway; current full-plan apply sends no environment names or customer GitHub token to the sandbox.

The current full-plan live execution budget is 240 seconds inside a 300-second gateway function budget. The broader protocol maximum of 900 seconds is not claimed as live Vercel gateway evidence. Source implementation and unit certification still do not prove the gateway is deployed or that guarded write E2E has passed; production readiness remains evidence-driven.

## Full Repository Supervisor planner

Commercial service 0.4.7 implements deterministic planning for `bootstrap_empty`, `bootstrap_child`, `adopt_existing`, `repair_partial`, and `upgrade_active` in addition to the existing bounded-change planner.

Full modes bind the plan to the authenticated principal/account, canonical repository identity, immutable observed target head when present, and the operator-configured exact private-template release. Planning compares validated `EXPORT-MANIFEST.json` per-file Git object identities against a non-truncated immutable target Git tree. Target-only files are preserved; adoption collisions become manual merges; project runtime/evidence paths are preserved or marked for migration review; material AI-control drift requires assurance re-verification.

The complete plan is encrypted server-side and MCP returns only a bounded preview and counts. Conflict-free non-empty plans apply through `sandbox_full_plan_v1`. A conflict-blocked plan remains non-applicable until `repository_resolve_plan_conflicts` derives a new immutable plan from the exact source plan ID/hash. Every `manual_merge` or `migration_review` path requires exactly one explicit `keep_target` or `use_release` decision bound to the exact observed target Git object; replacing migration-reviewed project state/evidence with release content additionally requires explicit acknowledgement. The resolver re-verifies repository identity, unchanged default-branch head, write permission, and exact verified private-release identity before issuing the new plan; it never mutates the source plan. A verified empty GitHub repository uses `guarded_empty_repository_v1` only after explicit confirmation: sandbox transformation runs first, then the service creates one inert `.anpos-bootstrap-seed` root commit through GitHub's Contents API, verifies that commit has zero parents and is the default-branch head, creates the full ANPOS `anpos/*` feature-branch commit on that seed while deleting the seed, and requires PR/CI/merge review. Any failure after the seed mutation moves the plan to recovery-required state.

## Production sandbox gateway

Repository execution must not fall back to the commercial-service host process. Commercial service 0.4.7 includes a remote-ephemeral production driver source configured only through environment secrets:

- `ANPOS_SANDBOX_ENDPOINT` — exact HTTPS `/v1/execute` endpoint;
- `ANPOS_SANDBOX_DRIVER_ID` — expected gateway driver identity;
- `ANPOS_SANDBOX_SIGNING_SECRET` — high-entropy HMAC secret stored only in secrets management;
- `ANPOS_SANDBOX_REQUEST_SKEW_SECONDS` — accepted timestamp window contract.

Sandbox protocol v2 supports bounded signed input/output artifacts with canonical base64 + SHA-256 integrity, exact output-path allowlists, argv without shell interpolation, names-only environment variables, network deny, timeout/output limits, and destroy-after-execution. Full-plan apply intentionally uses an explicit empty sandbox workspace populated only with verified release artifacts, so the customer GitHub token is never forwarded to the gateway. The driver signs exact request bytes with timestamp/nonce and requires a signed exact response that proves the workspace was destroyed and network stayed denied. `GET /api/ready/sandbox` reports configuration/source readiness but deliberately does not perform or claim a live gateway probe.

## Repository Supervisor production E2E

Run the live verifier from the deployed/operator environment with secrets in environment variables, never CLI arguments:

`npm run verify:e2e`

Supported `ANPOS_E2E_MODE` values:

- `read` — profile → resolve → audit → assurance at one exact head;
- `write_prepare` — on an explicitly disposable e2e/sandbox/test repository only, create an expected-head-bound plan, feature branch and PR;
- `write_verify_merge` — re-read PR and exact-head CI, then guarded-merge only when green.

Write modes require `ANPOS_E2E_WRITE_CONFIRM=I_ACCEPT_DISPOSABLE_TEST_REPO_MUTATION`. If CI is pending, the verifier exits with code 2 and must be explicitly re-run later; it does not busy-wait. Source tests are not live E2E evidence.

## Three-App trust architecture

Production uses three distinct GitHub App roles: Marketplace billing/Community, Repository Supervisor, and Vendor Distribution. The Supervisor App must not reuse Marketplace or Vendor identity/credentials; Marketplace and Vendor key separation remains independently enforced.

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

Community runtime credentials/configuration:

- `DATABASE_URL`
- `ANPOS_GITHUB_WEBHOOK_SECRET`
- `ANPOS_MARKETPLACE_APP_ID`
- `ANPOS_MARKETPLACE_APP_PRIVATE_KEY`
- `ANPOS_MARKETPLACE_CLIENT_ID`
- `ANPOS_MARKETPLACE_CLIENT_SECRET`
- `ANPOS_PUBLIC_BASE_URL`
- `ANPOS_SESSION_SECRET`
- `ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID`

These values are sufficient for the Community configuration boundary; they intentionally do not include Vendor App credentials, entitlement-signing keys, paid plan mapping, organization-seat policy, or a private-template repository.

### Repository Supervisor App — public/installable paid runtime

The Repository Supervisor App is a separate customer-installable GitHub App used by the authenticated MCP runtime. It must never reuse the Marketplace App or Vendor Distribution App identity.

Runtime configuration:

- `ANPOS_GITHUB_SUPERVISOR_APP_ID`
- `ANPOS_GITHUB_SUPERVISOR_CLIENT_ID`
- `ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET`

Minimum repository permissions for the guarded GitHub write runtime:

- Metadata: read
- Contents: write
- Pull requests: write
- Checks: read
- Commit statuses: read

Do not grant Administration by default. Branch protection/rulesets remain authoritative. OAuth uses PKCE S256 through the MCP broker and issues `anpos:profile`, `anpos:repo:read`, and `anpos:repo:write` only after the Supervisor App flow. The server then separately rechecks the paid entitlement and organization seat for each write-capable tool.

Guarded writes use a short-lived encrypted server-side plan bound to canonical repository identity, authenticated principal/billing account, exact default-branch head SHA, and deterministic plan hash. Apply creates a new `anpos/*` feature branch from an atomic Git Data commit. The service never direct-writes the default branch or force-pushes through the normal workflow. Merge re-reads PR state, exact planned head CI, current default-branch head and resulting default-branch head.

The source implements bounded and full bootstrap/adoption/repair/upgrade planning. Non-empty conflict-free full plans can use sandbox-backed apply; unresolved conflicts and empty-repository initialization remain pending.

### Vendor Distribution App — private/vendor-only

The Vendor App exists only to access the vendor-controlled private commercial template. Keep it private to the publisher account/organization and install it only on the vendor template repository.

Runtime credentials/configuration:

- `ANPOS_VENDOR_APP_ID`
- `ANPOS_VENDOR_APP_PRIVATE_KEY`
- `ANPOS_VENDOR_INSTALLATION_ID`
- `ANPOS_PRIVATE_TEMPLATE_REPO`
- `ANPOS_COMMERCIAL_RELEASE_REF`

`ANPOS_COMMERCIAL_RELEASE_REF` must be the exact 40-character commit SHA of a private template repository state populated from a handoff-verified deterministic template export. `main`, branch names, movable tags, and other mutable refs are rejected.

Minimum permissions:

- archive-first delivery: **Contents: read** on the private template repository;
- optional collaborator provision/revoke: **Administration: write** on the private template repository only when that fallback is explicitly enabled.

This split prevents a customer-facing Marketplace installation from inheriting vendor repository administration capability and prevents a compromise of the Marketplace App credential from automatically granting access to the private template repository.

## Readiness and deployment identity

`GET /api/version` is public and intentionally secret-free. It reports the commercial-service package version, the ANPOS source protocol version embedded into the exported artifact, and the runtime-contract identifier. The response is `Cache-Control: no-store` and does not read deployment secrets.

Production verification must not treat `/api/health` alone as proof that the intended artifact is deployed. `scripts/verify_commercial_production.py --require-ready` requires both `--expected-service-version` and `--expected-protocol-version`; it checks `/api/version` before readiness so a healthy but stale/wrong artifact fails certification.

There are two readiness scopes:

- `GET /api/ready/community` — verifies only the Community/free-first configuration boundary: Marketplace App/OAuth configuration, webhook secret, real Community plan ID, required database migration/schema, and database connectivity. It does **not** require Vendor App, paid entitlement signing, paid plan mapping, organization seats, or private-template distribution.
- `GET /api/ready` — verifies the full paid/vendor commercial configuration, including split-App role/key separation, entitlement signing, paid plan/seat policy, immutable `ANPOS_COMMERCIAL_RELEASE_REF`, migrations/schema, and database readiness.

A green `/api/ready/community` is not evidence that paid plans or vendor distribution are ready. A green full `/api/ready` does not replace the required real Marketplace E2E checks.

Generate exact expected values and GitHub App registration settings from the canonical vendor/operator handoff instead of copying release numbers or URLs manually:

```bash
python scripts/render_operator_launch_bootstrap.py \
  --organization YOUR_GITHUB_ORG \
  --service-base-url https://YOUR-SERVICE.example.com \
  --homepage-url https://YOUR-PRODUCT.example.com
```

The generated public Marketplace App registration URL includes the Setup URL, OAuth callback URL, Setup-on-update behavior, and exact ten-file Community permission scope. The generated environment-key handoff includes the immutable paid release ref requirement. It contains no credentials or live business-authority values.

## Certified Developer release channel

Developer source value is intentionally narrower than future higher tiers and consists of two implemented paid entitlements:

- `private_template_access`
- `protocol_update_channel`

Standard PM/AI provider compatibility is core/capability-dependent ANPOS behavior and is **not** sold as `standard_provider_adapters`.

The paid release flow is fail-closed:

1. Export the customer-facing template deterministically from the certified canonical source.
2. Verify the export with `scripts/verify_vendor_handoff.py` and retain its receipt.
3. Push only those verified bytes to the private vendor template repository and verify a clean checkout again.
4. Set `ANPOS_COMMERCIAL_RELEASE_REF` to that private repository's exact commit SHA.
5. `GET /api/v1/releases/current` reconciles billing, verifies the paid `protocol_update_channel` entitlement and organization seat when applicable, fetches `EXPORT-MANIFEST.json` at that exact ref, and validates deterministic-export identity before returning sanitized release metadata.
6. `GET /api/v1/template/archive` repeats the manifest verification and redirects only to the same exact immutable release for accounts entitled to `private_template_access`.

The manifest gate requires template export mode, exact canonical source revision/tree identities, committed-Git-blob provenance, `tracked_source_only=true`, `contains_secrets=false`, exact file count/byte totals, safe paths/modes, and SHA-256 digests. Failure does not silently fall back to a branch or another release.

This is source implementation evidence, not proof that Developer is live. Real private repositories, real GitHub Apps, real paid Marketplace plan IDs/prices, legal terms, deployment, and paid E2E are still launch gates.

## Recommended distribution architecture

Use `GET /api/v1/template/archive` as the default paid delivery mechanism. GitHub returns a temporary private-repository archive URL for the exact configured release. This avoids permanent repository access and avoids relying on collaborator invitations as the primary scale path.

`POST /api/v1/provision` is an optional collaborator fallback and is disabled unless `ANPOS_COLLABORATOR_PROVISIONING_ENABLED=true`. GitHub limits repository invitations and collaborator mutations require stronger repository permissions, so this mode should not be the default sales path.

## GitHub permissions

Use the minimum permissions needed for each trust boundary:

- Community Marketplace installation: metadata plus `single_file: read` for the exact ten ANPOS control files; actual file reads remain authenticated-user-token-bound.
- Marketplace billing reconciliation: Marketplace App authorization required by GitHub Marketplace.
- Customer identity: GitHub user access token; organization seat administration also requires **Members: read** when that customer-facing capability is used so active organization membership can be verified.
- Vendor release metadata + private-template archive: Vendor App **Contents: read** on the private template repository.
- Optional collaborator provision/revoke: Vendor App **Administration: write** on the private template repository. The service requests operation-scoped installation tokens instead of using the full installation permission set.

Never add vendor-template Administration permission to the Marketplace App merely to support vendor-side provisioning.

## Database migrations

Database DDL is never run by normal API requests. Run migrations explicitly from `commercial-service/`:

```bash
npm run migrate
```

The migrator takes a PostgreSQL advisory lock, applies ordered migrations transactionally, records SHA-256 checksums, and refuses edited applied migrations. Never edit an applied migration in place.

## Deploy

### Community free-first

1. Create/configure the public Marketplace GitHub App using the generated registration URL; verify Setup URL, callback URL, exact ten-file permission scope, webhook, and public visibility.
2. Generate the Marketplace App OAuth client secret and a strong webhook secret; store them only in the deployment secret manager.
3. Create a durable PostgreSQL database, configure `DATABASE_URL`, and run `npm run migrate`.
4. After the genuine free Marketplace plan exists, set its real ID in `ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID`. Keep Community outside `ANPOS_MARKETPLACE_PLAN_MAP`.
5. Configure `ANPOS_PUBLIC_BASE_URL` and a high-entropy `ANPOS_SESSION_SECRET`.
6. Deploy the exact certified service artifact and verify `/api/version` identity.
7. Require `/api/ready/community` HTTP 200.
8. Exercise the real Setup -> PKCE OAuth -> installation-bound repository discovery -> bounded audit flow before activating Community.

### Paid/vendor extension

1. Create the separate private Vendor Distribution GitHub App.
2. Create/populate the verified private commercial-template source and install only the Vendor App with **Contents: read**; add **Administration: write** only if collaborator provisioning is deliberately enabled.
3. Verify the exact private template commit and configure that 40-character SHA as `ANPOS_COMMERCIAL_RELEASE_REF`; do not use a branch/tag.
4. Configure entitlement signing, operator token, Vendor App credentials, paid `ANPOS_MARKETPLACE_PLAN_MAP`, and `ANPOS_ORG_SEAT_LIMITS` using real approved values.
5. Require exact `/api/version`, full `/api/ready`, and authenticated production verification.
6. Exercise `/api/v1/releases/current` and `/api/v1/template/archive` and verify their canonical source revision/tree against retained handoff evidence.
7. Exercise paid purchase, plan-change, cancellation, duplicate delivery, failed-delivery retry, seat assignment/revocation, and access-reconciliation before enabling paid sales.

## API

- `GET /api/health` — process liveness; does not imply artifact identity or readiness.
- `GET /api/version` — public, secret-free service/protocol/runtime-contract identity for deployment attestation.
- `GET /api/ready/community` — Community-only configuration/database readiness; deliberately independent of paid/vendor secrets.
- `GET /api/ready` — full commercial configuration, Marketplace/Vendor role separation, paid plan/seat/release policy, migration/schema, and database readiness.
- `GET /api/ready/mcp` — Repository Supervisor OAuth/MCP configuration, dedicated Supervisor App separation, migration/schema and database readiness.
- `GET /api/ready/sandbox` — signed remote-ephemeral sandbox source/config readiness; does not claim a live gateway probe.
- `POST /api/webhooks/github/marketplace` — GitHub Marketplace webhook receiver.
- `GET /setup/github` — Marketplace Setup entrypoint; starts PKCE GitHub App OAuth from an untrusted setup installation ID.
- `GET /api/auth/github/callback` — OAuth callback; verifies user + installation and creates encrypted short-lived browser session.
- `GET /api/v1/audit/repositories` — list repositories available to the authenticated user for the selected Marketplace installation.
- `POST /api/v1/audit/repository` — run the bounded ten-control-file Community readiness audit; no paid entitlement required.
- `GET /api/v1/keys` — public entitlement verification key for paid portable claims.
- `GET /api/v1/entitlements/current` — refresh a paid entitlement after GitHub identity verification; send `X-ANPOS-Account-Id`. Organization callers need an active assigned seat to receive a signed consumption token.
- `GET /api/v1/releases/current` — entitlement-gated sanitized metadata for the current immutable, deterministic-manifest-verified certified release.
- `GET /api/v1/template/archive` — short-lived archive redirect for the same exact verified release.
- `GET /api/v1/seats` — organization-admin seat list.
- `POST /api/v1/seats` — organization-admin seat assignment by GitHub username.
- `DELETE /api/v1/seats` — organization-admin seat revocation by assigned GitHub user ID.
- `POST /api/v1/reconcile` — operator-only billing reconciliation with `ANPOS_OPERATOR_TOKEN`.
- `POST /api/v1/access/reconcile` — operator-only retry of pending collaborator access revocations.
- `POST /mcp` — authenticated Repository Supervisor MCP transport.
- `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-authorization-server` — MCP OAuth metadata.
- `GET /oauth/authorize`, `POST /oauth/token`, and `GET /api/auth/mcp/github/callback` — Supervisor App OAuth 2.1/PKCE broker.
- `POST /api/v1/provision` — optional authenticated/idempotent collaborator provisioning; disabled by default.

## Organization seats

Organization membership alone is not a paid seat. An organization admin must explicitly assign an active organization member. Seat capacity is taken from GitHub Marketplace `unit_count` when present; otherwise the operator-defined `ANPOS_ORG_SEAT_LIMITS` mapping is required and the service fails closed if capacity cannot be determined.

Community organization installations do not receive paid seat entitlements merely because the Marketplace account type is `Organization`.

Organization paid-consumption entitlements use signed envelope format v2, containing both the canonical organization `subject` and the assigned GitHub user `principal`.

## Expiry and revocation boundary

Cancellation, expiry, or seat revocation may stop future paid entitlement refresh, private archives, certified update metadata, hosted capabilities, premium updates, support, and vendor-template access. They must not remotely modify, delete, encrypt, or intentionally break repositories/code already generated for the customer.

A paid-to-Community transition removes paid feature claims and queues any necessary vendor-template collaborator cleanup without turning ordinary Community use into a Vendor App dependency.

## Commercial boundary

This backend implements technical distribution/entitlement controls, the source implementation of Community readiness, and source-level Developer release-channel value. Product prices, Marketplace plan IDs, taxes, refunds, legal license terms, privacy terms, SLA/support commitments, actual listing publication, external installation evidence, private vendor repository reality, production deployment, and plan activation remain operator-controlled business reality.
