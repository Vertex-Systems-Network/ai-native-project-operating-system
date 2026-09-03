from __future__ import annotations

import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERIFIER_PATH = ROOT / "scripts" / "verify_commercial_production.py"


def load_verifier():
    name = "verify_commercial_production"
    spec = importlib.util.spec_from_file_location(name, VERIFIER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class CommercialLaunchPackageTests(unittest.TestCase):
    def test_source_launch_checklist_is_fail_closed(self) -> None:
        data = json.loads((ROOT / "blueprints/commercial/production-launch-checklist.json").read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "inactive_blueprint")
        self.assertFalse(data["launch_authorized"])
        self.assertTrue(data["non_destructive_expiry"])
        for gate in data["required_gates"]:
            self.assertNotEqual(gate["status"], "verified")
            self.assertIsNone(gate["evidence"])

    def test_marketplace_compliance_baseline(self) -> None:
        data = json.loads((ROOT / "blueprints/commercial/github-marketplace-compliance.json").read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "operator_verification_required")
        self.assertEqual(data["activation_scope"], "vendor_marketplace_launch_only")
        self.assertEqual(data["source_checked_at"], "2026-09-04")
        self.assertGreaterEqual(len(data["official_sources"]), 5)
        self.assertTrue(all(url.startswith("https://docs.github.com/") for url in data["official_sources"]))

        paid = data["paid_github_app"]
        self.assertTrue(paid["must_be_organization_owned"])
        self.assertTrue(paid["listing_submitter_must_be_organization_owner"])
        self.assertTrue(paid["verified_publisher_required"])
        self.assertTrue(paid["financial_onboarding_required"])
        self.assertEqual(paid["minimum_installations_before_paid_listing"], 100)
        self.assertTrue(
            {
                "verified_organization_domain",
                "confirmed_contact_email",
                "organization_two_factor_authentication_required",
            }.issubset(set(paid["verified_publisher_prerequisites"]))
        )

        pricing = data["pricing"]
        self.assertEqual(pricing["maximum_plans"], 10)
        self.assertEqual(pricing["paid_plan_currency"], "USD")
        self.assertTrue(pricing["paid_plan_monthly_price_required"])
        self.assertTrue(pricing["paid_plan_annual_price_required"])
        self.assertTrue(pricing["repository_must_not_define_live_prices"])

        trial = data["free_trial_privacy"]
        self.assertEqual(trial["github_marketplace_trial_days_when_enabled_at_source_check"], 14)
        self.assertEqual(trial["cancelled_trial_private_customer_data_delete_within_days"], 30)
        self.assertTrue(trial["must_reverify_before_publication"])

    def test_marketplace_compliance_gates_are_required(self) -> None:
        data = json.loads((ROOT / "blueprints/commercial/production-launch-checklist.json").read_text(encoding="utf-8"))
        self.assertEqual(data["schema_version"], 2)
        gate_ids = {gate["id"] for gate in data["required_gates"]}
        expected = {
            "marketplace_publisher",
            "marketplace_installation_threshold",
            "marketplace_listing",
            "marketplace_listing_assets",
            "marketplace_plans",
            "customer_billing_experience",
            "free_trial_privacy",
            "real_marketplace_events",
            "reconciliation",
        }
        self.assertTrue(expected.issubset(gate_ids))

    def test_app_blueprint_has_least_privilege_archive_mode(self) -> None:
        data = json.loads((ROOT / "blueprints/commercial/github-app-manifest.example.json").read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "operator_configuration_required")
        self.assertFalse(data["recommended_defaults"]["public"])
        self.assertIn("marketplace_purchase", data["event_subscriptions"])
        archive = data["minimum_permissions_by_capability"]["archive_first_delivery"]
        self.assertEqual(archive, {"contents": "read", "metadata": "read"})
        self.assertNotIn("administration", archive)

    def test_vendor_launch_assets_are_classified_vendor_only(self) -> None:
        data = json.loads((ROOT / "config/licensing/vendor-source-boundary.json").read_text(encoding="utf-8"))
        paths = set(data["vendor_only_paths"])
        self.assertEqual(data["activation_scope"], "canonical_vendor_source_management_only")
        for expected in (
            "commercial-service",
            "blueprints/commercial/github-app-manifest.example.json",
            "blueprints/commercial/github-marketplace-compliance.json",
            "blueprints/commercial/legal-pack.template.md",
            "blueprints/commercial/marketplace-listing-draft.md",
            "blueprints/commercial/production-launch-checklist.json",
            "blueprints/commercial/vendor-launch-quality.yml",
            "scripts/verify_commercial_production.py",
            "scripts/validate_commercial_launch_package.py",
            "tests/test_commercial_launch_package.py",
        ):
            self.assertIn(expected, paths)

    def test_normalize_base_url_requires_https(self) -> None:
        verifier = load_verifier()
        self.assertEqual(verifier.normalize_base_url("https://example.com/"), "https://example.com")
        with self.assertRaises(verifier.VerificationError):
            verifier.normalize_base_url("http://example.com")
        with self.assertRaises(verifier.VerificationError):
            verifier.normalize_base_url("https://user:pass@example.com")
        with self.assertRaises(verifier.VerificationError):
            verifier.normalize_base_url("https://example.com/?token=secret")

    def test_secret_values_are_read_by_environment_variable_name(self) -> None:
        verifier = load_verifier()
        key = "ANPOS_TEST_SECRET_ENV"
        old = os.environ.get(key)
        try:
            os.environ[key] = "super-secret-value"
            self.assertEqual(verifier.read_secret_from_env(key), "super-secret-value")
            with self.assertRaises(verifier.VerificationError):
                verifier.read_secret_from_env("ANPOS_TEST_MISSING_SECRET_ENV")
        finally:
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old


if __name__ == "__main__":
    unittest.main()
