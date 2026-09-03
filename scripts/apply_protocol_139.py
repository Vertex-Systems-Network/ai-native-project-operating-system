#!/usr/bin/env python3
"""Apply ANPOS 1.3.9 operator artifact-identity bookkeeping, then self-delete."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL_VERSION = "1.3.9"
PREVIOUS_PROTOCOL_VERSION = "1.3.8"
SERVICE_VERSION = "0.3.2"
PREVIOUS_SERVICE_VERSION = "0.3.1"
MIGRATION_ID = "ANPOS-1.3.8-to-1.3.9"
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
        raise RuntimeError(f"expected protocol {PREVIOUS_PROTOCOL_VERSION} before 1.3.9 bookkeeping")
    if instance.get("source_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("source instance protocol does not match expected 1.3.8 base")
    if migrations.get("current_protocol_version") != PREVIOUS_PROTOCOL_VERSION:
        raise RuntimeError("migration ledger does not match expected 1.3.8 base")
    if package.get("version") != PREVIOUS_SERVICE_VERSION:
        raise RuntimeError(f"expected commercial service {PREVIOUS_SERVICE_VERSION} before 1.3.9 bookkeeping")
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
        " ANPOS 1.3.9 binds the vendor/operator launch bootstrap to deployable package identity: "
        "the renderer derives service/protocol/runtime-contract expectations from commercial-service/package.json, "
        "cross-checks canonical protocol metadata, emits production-verifier identity arguments, and eliminates "
        "hand-maintained release numbers from launch instructions."
    )
    if "ANPOS 1.3.9 binds the vendor/operator launch bootstrap" not in str(instance.get("notes") or ""):
        instance["notes"] = str(instance.get("notes") or "").rstrip() + note

    migrations["current_protocol_version"] = PROTOCOL_VERSION
    migrations.setdefault("applied_migrations", []).append(
        {
            "id": MIGRATION_ID,
            "from_version": PREVIOUS_PROTOCOL_VERSION,
            "to_version": PROTOCOL_VERSION,
            "detected_at": APPLIED_AT,
            "impact": [
                "Bind operator launch handoff artifact identity to committed commercial-service package metadata instead of copied release numbers",
                "Cross-check the package embedded source protocol version against canonical protocol metadata and fail closed on drift",
                "Emit exact production verifier service/protocol arguments from the same artifact identity used by /api/version",
                "Remove hard-coded commercial release numbers from operator launch instructions and deployment examples",
                "Make deployment identity tests/validator version-agnostic so future patch releases do not require stale literal maintenance",
                "Bump commercial service from 0.3.1 to 0.3.2 so exported /api/version identity visibly attests the 1.3.9 vendor handoff contract",
                "Preserve split-github-app-v1, all secret boundaries, paid catalog drafts, and fail-closed launch authorization"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Operator bootstrap, deployment verifier, and commercial runtime remain vendor-only. Customer child repositories do not receive these assets and gain no billing/runtime dependency from this metadata/tooling correction.",
            "status": "applied",
            "applied_at": APPLIED_AT,
            "verification_evidence": [
                "Operator renderer artifact_identity is derived from commercial-service/package.json and checked against config/protocol/version.json",
                "Operator handoff production_verifier_arguments are generated from the same package-derived service/protocol identity",
                "Operator bootstrap unit tests cover package/protocol mismatch fail-closed behavior and reject hard-coded prior service versions",
                "Deployment identity tests and validator derive the current service version dynamically while preserving exact runtime-contract checks",
                "Deterministic vendor export must retain service 0.3.2 / protocol 1.3.9 identity while customer-template export strips vendor-only operator/deployment tooling",
                "Full temporary certification workflow must pass before canonical main promotion"
            ]
        }
    )
    migrations["migration_record_template"] = {
        "id": "ANPOS-1.3.9-to-NEXT",
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
    section = """

## Operator artifact identity binding in 1.3.9

The vendor-only operator launch bootstrap now derives the exact deployable commercial-service identity directly from `commercial-service/package.json` and cross-checks its embedded source protocol against `config/protocol/version.json`. The rendered handoff includes `artifact_identity` plus `production_verifier_arguments`, so expected service/protocol versions are no longer copied by hand into deployment instructions.

The renderer fails closed on missing/malformed package identity, package/protocol mismatch, or an unexpected runtime contract. Operators must deploy the exact exported artifact, verify `/api/version` against the generated identity, and only then accept `/api/ready` plus real Marketplace E2E evidence. This tooling remains vendor-only and does not create repositories, credentials, GitHub Apps, Marketplace approvals, prices, plan IDs, installations, or launch authority.
"""
    if "## Operator artifact identity binding in 1.3.9" not in readme:
        readme = readme.rstrip() + section.rstrip() + "\n"

    dump(version_path, version)
    dump(instance_path, instance)
    dump(migrations_path, migrations)
    dump(package_path, package)
    dump(lock_path, lock)
    readme_path.write_text(readme, encoding="utf-8", newline="\n")

    Path(__file__).unlink()


if __name__ == "__main__":
    main()
