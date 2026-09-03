# ANPOS Operator Launch Bootstrap

> Vendor/operator-only handoff. This document does not create repositories, GitHub Apps, Marketplace listings, credentials, prices, plan IDs, installations, publisher verification, financial onboarding, or production launch authority.

ANPOS 1.3.7 adds a secret-safe renderer that turns non-secret operator inputs into prefilled GitHub App registration URLs plus the commercial service 0.3.0 environment-key handoff:

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

Commercial service 0.3.0 requires distinct Marketplace and Vendor App credentials:

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

Legacy `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` must not be used to satisfy the 0.3.0 split-App contract.

## Required operator sequence

1. Create private vendor service/template repositories from certified deterministic exports.
2. Register the public Marketplace App from the generated prefilled URL and review every requested field/permission.
3. Register the private Vendor Distribution App from its generated prefilled URL.
4. Generate/store distinct App private keys and a strong webhook secret in the deployment secret store; never commit them.
5. Install only the Vendor Distribution App on the vendor private template repository.
6. Populate the commercial service 0.3.0 production environment with real external values.
7. Deploy 0.3.0 from vendor-private source or a verified immutable artifact.
8. Require `/api/ready` HTTP 200 plus real Marketplace E2E evidence before production launch authorization.

## Safety boundary

- Prefilled registration URLs are setup aids, not evidence that an App exists.
- Never reuse App IDs or private keys across Marketplace and Vendor Distribution roles.
- Do not add Vendor `Administration: write` unless collaborator provisioning is explicitly approved.
- Do not infer repository existence, Marketplace approval, publisher verification, installation count, prices, plan IDs, customer billing readiness, or launch authorization from renderer output.
- Re-check current GitHub App and GitHub Marketplace requirements immediately before registration/submission because platform requirements can change.
