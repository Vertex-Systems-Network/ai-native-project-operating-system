# ANPOS Pro Premium Pack Boundary

Status: **verification/distribution contract only — no premium payload is implemented in canonical public source**.

This document defines how a future private ANPOS Premium Pack must be structured and certified. It does not satisfy the `premium_blueprints` or `premium_provider_adapters` entitlements by itself and does not make ANPOS Pro sale-ready.

## Why the boundary is separate

The public canonical repository contains the reusable ANPOS core protocol and commercial control-plane contracts. Pro must deliver value that is genuinely distinct from that public core. Creating public files and labeling them “premium” would not create a defensible paid package.

Therefore:

- premium customer assets belong in a separate private premium repository or equivalent immutable private artifact;
- canonical source contains only the schema, verifier, safety rules and entitlement/distribution contract;
- a private pack must be versioned, content-addressed and independently verifiable;
- exact copies of canonical tracked files are rejected as premium payload;
- a verified private pack is still not a live entitlement or production distribution flow.

## Manifest

Every pack root must contain exactly one `ANPOS-PREMIUM-MANIFEST.json` conforming to `schemas/premium-pack-manifest.schema.json`.

The manifest binds:

- stable `pack_id`;
- semantic `pack_version`;
- supported ANPOS protocol range;
- premium capability IDs;
- provider adapter metadata where applicable;
- every payload file path, asset class, SHA-256, byte count and capability mapping;
- private-distribution and no-secret provenance assertions.

All payload files must live under one of:

- `premium/blueprints/`;
- `premium/providers/`;
- `premium/governance/`;
- `premium/docs/`.

Root-level application/runtime/configuration trees such as `.github/`, `.ai/`, `commercial-service/`, `config/`, `schemas/`, `scripts/` and `tests/` are not premium payload locations.

## Premium blueprints

A premium blueprint must solve a concrete reusable customer problem beyond the public core. Before an asset is marketed, its manifest capability should identify the value it implements and its compatibility assumptions should be tested.

Examples of acceptable future differentiation may include specialized production workflows, domain-specific governance packs or advanced automation recipes, but the actual private assets must exist and be independently useful. The contract does not pre-authorize any particular marketing claim.

## Premium provider adapters

Provider adapters require stricter evidence than merely naming a provider.

Each private adapter must:

- live under `premium/providers/<provider_id>/...`;
- have a matching provider entry in the manifest;
- carry its own adapter version;
- state the provider version/API surface actually tested;
- map to explicit premium capability IDs;
- ship no OAuth tokens, private keys, customer credentials or operator secrets;
- make no partnership/certification claim unless separately and legitimately authorized outside this default contract.

A passing pack verifier proves integrity/declared mapping, not live provider compatibility. Live provider behavior still requires runtime evidence.

## Verification

Run from the canonical ANPOS checkout that is intended to certify the pack:

```bash
python scripts/verify_premium_pack.py \
  --repository /path/to/private-premium-checkout \
  --expected-pack-id anpos-premium-pro \
  --expected-pack-version X.Y.Z \
  --expected-protocol-version 1.3.13
```

The verifier fails closed on:

- invalid manifest/schema;
- unsupported protocol range;
- duplicate/unknown capability or provider mappings;
- missing, extra or unmanifested payload files;
- SHA-256 or byte-count mismatch;
- symlinks/path traversal;
- high-confidence secret markers;
- provider adapter files without provider manifest evidence;
- exact byte-for-byte copies of any tracked canonical source file;
- provenance that does not require private immutable distribution.

A successful receipt includes pack/version, file count, total bytes, manifest/content-set digests and the canonical verifier revision/tree when available.

## Private repository release flow

The future operator flow should be:

1. implement genuinely premium private assets;
2. build/update `ANPOS-PREMIUM-MANIFEST.json` with exact digests;
3. run this verifier from the exact canonical ANPOS revision intended to support the pack;
4. commit the verified private pack;
5. bind distribution to that immutable private commit/artifact, never just a mutable branch name;
6. require an active entitlement before returning premium release metadata/archive access;
7. verify purchase/entitlement → premium release → archive/update E2E in production;
8. only then change `premium_blueprints` / `premium_provider_adapters` product truth from planned to implemented as supported by evidence.

## Current readiness

Current canonical truth remains:

- premium contract/schema/verifier: **implemented**;
- private premium repository: **not evidenced**;
- premium blueprint payload: **not implemented**;
- premium provider adapter payload: **not implemented**;
- entitlement-gated premium distribution: **not implemented**;
- Pro production E2E: **not verified**;
- Pro sale-ready: **false**.

The contract is preparation for a real paid layer, not the paid layer itself.
