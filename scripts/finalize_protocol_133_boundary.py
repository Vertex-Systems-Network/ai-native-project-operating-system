#!/usr/bin/env python3
"""One-shot branch-only helper to align ANPOS 1.3.3 docs/ledger with vendor-only source boundary."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_ID = "ANPOS-1.3.2-to-1.3.3"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    version = json.loads((ROOT / "config/protocol/version.json").read_text(encoding="utf-8"))
    if version.get("version") != "1.3.3" or version.get("last_protocol_migration") != MIGRATION_ID:
        raise SystemExit("Expected already-bookkept ANPOS 1.3.3")

    instance_path = ROOT / "config/protocol/instance.json"
    instance = json.loads(instance_path.read_text(encoding="utf-8"))
    if instance.get("source_protocol_version") != "1.3.3":
        raise SystemExit("Instance is not aligned to ANPOS 1.3.3")
    instance["notes"] = (
        "Canonical inert template source. Child repositories copied from this source must detect their different repository identity and run "
        "scripts/bootstrap_child.py before development. The bootstrap reads config/licensing/vendor-source-boundary.json and strips vendor-only "
        "commercial runtime, source-management, export-test, legal/listing, GitHub-App, production-launch, and vendor-quality assets from customer "
        "children. The same committed boundary policy excludes vendor-only assets from anpos-commercial-template exports, while the vendor service "
        "export is sourced only from committed commercial-service/ Git blobs. Core child development/security/quality/PM/AI and non-secret "
        "entitlement-reference functionality remain available. Commercial Marketplace/customer billing, webhook secrets, signing keys, live plan "
        "IDs, customer records and active entitlements remain external to this source/runtime boundary."
    )
    write_json(instance_path, instance)

    migrations_path = ROOT / "config/protocol/migrations.json"
    migrations = json.loads(migrations_path.read_text(encoding="utf-8"))
    records = [item for item in migrations.get("applied_migrations", []) if item.get("id") == MIGRATION_ID]
    if len(records) != 1:
        raise SystemExit("Expected exactly one ANPOS 1.3.3 migration record")
    record = records[0]
    additions = [
        "Add config/licensing/vendor-source-boundary.json as the shared machine-readable classification for vendor-only service, export, launch/legal/App/operator and vendor-quality assets",
        "Drive scripts/bootstrap_child.py vendor stripping from the shared source-boundary policy instead of a one-path hardcoded tuple",
        "Exclude every vendor-only source-boundary path from anpos-commercial-template while continuing to source the vendor service only from committed commercial-service/ Git blobs",
        "Move vendor repository export and commercial launch validation out of the child repository-quality blueprint into a separate vendor-only quality blueprint so customer children never depend on stripped vendor tooling",
    ]
    impact = record.setdefault("impact", [])
    for item in additions:
        if item not in impact:
            impact.append(item)
    record["child_migration_rule"] = (
        "Existing child projects do not require vendor commercial runtime, export tooling, launch/legal/App/operator assets, or vendor-only tests/validators. "
        "New child initialization strips all paths classified by config/licensing/vendor-source-boundary.json. Do not introduce billing, legal, Marketplace, "
        "vendor source-management, or production-launch dependencies into normal child execution merely by adopting ANPOS 1.3.3."
    )
    evidence = record.setdefault("verification_evidence", [])
    for item in (
        "Customer-template export tests verify all configured vendor-only paths are excluded using the committed source-boundary policy",
        "Vendor-only source-management and launch validators are routed through blueprints/commercial/vendor-launch-quality.yml rather than the child repository-quality blueprint",
        "Child bootstrap and vendor exporter consume the same vendor-source-boundary classification",
    ):
        if item not in evidence:
            evidence.append(item)
    write_json(migrations_path, migrations)

    readme_path = ROOT / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    old_132 = "The default export produces `anpos-commercial-service` from committed `commercial-service/` Git blobs with the prefix stripped, and `anpos-commercial-template` from the canonical source with `commercial-service/` excluded."
    new_132 = "The default export produces `anpos-commercial-service` from committed `commercial-service/` Git blobs with the prefix stripped, and `anpos-commercial-template` from the canonical source with every path classified as vendor-only in `config/licensing/vendor-source-boundary.json` excluded."
    if old_132 in readme:
        readme = readme.replace(old_132, new_132, 1)
    elif new_132 not in readme:
        raise SystemExit("README 1.3.2 export sentence not found")

    old_133 = "The inactive repository-quality blueprint runs the commercial launch-package validator and protected-base validation so this fail-closed boundary cannot silently disappear when a child/vendor quality workflow is instantiated."
    new_133 = (
        "Vendor/operator launch and export assets are classified through `config/licensing/vendor-source-boundary.json`; child bootstrap and the customer-facing commercial-template export remove them. "
        "Their tests/validators run through the separate inactive `blueprints/commercial/vendor-launch-quality.yml`, while the child `repository-quality.yml` remains free of dependencies on stripped vendor-only tooling."
    )
    if old_133 in readme:
        readme = readme.replace(old_133, new_133, 1)
    elif new_133 not in readme:
        raise SystemExit("README 1.3.3 quality paragraph not found")
    readme_path.write_text(readme, encoding="utf-8", newline="\n")

    helper = ROOT / "scripts/finalize_protocol_133_boundary.py"
    if helper.exists():
        helper.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
