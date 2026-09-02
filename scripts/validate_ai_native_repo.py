#!/usr/bin/env python3
"""Validate AI-Native protocol state and GitHub workflow safety invariants."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


def load_json(relative: str) -> dict[str, Any]:
    path = ROOT / relative
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - validator must report parse failures
        fail(f"{relative}: invalid JSON: {exc}")
        return {}
    if not isinstance(data, dict):
        fail(f"{relative}: top-level JSON value must be an object")
        return {}
    return data


def ids(items: Any, label: str) -> set[str]:
    found: set[str] = set()
    if items is None:
        return found
    if not isinstance(items, list):
        fail(f"{label}: expected a list")
        return found
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            fail(f"{label}[{index}]: expected an object")
            continue
        value = item.get("id")
        if not isinstance(value, str) or not value.strip():
            fail(f"{label}[{index}]: missing non-empty id")
            continue
        if value in found:
            fail(f"{label}: duplicate id {value}")
        found.add(value)
    return found


def check_refs(values: Any, valid: set[str], label: str) -> None:
    if values is None:
        return
    if not isinstance(values, list):
        fail(f"{label}: expected a list")
        return
    for value in values:
        if not isinstance(value, str):
            fail(f"{label}: reference must be a string")
        elif value and value not in valid:
            fail(f"{label}: unknown reference {value}")


def validate_all_json() -> None:
    for path in sorted((ROOT / "config").rglob("*.json")):
        relative = path.relative_to(ROOT).as_posix()
        data = load_json(relative)
        if data and "schema_version" not in data:
            fail(f"{relative}: missing schema_version")


def validate_ai_graph() -> None:
    options_doc = load_json("config/ai/options-bank.json")
    modules_doc = load_json("config/ai/modules-bank.json")
    execution_doc = load_json("config/ai/execution-plan.json")
    queue_doc = load_json("config/coordination/agent-work-queue.json")
    alerts_doc = load_json("config/coordination/agent-alerts.json")
    consents_doc = load_json("config/consent/consent-requests.json")

    options = options_doc.get("options", [])
    modules = modules_doc.get("modules", [])
    phases = execution_doc.get("phases", [])
    work_units = execution_doc.get("work_units", [])
    slots = queue_doc.get("slots", [])

    option_ids = ids(options, "options")
    module_ids = ids(modules, "modules")
    phase_ids = ids(phases, "phases")
    work_unit_ids = ids(work_units, "work_units")
    ids(slots, "coordination slots")
    ids(alerts_doc.get("alerts", []), "agent alerts")
    ids(consents_doc.get("requests", []), "consent requests")

    for module in modules if isinstance(modules, list) else []:
        if not isinstance(module, dict):
            continue
        mid = str(module.get("id", "<unknown>"))
        check_refs(module.get("option_ids", []), option_ids, f"module {mid} option_ids")
        check_refs(module.get("dependencies", []), module_ids, f"module {mid} dependencies")

    for phase in phases if isinstance(phases, list) else []:
        if not isinstance(phase, dict):
            continue
        pid = str(phase.get("id", "<unknown>"))
        check_refs(phase.get("module_ids", []), module_ids, f"phase {pid} module_ids")
        check_refs(phase.get("dependencies", []), phase_ids, f"phase {pid} dependencies")

    for unit in work_units if isinstance(work_units, list) else []:
        if not isinstance(unit, dict):
            continue
        uid = str(unit.get("id", "<unknown>"))
        phase_id = unit.get("phase_id")
        module_id = unit.get("module_id")
        if phase_id and phase_id not in phase_ids:
            fail(f"work unit {uid}: unknown phase_id {phase_id}")
        if module_id and module_id not in module_ids:
            fail(f"work unit {uid}: unknown module_id {module_id}")
        check_refs(unit.get("dependencies", []), work_unit_ids, f"work unit {uid} dependencies")

    for slot in slots if isinstance(slots, list) else []:
        if not isinstance(slot, dict):
            continue
        sid = str(slot.get("id", "<unknown>"))
        phase_id = slot.get("phase_id")
        module_id = slot.get("module_id")
        work_unit_id = slot.get("work_unit_id")
        if phase_id and phase_id not in phase_ids:
            fail(f"slot {sid}: unknown phase_id {phase_id}")
        if module_id and module_id not in module_ids:
            fail(f"slot {sid}: unknown module_id {module_id}")
        if work_unit_id and work_unit_id not in work_unit_ids:
            fail(f"slot {sid}: unknown work_unit_id {work_unit_id}")


def validate_workflows() -> None:
    workflow_dir = ROOT / ".github" / "workflows"
    action_pattern = re.compile(r"^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)", re.MULTILINE)
    full_sha = re.compile(r"^[0-9a-fA-F]{40}$")

    for path in sorted(workflow_dir.glob("*.y*ml")):
        relative = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")

        if "permissions:" not in text:
            fail(f"{relative}: explicit least-privilege permissions block is required")
        if re.search(r"permissions:\s*write-all", text):
            fail(f"{relative}: permissions: write-all is forbidden")
        if re.search(r"^\s*pull_request_target\s*:", text, re.MULTILINE):
            fail(f"{relative}: pull_request_target requires an explicit security exception")
        if "persist-credentials: true" in text:
            fail(f"{relative}: checkout persist-credentials must not be true")

        for match in action_pattern.finditer(text):
            action, ref = match.groups()
            if action.startswith("./"):
                continue
            if not full_sha.fullmatch(ref):
                fail(
                    f"{relative}: third-party/action reference {action}@{ref} is not pinned "
                    "to a full 40-character commit SHA"
                )


def validate_required_files() -> None:
    required = [
        "AGENTS.md",
        "START-HERE.md",
        "AI-NATIVE-EXECUTION.md",
        "MULTI-AGENT-ORCHESTRATION.md",
        "AUTO-AGENT.md",
        "SUPERVISOR.md",
        "DEVELOPMENT-LIFECYCLE.md",
        "CONTINUOUS-IMPROVEMENT.md",
        "PROJECT-IDEA.md",
        "README.md",
    ]
    for relative in required:
        if not (ROOT / relative).is_file():
            fail(f"missing required protocol file: {relative}")


def main() -> int:
    validate_required_files()
    validate_all_json()
    validate_ai_graph()
    validate_workflows()

    if ERRORS:
        print("AI-Native repository validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("AI-Native repository integrity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
