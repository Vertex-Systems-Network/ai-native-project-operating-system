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
        self.assertEqual(policy["schema_version"], 4)
        self.assertEqual(policy["status"], "vercel_gateway_source_implemented_live_gateway_evidence_pending")
        driver = policy["production_driver"]
        self.assertTrue(driver["source_ready"])
        self.assertEqual(driver["live_gateway_evidence"], "pending")
        self.assertEqual(driver["protocol_version"], 2)
        self.assertEqual(driver["workspace_source_binding"], "github_repository_full_name_plus_immutable_commit_sha_or_explicit_empty")
        self.assertEqual(driver["artifact_channel"], "signed_bounded_input_files_plus_exact_output_allowlist")
        self.assertEqual(driver["runtime_requirements"], ["python3>=3.12"])
        self.assertEqual(driver["gateway_source"], "commercial-service/lib/vercel-sandbox-gateway.ts")
        self.assertEqual(driver["gateway_route"], "/v1/execute")
        self.assertEqual(driver["gateway_runtime"], "vercel_sandbox_python3.13")
        self.assertEqual(driver["gateway_network_policy"], "deny-all")
        self.assertEqual(driver["gateway_replay_ledger"], "sandbox_gateway_request_nonces")
        self.assertEqual(driver["gateway_live_execution_timeout_seconds"], 240)
        self.assertEqual(driver["gateway_function_max_duration_seconds"], 300)
        self.assertEqual(driver["gateway_workspace_base_modes_live"], ["empty"])
        self.assertFalse(driver["environment_variable_forwarding_live"])
        self.assertTrue(driver["workspace_destroy_after_execution"])
        self.assertEqual(policy["network"]["default"], "deny")
        self.assertFalse(policy["local_process_fallback"])

    def test_full_apply_policy_requires_conflict_free_token_isolation_and_receipt(self) -> None:
        schema = load("schemas/repository-supervisor-planner.schema.json")
        policy = load("config/runtime/repository-supervisor-planner.json")
        Draft202012Validator(schema).validate(policy)
        self.assertEqual(policy["schema_version"], 4)
        apply = policy["apply_runtime"]
        self.assertEqual(apply["sandbox_protocol_version"], 2)
        self.assertTrue(apply["conflict_free_required"])
        self.assertEqual(apply["bootstrap_empty"], "guarded_root_seed_then_feature_branch_pr_v1")
        self.assertIn("bootstrap_empty", apply["eligible_modes"])
        self.assertEqual(apply["empty_repository_direct_default_branch_exception"], "single_verified_zero_parent_seed_only")
        self.assertEqual(apply["empty_repository_seed_path"], ".anpos-bootstrap-seed")
        self.assertTrue(apply["empty_repository_seed_removed_on_feature_branch"])
        self.assertTrue(apply["empty_repository_explicit_confirmation_required"])
        self.assertEqual(apply["conflict_resolution"], "explicit_resolved_plan_v1")
        self.assertTrue(apply["conflict_resolution_requires_exact_source_plan_hash"])
        self.assertTrue(apply["conflict_resolution_requires_exact_target_git_object"])
        self.assertTrue(apply["migration_review_use_release_requires_acknowledgement"])
        self.assertTrue(apply["resolved_plan_is_new_immutable_plan"])
        self.assertEqual(apply["empty_repository_recovery_after_seed_failure"], "apply_recovery_required")
        self.assertFalse(apply["customer_provider_token_forwarded_to_sandbox"])
        self.assertTrue(apply["merge_requires_sandbox_receipt"])

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
            "commercial-service/lib/repository-supervisor-full-apply.ts",
            "commercial-service/lib/full-plan-sandbox-runner.ts",
            "commercial-service/migrations/005_repository_supervisor_full_apply.sql",
            "commercial-service/migrations/006_guarded_empty_repository_initialization.sql",
            "commercial-service/migrations/007_vercel_sandbox_gateway_replay.sql",
            "commercial-service/lib/vercel-sandbox-gateway.ts",
            "commercial-service/app/v1/execute/route.ts",
            "commercial-service/tests/vercel-sandbox-gateway.test.ts",
            "commercial-service/tests/repository-supervisor-full-apply.test.ts",
            "commercial-service/app/api/ready/sandbox/route.ts",
            "commercial-service/scripts/verify-repository-supervisor-e2e.ts",
            "commercial-service/tests/remote-sandbox-driver.test.ts",
            "config/runtime/repository-supervisor-e2e.json",
            "schemas/repository-supervisor-e2e.schema.json",
        ]:
            self.assertIn(path, role)


if __name__ == "__main__":
    unittest.main()
