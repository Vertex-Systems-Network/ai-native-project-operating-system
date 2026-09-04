# ANPOS Operator Launch Bootstrap

> Vendor/operator-only handoff. This document does not create repositories, GitHub Apps, Marketplace listings, credentials, prices, plan IDs, installations, publisher verification, financial onboarding, or production launch authority.

ANPOS includes a **secret-safe renderer** that turns non-secret operator inputs into prefilled GitHub App registration URLs, the split production environment-key handoff, **package-derived artifact identity**, and the exact canonical Git commit/tree that deterministic vendor repositories must represent:

```bash
python scripts/render_operator_launch_bootstrap.py \
  --organization YOUR_GITHUB_ORG \
  --service-base-url https://YOUR-SERVICE.example.com \
  --homepage-url https://YOUR-PRODUCT.example.com
```

The command prints JSON to stdout. Redirect it to an operator-controlled location only if you want a durable handoff record.

## Inputs

The renderer accepts only non-secret configuration:

- GitHub organization slug;
- HTTPS commercial-service base URL;
- HTTPS product/application homepage URL;
- optional Marketplace App display name;
- optional Vendor Distribution App display name;
- optional explicit collaborator-provisioning switch.

It intentionally does **not** accept private keys, webhook secrets, database credentials, operator tokens, Marketplace plan IDs, prices, installation counts, publisher evidence, or customer data.

## Package-derived artifact identity

The renderer reads the deployable `commercial-service/package.json` and cross-checks its embedded ANPOS source protocol version against `config/protocol/version.json`. It fails closed if package metadata is missing, malformed, points at a different protocol version, or does not use the expected split GitHub App runtime contract.

The JSON output includes:

- `artifact_identity.service`
- `artifact_identity.service_version`
- `artifact_identity.source_protocol_version`
- `artifact_identity.runtime_contract`
- `production_verifier_arguments`

`production_verifier_arguments` contains the exact `--require-ready`, `--expected-service-version`, and `--expected-protocol-version` values derived from the deployable artifact. Operators should not maintain a second handwritten copy of expected release numbers.

After deployment, `/api/version` must match `artifact_identity` before either Community or paid readiness can count as launch evidence. A green `/api/health` alone is not sufficient. `/api/ready/community` is the narrower free-first readiness gate; full `/api/ready` remains the paid/vendor runtime gate.

## Deterministic vendor-repository handoff

The renderer also reads the canonical checkout's exact Git commit and tree and emits `vendor_repository_handoff` containing:

- `canonical_source_revision`
- `canonical_source_tree`
- expected service/template repository names
- `EXPORT-MANIFEST.json` as the deterministic export manifest
- `scripts/verify_vendor_handoff.py` as the canonical verification command
- service-specific verification arguments bound to artifact identity
- template-specific verification arguments bound to the same canonical source revision/tree

Generate the exports first:

```bash
python scripts/export_vendor_repositories.py --output /outside/canonical/source
```

Then verify each exported directory from the **canonical checkout at the exact revision printed by the renderer**. Append the generated argument list for the corresponding repository:

```bash
python scripts/verify_vendor_handoff.py \
  --repository /outside/canonical/source/anpos-commercial-service \
  <service_verification_arguments>

python scripts/verify_vendor_handoff.py \
  --repository /outside/canonical/source/anpos-commercial-template \
  <template_verification_arguments>
```

The verifier reconstructs the expected export from committed canonical Git blobs and compares the complete target byte set against it, including `EXPORT-MANIFEST.json`. This means changing both a file and its local manifest does not bypass verification. Extra files, missing files, stale source revisions, wrong source trees, wrong export modes, symlinks, unsupported Git modes, dirty Git checkouts, byte changes, and wrong service/protocol/runtime identities fail closed.

For a private GitHub repository checkout, verification reads committed `HEAD` blobs instead of newline-converted working-tree bytes. The checkout must still be clean, including untracked files. After the first private-repository push, clone/check out that repository cleanly and run the same verification again before treating it as the vendor source of record.

A successful command prints a JSON receipt containing canonical source revision/tree, target repository revision when applicable, manifest SHA-256, deterministic content-set SHA-256, file counts, and service artifact identity when verifying the service. Retain that receipt as provenance evidence. It proves byte equality to the approved deterministic export; it does **not** prove repository ownership/visibility, GitHub App installation, Marketplace approval, or deployment readiness.

## Generated Marketplace App registration

The Marketplace App registration URL is prefilled as:

- organization-owned registration page;
- `public=true`;
- webhook enabled;
- webhook URL `<service-base-url>/api/webhooks/github/marketplace`;
- `marketplace_purchase` event;
- Setup URL `<service-base-url>/setup/github`;
- OAuth callback `<service-base-url>/api/auth/github/callback`;
- request-OAuth-on-install disabled so Setup starts the explicit PKCE flow;
- Setup-on-update enabled;
- `single_file: read` limited to exactly the ten approved ANPOS control files;
- no vendor private-template repository permissions.

The operator must review GitHub's registration form before creating the App. GitHub remains authoritative for the resulting App configuration.

## Generated Vendor Distribution App registration

The Vendor Distribution App registration URL is prefilled as:

- organization-owned registration page;
- `public=false`;
- webhooks disabled;
- OAuth-on-install disabled;
- `Contents: read` for archive-first template delivery;
- no Marketplace events;
- no `Administration: write` by default.

`Administration: write` is added only when `--enable-collaborator-provisioning` is deliberately passed. Archive-first delivery remains the safer default.

## Required split runtime handoff

Marketplace / Community role:

- `GITHUB_MARKETPLACE_APP_ID`
- `GITHUB_MARKETPLACE_APP_PRIVATE_KEY`
- `GITHUB_MARKETPLACE_CLIENT_ID`
- `GITHUB_MARKETPLACE_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `ANPOS_PUBLIC_BASE_URL`
- `ANPOS_SESSION_SECRET`
- `DATABASE_URL`
- `ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID`

`ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID` must be the **real operator-approved free Marketplace plan ID after that plan exists**. It must remain separate from `ANPOS_MARKETPLACE_PLAN_MAP`; Community has zero paid entitlements and must not be smuggled into the paid mapping merely to make a listing look configured.

With the Marketplace/Community values above and the required database migration present, `/api/ready/community` can become HTTP 200 without any Vendor App, entitlement-signing key, paid plan map, organization-seat configuration, or private-template repository. That narrower readiness result is evidence only for the Community runtime configuration. It is not paid/vendor launch evidence.

Vendor Distribution role:

- `GITHUB_VENDOR_APP_ID`
- `GITHUB_VENDOR_APP_PRIVATE_KEY`
- `GITHUB_VENDOR_INSTALLATION_ID`
- `ANPOS_PRIVATE_TEMPLATE_REPO`

Additional paid/full commercial service configuration:

- `ANPOS_ENTITLEMENT_PRIVATE_KEY`
- `ANPOS_ENTITLEMENT_KEY_ID`
- `ANPOS_ENTITLEMENT_ISSUER`
- `ANPOS_OPERATOR_TOKEN`
- `ANPOS_MARKETPLACE_PLAN_MAP`
- `ANPOS_ORG_SEAT_LIMITS`

`ANPOS_MARKETPLACE_PLAN_MAP` remains paid-only and maps real Marketplace IDs only to `developer`, `pro`, `team`, or `enterprise`. Full `/api/ready` remains fail-closed until the paid/vendor configuration is complete.

Legacy `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` must not be used to satisfy the split-App contract.

## Required operator sequence

1. Generate this handoff from the certified canonical revision that will supply the deployable service/vendor export.
2. Verify `/api/version` for any candidate deployment against the exact `artifact_identity`; do not treat `/api/health` as artifact proof.
3. Register the public Marketplace App from the generated prefilled URL and review every requested field/permission.
4. Generate the Marketplace OAuth client secret and strong webhook secret; store credentials only in the deployment secret store.
5. After the genuine free Marketplace plan exists, configure its real ID as `ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID`; keep it outside `ANPOS_MARKETPLACE_PLAN_MAP`.
6. Configure the Community database, run the required migration, and require `/api/ready/community` HTTP 200.
7. Exercise the real Setup URL → PKCE OAuth callback → installation-bound repository discovery → bounded read-only Community audit flow before claiming Community launch readiness.
8. For paid/vendor distribution, generate deterministic private vendor service/template exports from the same certified canonical revision.
9. Verify both exports with `scripts/verify_vendor_handoff.py` using the generated service/template argument lists; retain successful JSON receipts.
10. Create the private vendor repositories and populate them only from verified deterministic exports.
11. Clone/check out each new private repository cleanly and run the same handoff verification again before accepting it as vendor source.
12. Register the private Vendor Distribution App from its generated prefilled URL.
13. Generate/store a distinct Vendor App private key; never reuse Marketplace App identity/key material.
14. Install only the Vendor Distribution App on the vendor private template repository.
15. Populate the remaining paid/full production environment with real external values listed by the handoff.
16. Deploy the exact service artifact represented by `artifact_identity` from a verified immutable source.
17. Run `scripts/verify_commercial_production.py` with `production_verifier_arguments` plus the required base URL and separately supplied secret environment-variable names.
18. Require full `/api/ready` HTTP 200 plus applicable paid Marketplace/vendor E2E evidence before paid production launch authorization.

## Safety boundary

- Prefilled registration URLs are setup aids, not evidence that an App exists.
- Package/protocol metadata supplies expected artifact identity; do not replace it with copied release numbers in operator instructions.
- Canonical Git revision/tree supplies export provenance; do not accept a private vendor checkout merely because its filenames look correct.
- A successful handoff receipt proves exact deterministic export equality only; it is not evidence of GitHub ownership, repository privacy, App installation, Marketplace approval, or deployment.
- Community readiness and full commercial readiness are intentionally separate. `/api/ready/community` must never be represented as proof that paid plans, Vendor App distribution, private template access, organization seats, or entitlement signing are ready.
- Never reuse App IDs or private keys across Marketplace and Vendor Distribution roles.
- Do not add Vendor `Administration: write` unless collaborator provisioning is explicitly approved.
- Do not infer repository existence, Marketplace approval, publisher verification, installation count, prices, plan IDs, customer billing readiness, or launch authorization from renderer output.
- Re-check current GitHub App and GitHub Marketplace requirements immediately before registration/submission because platform requirements can change.
