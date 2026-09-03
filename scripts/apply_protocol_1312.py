#!/usr/bin/env python3
"""Apply one-time ANPOS 1.3.12 authenticated production-smoke bookkeeping."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FROM_PROTOCOL = "1.3.11"
TO_PROTOCOL = "1.3.12"
FROM_SERVICE = "0.3.4"
TO_SERVICE = "0.3.5"
MIGRATION_ID = "ANPOS-1.3.11-to-1.3.12"
STAMP = "2026-09-04T02:49:00+05:00"


def load(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def write(path: str, data: dict) -> None:
    (ROOT / path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    version = load("config/protocol/version.json")
    instance = load("config/protocol/instance.json")
    migrations = load("config/protocol/migrations.json")
    package = load("commercial-service/package.json")
    lock = load("commercial-service/package-lock.json")

    if version.get("version") != FROM_PROTOCOL:
        raise SystemExit(f"expected protocol {FROM_PROTOCOL}, got {version.get('version')}")
    if package.get("version") != FROM_SERVICE:
        raise SystemExit(f"expected service {FROM_SERVICE}, got {package.get('version')}")
    if package.get("anpos", {}).get("source_protocol_version") != FROM_PROTOCOL:
        raise SystemExit("commercial package source protocol does not match expected base")
    if migrations.get("current_protocol_version") != FROM_PROTOCOL:
        raise SystemExit("migration ledger current protocol does not match expected base")
    if any(item.get("id") == MIGRATION_ID for item in migrations.get("applied_migrations", [])):
        raise SystemExit(f"migration {MIGRATION_ID} already exists")

    version["version"] = TO_PROTOCOL
    version["last_protocol_migration"] = MIGRATION_ID
    instance["source_protocol_version"] = TO_PROTOCOL
    note = (
        " ANPOS 1.3.12 binds optional authenticated production smoke verification to the canonical service API contract: "
        "customer entitlement probes send the required x-anpos-account-id header and distinguish a structured "
        "entitlement_not_found response from a missing route, while the operator probe authenticates the reconcile route "
        "with a deliberately invalid empty body and requires valid_account_id_required so verification stays non-mutating and cannot pass on generic 400/404 responses."
    )
    if "ANPOS 1.3.12 binds optional authenticated production smoke verification" not in instance.get("notes", ""):
        instance["notes"] = instance.get("notes", "").rstrip() + note

    migrations["current_protocol_version"] = TO_PROTOCOL
    migrations.setdefault("applied_migrations", []).append(
        {
            "id": MIGRATION_ID,
            "from_version": FROM_PROTOCOL,
            "to_version": TO_PROTOCOL,
            "detected_at": STAMP,
            "impact": [
                "Bind optional customer entitlement smoke verification to the canonical x-anpos-account-id request contract instead of sending only a bearer token",
                "Require generic or route-missing 404 responses to fail while preserving the canonical structured entitlement_not_found outcome for accounts without an entitlement",
                "Replace the stale operator reconciliation dry_run/github_account_id payload with a non-mutating authenticated contract probe that sends an empty JSON object and requires the canonical valid_account_id_required response",
                "Reject operator 404 and generic 400 responses so explicitly requested authenticated smoke checks cannot pass when the route is missing or behavior has drifted",
                "Validate GitHub account IDs locally as positive JavaScript-safe integers before any network request when a customer token smoke check is requested",
                "Add behavioral regression tests and static deployment-identity validation for authenticated smoke request headers, bodies and error contracts",
                "Bump commercial service from 0.3.4 to 0.3.5 because exported package source_protocol_version changes to 1.3.12 and /api/version must attest the exact certified source identity"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "This is vendor/operator production-verification hardening. Existing child projects do not receive the vendor-only verifier or commercial service. Preserve project behavior and do not introduce billing/runtime dependencies merely by adopting ANPOS 1.3.12.",
            "status": "applied",
            "applied_at": STAMP,
            "verification_evidence": [
                "scripts/verify_commercial_production.py binds authenticated customer requests to X-Anpos-Account-Id and validates structured entitlement_not_found responses",
                "scripts/verify_commercial_production.py uses a non-mutating authenticated empty-body operator probe and requires valid_account_id_required",
                "tests/test_commercial_launch_package.py behaviorally verifies request headers/body, structured errors, route-missing rejection and pre-network account-ID validation",
                "tests/test_deployment_identity.py plus scripts/validate_deployment_identity.py prevent authenticated smoke contract drift",
                "commercial-service/package.json embeds source_protocol_version 1.3.12 and service version 0.3.5 for exact /api/version attestation"
            ]
        }
    )
    template = migrations.get("migration_record_template")
    if not isinstance(template, dict):
        raise SystemExit("missing migration_record_template")
    template["id"] = "ANPOS-1.3.12-to-NEXT"
    template["from_version"] = TO_PROTOCOL

    package["version"] = TO_SERVICE
    package.setdefault("anpos", {})["source_protocol_version"] = TO_PROTOCOL
    lock["version"] = TO_SERVICE
    lock.setdefault("packages", {}).setdefault("", {})["version"] = TO_SERVICE

    write("config/protocol/version.json", version)
    write("config/protocol/instance.json", instance)
    write("config/protocol/migrations.json", migrations)
    write("commercial-service/package.json", package)
    write("commercial-service/package-lock.json", lock)

    readme_path = ROOT / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    old_marker = f"**Current protocol:** `{FROM_PROTOCOL}`"
    new_marker = f"**Current protocol:** `{TO_PROTOCOL}`"
    if old_marker not in readme:
        raise SystemExit(f"README missing expected marker {old_marker}")
    readme = readme.replace(old_marker, new_marker, 1)
    section = """

## Authenticated production smoke contract binding in 1.3.12

ANPOS 1.3.12 hardens the vendor-only production verifier so explicitly requested authenticated smoke checks cannot pass on route drift. Customer entitlement probes now require a positive GitHub account ID, send the canonical `X-Anpos-Account-Id` header, and accept HTTP 404 only when the JSON error is exactly `entitlement_not_found`. Operator verification is intentionally non-mutating: it authenticates `POST /api/v1/reconcile` with an empty JSON body and requires the route's exact `400 valid_account_id_required` contract, so a missing route, generic 400, unauthorized token, or stale API shape fails verification.

The commercial service package is 0.3.5 solely so exported `/api/version` attests ANPOS 1.3.12 exactly. No Marketplace purchase, reconciliation mutation, pricing decision, App registration, private-repository creation, production secret, or launch authority is created by this verifier hardening.
"""
    if "## Authenticated production smoke contract binding in 1.3.12" not in readme:
        readme = readme.rstrip() + section.rstrip() + "\n"
    readme_path.write_text(readme, encoding="utf-8")

    service_readme_path = ROOT / "commercial-service/README.md"
    service_readme = service_readme_path.read_text(encoding="utf-8")
    service_section = """

### Authenticated production smoke contract

When `scripts/verify_commercial_production.py` is run with `--github-token-env`, `--github-account-id` is required and is sent as `X-Anpos-Account-Id` to the canonical entitlement route. A 404 only counts as a valid route response when its JSON error is exactly `entitlement_not_found`; generic/missing-route 404 responses fail. When `--operator-token-env` is supplied, the verifier does not perform a real reconciliation: it sends an authenticated empty JSON body to `/api/v1/reconcile` and requires the canonical `400 valid_account_id_required` validation response. This proves route/auth contract reachability without intentionally mutating entitlement state.
"""
    if "### Authenticated production smoke contract" not in service_readme:
        service_readme = service_readme.rstrip() + service_section.rstrip() + "\n"
    service_readme_path.write_text(service_readme, encoding="utf-8")

    Path(__file__).unlink()


if __name__ == "__main__":
    main()
