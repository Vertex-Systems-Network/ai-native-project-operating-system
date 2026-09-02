from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import anpos_guard
import consent_guard
from coordination_mutation import validate_queue_transitions


class ControlPlaneGuardTests(unittest.TestCase):
    def agent(self, capabilities=None, allowed_paths=None):
        return {
            "id": "worker-1",
            "provider": "test",
            "roles": ["worker"],
            "capabilities": capabilities or ["repository_write"],
            "permissions": {
                "allowed_paths": allowed_paths or ["src/**"],
                "denied_paths": ["config/security/**"],
            },
        }

    def base_slot(self):
        return {
            "id": "SLOT-1",
            "work_unit_id": "WU-1",
            "eligibility": ["ANY"],
            "required_roles": ["worker"],
            "required_capabilities": ["repository_write"],
            "allowed_paths": ["src/auth/**"],
            "acceptance_criteria": ["works"],
            "required_checks": ["tests"],
            "base_sha": "a" * 40,
        }

    def test_supervisor_only_slot_rejects_worker(self):
        slot = self.base_slot()
        slot["eligibility"] = ["SUPERVISOR_ONLY"]
        with patch.object(anpos_guard, "require_verified_agent", return_value=self.agent()):
            with self.assertRaises(PermissionError):
                anpos_guard.authorize_slot_claim(slot, "worker-1", "worker")

    def test_missing_capability_rejected(self):
        slot = self.base_slot()
        slot["required_capabilities"] = ["security_review"]
        with patch.object(anpos_guard, "require_verified_agent", return_value=self.agent()):
            with self.assertRaises(PermissionError):
                anpos_guard.authorize_slot_claim(slot, "worker-1", "worker")

    def test_path_permission_violation_rejected(self):
        slot = self.base_slot()
        slot["allowed_paths"] = ["config/security/**"]
        with self.assertRaises(PermissionError):
            anpos_guard.authorize_slot_paths(slot, self.agent())

    def test_incomplete_handoff_rejected(self):
        slot = self.base_slot()
        slot["required_checks"] = []
        with self.assertRaises(ValueError):
            anpos_guard.validate_handoff(slot)


class CoordinationMutationTests(unittest.TestCase):
    def test_illegal_transition_rejected(self):
        old = {"slots": [{"id": "S1", "status": "free"}]}
        new = {"slots": [{"id": "S1", "status": "completed"}]}
        with self.assertRaises(PermissionError):
            validate_queue_transitions(old, new)

    def test_active_claim_identity_cannot_silently_change(self):
        old = {"slots": [{
            "id": "S1", "status": "in_progress", "claimant": "a", "claim_id": "1",
            "coordination_epoch": 1, "fencing_token": "f",
        }]}
        new = copy.deepcopy(old)
        new["slots"][0]["claimant"] = "b"
        with self.assertRaises(PermissionError):
            validate_queue_transitions(old, new)


class ConsentIntegrityTests(unittest.TestCase):
    def record(self):
        return {
            "id": "CONSENT-000001",
            "type": "material_change",
            "title": "Upgrade",
            "summary": "Upgrade A",
            "proposed_changes": ["A"],
            "affected_modules": ["M1"],
            "risk": "medium",
            "owner_identity": "owner",
            "requested_at": "2026-09-03T00:00:00+00:00",
            "expires_at": "2026-09-04T00:00:00+00:00",
            "nonce": "nonce-1234567890",
        }

    def test_changed_request_changes_hash(self):
        first = self.record()
        second = copy.deepcopy(first)
        second["summary"] = "Upgrade B"
        self.assertNotEqual(consent_guard.request_hash(first), consent_guard.request_hash(second))

    def test_changed_nonce_changes_hash(self):
        first = self.record()
        second = copy.deepcopy(first)
        second["nonce"] = "nonce-different"
        self.assertNotEqual(consent_guard.request_hash(first), consent_guard.request_hash(second))


class TemplatePolicyTests(unittest.TestCase):
    def test_conformance_manifest_has_required_scenarios(self):
        doc = json.loads((ROOT / "config/testing/conformance-scenarios.json").read_text())
        names = {row["name"] for row in doc["scenarios"]}
        required = {
            "two_workers_same_slot", "unauthorized_worker_restricted_slot", "stale_fencing_token",
            "orphan_claim_ref", "supervisor_crash_failover", "duplicate_event_replay",
            "malicious_external_instruction", "consent_expiry_replay_or_hash_mismatch",
            "control_plane_validator_tampering", "agent_budget_retry_loop",
        }
        self.assertTrue(required.issubset(names))

    def test_source_has_no_live_agent_selection(self):
        catalog = json.loads((ROOT / "config/ai/agent-catalog.json").read_text())
        self.assertEqual(catalog.get("selected_agents"), [])


if __name__ == "__main__":
    unittest.main()
