#!/usr/bin/env python3
"""Apply ANPOS 1.3.10 deterministic vendor-handoff bookkeeping, then self-delete."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL_VERSION = "1.3.10"
PREVIOUS_PROTOCOL_VERSION = "1.3.9"
SERVICE_VERSION = "0.3.3"
PREVIOUS_SERVICE_VERSION = "0.3.2"
MIGRATION_ID = "ANPOS-1.3.9-to-1.3.10"
APPLIED_AT = "2026-09-04T00:00:00+05:00"


def load(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"{path.relative_to(ROOT)} must contain an object")
    return data


def dump(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    version_path = ROOT / "config/protocol/version.json"
    instance_path = ROOT / "config/protocol/instance.json"
    migrations_path = ROOT / "config/protocol/migrations.json"
    package_path = ROOT / "commercial-service/package.json"
    lock_path = ROOT / "commercial-service/package-lock.json"
    readme_path = ROOT / "README.md"

    version = load(version_path)
    instance = load(instance_path)
    migrations = load(migrations_path)
    package = load(package_path)
    lock = load(lock_path)

    if version.get("version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError(f"expected protocol {PREVIOUS_PROTOCOL_VERSION} before 1.3.10 bookkeeping")
    if instance.get("source_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("source instance protocol does not match expected 1.3.9 base")
    if migrations.get("current_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("migration ledger does not match expected 1.3.9 base")
    if package.get("version") != PREVIOUS_SERVICE_VERSION:
        raise RuntimeError(f"expected commercial service {PREVIOUS_SERVICE_VERSION} before 1.3.10 bookkeeping")
    if (package.get("anpos") or {}).get("source_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("commercial package protocol identity does not match expected base")
    if lock.get("version") != PREVIOUS_SERVICE_VERSION or (lock.get("packages") or {}).get("", {}).get("version") != PREVIOUS_SERVICE_VERSION:
        raise RuntimeError("package-lock root version does not match expected commercial service base")
    if any(item.get("id") == MIGRATION_ID for item in migrations.get("applied_migrations", [])):
        raise RuntimeError(f"migration {MIGRATION_ID} already exists")

    version["version"] = PROTOCOL_VERSION
    version["last_protocol_migration"] = MIGRATION_ID
    instance["source_protocol_version"] = PROTOCOL_VERSION
    note = (
        " ANPOS 1.3.10 adds exact deterministic vendor-repository handoff verification: the operator handoff "
        "binds private service/template exports to the canonical Git revision/tree, and the vendor-only verifier "
        "reconstructs expected exports from committed blobs before accepting a directory or clean private Git checkout."
    )
    if "ANPOS 1.3.10 adds exact deterministic vendor-repository handoff verification" not in str(instance.get("notes") or ""):
        instance["notes"] = str(instance.get("notes") or "").rstrip() + note

    migrations["current_protocol_version"] = PROTOCOL_VERSION
    migrations.setdefault("applied_migrations", []).append(
        {
            "id": MIGRATION_ID,
            "from_version": PREVIOUS_PROTOCOL_VERSION,
            "to_version": PROTOCOL_VERSION,
            "detected_at": APPLIED_AT,
            "impact": [
                "Add a vendor-only handoff verifier that reconstructs the approved service/template export from committed canonical Git blobs and compares the complete target byte set",
                "Verify clean private Git checkouts from committed HEAD blobs so newline-converted working-tree bytes cannot create false mismatches",
                "Reject extra, missing, dirty, stale, tampered, wrong-mode, symlinked or wrong-identity vendor repository content before private-source acceptance",
                "Emit deterministic verification receipts with canonical source revision/tree, target repository revision, manifest SHA-256 and content-set SHA-256",
                "Upgrade operator handoff schema to bind both vendor repositories to canonical source revision/tree and generate exact service/template verifier arguments",
                "Route exporter and handoff verifier explicitly to commercial-distribution agents and keep all new verification tooling vendor-only",
                "Bump commercial service from 0.3.2 to 0.3.3 because exported package source_protocol_version changes to 1.3.10 and /api/version must attest the exact certified source identity",
                "Preserve split-github-app-v1, paid draft catalog, secret boundaries, fail-closed launch authorization and non-destructive cancellation behavior"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Vendor export/handoff verification is vendor-only source-management tooling. Customer child repositories and customer-facing commercial-template exports must strip it and gain no commercial runtime dependency from this migration.",
            "status": "applied",
            "applied_at": APPLIED_AT,
            "verification_evidence": [
                "scripts/verify_vendor_handoff.py reconstructs expected exports from committed canonical blobs and compares exact target files/bytes",
                "Target Git checkout verification reads committed HEAD blobs and requires a clean checkout including untracked files",
                "tests/test_vendor_handoff.py covers valid service/template handoff, private-style Git checkout, tampering, extra files, stale source identity, dirty checkout and service identity mismatch",
                "Operator handoff schema_version=3 emits canonical source revision/tree plus exact service/template verification argument lists",
                "Vendor source boundary strips verifier/tests from customer templates and .ai commercial_distribution routing includes exporter/verifier",
                "Deterministic double export, full ANPOS/commercial/vendor tests and commercial service certification must pass before canonical main promotion"
            ]
        }
    )
    migrations["migration_record_template"] = {
        "id": "ANPOS-1.3.10-to-NEXT",
        "from_version": PROTOCOL_VERSION,
        "to_version": None,
        "detected_at": None,
        "impact": [],
        "project_conflicts": [],
        "requires_owner_consent": False,
        "status": "pending",
        "applied_at": None,
        "verification_evidence": []
    }

    package["version"] = SERVICE_VERSION
    package.setdefault("anpos", {})["source_protocol_version"] = PROTOCOL_VERSION
    if package["anpos"].get("runtime_contract") != "split-github-app-v1":
        raise RuntimeError("commercial runtime contract unexpectedly changed")
    lock["version"] = SERVICE_VERSION
    lock.setdefault("packages", {}).setdefault("", {})["version"] = SERVICE_VERSION

    readme = readme_path.read_text(encoding="utf-8")
    current_marker = f"**Current protocol:** `{PREVIOUS_PROTOCOL_VERSION}`"
    if current_marker not in readme:
        raise RuntimeError("README current protocol marker does not match expected base")
    readme = readme.replace(current_marker, f"**Current protocol:** `{PROTOCOL_VERSION}`", 1)
    if "## Deterministic vendor handoff verification in 1.3.10" not in readme:
        readme = readme.rstrip() + (
            "\n\n## Deterministic vendor handoff verification in 1.3.10\n\n"
            "ANPOS now binds the vendor/operator handoff to the exact canonical Git commit and tree used for deterministic private-repository exports. `scripts/verify_vendor_handoff.py` reconstructs the expected service or customer-template export from committed canonical Git blobs and compares the complete target file/byte set, including `EXPORT-MANIFEST.json`, before that export or a clean private-repository checkout is accepted.\n\n"
            "For Git checkouts, verification reads committed `HEAD` blobs and requires a clean checkout including untracked files. It fails closed on stale source identity, extra/missing files, byte drift, unsupported Git modes/symlinks, wrong export mode, or wrong service/protocol/runtime identity. Successful verification emits a JSON provenance receipt with canonical source revision/tree, target repository revision when applicable, manifest SHA-256 and content-set SHA-256. The receipt proves exact deterministic-export equality only; it does not prove repository privacy/ownership, GitHub App installation, Marketplace approval, credentials, deployment, or launch authority.\n"
        )

    dump(version_path, version)
    dump(instance_path, instance)
    dump(migrations_path, migrations)
    dump(package_path, package)
    dump(lock_path, lock)
    readme_path.write_text(readme, encoding="utf-8", newline="\n")

    Path(__file__).unlink()


if __name__ == "__main__":
    main()
