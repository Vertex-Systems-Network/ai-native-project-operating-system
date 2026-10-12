#!/usr/bin/env python3
"""Generate work-queue slots from an approved ANPOS execution plan.

This script never writes repository state. It renders a complete candidate
`config/coordination/agent-work-queue.json` document containing one free slot
for each `ready` work unit that does not already have a slot, and prints the
CAS hash of the current queue. The Supervisor then commits the candidate
through `scripts/coordination_mutation.py`, which enforces fencing and CAS.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PLAN = "config/ai/execution-plan.json"
QUEUE = "config/coordination/agent-work-queue.json"
CONSENTS = "config/consent/consent-requests.json"

COPIED_FIELDS = (
    "phase_id", "module_id", "requirement_ids", "title", "priority", "risk_classification",
    "eligibility", "required_roles", "required_capabilities", "allowed_paths", "denied_paths",
    "acceptance_criteria", "required_checks",
)
APPROVED_CONSENT_STATES = {"approved", "implemented", "verified"}


class PlanError(RuntimeError):
    pass


def load(root: Path, relative: str) -> tuple[str, dict[str, Any]]:
    text = (root / relative).read_text(encoding="utf-8")
    return text, json.loads(text)


def require_approved_plan(plan: dict[str, Any], consents: dict[str, Any]) -> None:
    if plan.get("plan_status") != "approved":
        raise PlanError(f"execution plan is {plan.get('plan_status')!r}; slots require plan_status 'approved'")
    ref = plan.get("plan_approval_ref")
    for request in consents.get("requests", []):
        if (
            isinstance(request, dict)
            and request.get("id") == ref
            and request.get("type") == "plan_approval"
            and request.get("status") in APPROVED_CONSENT_STATES
        ):
            return
    raise PlanError(f"plan_approval_ref {ref!r} does not name an approved plan_approval consent request")


def slot_for(unit: dict[str, Any], template: dict[str, Any]) -> dict[str, Any]:
    missing = [key for key in ("acceptance_criteria", "required_checks", "allowed_paths") if not unit.get(key)]
    if missing:
        raise PlanError(f"work unit {unit.get('id')} is ready but has empty {', '.join(missing)}")
    slot = copy.deepcopy(template)
    slot["id"] = f"SLOT-{unit['id']}"
    slot["work_unit_id"] = unit["id"]
    for key in COPIED_FIELDS:
        if key in unit:
            slot[key] = copy.deepcopy(unit[key])
    slot["description"] = unit.get("objective", "")
    slot["dependencies"] = list(unit.get("dependencies", []))  # work-unit IDs, see slot_dependency_semantics
    slot["status"] = "free"
    slot["lease_status"] = "not_acquired"
    return slot


def build_queue(root: Path) -> tuple[str, dict[str, Any], list[str]]:
    _, plan = load(root, PLAN)
    _, consents = load(root, CONSENTS)
    queue_text, queue = load(root, QUEUE)
    require_approved_plan(plan, consents)

    existing = {slot.get("work_unit_id") for slot in queue.get("slots", []) if isinstance(slot, dict)}
    template = queue.get("slot_schema") or {}
    candidate = copy.deepcopy(queue)
    added: list[str] = []
    for unit in sorted(
        (u for u in plan.get("work_units", []) if isinstance(u, dict)),
        key=lambda u: (u.get("priority") if isinstance(u.get("priority"), int) else 10**9, str(u.get("id"))),
    ):
        if unit.get("status") != "ready" or unit.get("id") in existing:
            continue
        slot = slot_for(unit, template)
        candidate["slots"].append(slot)
        added.append(slot["id"])
    return queue_text, candidate, added


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", help="Write the candidate queue JSON here (outside the repository is recommended)")
    parser.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    try:
        queue_text, candidate, added = build_queue(Path(args.root))
    except PlanError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(candidate, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    print(json.dumps({
        "added_slots": added,
        "expected_sha256": hashlib.sha256(queue_text.encode("utf-8")).hexdigest(),
        "next": "commit with scripts/coordination_mutation.py --target " + QUEUE + " --input <candidate> --expected-sha256 <hash> ...",
    }, indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
