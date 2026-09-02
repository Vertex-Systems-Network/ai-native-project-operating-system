#!/usr/bin/env python3
"""Validate ANPOS protocol state, routing, coordination and blueprint safety invariants."""
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
    except Exception as exc:
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


def validate_required_files() -> None:
    required = [
        "AGENTS.md", ".ai/manifest.json", "PROJECT-INITIALIZATION.md", "PROJECT-MANAGEMENT.md", "START-HERE.md",
        "AI-NATIVE-EXECUTION.md", "MULTI-AGENT-ORCHESTRATION.md", "AUTO-AGENT.md",
        "SUPERVISOR.md", "ORCHESTRATOR.md", "DEVELOPMENT-LIFECYCLE.md",
        "CONTINUOUS-IMPROVEMENT.md", "GITHUB-GOVERNANCE.md", "CODE-QUALITY.md",
        "SECURITY.md", "PROJECT-IDEA.md", "README.md",
        "config/protocol/version.json", "config/protocol/instance.json", "config/protocol/migrations.json",
        "config/protocol/state-machine.json", "config/traceability/requirements-traceability.json",
        "config/integrations/project-management.json", "config/integrations/linear-sync.json",
        "config/ai/agent-catalog.json", "config/github/ruleset-policy.json",
        "config/quality/quality-policy.json", "config/github/path-ownership.json", ".github/CODEOWNERS",
        "schemas/project-state.schema.json", "schemas/agent-work-queue.schema.json", "schemas/supervisor-state.schema.json",
        "scripts/bootstrap_instance.py", "scripts/claim_slot.py", "scripts/supervisor_lease.py",
        "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md",
        "blueprints/github/dependabot.yml",
        "blueprints/github/workflows/codeql-actions.yml",
        "blueprints/github/workflows/dependency-review.yml",
        "blueprints/github/workflows/governance-audit.yml",
        "blueprints/github/workflows/innovation-scout.yml",
        "blueprints/github/workflows/protocol-update-watch.yml",
        "blueprints/github/workflows/repository-quality.yml",
        "blueprints/github/workflows/scorecard.yml",
        "blueprints/github/workflows/technology-update-watch.yml",
    ]
    for relative in required:
        if not (ROOT / relative).is_file():
            fail(f"missing required protocol/blueprint file: {relative}")


def validate_all_json() -> None:
    for base in [ROOT / "config", ROOT / ".ai"]:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.json")):
            relative = path.relative_to(ROOT).as_posix()
            data = load_json(relative)
            if data and "schema_version" not in data:
                fail(f"{relative}: missing schema_version")
    for path in sorted((ROOT / "schemas").glob("*.json")):
        load_json(path.relative_to(ROOT).as_posix())


def validate_manifest() -> None:
    doc = load_json(".ai/manifest.json")
    paths = list(doc.get("common", []))
    roles = doc.get("roles", {})
    if not isinstance(roles, dict):
        fail(".ai/manifest.json: roles must be an object")
        return
    for role, files in roles.items():
        if not isinstance(files, list):
            fail(f"manifest role {role}: expected file list")
            continue
        paths.extend(files)
    for relative in paths:
        if not isinstance(relative, str) or not (ROOT / relative).exists():
            fail(f"manifest references missing path: {relative}")


def validate_protocol_versioning() -> None:
    version = load_json("config/protocol/version.json")
    instance = load_json("config/protocol/instance.json")
    migrations = load_json("config/protocol/migrations.json")

    current = version.get("version")
    if not isinstance(current, str) or not current:
        fail("protocol version: config/protocol/version.json must contain a non-empty version")
        return
    if migrations.get("current_protocol_version") != current:
        fail("protocol version: migrations.current_protocol_version must match version.json")
    if instance.get("instance_status") == "template_source" and instance.get("source_protocol_version") != current:
        fail("protocol version: template source instance.source_protocol_version must match version.json")

    last_migration = version.get("last_protocol_migration")
    applied = migrations.get("applied_migrations", [])
    if last_migration:
        if not isinstance(applied, list) or not any(
            isinstance(record, dict)
            and record.get("id") == last_migration
            and record.get("status") == "applied"
            and record.get("to_version") == current
            for record in applied
        ):
            fail("protocol version: last_protocol_migration must reference an applied migration to the current version")


def validate_template_boundary() -> None:
    instance = load_json("config/protocol/instance.json")
    pm = load_json("config/integrations/project-management.json")
    linear = load_json("config/integrations/linear-sync.json")
    agents = load_json("config/ai/agent-catalog.json")
    rules = load_json("config/github/ruleset-policy.json")
    quality = load_json("config/quality/quality-policy.json")

    if instance.get("instance_status") == "template_source":
        if pm.get("status") != "template_blueprint" or pm.get("activation_scope") != "child_project_only":
            fail("template source: PM provider state must remain child-project template_blueprint")
        selection = pm.get("selection") or {}
        if selection.get("status") != "not_selected":
            fail("template source: PM provider selection must remain not_selected")
        for key in (
            "selected_provider_id", "selected_provider_name", "workspace_or_org_id", "workspace_or_org_name",
            "external_project_id", "external_project_name", "external_project_url", "connected_at", "verified_at"
        ):
            if selection.get(key) not in (None, ""):
                fail(f"template source: PM runtime field {key} must be empty")
        if selection.get("sync_enabled") is not False:
            fail("template source: PM synchronization must be disabled")

        if linear.get("enabled") is not False:
            fail("template source: Linear adapter must not be enabled")
        project = linear.get("project") or {}
        if any(project.get(key) not in (None, "") for key in ("name", "id", "url")):
            fail("template source: Linear project mapping must be empty")
        for key in ("last_successful_sync_at", "last_attempt_at", "last_reconciled_main_sha", "last_linear_status_update_id"):
            if linear.get(key) not in (None, ""):
                fail(f"template source: Linear runtime field {key} must be empty")

        if agents.get("selection_status") not in {"not_selected", "discovery_required"}:
            fail("template source: development AI selection must remain unresolved")
        if agents.get("available_agents") or agents.get("selected_agents"):
            fail("template source: project-specific AI agent pool must be empty")
        role_assignments = agents.get("role_assignments") or {}
        if role_assignments.get("supervisor_agent_id") not in (None, "") or role_assignments.get("worker_agent_ids"):
            fail("template source: development AI role assignments must be empty")

        if rules.get("status") != "template_blueprint" or rules.get("activation_scope") != "child_project_only":
            fail("template source: GitHub Rules policy must remain a child-project template_blueprint")
        setup_flow = rules.get("setup_flow") or {}
        if setup_flow.get("ask_user_before_applying") is not True:
            fail("template source: child GitHub Rules setup must ask the user before applying")

        if quality.get("status") != "template_blueprint" or quality.get("apply_to_template_source") is not False:
            fail("template source: Code Quality policy must remain inactive blueprint")
        if quality.get("activation_scope") != "child_project_only":
            fail("template source: Code Quality activation_scope must be child_project_only")

        active_workflow_dir = ROOT / ".github" / "workflows"
        if active_workflow_dir.exists() and any(active_workflow_dir.glob("*.y*ml")):
            fail("template source: child runtime workflows must not exist in active .github/workflows")
        if (ROOT / ".github" / "dependabot.yml").exists():
            fail("template source: child Dependabot config must not be active in .github/dependabot.yml")


def validate_provider_catalogs() -> None:
    pm = load_json("config/integrations/project-management.json")
    providers = pm.get("providers", [])
    provider_ids = ids(providers, "project-management providers")
    recommended = (pm.get("selection_flow") or {}).get("recommended_provider_id")
    if recommended and recommended not in provider_ids:
        fail(f"project-management recommended provider {recommended} is not in provider catalog")
    if "linear" not in provider_ids:
        fail("project-management provider catalog must include the Linear adapter")
    if not pm.get("adapter_contract"):
        fail("project-management provider catalog must define a non-empty adapter_contract")


def validate_ai_graph() -> None:
    options_doc = load_json("config/ai/options-bank.json")
    modules_doc = load_json("config/ai/modules-bank.json")
    execution_doc = load_json("config/ai/execution-plan.json")
    queue_doc = load_json("config/coordination/agent-work-queue.json")
    alerts_doc = load_json("config/coordination/agent-alerts.json")
    consents_doc = load_json("config/consent/consent-requests.json")
    trace_doc = load_json("config/traceability/requirements-traceability.json")

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
        if isinstance(module, dict):
            mid = str(module.get("id", "<unknown>"))
            check_refs(module.get("option_ids", []), option_ids, f"module {mid} option_ids")
            check_refs(module.get("dependencies", []), module_ids, f"module {mid} dependencies")
    for phase in phases if isinstance(phases, list) else []:
        if isinstance(phase, dict):
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
        status = slot.get("status")
        if status in {"claimed", "in_progress", "blocked", "submitted_for_review", "changes_requested", "approved"}:
            for key in ["claimant", "claim_id", "claim_branch", "coordination_epoch", "fencing_token", "lease_expires_at", "base_sha"]:
                if slot.get(key) in (None, ""):
                    fail(f"slot {sid}: active claim missing {key}")
    for link in trace_doc.get("links", []) if isinstance(trace_doc.get("links", []), list) else []:
        if not isinstance(link, dict):
            continue
        rid = str(link.get("requirement_id", "<unknown>"))
        check_refs(link.get("option_ids", []), option_ids, f"trace {rid} option_ids")
        check_refs(link.get("module_ids", []), module_ids, f"trace {rid} module_ids")
        check_refs(link.get("work_unit_ids", []), work_unit_ids, f"trace {rid} work_unit_ids")


def validate_coordination() -> None:
    queue = load_json("config/coordination/agent-work-queue.json")
    supervisor = load_json("config/coordination/supervisor-state.json")
    machine = load_json("config/protocol/state-machine.json")
    if int(queue.get("schema_version", 0)) < 2:
        fail("agent-work-queue schema_version must be >= 2")
    if int(supervisor.get("schema_version", 0)) < 2:
        fail("supervisor-state schema_version must be >= 2")
    sup = supervisor.get("supervisor") or {}
    if sup.get("status") == "active":
        for key in ["agent_id", "heartbeat_at", "lease_id", "lease_expires_at", "fencing_token", "election_ref"]:
            if sup.get(key) in (None, ""):
                fail(f"active Supervisor missing {key}")
    q_status = set(queue.get("status_values", []))
    transitions = machine.get("worker_slot_transitions", {})
    if set(transitions) != q_status:
        fail("state-machine worker states must match queue status_values")
    for state, targets in transitions.items():
        for target in targets:
            if target not in q_status:
                fail(f"state-machine transition {state}->{target} targets unknown state")


def validate_workflow_tree(directory: Path, label: str) -> None:
    action_pattern = re.compile(r"^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)", re.MULTILINE)
    full_sha = re.compile(r"^[0-9a-fA-F]{40}$")
    for path in sorted(directory.glob("*.y*ml")) if directory.exists() else []:
        relative = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        if "permissions:" not in text:
            fail(f"{label} {relative}: explicit least-privilege permissions block is required")
        if re.search(r"permissions:\s*write-all", text):
            fail(f"{label} {relative}: permissions: write-all is forbidden")
        if re.search(r"^\s*pull_request_target\s*:", text, re.MULTILINE):
            fail(f"{label} {relative}: pull_request_target requires an explicit security exception")
        if "persist-credentials: true" in text:
            fail(f"{label} {relative}: checkout persist-credentials must not be true")
        for match in action_pattern.finditer(text):
            action, ref = match.groups()
            if not action.startswith("./") and not full_sha.fullmatch(ref):
                fail(f"{label} {relative}: {action}@{ref} is not pinned to a full 40-character commit SHA")


def validate_workflows() -> None:
    validate_workflow_tree(ROOT / "blueprints" / "github" / "workflows", "blueprint")
    validate_workflow_tree(ROOT / ".github" / "workflows", "active")


def main() -> int:
    validate_required_files()
    validate_all_json()
    validate_manifest()
    validate_protocol_versioning()
    validate_template_boundary()
    validate_provider_catalogs()
    validate_ai_graph()
    validate_coordination()
    validate_workflows()
    if ERRORS:
        print("ANPOS repository validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS repository integrity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
