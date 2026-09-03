#!/usr/bin/env python3
"""Temporary certification helper for ANPOS 1.3.4 bookkeeping; self-deletes."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "config" / "protocol" / "migrations.json"
README = ROOT / "README.md"


def update_migrations() -> None:
    data = json.loads(MIGRATIONS.read_text(encoding="utf-8"))
    migration_id = "ANPOS-1.3.3-to-1.3.4"
    if not any(item.get("id") == migration_id for item in data.get("applied_migrations", [])):
        data.setdefault("applied_migrations", []).append(
            {
                "id": migration_id,
                "from_version": "1.3.3",
                "to_version": "1.3.4",
                "detected_at": "2026-09-04T00:00:00+05:00",
                "impact": [
                    "Add a vendor-only machine-readable GitHub Marketplace compliance baseline checked against official GitHub documentation on 2026-09-04 and require re-verification before submission",
                    "Record the current paid GitHub App baseline that the app is organization-owned, an organization owner controls listing submission, publisher verification prerequisites include verified domain/contact email/organization 2FA, and financial onboarding is required",
                    "Record the current paid-listing minimum of 100 GitHub App installations as an external evidence gate rather than invented repository state",
                    "Record Marketplace listing requirements for contact information, relevant description, pricing, privacy/support/working links, integration value beyond authentication, public availability, plan-change/cancellation webhook configuration, logo, feature card and screenshots",
                    "Record paid-plan constraints including monthly and annual USD pricing, maximum 10 plans, supported flat-rate/per-unit models, and no repository-defined live prices",
                    "Require customer-facing billing visibility for current plan/price, purchase/change/cancellation/trial state, billing cycle and usage/remaining resources where applicable",
                    "Record the 2026-09-04 Marketplace free-trial baseline of 14 days and deletion of private customer data within 30 days after a cancelled trial, with mandatory re-verification before publication",
                    "Expand the fail-closed production checklist, listing draft, legal template, unit tests and launch validator around these current Marketplace requirements",
                    "Keep all Marketplace compliance assets vendor-only and preserve core child-project execution without billing, legal, listing, or launch dependencies"
                ],
                "project_conflicts": [],
                "requires_owner_consent": False,
                "child_migration_rule": "Existing child projects do not need GitHub Marketplace listing/compliance assets. New child initialization and customer-facing commercial-template export strip these vendor-only files through config/licensing/vendor-source-boundary.json. Do not introduce Marketplace billing, legal, trial-retention, listing, or launch dependencies into normal child execution merely by adopting ANPOS 1.3.4.",
                "status": "applied",
                "applied_at": "2026-09-04T00:00:00+05:00",
                "verification_evidence": [
                    "blueprints/commercial/github-marketplace-compliance.json records official docs.github.com sources and source_checked_at=2026-09-04",
                    "Production launch checklist remains launch_authorized=false and all new Marketplace gates remain unverified without external evidence",
                    "Launch validator and unit tests enforce publisher, installation-threshold, listing, pricing, billing-UX and trial-privacy baseline fields",
                    "config/licensing/vendor-source-boundary.json classifies the Marketplace compliance baseline as vendor-only",
                    "Customer-template deterministic export must exclude every vendor-only path including the Marketplace compliance baseline",
                    "Full ANPOS/commercial/vendor certification must pass before this migration is promoted to canonical main"
                ]
            }
        )
    data["current_protocol_version"] = "1.3.4"
    template = data.setdefault("migration_record_template", {})
    template["id"] = "ANPOS-1.3.4-to-NEXT"
    template["from_version"] = "1.3.4"
    MIGRATIONS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")


def update_readme() -> None:
    text = README.read_text(encoding="utf-8")
    heading = "## GitHub Marketplace compliance hardening in 1.3.4"
    if heading not in text:
        marker = "## Repository hygiene"
        if marker not in text:
            raise SystemExit("README insertion marker not found")
        section = """## GitHub Marketplace compliance hardening in 1.3.4

ANPOS now includes a vendor-only, machine-readable GitHub Marketplace compliance baseline checked against official GitHub documentation on **2026-09-04**. It records current paid GitHub App publication prerequisites such as organization ownership and organization-owner listing control, verified-publisher prerequisites, financial onboarding, the documented minimum of 100 installations for a paid listing, listing/support/privacy/assets requirements, monthly and annual USD paid-plan pricing, customer billing-state visibility, and the current Marketplace free-trial/private-data-retention baseline.

These values are **not launch evidence** and GitHub can change Marketplace requirements. `blueprints/commercial/github-marketplace-compliance.json` must therefore be re-verified against official GitHub documentation immediately before listing submission. The production checklist remains fail-closed: it cannot infer installation count, publisher verification, financial approval, prices/plan IDs, listing approval, customer billing UX, trial-data deletion evidence, or production readiness from repository files.

Marketplace compliance assets remain inside the vendor/operator source boundary and are stripped from normal child repositories and customer-facing `anpos-commercial-template` exports. ANPOS core child development continues without a Marketplace or billing runtime dependency.

"""
        text = text.replace(marker, section + marker, 1)
        README.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    update_migrations()
    update_readme()
    Path(__file__).unlink()


if __name__ == "__main__":
    main()
