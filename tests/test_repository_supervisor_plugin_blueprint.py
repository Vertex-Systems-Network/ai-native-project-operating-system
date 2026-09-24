from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class RepositorySupervisorPluginBlueprintTests(unittest.TestCase):
    def test_plugin_identity_is_anpos_14_aware(self) -> None:
        plugin = load("blueprints/plugins/anpos-repository-supervisor/plugin.json")
        self.assertEqual(plugin["name"], "anpos-repository-supervisor")
        self.assertEqual(plugin["version"], "0.4.1")
        self.assertIn("ANPOS 1.4.0", plugin["description"])
        self.assertIn("Requirements 83–96", plugin["description"])

    def test_provider_contract_binds_anpos_14_assurance(self) -> None:
        contract = load("blueprints/plugins/anpos-repository-supervisor/contracts/repository-provider-contract.json")
        self.assertEqual(contract["schema_version"], 4)
        self.assertEqual(contract["anpos_protocol_baseline"], "1.4.0")
        names = {tool["name"] for tool in contract["tools"]}
        self.assertIn("repository_get_assurance", names)
        audit = next(tool for tool in contract["tools"] if tool["name"] == "repository_audit")
        self.assertIn("anpos_protocol_version", audit["required_outputs"])
        self.assertIn("assurance_state_summary", audit["required_outputs"])
        plan = next(tool for tool in contract["tools"] if tool["name"] == "repository_plan_anpos_change")
        self.assertEqual(plan["source_implemented_modes"], ["bounded_change"])
        self.assertIn("plan_hash", plan["required_outputs"])
        self.assertIn("changes", plan["required_outputs"])
        self.assertIn("upgrade_active", plan["planned_modes"])
        self.assertIn(
            "full_anpos_bootstrap_adoption_upgrade_plan_generator",
            contract["implementation"]["not_yet_implemented"],
        )

    def test_skill_preserves_assurance_evidence_on_upgrade(self) -> None:
        skill = (ROOT / "blueprints/plugins/anpos-repository-supervisor/skills/anpos-repository-supervisor/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Requirements 83–96", skill)
        self.assertIn("preserve verified evidence refs during upgrades/adoption", skill)
        self.assertIn("repository_plan_anpos_change", skill)
        self.assertIn("upgrade_active", skill)

    def test_mcp_blueprint_remains_placeholder_while_runtime_source_is_implemented(self) -> None:
        mcp = load("blueprints/plugins/anpos-repository-supervisor/mcp.json")
        server = mcp["mcpServers"]["anpos-repository-service"]
        self.assertEqual(server["url"], "https://replace-me.invalid/mcp")
        contract = load("blueprints/plugins/anpos-repository-supervisor/contracts/repository-provider-contract.json")
        implementation = contract["implementation"]
        self.assertNotIn("supervisor_specific_oauth_and_mcp_transport", implementation["not_yet_implemented"])
        for marker in [
            "github_backed_mcp_oauth_2_1_authorization_code_pkce",
            "stateless_streamable_http_post_mcp_transport",
            "openai_compatible_authenticated_profile_tool",
        ]:
            self.assertIn(marker, implementation["implemented_support"])
        transport = contract["mcp_transport"]
        self.assertEqual(transport["issued_scopes"], ["anpos:profile", "anpos:repo:read", "anpos:repo:write"])
        self.assertTrue(transport["write_scope_available"])
        self.assertEqual(transport["github_app_role"], "dedicated_repository_supervisor_app")
        for tool in [
            "repository_plan_anpos_change", "repository_apply_anpos_change",
            "repository_open_change_request", "repository_get_change_request",
            "repository_get_ci", "repository_merge_change_request",
        ]:
            self.assertIn(tool, implementation["implemented_tools"])
        self.assertIn("full_anpos_bootstrap_adoption_upgrade_plan_generator", implementation["not_yet_implemented"])
        self.assertNotIn("production_sandbox_driver", implementation["not_yet_implemented"])
        self.assertIn("live_production_sandbox_gateway_evidence", implementation["not_yet_implemented"])
        self.assertIn("live_github_repository_supervisor_read_e2e_receipt", implementation["not_yet_implemented"])
        self.assertIn("live_github_repository_supervisor_write_e2e_receipt", implementation["not_yet_implemented"])
        sandbox = contract["production_sandbox"]
        self.assertEqual(sandbox["isolation"], "remote_ephemeral")
        self.assertEqual(sandbox["network"], "deny")
        self.assertTrue(sandbox["destroy_after_execution"])
        self.assertEqual(sandbox["live_gateway_evidence"], "pending")
        e2e = contract["github_runtime_e2e"]
        self.assertEqual(e2e["modes"], ["read", "write_prepare", "write_verify_merge"])
        self.assertFalse(e2e["busy_wait"])
        self.assertEqual(e2e["live_read_receipt"], "pending")
        self.assertEqual(e2e["live_write_receipt"], "pending")

    def test_plugin_assets_are_vendor_only(self) -> None:
        boundary = load("config/licensing/vendor-source-boundary.json")
        paths = set(boundary["vendor_only_paths"])
        self.assertIn("blueprints/plugins/anpos-repository-supervisor", paths)
        self.assertIn("tests/test_repository_supervisor_plugin_blueprint.py", paths)


if __name__ == "__main__":
    unittest.main()
