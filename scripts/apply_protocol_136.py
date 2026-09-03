#!/usr/bin/env python3
"""Temporary ANPOS 1.3.6 bookkeeping helper; self-deletes after application."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"{path.relative_to(ROOT)} must contain an object")
    return value


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")


def update_protocol_version() -> None:
    path = ROOT / "config/protocol/version.json"
    data = load(path)
    if data.get("version") != "1.3.5":
        raise SystemExit(f"expected protocol 1.3.5 before migration, found {data.get('version')!r}")
    data["version"] = "1.3.6"
    data["last_protocol_migration"] = "ANPOS-1.3.5-to-1.3.6"
    write_json(path, data)


def update_instance() -> None:
    path = ROOT / "config/protocol/instance.json"
    data = load(path)
    data["source_protocol_version"] = "1.3.6"
    data["notes"] = (
        "Canonical inert template source. Child repositories copied from this source must detect their different repository identity and run "
        "scripts/bootstrap_child.py before development. The bootstrap reads config/licensing/vendor-source-boundary.json and strips vendor-only "
        "commercial runtime, source-management, export-test, legal/listing, GitHub-App, Marketplace-compliance/staged-launch, production-launch, "
        "and vendor-quality assets from customer children. The same committed boundary policy excludes vendor-only assets from "
        "anpos-commercial-template exports, while the vendor service export is sourced only from committed commercial-service/ Git blobs. Core "
        "child development/security/quality/PM/AI and non-secret entitlement-reference functionality remain available. GitHub Marketplace "
        "compliance and free-first-to-paid staged-publication guidance are vendor-only, must be re-verified against official GitHub documentation "
        "before submission/conversion, do not create a free Community plan automatically, do not mutate the paid Developer/Pro/Team/Enterprise "
        "drafts, and are never proof of real installations, publisher verification, financial onboarding, pricing, listing approval, customer "
        "billing readiness, or production launch. ANPOS 1.3.6 separates the public/customer-facing Marketplace GitHub App from the private "
        "Vendor Distribution GitHub App; new production commercial-service 0.3.0 configuration requires distinct App IDs/private keys and "
        "rejects legacy single-App credentials rather than silently collapsing the trust boundary."
    )
    write_json(path, data)


def update_migrations() -> None:
    path = ROOT / "config/protocol/migrations.json"
    data = load(path)
    if data.get("current_protocol_version") != "1.3.5":
        raise SystemExit(f"expected migration ledger at 1.3.5, found {data.get('current_protocol_version')!r}")
    migration_id = "ANPOS-1.3.5-to-1.3.6"
    applied = data.setdefault("applied_migrations", [])
    if any(item.get("id") == migration_id for item in applied if isinstance(item, dict)):
        raise SystemExit("ANPOS 1.3.6 migration already recorded")
    applied.append(
        {
            "id": migration_id,
            "from_version": "1.3.5",
            "to_version": "1.3.6",
            "detected_at": "2026-09-04T00:00:00+05:00",
            "impact": [
                "Separate the public/customer-facing GitHub Marketplace App trust boundary from the private Vendor Distribution GitHub App used for vendor-template access",
                "Require the Marketplace App to be public/installable for Marketplace publication while keeping the Vendor Distribution App private and vendor-only",
                "Move Marketplace reconciliation to GITHUB_MARKETPLACE_APP_ID/GITHUB_MARKETPLACE_APP_PRIVATE_KEY and vendor template access to GITHUB_VENDOR_APP_ID/GITHUB_VENDOR_APP_PRIVATE_KEY",
                "Fail closed when Marketplace and Vendor App IDs are equal or their private keys are reused",
                "Reject legacy GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY as production substitutes instead of silently collapsing App roles",
                "Keep vendor repository Administration permission off the customer-facing Marketplace App; optional collaborator Administration permission remains Vendor-App-only",
                "Add separate Marketplace/Vendor App blueprints and deprecate the legacy single-App blueprint",
                "Bind free-first Marketplace staged publication and launch gates to public App installability plus App-role separation",
                "Bump the commercial service contract from 0.2.1 to 0.3.0 because production environment configuration changes are intentionally non-backward-compatible",
                "Preserve customer child/template vendor-source stripping and the existing Developer/Pro/Team/Enterprise paid catalog"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Existing customer child projects do not receive vendor-only GitHub App or commercial runtime assets. No child code migration is required. Vendor operators upgrading the commercial service must create/configure two distinct GitHub Apps and replace legacy single-App environment variables before 0.3.0 readiness can pass.",
            "status": "applied",
            "applied_at": "2026-09-04T00:00:00+05:00",
            "verification_evidence": [
                "Official GitHub documentation checked on 2026-09-04 confirms public Apps can be installed by other accounts and Marketplace publication is associated with public Apps",
                "commercial-service configuration fails closed on equal Marketplace/Vendor App IDs and reused App private keys",
                "commercial-service Marketplace reconciliation and vendor-template installation-token calls use separate App JWT roles",
                "Production readiness validates both App private keys as RSA and legacy single-App credentials do not satisfy required configuration",
                "Separate Marketplace and Vendor App blueprints are vendor-only and customer-template exports exclude them",
                "Full ANPOS/commercial/vendor certification must pass before this migration is promoted to canonical main"
            ]
        }
    )
    data["current_protocol_version"] = "1.3.6"
    template = data.setdefault("migration_record_template", {})
    template["id"] = "ANPOS-1.3.6-to-NEXT"
    template["from_version"] = "1.3.6"
    write_json(path, data)


def update_service_version() -> None:
    package_path = ROOT / "commercial-service/package.json"
    package = load(package_path)
    if package.get("version") != "0.2.1":
        raise SystemExit(f"expected commercial service 0.2.1, found {package.get('version')!r}")
    package["version"] = "0.3.0"
    write_json(package_path, package)

    lock_path = ROOT / "commercial-service/package-lock.json"
    lock = load(lock_path)
    if lock.get("version") != "0.2.1":
        raise SystemExit(f"expected package-lock top-level version 0.2.1, found {lock.get('version')!r}")
    root_package = (lock.get("packages") or {}).get("")
    if not isinstance(root_package, dict) or root_package.get("version") != "0.2.1":
        raise SystemExit("expected package-lock root package at version 0.2.1")
    lock["version"] = "0.3.0"
    root_package["version"] = "0.3.0"
    write_json(lock_path, lock)


def update_readme() -> None:
    path = ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    heading = "## GitHub App trust separation in 1.3.6"
    if heading in text:
        return
    marker = "## Repository hygiene"
    if marker not in text:
        raise SystemExit("README insertion marker not found")
    section = """## GitHub App trust separation in 1.3.6

ANPOS 1.3.6 separates the GitHub App used for customer-facing Marketplace publication/reconciliation from the GitHub App used for vendor private-template distribution. The Marketplace App is a public/installable customer-facing trust boundary; the Vendor Distribution App stays private to the publisher and receives only the private-repository permissions required for archive delivery or the explicitly enabled collaborator fallback.

Commercial service `0.3.0` requires distinct `GITHUB_MARKETPLACE_APP_*` and `GITHUB_VENDOR_APP_*` credentials. Readiness fails closed if the App IDs are equal, if the private keys are reused, or if an operator supplies only the legacy `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` pair. Marketplace reconciliation uses only the Marketplace App JWT; vendor installation tokens use only the Vendor App JWT.

The legacy single-App manifest remains only as a deprecated migration marker. Separate vendor-only manifests define the public Marketplace App and private Vendor Distribution App, and deterministic customer-template export strips all of these vendor launch assets. This change does not create either App, grant Marketplace approval, configure production credentials, define a free plan, or authorize sales.

"""
    path.write_text(text.replace(marker, section + marker, 1), encoding="utf-8", newline="\n")


def main() -> None:
    update_protocol_version()
    update_instance()
    update_migrations()
    update_service_version()
    update_readme()
    Path(__file__).unlink()


if __name__ == "__main__":
    main()
