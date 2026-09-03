#!/usr/bin/env python3
"""One-shot branch-only helper for ANPOS 1.3.3 commercial launch-package bookkeeping."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_ID = "ANPOS-1.3.2-to-1.3.3"
TIMESTAMP = "2026-09-03T23:41:00+05:00"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    version_path = ROOT / "config/protocol/version.json"
    instance_path = ROOT / "config/protocol/instance.json"
    migrations_path = ROOT / "config/protocol/migrations.json"
    readme_path = ROOT / "README.md"

    version = json.loads(version_path.read_text(encoding="utf-8"))
    if version.get("version") != "1.3.2":
        raise SystemExit(f"Expected protocol 1.3.2, got {version.get('version')!r}")
    version["version"] = "1.3.3"
    version["last_protocol_migration"] = MIGRATION_ID
    write_json(version_path, version)

    instance = json.loads(instance_path.read_text(encoding="utf-8"))
    if instance.get("source_protocol_version") != "1.3.2":
        raise SystemExit("Source instance protocol version is not 1.3.2")
    instance["source_protocol_version"] = "1.3.3"
    instance["notes"] = (
        "Canonical inert template source. Child repositories copied from this source must detect their different repository identity and run "
        "scripts/bootstrap_child.py before development; vendor-only commercial-service is stripped from customer/child repositories. Source-side "
        "commercial launch assets are inactive operator blueprints/templates/verifiers only and cannot authorize production sales, create billing "
        "authority, accept legal terms, or fabricate GitHub App/Marketplace credentials. Vendor export tooling may deterministically split future "
        "private service/template repositories from committed Git blobs. Commercial Marketplace/customer billing, webhook secrets, signing keys, "
        "live plan IDs, customer records and active entitlements remain external to this source/runtime boundary."
    )
    write_json(instance_path, instance)

    migrations = json.loads(migrations_path.read_text(encoding="utf-8"))
    if migrations.get("current_protocol_version") != "1.3.2":
        raise SystemExit("Migration ledger current protocol version is not 1.3.2")
    if any(item.get("id") == MIGRATION_ID for item in migrations.get("applied_migrations", [])):
        raise SystemExit(f"{MIGRATION_ID} already exists")
    migrations["current_protocol_version"] = "1.3.3"
    migrations["applied_migrations"].append({
        "id": MIGRATION_ID,
        "from_version": "1.3.2",
        "to_version": "1.3.3",
        "detected_at": TIMESTAMP,
        "impact": [
            "Add an inactive GitHub App configuration blueprint with archive-first least-privilege permissions and explicit operator-supplied identifiers",
            "Add a GitHub Marketplace listing draft with plan positioning but no repository-defined prices, plan IDs, tax/refund/SLA promises or legal commitments",
            "Add a fail-closed machine-readable production launch checklist whose source state can never authorize sales or pre-verify external launch gates",
            "Add a legal document template pack for Terms, EULA/license, Privacy, Refund/Cancellation and Support/SLA while explicitly requiring operator/legal/accounting review",
            "Add a production smoke verifier for health/readiness/public keys plus optional customer/operator checks using environment-variable secret references rather than raw secret CLI values",
            "Add launch-package unit/static validation and integrate the launch validator into the inactive repository-quality blueprint including protected-base validation",
            "Preserve core/child non-destructive license expiry and source-template inertness; no production credentials, prices, customer records or live launch evidence are added"
        ],
        "project_conflicts": [],
        "requires_owner_consent": false,
        "child_migration_rule": "Existing child projects do not require this vendor/operator launch package. Do not introduce billing, legal, Marketplace or production-launch dependencies into normal child execution merely by adopting ANPOS 1.3.3.",
        "status": "applied",
        "applied_at": TIMESTAMP,
        "verification_evidence": [
            "Commercial launch package certification must pass before publishing this migration to canonical main",
            "Source launch checklist remains launch_authorized=false and carries no live external evidence",
            "GitHub App blueprint contains no credentials or final runtime identifiers",
            "Marketplace listing/legal files remain explicit drafts/templates rather than billing/legal authority",
            "Production verifier does not synthesize or claim real Marketplace purchase evidence"
        ]
    })
    template = migrations.get("migration_record_template") or {}
    template["id"] = "ANPOS-1.3.3-to-NEXT"
    template["from_version"] = "1.3.3"
    migrations["migration_record_template"] = template
    write_json(migrations_path, migrations)

    readme = readme_path.read_text(encoding="utf-8")
    old = "**Current protocol:** `1.3.2`"
    if readme.count(old) != 1:
        raise SystemExit("README protocol marker is missing or ambiguous")
    readme = readme.replace(old, "**Current protocol:** `1.3.3`", 1)
    heading = "## Commercial launch package in 1.3.3"
    if heading in readme:
        raise SystemExit("README 1.3.3 launch-package section already exists")
    anchor = "\n## Repository hygiene\n"
    if readme.count(anchor) != 1:
        raise SystemExit("README repository-hygiene anchor is missing or ambiguous")
    section = '''
## Commercial launch package in 1.3.3

ANPOS includes an **inactive vendor/operator launch package** under `blueprints/commercial/` plus `scripts/verify_commercial_production.py`. It provides a GitHub App configuration blueprint, Marketplace listing draft, fail-closed production launch checklist, legal-document template pack, and production smoke verifier.

These assets do not create a GitHub App, approve Marketplace financial onboarding, set prices/plan IDs, accept legal terms, store production credentials, or authorize sales. The source checklist remains `launch_authorized: false`; production promotion requires real external evidence for every required gate. The verifier may check health/readiness/public keys and optional authenticated customer/operator routes, but synthetic smoke checks are never evidence of a real Marketplace purchase/change/cancel event.

The inactive repository-quality blueprint runs the commercial launch-package validator and protected-base validation so this fail-closed boundary cannot silently disappear when a child/vendor quality workflow is instantiated.
'''
    readme = readme.replace(anchor, "\n" + section + anchor, 1)
    readme_path.write_text(readme, encoding="utf-8", newline="\n")

    helper = ROOT / "scripts/apply_protocol_133.py"
    if helper.exists():
        helper.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
