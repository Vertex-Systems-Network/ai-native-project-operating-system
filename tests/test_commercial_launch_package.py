from __future__ import annotations

import importlib.util
import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERIFIER_PATH = ROOT / "scripts" / "verify_commercial_production.py"


def load_verifier():
    spec = importlib.util.spec_from_file_location("verify_commercial_production", VERIFIER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
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

    def test_app_blueprint_has_least_privilege_archive_mode(self) -> None:
        data = json.loads((ROOT / "blueprints/commercial/github-app-manifest.example.json").read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "operator_configuration_required")
        self.assertFalse(data["recommended_defaults"]["public"])
        self.assertIn("marketplace_purchase", data["event_subscriptions"])
        archive = data["minimum_permissions_by_capability"]["archive_first_delivery"]
        self.assertEqual(archive, {"contents": "read", "metadata": "read"})
        self.assertNotIn("administration", archive)

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
