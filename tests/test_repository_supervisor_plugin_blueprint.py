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
        self.assertEqual(plugin["version"], "0.2.0")
        self.assertIn("ANPOS 1.4.0", plugin["description"])
        self.assertIn("Requirements 83–96", plugin["description"])

    def test_provider_contract_binds_anpos_14_assurance(self) -> None:
        contract = load("blueprints/plugins/anpos-repository-supervisor/contracts/repository-provider-contract.json")
        self.assertEqual(contract["schema_version"], 2)
        self.assertEqual(contract["anpos_protocol_baseline"], "1.4.0")
        names = {tool["name"] for tool in contract["tools"]}
        self.assertIn("repository_get_assurance", names)
        audit = next(tool for tool in contract["tools"] if tool["name"] == "repository_audit")
        self.assertIn("anpos_protocol_version", audit["required_outputs"])
        self.assertIn("assurance_state_summary", audit["required_outputs"])
        plan = next(tool for tool in contract["tools"] if tool["name"] == "repository_plan_anpos_change")
        self.assertIn("requirements_83_96_applicability", plan["required_outputs"])
        self.assertIn("evidence_preservation_plan", plan["required_outputs"])
        self.assertIn("upgrade_active", plan["modes"])

    def test_skill_preserves_assurance_evidence_on_upgrade(self) -> None:
        skill = (ROOT / "blueprints/plugins/anpos-repository-supervisor/skills/anpos-repository-supervisor/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Requirements 83–96", skill)
        self.assertIn("preserve verified evidence refs during upgrades/adoption", skill)
        self.assertIn("repository_plan_anpos_change", skill)
        self.assertIn("upgrade_active", skill)

    def test_mcp_endpoint_is_still_inert_blueprint(self) -> None:
        mcp = load("blueprints/plugins/anpos-repository-supervisor/mcp.json")
        server = mcp["mcpServers"]["anpos-repository-service"]
        self.assertEqual(server["url"], "https://replace-me.invalid/mcp")

    def test_plugin_assets_are_vendor_only(self) -> None:
        boundary = load("config/licensing/vendor-source-boundary.json")
        paths = set(boundary["vendor_only_paths"])
        self.assertIn("blueprints/plugins/anpos-repository-supervisor", paths)
        self.assertIn("tests/test_repository_supervisor_plugin_blueprint.py", paths)


if __name__ == "__main__":
    unittest.main()
