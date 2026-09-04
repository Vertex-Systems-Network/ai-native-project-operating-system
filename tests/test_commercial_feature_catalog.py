from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CommercialFeatureCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = json.loads((ROOT / "config/licensing/product-catalog.json").read_text(encoding="utf-8"))
        self.features = json.loads((ROOT / "config/licensing/feature-catalog.json").read_text(encoding="utf-8"))

    def test_paid_plan_ids_remain_compatible(self) -> None:
        plan_ids = [plan["id"] for plan in self.catalog["plans"]]
        self.assertEqual(plan_ids, ["developer", "pro", "team", "enterprise"])

        community = self.catalog["free_acquisition_plan"]
        self.assertEqual(community["id"], "community")
        self.assertEqual(community["status"], "implemented_source_not_active")
        self.assertEqual(
            community["implementation_status"],
            "implemented_source_pending_real_marketplace_e2e_and_operator_activation",
        )
        self.assertEqual(community["capabilities"], ["community_repository_readiness_audit"])
        self.assertIsNone(community["marketplace_plan_id"])
        self.assertEqual(community["entitlements"], [])
        self.assertNotIn("community", plan_ids)

    def test_every_paid_entitlement_has_feature_truth(self) -> None:
        feature_rows = self.features["entitlements"]
        by_id = {row["id"]: row for row in feature_rows}
        self.assertEqual(len(by_id), len(feature_rows))

        for plan in self.catalog["plans"]:
            for entitlement in plan["entitlements"]:
                self.assertIn(entitlement, by_id, f"{plan['id']} entitlement {entitlement} lacks feature truth")
                self.assertTrue(by_id[entitlement].get("evidence"), f"{entitlement} must include evidence")

    def test_community_capability_is_implemented_source_but_not_external_launch_evidence(self) -> None:
        capabilities = {row["id"]: row for row in self.features["core_product_capabilities"]}
        community = capabilities["community_repository_readiness_audit"]
        self.assertEqual(community["availability"], "implemented_source_pending_external_activation")
        evidence = set(community["evidence"])
        self.assertIn("commercial-service/app/setup/github/route.ts", evidence)
        self.assertIn("commercial-service/app/api/auth/github/callback/route.ts", evidence)
        self.assertIn("commercial-service/app/api/v1/audit/repository/route.ts", evidence)
        self.assertIn("commercial-service/app/community/CommunityClient.tsx", evidence)
        self.assertIn("externally unlaunched", community["notes"])

    def test_draft_packages_expose_current_blockers(self) -> None:
        plans = {plan["id"]: plan for plan in self.catalog["plans"]}
        for plan in plans.values():
            self.assertEqual(plan["sale_status"], "draft")
            self.assertTrue(plan.get("commercial_readiness"))
            self.assertIsNone(plan["marketplace_plan_id"])
            self.assertIsNone(plan["monthly_price_usd"])
            self.assertIsNone(plan["annual_price_usd"])

        features = {row["id"]: row for row in self.features["entitlements"]}
        for entitlement in [
            "premium_blueprints",
            "premium_provider_adapters",
            "hosted_orchestrator_when_offered",
            "hosted_or_self_hosted_orchestrator_when_offered",
        ]:
            self.assertEqual(features[entitlement]["availability"], "planned_not_implemented")

        self.assertEqual(features["organization_team_features"]["availability"], "partial_implementation")
        self.assertEqual(features["commercial_support"]["availability"], "external_contract_required")
        self.assertEqual(features["priority_support_or_sla_when_contracted"]["availability"], "external_contract_required")

    def test_private_template_access_is_not_claimed_as_sufficient_premium_content(self) -> None:
        features = {row["id"]: row for row in self.features["entitlements"]}
        private_template = features["private_template_access"]
        self.assertEqual(private_template["availability"], "implemented_commercial_runtime")
        self.assertEqual(private_template["commercial_differentiator_status"], "insufficient_alone")


if __name__ == "__main__":
    unittest.main()
