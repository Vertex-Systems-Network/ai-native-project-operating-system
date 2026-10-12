from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import plan_to_slots  # noqa: E402

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - validator dependency is pinned in requirements-anpos.txt
    Draft202012Validator = None


def load(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class PlanningFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        for relative in (plan_to_slots.PLAN, plan_to_slots.QUEUE, plan_to_slots.CONSENTS):
            (self.root / relative).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(ROOT / relative, self.root / relative)
        self.plan = load(plan_to_slots.PLAN)
        self.plan["phases"] = [{
            "id": "PHASE-FOUNDATION", "name": "Foundation", "objective": "Usable skeleton",
            "module_ids": ["MOD-AUTH"], "dependencies": [], "status": "ready", "exit_criteria": ["Login works"],
        }]
        unit = dict(self.plan["work_unit_template"])
        unit.update({
            "id": "WU-AUTH-001", "phase_id": "PHASE-FOUNDATION", "module_id": "MOD-AUTH",
            "requirement_ids": ["REQ-001"], "title": "Email login", "objective": "Users can sign in",
            "status": "ready", "priority": 10, "acceptance_criteria": ["Valid credentials sign in"],
            "required_checks": ["unit tests"], "allowed_paths": ["src/auth/**"],
        })
        blocked = dict(unit, id="WU-AUTH-002", status="not_started", dependencies=["WU-AUTH-001"])
        self.plan["work_units"] = [unit, blocked]

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, relative: str, doc: dict) -> None:
        (self.root / relative).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")

    def approve(self) -> None:
        consents = load(plan_to_slots.CONSENTS)
        consents["requests"] = [{"id": "CONSENT-000001", "type": "plan_approval", "status": "approved"}]
        self.write(plan_to_slots.CONSENTS, consents)
        self.plan["plan_status"] = "approved"
        self.plan["plan_approval_ref"] = "CONSENT-000001"

    def test_template_plan_matches_its_schema(self) -> None:
        if Draft202012Validator is None:
            self.skipTest("jsonschema not installed")
        for config, schema in [
            ("config/ai/execution-plan.json", "schemas/execution-plan.schema.json"),
            ("config/ai/modules-bank.json", "schemas/modules-bank.schema.json"),
            ("config/ai/options-bank.json", "schemas/options-bank.schema.json"),
        ]:
            errors = list(Draft202012Validator(load(schema)).iter_errors(load(config)))
            self.assertEqual(errors, [], config)

    def test_draft_plan_cannot_produce_slots(self) -> None:
        self.write(plan_to_slots.PLAN, self.plan)
        with self.assertRaisesRegex(plan_to_slots.PlanError, "plan_status 'approved'"):
            plan_to_slots.build_queue(self.root)

    def test_approval_must_be_a_real_plan_approval_consent(self) -> None:
        self.plan["plan_status"] = "approved"
        self.plan["plan_approval_ref"] = "CONSENT-999999"
        self.write(plan_to_slots.PLAN, self.plan)
        with self.assertRaisesRegex(plan_to_slots.PlanError, "plan_approval consent"):
            plan_to_slots.build_queue(self.root)

    def test_approved_plan_maps_ready_units_to_valid_slots(self) -> None:
        self.approve()
        self.write(plan_to_slots.PLAN, self.plan)
        _, queue, added = plan_to_slots.build_queue(self.root)
        self.assertEqual(added, ["SLOT-WU-AUTH-001"])
        slot = queue["slots"][0]
        self.assertEqual(slot["work_unit_id"], "WU-AUTH-001")
        self.assertEqual(slot["requirement_ids"], ["REQ-001"])
        self.assertEqual(slot["allowed_paths"], ["src/auth/**"])
        self.assertEqual(slot["status"], "free")
        if Draft202012Validator is not None:
            errors = list(Draft202012Validator(load("schemas/agent-work-queue.schema.json")).iter_errors(queue))
            self.assertEqual(errors, [])
            plan_errors = list(Draft202012Validator(load("schemas/execution-plan.schema.json")).iter_errors(self.plan))
            self.assertEqual(plan_errors, [])

    def test_existing_slots_are_not_duplicated(self) -> None:
        self.approve()
        self.write(plan_to_slots.PLAN, self.plan)
        _, queue, _ = plan_to_slots.build_queue(self.root)
        self.write(plan_to_slots.QUEUE, queue)
        _, again, added = plan_to_slots.build_queue(self.root)
        self.assertEqual(added, [])
        self.assertEqual(len(again["slots"]), 1)

    def test_ready_unit_without_scope_is_rejected(self) -> None:
        self.approve()
        self.plan["work_units"][0]["allowed_paths"] = []
        self.write(plan_to_slots.PLAN, self.plan)
        with self.assertRaisesRegex(plan_to_slots.PlanError, "allowed_paths"):
            plan_to_slots.build_queue(self.root)

    def test_schema_rejects_approved_plan_without_approval_ref(self) -> None:
        if Draft202012Validator is None:
            self.skipTest("jsonschema not installed")
        self.plan["plan_status"] = "approved"
        errors = list(Draft202012Validator(load("schemas/execution-plan.schema.json")).iter_errors(self.plan))
        self.assertTrue(errors)


if __name__ == "__main__":
    unittest.main()
