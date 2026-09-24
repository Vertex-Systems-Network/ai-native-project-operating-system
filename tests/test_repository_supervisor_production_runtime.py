from __future__ import annotations

import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class RepositorySupervisorProductionRuntimeTests(unittest.TestCase):
    def test_execution_sandbox_policy_is_source_ready_but_live_gateway_pending(self) -> None:
        schema = load("schemas/execution-sandbox.schema.json")
        policy = load("config/runtime/execution-sandbox.json")
        Draft202012Validator(schema).validate(policy)
        self.assertEqual(policy["schema_version"], 2)
        self.assertEqual(policy["status"], "production_driver_source_implemented_live_gateway_evidence_pending")
        driver = policy["production_driver"]
        self.assertTrue(driver["source_ready"])
        self.assertEqual(driver["live_gateway_evidence"], "pending")
        self.assertEqual(driver["workspace_source_binding"], "github_repository_full_name_plus_immutable_commit_sha")
        self.assertTrue(driver["workspace_destroy_after_execution"])
        self.assertEqual(policy["network"]["default"], "deny")
        self.assertFalse(policy["local_process_fallback"])

    def test_live_e2e_contract_is_schema_valid_and_evidence_is_not_invented(self) -> None:
        schema = load("schemas/repository-supervisor-e2e.schema.json")
        contract = load("config/runtime/repository-supervisor-e2e.json")
        Draft202012Validator(schema).validate(contract)
        self.assertEqual(
            [row["id"] for row in contract["modes"]],
            ["read", "write_prepare", "write_verify_merge"],
        )
        self.assertFalse(next(row for row in contract["modes"] if row["id"] == "write_verify_merge")["busy_wait"])
        evidence = contract["live_evidence"]
        self.assertEqual(evidence["status"], "pending")
        for key in ("service_origin", "repository", "read_receipt", "write_receipt", "verified_at"):
            self.assertIsNone(evidence[key])

    def test_commercial_role_routes_sandbox_and_e2e_assets(self) -> None:
        role = set(load(".ai/manifest.json")["roles"]["commercial_distribution"])
        for path in [
            "commercial-service/lib/remote-sandbox-driver.ts",
            "commercial-service/app/api/ready/sandbox/route.ts",
            "commercial-service/scripts/verify-repository-supervisor-e2e.ts",
            "commercial-service/tests/remote-sandbox-driver.test.ts",
            "config/runtime/repository-supervisor-e2e.json",
            "schemas/repository-supervisor-e2e.schema.json",
        ]:
            self.assertIn(path, role)


if __name__ == "__main__":
    unittest.main()
