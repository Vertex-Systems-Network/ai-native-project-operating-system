#!/usr/bin/env python3
"""One-shot certification helper for ANPOS 1.3.2 bookkeeping.

This file deletes itself after preparing the protocol patch and must never land on
canonical main.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMESTAMP = "2026-09-03T23:09:16+05:00"
MIGRATION_ID = "ANPOS-1.3.1-to-1.3.2"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    version_path = ROOT / "config/protocol/version.json"
    instance_path = ROOT / "config/protocol/instance.json"
    migrations_path = ROOT / "config/protocol/migrations.json"
    readme_path = ROOT / "README.md"

    version = json.loads(version_path.read_text(encoding="utf-8"))
    if version.get("version") != "1.3.1":
        raise SystemExit(f"Expected protocol 1.3.1, got {version.get('version')!r}")
    version["version"] = "1.3.2"
    version["last_protocol_migration"] = MIGRATION_ID
    write_json(version_path, version)

    instance = json.loads(instance_path.read_text(encoding="utf-8"))
    if instance.get("source_protocol_version") != "1.3.1":
        raise SystemExit("Source instance protocol version is not 1.3.1")
    instance["source_protocol_version"] = "1.3.2"
    instance["notes"] = (
        "Canonical inert template source. Child repositories copied from this source must detect their different repository identity and run "
        "scripts/bootstrap_child.py before development; that wrapper performs normal child initialization and strips the vendor-only "
        "commercial-service implementation from customer/child repositories. Source-side vendor export tooling may deterministically split "
        "future private anpos-commercial-service and anpos-commercial-template repositories from committed Git blobs, but does not create "
        "or connect those repositories by itself. Only after child bootstrap may a child select PM/AI providers, verify agent identities, "
        "activate child policies/workflows, configure governance, or acquire runtime authority. Commercial Marketplace/customer billing, "
        "webhook secrets, signing keys, live plan IDs, customer records and live entitlements remain external to this source/runtime boundary."
    )
    write_json(instance_path, instance)

    migrations = json.loads(migrations_path.read_text(encoding="utf-8"))
    if migrations.get("current_protocol_version") != "1.3.1":
        raise SystemExit("Migration ledger current protocol version is not 1.3.1")
    if any(item.get("id") == MIGRATION_ID for item in migrations.get("applied_migrations", [])):
        raise SystemExit(f"{MIGRATION_ID} already exists")
    migrations["current_protocol_version"] = "1.3.2"
    migrations["applied_migrations"].append(
        {
            "id": MIGRATION_ID,
            "from_version": "1.3.1",
            "to_version": "1.3.2",
            "detected_at": TIMESTAMP,
            "impact": [
                "Add deterministic vendor repository export tooling that reads committed Git blobs from HEAD rather than working-tree bytes",
                "Define anpos-commercial-service export with the commercial-service/ prefix stripped for a future vendor-private backend repository",
                "Define anpos-commercial-template export that excludes commercial-service/ for a future customer-facing private template repository",
                "Fail closed on tracked secret-like files, committed symlinks, generated/runtime paths, unsupported Git modes, dirty tracked trees by default, in-repository outputs and existing export targets",
                "Generate deterministic EXPORT-MANIFEST.json provenance with source revision/tree plus per-file Git object, mode, size and SHA-256 evidence",
                "Add dedicated vendor-export unit tests and static validation while preserving canonical source inertness and canonical child bootstrap vendor stripping",
                "Do not create private repositories, activate commercial runtime, attach Marketplace/GitHub App state, or introduce billing checks into child-project runtime",
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Existing child projects do not need this vendor-side export tooling and must not receive commercial-service/. This patch does not introduce billing/runtime dependencies into children. Preserve project-specific behavior and adopt vendor-export tooling only in the canonical/vendor source-management context.",
            "status": "applied",
            "applied_at": TIMESTAMP,
            "verification_evidence": [
                "GitHub Actions certification run 33788462032 completed successfully on the vendor-export implementation before protocol bookkeeping",
                "ANPOS Python suite passed 36 tests including eight vendor repository export safety tests",
                "Core, commercial licensing, commercial service and vendor repository export validators all passed",
                "Two independent vendor exports were byte-for-byte identical and their manifests matched the certified source revision",
                "Node 22/npm 11.19.1 locked npm ci and npm audit completed with 0 reported vulnerabilities",
                "Commercial TypeScript typecheck, four security unit tests, Next.js 16.3.4 production build and final tracked clean-tree gate passed",
            ],
        }
    )
    template = migrations.get("migration_record_template") or {}
    template["id"] = "ANPOS-1.3.2-to-NEXT"
    template["from_version"] = "1.3.2"
    migrations["migration_record_template"] = template
    write_json(migrations_path, migrations)

    readme = readme_path.read_text(encoding="utf-8")
    old_marker = "**Current protocol:** `1.3.1`"
    if readme.count(old_marker) != 1:
        raise SystemExit("README current-protocol marker is missing or ambiguous")
    readme = readme.replace(old_marker, "**Current protocol:** `1.3.2`", 1)
    heading = "## Vendor repository separation in 1.3.2"
    if heading in readme:
        raise SystemExit("README 1.3.2 vendor section already exists")
    anchor = "\n## Repository hygiene\n"
    if readme.count(anchor) != 1:
        raise SystemExit("README repository-hygiene anchor is missing or ambiguous")
    section = """
## Vendor repository separation in 1.3.2

`scripts/export_vendor_repositories.py` provides a deterministic, fail-closed source-management bridge for the future private vendor repositories. Run it from a clean canonical Git worktree with an output directory outside the repository:

```bash
python scripts/export_vendor_repositories.py --output <outside-directory>
```

The default export produces `anpos-commercial-service` from committed `commercial-service/` Git blobs with the prefix stripped, and `anpos-commercial-template` from the canonical source with `commercial-service/` excluded. Exported bytes come from committed Git objects at `HEAD`, not untracked or modified working-tree files. Each output includes `EXPORT-MANIFEST.json` with source revision/tree and per-file Git object/mode/SHA-256 provenance.

The exporter refuses tracked secret-like files, committed symlinks, generated/runtime paths, unsupported Git modes, dirty tracked trees by default, output paths inside the canonical repository, and pre-existing targets. It does **not** create GitHub repositories, configure a GitHub App/Marketplace listing, transfer credentials, deploy a runtime, or make commercial licensing a child-project dependency.
"""
    readme = readme.replace(anchor, "\n" + section + anchor, 1)
    readme_path.write_text(readme, encoding="utf-8", newline="\n")

    for relative in (
        ".github/workflows/apply-protocol-132.yml",
        "scripts/apply_protocol_132.py",
    ):
        path = ROOT / relative
        if path.exists():
            path.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
