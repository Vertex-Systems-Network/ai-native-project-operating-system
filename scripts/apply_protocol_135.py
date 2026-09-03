#!/usr/bin/env python3
"""Temporary certification helper for ANPOS 1.3.5 bookkeeping; self-deletes."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "config/protocol/migrations.json"
CHECKLIST = ROOT / "blueprints/commercial/production-launch-checklist.json"
README = ROOT / "README.md"


def update_migrations() -> None:
    data = json.loads(MIGRATIONS.read_text(encoding="utf-8"))
    migration_id = "ANPOS-1.3.4-to-1.3.5"
    if not any(item.get("id") == migration_id for item in data.get("applied_migrations", [])):
        data.setdefault("applied_migrations", []).append(
            {
                "id": migration_id,
                "from_version": "1.3.4",
                "to_version": "1.3.5",
                "detected_at": "2026-09-04T00:30:00+05:00",
                "impact": [
                    "Add a vendor-only fail-closed free-first-to-paid GitHub Marketplace staged publication strategy sourced from official GitHub documentation checked on 2026-09-04",
                    "Recommend a genuine free Marketplace listing as a compliant installation-acquisition path while paid-listing eligibility evidence is missing, without making the recommendation mandatory",
                    "Require real GitHub-integrated user value beyond authentication, general listing compliance, public availability and purchase/cancellation event handling before any free listing",
                    "Keep the free plan definition operator-controlled with no repository-invented catalog plan ID, Marketplace plan ID or entitlement set",
                    "Preserve the existing Developer/Pro/Team/Enterprise paid draft catalog unchanged and explicitly prohibit this strategy from silently creating a Community/free product tier",
                    "Record that current GitHub documentation allows paid plans to be added to an existing free listing after paid requirements, verified publisher and financial onboarding are satisfied",
                    "Keep the current 100-install paid GitHub App threshold as real external evidence and prohibit artificial/deceptive installation generation",
                    "Add dedicated staged-launch validation/tests and route them only through the vendor source-quality boundary",
                    "Keep staged Marketplace assets excluded from normal child repositories and customer-facing commercial-template exports"
                ],
                "project_conflicts": [],
                "requires_owner_consent": False,
                "child_migration_rule": "Existing child projects do not need Marketplace staged-publication strategy, tests, or validators. New child initialization and customer-facing commercial-template export strip these vendor-only files through config/licensing/vendor-source-boundary.json. ANPOS 1.3.5 must not introduce a free plan, Marketplace acquisition logic, billing, listing, or paid-conversion dependency into normal child execution.",
                "status": "applied",
                "applied_at": "2026-09-04T00:30:00+05:00",
                "verification_evidence": [
                    "marketplace-staged-launch.json records official docs.github.com sources and source_checked_at=2026-09-04",
                    "Free plan definition remains operator_decision_required with null catalog/Marketplace IDs and an empty entitlement list",
                    "Existing product-catalog plan IDs remain developer/pro/team/enterprise with no free/community tier introduced by this patch",
                    "Production launch checklist remains launch_authorized=false and references the staged route only as an operator-overridable recommendation",
                    "Dedicated staged-launch validator rejects automatic paid conversion, repository-authorized paid conversion and staged-plan mutation of the paid catalog",
                    "Full ANPOS/commercial/vendor certification must pass before this migration is promoted to canonical main"
                ]
            }
        )
    data["current_protocol_version"] = "1.3.5"
    template = data.setdefault("migration_record_template", {})
    template["id"] = "ANPOS-1.3.5-to-NEXT"
    template["from_version"] = "1.3.5"
    MIGRATIONS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")


def normalize_checklist() -> None:
    data = json.loads(CHECKLIST.read_text(encoding="utf-8"))
    data["schema_version"] = 2
    CHECKLIST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")


def update_readme() -> None:
    text = README.read_text(encoding="utf-8")
    heading = "## Marketplace staged publication in 1.3.5"
    if heading not in text:
        marker = "## Repository hygiene"
        if marker not in text:
            raise SystemExit("README insertion marker not found")
        section = """## Marketplace staged publication in 1.3.5

GitHub's current Marketplace documentation allows a free app/listing to be published after the general listing requirements are met, while the current 100-install minimum applies to publishing a paid GitHub App plan. ANPOS therefore includes an inactive vendor-only `marketplace-staged-launch.json` strategy that recommends **free-first → genuine installations/evidence → verified paid conversion** while paid eligibility is missing.

The staged strategy is intentionally fail-closed. It does not invent a Community/free plan, Marketplace plan ID, or free entitlements; it does not alter the draft Developer/Pro/Team/Enterprise catalog; and it cannot authorize automatic paid conversion. A free offering must first have operator-approved real user value beyond authentication, complete general Marketplace listing/privacy/support/assets requirements, and pass real purchase/cancellation webhook tests. Once current paid requirements are genuinely met, GitHub's current documentation supports adding paid plans to an already-published free listing after verified-publisher and financial onboarding requirements are satisfied.

Installation thresholds and Marketplace rules can change, so official GitHub documentation must be re-checked before free submission and paid conversion. Artificial, purchased, deceptive, or otherwise non-genuine installations are explicitly outside the strategy.

"""
        text = text.replace(marker, section + marker, 1)
        README.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    update_migrations()
    normalize_checklist()
    update_readme()
    Path(__file__).unlink()


if __name__ == "__main__":
    main()
