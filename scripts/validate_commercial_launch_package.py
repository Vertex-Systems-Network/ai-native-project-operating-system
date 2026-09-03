#!/usr/bin/env python3
"""Static validation for the ANPOS commercial production-launch package."""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

APP_BLUEPRINT = ROOT / "blueprints/commercial/github-app-manifest.example.json"
CHECKLIST = ROOT / "blueprints/commercial/production-launch-checklist.json"
LISTING = ROOT / "blueprints/commercial/marketplace-listing-draft.md"
LEGAL = ROOT / "blueprints/commercial/legal-pack.template.md"
VERIFIER = ROOT / "scripts/verify_commercial_production.py"
TESTS = ROOT / "tests/test_commercial_launch_package.py"
VENDOR_QUALITY = ROOT / "blueprints/commercial/vendor-launch-quality.yml"
CHILD_QUALITY = ROOT / "blueprints/github/workflows/repository-quality.yml"
BOUNDARY = ROOT / "config/licensing/vendor-source-boundary.json"


def fail(message: str) -> None:
    ERRORS.append(message)


def load_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"{path.relative_to(ROOT)} is not valid JSON: {exc}")
        return {}
    if not isinstance(data, dict):
        fail(f"{path.relative_to(ROOT)} must contain a JSON object")
        return {}
    return data


def require_text(path: Path, markers: tuple[str, ...]) -> str:
    if not path.is_file():
        fail(f"missing {path.relative_to(ROOT)}")
        return ""
    text = path.read_text(encoding="utf-8")
    for marker in markers:
        if marker not in text:
            fail(f"{path.relative_to(ROOT)} missing marker: {marker}")
    return text


def main() -> int:
    for path in (APP_BLUEPRINT, CHECKLIST, LISTING, LEGAL, VERIFIER, TESTS, VENDOR_QUALITY, BOUNDARY):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    app = load_json(APP_BLUEPRINT) if APP_BLUEPRINT.is_file() else {}
    if app.get("status") != "operator_configuration_required":
        fail("GitHub App blueprint must remain operator_configuration_required")
    if app.get("recommended_defaults", {}).get("public") is not False:
        fail("vendor GitHub App blueprint must default to private/non-public")
    events = app.get("event_subscriptions") or []
    if "marketplace_purchase" not in events:
        fail("GitHub App blueprint must subscribe to marketplace_purchase")
    permissions = app.get("minimum_permissions_by_capability") or {}
    archive = permissions.get("archive_first_delivery") or {}
    if archive.get("contents") != "read" or archive.get("metadata") != "read":
        fail("archive-first delivery must define contents/metadata read permissions")
    collaborator = permissions.get("optional_collaborator_provisioning") or {}
    if collaborator.get("administration") != "write":
        fail("optional collaborator provisioning must make administration write scope explicit")

    checklist = load_json(CHECKLIST) if CHECKLIST.is_file() else {}
    if checklist.get("status") != "inactive_blueprint":
        fail("production launch checklist must remain an inactive blueprint")
    if checklist.get("launch_authorized") is not False:
        fail("source launch checklist must never authorize production sales")
    if checklist.get("non_destructive_expiry") is not True:
        fail("launch checklist must preserve non-destructive expiry")
    gates = checklist.get("required_gates") or []
    gate_ids = {item.get("id") for item in gates if isinstance(item, dict)}
    required_ids = {
        "vendor_service_repo",
        "vendor_template_repo",
        "github_app",
        "app_installation",
        "marketplace_publisher",
        "marketplace_plans",
        "legal_pack",
        "vercel_production_env",
        "webhook_public_reachability",
        "ready_endpoint",
        "real_marketplace_events",
        "reconciliation",
        "archive_delivery",
        "seat_flows",
        "cancellation_safety",
        "backup_restore",
        "production_source_boundary",
    }
    missing = sorted(required_ids - gate_ids)
    if missing:
        fail(f"production launch checklist missing gates: {', '.join(missing)}")
    for item in gates:
        if not isinstance(item, dict):
            fail("every launch gate must be an object")
            continue
        if item.get("status") == "verified":
            fail(f"source blueprint must not pre-verify launch gate {item.get('id')}")
        if item.get("evidence") is not None:
            fail(f"source blueprint must not carry live launch evidence for {item.get('id')}")

    require_text(
        LISTING,
        (
            "Draft only",
            "Developer",
            "Pro",
            "Team",
            "Enterprise",
            "Repository files are never billing authority.",
            "Organization membership alone is not a licensed seat.",
            "No final price, legal promise, uptime SLA, tax treatment, refund right, or warranty is created by this draft.",
        ),
    )
    require_text(
        LEGAL,
        (
            "Template only — not legal advice",
            "Non-destructive expiry/cancellation",
            "Privacy Policy — template",
            "Refund / Cancellation Policy — template",
            "Support / SLA Policy — template",
            "LEGAL REVIEW REQUIRED",
            "OPERATOR REQUIRED",
        ),
    )

    verifier = require_text(
        VERIFIER,
        (
            '"/api/health"',
            '"/api/ready"',
            '"/v1/keys"',
            '"/v1/entitlements/current"',
            '"/v1/reconcile"',
            '"--require-ready"',
            '"--github-token-env"',
            '"--operator-token-env"',
            "--require-ready passes and real Marketplace E2E evidence is recorded.",
        ),
    )
    if verifier:
        try:
            ast.parse(verifier, filename=str(VERIFIER))
        except SyntaxError as exc:
            fail(f"production verifier is not valid Python: {exc}")
        forbidden = ("--github-token\"", "--operator-token\"", "print(github_token", "print(operator_token")
        for marker in forbidden:
            if marker in verifier:
                fail(f"production verifier must not accept/print raw secret CLI values: {marker}")

    tests = require_text(
        TESTS,
        (
            "test_source_launch_checklist_is_fail_closed",
            "test_app_blueprint_has_least_privilege_archive_mode",
            "test_normalize_base_url_requires_https",
            "test_secret_values_are_read_by_environment_variable_name",
        ),
    )
    if tests:
        try:
            ast.parse(tests, filename=str(TESTS))
        except SyntaxError as exc:
            fail(f"launch package tests are not valid Python: {exc}")

    vendor_quality = require_text(
        VENDOR_QUALITY,
        (
            "python scripts/validate_commercial_launch_package.py",
            "scripts/.trusted-base-commercial-launch-validator.py",
            "tests.test_commercial_launch_package",
        ),
    )
    child_quality = CHILD_QUALITY.read_text(encoding="utf-8") if CHILD_QUALITY.is_file() else ""
    if "validate_commercial_launch_package.py" in child_quality or "test_commercial_launch_package" in child_quality:
        fail("child repository-quality blueprint must not depend on vendor-only launch package files")

    boundary = load_json(BOUNDARY) if BOUNDARY.is_file() else {}
    if boundary.get("activation_scope") != "canonical_vendor_source_management_only":
        fail("vendor source boundary must remain canonical_vendor_source_management_only")
    vendor_only = set(boundary.get("vendor_only_paths") or [])
    required_vendor_only = {
        "commercial-service",
        "blueprints/commercial/github-app-manifest.example.json",
        "blueprints/commercial/legal-pack.template.md",
        "blueprints/commercial/marketplace-listing-draft.md",
        "blueprints/commercial/production-launch-checklist.json",
        "blueprints/commercial/vendor-launch-quality.yml",
        "scripts/export_vendor_repositories.py",
        "scripts/validate_vendor_repository_export.py",
        "scripts/validate_commercial_service.py",
        "scripts/validate_commercial_launch_package.py",
        "scripts/verify_commercial_production.py",
        "tests/test_vendor_repository_export.py",
        "tests/test_commercial_launch_package.py",
    }
    missing_vendor = sorted(required_vendor_only - vendor_only)
    if missing_vendor:
        fail(f"vendor source boundary missing paths: {', '.join(missing_vendor)}")

    if ERRORS:
        print("ANPOS commercial launch package validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS commercial launch package static checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
