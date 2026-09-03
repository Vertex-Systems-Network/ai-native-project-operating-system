from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "render_operator_launch_bootstrap.py"


def load_renderer():
    name = "render_operator_launch_bootstrap"
    spec = importlib.util.spec_from_file_location(name, SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class OperatorLaunchBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.renderer = load_renderer()
        self.inputs = self.renderer.Inputs(
            organization="Vertex-Systems-Network",
            service_base_url="https://license.example.test",
            homepage_url="https://example.test/anpos",
            marketplace_app_name="ANPOS Marketplace Test",
            vendor_app_name="ANPOS Vendor Test",
            collaborator_provisioning=False,
        )

    def query(self, url: str) -> dict[str, list[str]]:
        return urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)

    def test_marketplace_registration_is_public_and_vendor_permission_free(self) -> None:
        data = self.renderer.render(self.inputs)
        marketplace = data["github_apps"]["marketplace"]
        query = self.query(marketplace["registration_url"])
        self.assertTrue(marketplace["public"])
        self.assertEqual(query["public"], ["true"])
        self.assertEqual(query["webhook_active"], ["true"])
        self.assertEqual(query["events[]"], ["marketplace_purchase"])
        self.assertEqual(
            query["webhook_url"],
            ["https://license.example.test/api/webhooks/github/marketplace"],
        )
        self.assertNotIn("administration", query)
        self.assertNotIn("contents", query)

    def test_vendor_registration_is_private_archive_only_by_default(self) -> None:
        data = self.renderer.render(self.inputs)
        vendor = data["github_apps"]["vendor_distribution"]
        query = self.query(vendor["registration_url"])
        self.assertFalse(vendor["public"])
        self.assertEqual(query["public"], ["false"])
        self.assertEqual(query["webhook_active"], ["false"])
        self.assertEqual(query["contents"], ["read"])
        self.assertNotIn("administration", query)
        self.assertEqual(vendor["permissions"], {"contents": "read", "metadata": "read"})

    def test_collaborator_mode_explicitly_adds_administration_write(self) -> None:
        inputs = self.renderer.Inputs(**{**self.inputs.__dict__, "collaborator_provisioning": True})
        data = self.renderer.render(inputs)
        vendor = data["github_apps"]["vendor_distribution"]
        query = self.query(vendor["registration_url"])
        self.assertEqual(query["administration"], ["write"])
        self.assertEqual(vendor["permissions"]["administration"], "write")

    def test_split_environment_contract_and_legacy_rejection_are_explicit(self) -> None:
        data = self.renderer.render(self.inputs)
        marketplace_keys = set(data["github_apps"]["marketplace"]["environment_keys"])
        vendor_keys = set(data["github_apps"]["vendor_distribution"]["environment_keys"])
        self.assertIn("GITHUB_MARKETPLACE_APP_ID", marketplace_keys)
        self.assertIn("GITHUB_MARKETPLACE_APP_PRIVATE_KEY", marketplace_keys)
        self.assertIn("GITHUB_VENDOR_APP_ID", vendor_keys)
        self.assertIn("GITHUB_VENDOR_APP_PRIVATE_KEY", vendor_keys)
        self.assertEqual(
            data["legacy_single_app_environment_keys_forbidden"],
            ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"],
        )
        self.assertFalse(data["launch_authorized"])

    def test_artifact_identity_and_verifier_args_are_package_derived(self) -> None:
        data = self.renderer.render(self.inputs)
        package = json.loads((ROOT / "commercial-service/package.json").read_text(encoding="utf-8"))
        protocol = json.loads((ROOT / "config/protocol/version.json").read_text(encoding="utf-8"))
        expected = {
            "service": package["name"],
            "service_version": package["version"],
            "source_protocol_version": package["anpos"]["source_protocol_version"],
            "runtime_contract": package["anpos"]["runtime_contract"],
        }
        self.assertEqual(data["schema_version"], 2)
        self.assertEqual(data["artifact_identity"], expected)
        self.assertEqual(expected["source_protocol_version"], protocol["version"])
        self.assertEqual(
            data["production_verifier_arguments"],
            [
                "--require-ready",
                "--expected-service-version",
                package["version"],
                "--expected-protocol-version",
                protocol["version"],
            ],
        )
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn('"0.3.0"', source)
        self.assertNotIn('"0.3.1"', source)

    def test_artifact_identity_fails_closed_on_package_protocol_mismatch(self) -> None:
        import tempfile

        package = json.loads((ROOT / "commercial-service/package.json").read_text(encoding="utf-8"))
        protocol = json.loads((ROOT / "config/protocol/version.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            package_path = Path(tmp) / "package.json"
            protocol_path = Path(tmp) / "version.json"
            package["anpos"]["source_protocol_version"] = "9.9.9"
            package_path.write_text(json.dumps(package), encoding="utf-8")
            protocol_path.write_text(json.dumps(protocol), encoding="utf-8")
            with self.assertRaisesRegex(self.renderer.BootstrapError, "does not match canonical protocol"):
                self.renderer.load_artifact_identity(package_path, protocol_path)

    def test_renderer_rejects_non_https_and_credential_bearing_urls(self) -> None:
        with self.assertRaises(self.renderer.BootstrapError):
            self.renderer.normalize_https_url("http://example.test", "service base URL")
        with self.assertRaises(self.renderer.BootstrapError):
            self.renderer.normalize_https_url("https://user:pass@example.test", "homepage URL")
        with self.assertRaises(self.renderer.BootstrapError):
            self.renderer.normalize_https_url("https://example.test/path?secret=value", "homepage URL")

    def test_cli_output_contains_no_secret_values_or_secret_cli_flags(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--organization",
                "Vertex-Systems-Network",
                "--service-base-url",
                "https://license.example.test",
                "--homepage-url",
                "https://example.test/anpos",
            ],
            cwd=ROOT,
            check=True,
            text=True,
            capture_output=True,
        )
        data = json.loads(result.stdout)
        serialized = json.dumps(data, sort_keys=True)
        self.assertNotIn("BEGIN PRIVATE KEY", serialized)
        self.assertNotIn("github_pat_", serialized)
        self.assertNotIn("ghp_", serialized)
        source = SCRIPT.read_text(encoding="utf-8")
        for forbidden in ("--private-key", "--webhook-secret", "--database-url", "--operator-token"):
            self.assertNotIn(forbidden, source)

    def test_invalid_organization_and_newline_app_names_fail(self) -> None:
        with self.assertRaises(self.renderer.BootstrapError):
            self.renderer.validate_org("bad/org")
        with self.assertRaises(self.renderer.BootstrapError):
            self.renderer.validate_app_name("bad\nname", "App name")


if __name__ == "__main__":
    unittest.main()
