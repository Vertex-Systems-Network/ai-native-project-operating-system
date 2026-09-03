# ANPOS Operator Launch Bootstrap

> Vendor/operator-only handoff. This document does not create repositories, GitHub Apps, Marketplace listings, credentials, prices, plan IDs, installations, publisher verification, financial onboarding, or production launch authority.

ANPOS includes a **secret-safe renderer** that turns non-secret operator inputs into prefilled GitHub App registration URLs, the split production environment-key handoff, and **package-derived artifact identity** for the exact commercial-service artifact that should be deployed and verified:

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

After deployment, `/api/version` must match `artifact_identity` before `/api/ready` can count as launch evidence. A green `/api/health` alone is not sufficient.

## Generated Marketplace App registration

The Marketplace App registration URL is prefilled as:

- organization-owned registration page;
- `public=true`;
- webhook enabled;
- webhook URL `<service-base-url>/api/webhooks/github/marketplace`;
- `marketplace_purchase` event;
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

Marketplace role:

- `GITHUB_MARKETPLACE_APP_ID`
- `GITHUB_MARKETPLACE_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`

Vendor Distribution role:

- `GITHUB_VENDOR_APP_ID`
- `GITHUB_VENDOR_APP_PRIVATE_KEY`
- `GITHUB_VENDOR_INSTALLATION_ID`
- `ANPOS_PRIVATE_TEMPLATE_REPO`

Other production service configuration:

- `DATABASE_URL`
- `ANPOS_ENTITLEMENT_PRIVATE_KEY`
- `ANPOS_ENTITLEMENT_KEY_ID`
- `ANPOS_ENTITLEMENT_ISSUER`
- `ANPOS_OPERATOR_TOKEN`
- `ANPOS_MARKETPLACE_PLAN_MAP`
- `ANPOS_ORG_SEAT_LIMITS`

Legacy `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` must not be used to satisfy the split-App contract.

## Required operator sequence

1. Create private vendor service/template repositories from certified deterministic exports.
2. Generate this handoff from the same certified canonical revision that will supply the vendor export.
3. Register the public Marketplace App from the generated prefilled URL and review every requested field/permission.
4. Register the private Vendor Distribution App from its generated prefilled URL.
5. Generate/store distinct App private keys and a strong webhook secret in the deployment secret store; never commit them.
6. Install only the Vendor Distribution App on the vendor private template repository.
7. Populate the production environment with real external values listed by the handoff.
8. Deploy the exact service artifact represented by `artifact_identity` from vendor-private source or a verified immutable artifact.
9. Verify `/api/version` equals `artifact_identity`.
10. Run `scripts/verify_commercial_production.py` with `production_verifier_arguments` plus the required base URL and any separately supplied secret environment-variable names.
11. Require `/api/ready` HTTP 200 plus real Marketplace E2E evidence before production launch authorization.

## Safety boundary

- Prefilled registration URLs are setup aids, not evidence that an App exists.
- Package/protocol metadata supplies expected artifact identity; do not replace it with copied release numbers in operator instructions.
- Never reuse App IDs or private keys across Marketplace and Vendor Distribution roles.
- Do not add Vendor `Administration: write` unless collaborator provisioning is explicitly approved.
- Do not infer repository existence, Marketplace approval, publisher verification, installation count, prices, plan IDs, customer billing readiness, or launch authorization from renderer output.
- Re-check current GitHub App and GitHub Marketplace requirements immediately before registration/submission because platform requirements can change.
