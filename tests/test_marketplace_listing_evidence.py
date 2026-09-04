from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class MarketplaceListingEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = json.loads((ROOT / "config/licensing/marketplace-listing-evidence.json").read_text(encoding="utf-8"))

    def test_listing_evidence_is_separate_from_requirements_blueprint(self) -> None:
        self.assertEqual(self.data["status"], "pending_external_assets_and_urls")
        self.assertEqual(
            self.data["requirements_authority"],
            "blueprints/commercial/github-marketplace-compliance.json",
        )

    def test_all_external_evidence_starts_pending(self) -> None:
        items = self.data["evidence_items"]
        expected = {
            "homepage", "privacy_policy", "support", "terms", "publisher_contact",
            "logo", "feature_card", "screenshots", "public_app_installability", "marketplace_webhook",
        }
        self.assertEqual(set(items), expected)
        for row in items.values():
            self.assertEqual(row["status"], "pending")

    def test_listing_cannot_be_claimed_ready_without_real_evidence(self) -> None:
        gate = self.data["submission_gate"]
        self.assertFalse(gate["listing_evidence_complete"])
        serialized = json.dumps(self.data).lower()
        self.assertNotIn("example.com", serialized)
        self.assertNotIn("placeholder", serialized)


if __name__ == "__main__":
    unittest.main()
