#!/usr/bin/env python3
"""Apply ANPOS 1.3.8 deployment-identity bookkeeping, then self-delete."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
MIGRATION_ID = "ANPOS-1.3.7-to-1.3.8"


def load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def write(relative: str, value: dict) -> None:
    (ROOT / relative).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def update_protocol() -> None:
    version = load("config/protocol/version.json")
    if version.get("version") != "1.3.7":
        raise RuntimeError(f"expected protocol 1.3.7 before 1.3.8 bookkeeping, got {version.get('version')!r}")
    version["version"] = "1.3.8"
    version["last_protocol_migration"] = MIGRATION_ID
    write("config/protocol/version.json", version)

    instance = load("config/protocol/instance.json")
    if instance.get("source_protocol_version") != "1.3.7":
        raise RuntimeError("canonical instance source_protocol_version must be 1.3.7 before 1.3.8")
    instance["source_protocol_version"] = "1.3.8"
    notes = str(instance.get("notes") or "")
    addition = (
        " ANPOS 1.3.8 adds commercial deployment identity attestation: exported service artifacts embed the "
        "source protocol/runtime contract, expose a secret-free /api/version endpoint, and production readiness "
        "verification requires exact expected artifact identity while using the actual /api/v1 route prefixes."
    )
    if "ANPOS 1.3.8 adds commercial deployment identity attestation" not in notes:
        instance["notes"] = notes.rstrip() + addition
    write("config/protocol/instance.json", instance)

    migrations = load("config/protocol/migrations.json")
    if migrations.get("current_protocol_version") != "1.3.7":
        raise RuntimeError("migration ledger must be at 1.3.7 before 1.3.8")
    applied = migrations.get("applied_migrations")
    if not isinstance(applied, list):
        raise RuntimeError("migration ledger applied_migrations must be a list")
    if any(item.get("id") == MIGRATION_ID for item in applied if isinstance(item, dict)):
        raise RuntimeError(f"migration {MIGRATION_ID} already exists")
    applied.append(
        {
            "id": MIGRATION_ID,
            "from_version": "1.3.7",
            "to_version": "1.3.8",
            "detected_at": "2026-09-04T00:00:00+05:00",
            "impact": [
                "Add a public secret-free /api/version endpoint to the commercial service so deployment identity is observable independently of health/readiness",
                "Embed source_protocol_version and split-github-app-v1 runtime-contract identity in the exported commercial-service package metadata",
                "Require exact expected service/protocol versions whenever the production verifier is run with --require-ready so stale healthy artifacts cannot be certified",
                "Correct production verifier customer/operator paths from stale /v1/* URLs to the actual Next.js /api/v1/* routes",
                "Add deployment identity tests and a dedicated validator covering route identity, stale-version rejection, route-prefix correctness and vendor/customer boundary enforcement",
                "Bump commercial service from 0.3.0 to 0.3.1 because the public operational API gains deployment identity and the production verifier contract is hardened",
                "Do not add secrets, live Marketplace state, pricing, plan IDs, customer data or production authorization"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Deployment identity tooling and the commercial service remain vendor-only. Customer child repositories must not receive the commercial runtime or vendor verifier merely by adopting protocol metadata.",
            "status": "applied",
            "applied_at": "2026-09-04T00:00:00+05:00",
            "verification_evidence": [
                "commercial-service/app/api/version/route.ts derives non-secret identity from package metadata and uses Cache-Control: no-store",
                "scripts/verify_commercial_production.py requires exact expected artifact identity with --require-ready and uses /api/v1 route prefixes",
                "tests/test_deployment_identity.py covers exact identity, stale-version rejection, route-prefix regression and contract invariants",
                "scripts/validate_deployment_identity.py behaviorally verifies the pre-network production readiness identity gate",
                "Deterministic vendor export retains service 0.3.1 identity while customer-template export strips vendor-only identity-verification tooling",
                "Full temporary certification workflow must pass before canonical main promotion"
            ]
        }
    )
    migrations["current_protocol_version"] = "1.3.8"
    template = migrations.get("migration_record_template")
    if isinstance(template, dict):
        template["id"] = "ANPOS-1.3.8-to-NEXT"
        template["from_version"] = "1.3.8"
    write("config/protocol/migrations.json", migrations)


def update_service_package() -> None:
    package = load("commercial-service/package.json")
    if package.get("version") != "0.3.0":
        raise RuntimeError(f"expected commercial service 0.3.0 before 0.3.1, got {package.get('version')!r}")
    package["version"] = "0.3.1"
    package["anpos"] = {
        "source_protocol_version": "1.3.8",
        "runtime_contract": "split-github-app-v1"
    }
    write("commercial-service/package.json", package)

    lock = load("commercial-service/package-lock.json")
    if lock.get("version") != "0.3.0":
        raise RuntimeError("package-lock top-level version must be 0.3.0 before 0.3.1")
    root_package = (lock.get("packages") or {}).get("")
    if not isinstance(root_package, dict) or root_package.get("version") != "0.3.0":
        raise RuntimeError("package-lock root package version must be 0.3.0 before 0.3.1")
    lock["version"] = "0.3.1"
    root_package["version"] = "0.3.1"
    write("commercial-service/package-lock.json", lock)


def update_manifest() -> None:
    manifest = load(".ai/manifest.json")
    role = ((manifest.get("roles") or {}).get("commercial_distribution"))
    if not isinstance(role, list):
        raise RuntimeError("commercial_distribution role must be a list")
    additions = [
        "blueprints/commercial/service-api-contract.json",
        "commercial-service/app/api/version/route.ts",
        "scripts/verify_commercial_production.py",
        "scripts/validate_deployment_identity.py",
    ]
    for item in additions:
        if item not in role:
            role.append(item)
    write(".ai/manifest.json", manifest)


def update_readme() -> None:
    path = ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    if "**Current protocol:** `1.3.7`" in text:
        text = text.replace("**Current protocol:** `1.3.7`", "**Current protocol:** `1.3.8`", 1)
    elif "**Current protocol:** `1.3.8`" not in text:
        raise RuntimeError("README current protocol marker is not in an expected pre-1.3.8 state")

    section = """## Deployment identity attestation in 1.3.8

ANPOS 1.3.8 makes commercial deployment identity a first-class production gate. Commercial service `0.3.1` exposes `GET /api/version`, derived from package metadata, with the service version, source ANPOS protocol version and runtime-contract identifier. The endpoint is public, secret-free and `Cache-Control: no-store`.

`scripts/verify_commercial_production.py --require-ready` now requires `--expected-service-version` and `--expected-protocol-version` and verifies `/api/version` before readiness. This prevents a stale or wrong artifact from being certified merely because `/api/health` is green. The verifier also uses the actual Next.js `/api/v1/...` paths; the previously unprefixed `/v1/...` smoke-check paths were invalid and returned 404 on the connected deployment.

"""
    marker = "## Repository hygiene\n"
    if "## Deployment identity attestation in 1.3.8" not in text:
        if marker not in text:
            raise RuntimeError("README Repository hygiene marker not found")
        text = text.replace(marker, section + marker, 1)

    source_marker = "- `scripts/validate_operator_launch_bootstrap.py` — operator launch bootstrap safety/behavior validator\n"
    addition = source_marker + "- `scripts/validate_deployment_identity.py` — commercial deployment identity/version + production verifier route validator\n"
    if "scripts/validate_deployment_identity.py` — commercial deployment identity" not in text:
        if source_marker not in text:
            raise RuntimeError("README operator validator source marker not found")
        text = text.replace(source_marker, addition, 1)

    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    update_protocol()
    update_service_package()
    update_manifest()
    update_readme()
    SELF.unlink()


if __name__ == "__main__":
    main()
