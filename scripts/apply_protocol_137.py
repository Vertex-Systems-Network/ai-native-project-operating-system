#!/usr/bin/env python3
"""Apply ANPOS 1.3.7 operator-launch-bootstrap bookkeeping, then self-delete."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
MIGRATION_ID = "ANPOS-1.3.6-to-1.3.7"


def load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def write(relative: str, value: dict) -> None:
    (ROOT / relative).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def update_protocol() -> None:
    version = load("config/protocol/version.json")
    if version.get("version") != "1.3.6":
        raise RuntimeError(f"expected protocol 1.3.6 before 1.3.7 bookkeeping, got {version.get('version')!r}")
    version["version"] = "1.3.7"
    version["last_protocol_migration"] = MIGRATION_ID
    write("config/protocol/version.json", version)

    instance = load("config/protocol/instance.json")
    if instance.get("source_protocol_version") != "1.3.6":
        raise RuntimeError("canonical instance source_protocol_version must be 1.3.6 before 1.3.7")
    instance["source_protocol_version"] = "1.3.7"
    notes = str(instance.get("notes") or "")
    addition = (
        " ANPOS 1.3.7 adds vendor-only secret-safe operator launch bootstrap tooling that renders prefilled "
        "public Marketplace/private Vendor GitHub App registration URLs and the commercial service 0.3.0 split "
        "environment-key handoff without accepting credentials or creating external resources."
    )
    if "ANPOS 1.3.7 adds vendor-only secret-safe operator launch bootstrap tooling" not in notes:
        instance["notes"] = notes.rstrip() + addition
    write("config/protocol/instance.json", instance)

    migrations = load("config/protocol/migrations.json")
    if migrations.get("current_protocol_version") != "1.3.6":
        raise RuntimeError("migration ledger must be at 1.3.6 before 1.3.7")
    applied = migrations.get("applied_migrations")
    if not isinstance(applied, list):
        raise RuntimeError("migration ledger applied_migrations must be a list")
    if any(item.get("id") == MIGRATION_ID for item in applied if isinstance(item, dict)):
        raise RuntimeError(f"migration {MIGRATION_ID} already exists")
    applied.append(
        {
            "id": MIGRATION_ID,
            "from_version": "1.3.6",
            "to_version": "1.3.7",
            "detected_at": "2026-09-04T00:00:00+05:00",
            "impact": [
                "Add a vendor-only secret-safe operator launch bootstrap renderer for the external commercial setup handoff",
                "Generate prefilled organization-owned GitHub App registration URLs for the public Marketplace App and private Vendor Distribution App",
                "Keep Vendor Administration: write absent by default and add it only through an explicit collaborator-provisioning switch",
                "Emit the commercial service 0.3.0 split Marketplace/Vendor environment-key contract without accepting or printing credential values",
                "Add behavioral unit tests and a dedicated validator that reject secret-bearing CLI flags, legacy single-App configuration and trust-boundary collapse",
                "Route commercial-distribution agents through the operator bootstrap assets and classify all bootstrap files as vendor-only",
                "Correct stale README current-protocol metadata and document the 1.3.7 operator launch flow",
                "Do not create GitHub repositories, GitHub Apps, Marketplace listings, credentials, plan IDs, pricing, installation evidence or launch authority"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "Operator launch bootstrap assets are vendor-only and must remain stripped from customer child repositories and customer-facing commercial-template exports. Existing child projects do not need this helper and must not gain a commercial runtime dependency merely by adopting protocol metadata.",
            "status": "applied",
            "applied_at": "2026-09-04T00:00:00+05:00",
            "verification_evidence": [
                "scripts/render_operator_launch_bootstrap.py accepts only non-secret registration inputs and emits fail-closed JSON handoff data",
                "tests/test_operator_launch_bootstrap.py covers Marketplace/Vendor visibility, permissions, explicit collaborator escalation, URL validation, split environment keys and secret-safety invariants",
                "scripts/validate_operator_launch_bootstrap.py behaviorally verifies generated registration URLs and vendor/customer boundary enforcement",
                "blueprints/commercial/vendor-launch-quality.yml runs the operator bootstrap tests and validator",
                "config/licensing/vendor-source-boundary.json strips operator bootstrap assets from customer-template exports",
                "Full temporary certification workflow must pass before canonical main promotion"
            ]
        }
    )
    migrations["current_protocol_version"] = "1.3.7"
    template = migrations.get("migration_record_template")
    if isinstance(template, dict):
        template["id"] = "ANPOS-1.3.7-to-NEXT"
        template["from_version"] = "1.3.7"
    write("config/protocol/migrations.json", migrations)


def update_readme() -> None:
    path = ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    current_line = "**Current protocol:** `1.3.3`"
    if current_line in text:
        text = text.replace(current_line, "**Current protocol:** `1.3.7`", 1)
    elif "**Current protocol:** `1.3.6`" in text:
        text = text.replace("**Current protocol:** `1.3.6`", "**Current protocol:** `1.3.7`", 1)
    elif "**Current protocol:** `1.3.7`" not in text:
        raise RuntimeError("README current protocol marker is not in an expected pre-1.3.7 state")

    section = """## Operator launch bootstrap in 1.3.7

ANPOS 1.3.7 adds `scripts/render_operator_launch_bootstrap.py` plus `blueprints/commercial/operator-launch-bootstrap.md` to reduce external commercial setup errors without moving credentials or account authority into the repository. Given only a GitHub organization slug, HTTPS commercial-service base URL and HTTPS product homepage URL, the renderer produces a fail-closed JSON handoff containing prefilled GitHub App registration URLs and the commercial service 0.3.0 environment-key contract.

The generated Marketplace App registration is public, webhook-enabled and subscribed to `marketplace_purchase`, with no vendor private-template repository permissions. The generated Vendor Distribution App registration is private, webhook-disabled and archive-first with `Contents: read`; `Administration: write` is added only when the operator explicitly enables collaborator provisioning. The renderer never accepts private keys, webhook secrets, database credentials, operator tokens, Marketplace plan IDs, prices or customer data.

The output does not create GitHub Apps or repositories and cannot prove Marketplace approval, installation counts, publisher verification, pricing, plan IDs or production readiness. GitHub remains authoritative for the final App registrations, and current GitHub/Marketplace requirements must be re-checked before registration and listing submission.

"""
    marker = "## Repository hygiene\n"
    if "## Operator launch bootstrap in 1.3.7" not in text:
        if marker not in text:
            raise RuntimeError("README Repository hygiene marker not found")
        text = text.replace(marker, section + marker, 1)

    source_marker = "- `scripts/validate_commercial_licensing.py` — commercial distribution/licensing validator\n"
    source_addition = (
        source_marker
        + "- `scripts/render_operator_launch_bootstrap.py` — secret-safe vendor/operator GitHub App registration + environment-key handoff renderer\n"
        + "- `scripts/validate_operator_launch_bootstrap.py` — operator launch bootstrap safety/behavior validator\n"
    )
    if "scripts/render_operator_launch_bootstrap.py` — secret-safe vendor/operator" not in text:
        if source_marker not in text:
            raise RuntimeError("README important-source insertion marker not found")
        text = text.replace(source_marker, source_addition, 1)

    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    update_protocol()
    update_readme()
    SELF.unlink()


if __name__ == "__main__":
    main()
