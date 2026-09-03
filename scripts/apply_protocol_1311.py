#!/usr/bin/env python3
"""Apply ANPOS 1.3.11 vendor handoff cleanliness bookkeeping, then self-delete."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL_VERSION = "1.3.11"
PREVIOUS_PROTOCOL_VERSION = "1.3.10"
SERVICE_VERSION = "0.3.4"
PREVIOUS_SERVICE_VERSION = "0.3.3"
MIGRATION_ID = "ANPOS-1.3.10-to-1.3.11"
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
        raise RuntimeError(f"expected protocol {PREVIOUS_PROTOCOL_VERSION} before 1.3.11 bookkeeping")
    if instance.get("source_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("source instance protocol does not match expected 1.3.10 base")
    if migrations.get("current_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("migration ledger does not match expected 1.3.10 base")
    if package.get("version") != PREVIOUS_SERVICE_VERSION:
        raise RuntimeError(f"expected commercial service {PREVIOUS_SERVICE_VERSION} before 1.3.11 bookkeeping")
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
        " ANPOS 1.3.11 hardens private vendor-repository handoff cleanliness by treating ignored "
        "untracked files as contamination instead of allowing Git ignore rules to hide target bytes from acceptance checks."
    )
    if "ANPOS 1.3.11 hardens private vendor-repository handoff cleanliness" not in str(instance.get("notes") or ""):
        instance["notes"] = str(instance.get("notes") or "").rstrip() + note

    migrations["current_protocol_version"] = PROTOCOL_VERSION
    migrations.setdefault("applied_migrations", []).append(
        {
            "id": MIGRATION_ID,
            "from_version": PREVIOUS_PROTOCOL_VERSION,
            "to_version": PROTOCOL_VERSION,
            "detected_at": APPLIED_AT,
            "impact": [
                "Make clean private vendor-repository verification include ignored untracked files instead of relying on default git status visibility",
                "Use explicit porcelain-v1 status with all untracked files and matching ignored paths before committed-blob comparison",
                "Add regression coverage proving a file hidden only by .git/info/exclude cannot pass private checkout acceptance",
                "Strengthen the vendor-export static validator so future changes cannot silently remove ignored-file cleanliness enforcement",
                "Bump commercial service from 0.3.3 to 0.3.4 because exported package source_protocol_version changes to 1.3.11 and /api/version must attest the exact certified source identity",
                "Preserve deterministic export receipts, split-github-app-v1, paid draft catalog, secret boundaries, fail-closed launch authorization and non-destructive cancellation behavior"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Vendor checkout cleanliness verification is vendor-only source-management tooling. Customer child repositories and customer-facing commercial-template exports must strip it and gain no commercial runtime dependency from this migration.",
            "status": "applied",
            "applied_at": APPLIED_AT,
            "verification_evidence": [
                "scripts/verify_vendor_handoff.py uses git status --porcelain=v1 --untracked-files=all --ignored=matching before accepting a target Git checkout",
                "tests/test_vendor_handoff.py proves an ignored untracked file hidden from default git status is rejected",
                "scripts/validate_vendor_repository_export.py requires both ignored-file status flags and the regression test marker",
                "Deterministic service/template export verification and receipt generation remain unchanged after the cleanliness preflight",
                "Full ANPOS/commercial/vendor certification must pass before canonical main promotion"
            ]
        }
    )
    migrations["migration_record_template"] = {
        "id": "ANPOS-1.3.11-to-NEXT",
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
    if "## Ignored-file vendor checkout hardening in 1.3.11" not in readme:
        readme = readme.rstrip() + (
            "\n\n## Ignored-file vendor checkout hardening in 1.3.11\n\n"
            "Private vendor-repository acceptance now treats ignored untracked files as checkout contamination. `scripts/verify_vendor_handoff.py` runs Git status with explicit all-untracked plus ignored matching-path visibility before reading committed `HEAD` blobs, so `.gitignore` or `.git/info/exclude` cannot hide extra target bytes from the cleanliness gate.\n\n"
            "This strengthens the 1.3.10 exact handoff contract without changing export content, Marketplace state, credentials, pricing, plan IDs or launch authority. Vendor repositories should be verified from a truly clean checkout before they are accepted as source of record or used for deployment.\n"
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
