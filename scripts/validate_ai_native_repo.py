#!/usr/bin/env python3
"""Validate ANPOS protocol, security, coordination and blueprint invariants."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

try:
    from jsonschema import Draft202012Validator
except Exception:
    Draft202012Validator = None


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
        "AI-NATIVE-EXECUTION.md", "MULTI-AGENT-ORCHESTRATION.md", "AUTO-AGENT.md", "SUPERVISOR.md", "ORCHESTRATOR.md",
        "DEVELOPMENT-LIFECYCLE.md", "CONTINUOUS-IMPROVEMENT.md", "GITHUB-GOVERNANCE.md", "CODE-QUALITY.md", "SECURITY.md",
        "CONTROL-PLANE-SECURITY.md", "PRODUCTION-ASSURANCE.md", "DESIGN-DATA-OPERATIONS.md", "PROJECT-IDEA.md", "README.md",
        "requirements-anpos.txt",
        "config/protocol/version.json", "config/protocol/instance.json", "config/protocol/migrations.json", "config/protocol/state-machine.json",
        "config/traceability/requirements-traceability.json", "config/integrations/project-management.json",
        "config/integrations/linear-sync.json", "config/integrations/sync-authority.json", "config/ai/agent-catalog.json",
        "config/ai/memory-provenance.json", "config/github/ruleset-policy.json", "config/github/path-ownership.json",
        "config/quality/quality-policy.json", "config/security/control-plane-policy.json", "config/security/trust-policy.json",
        "config/security/threat-model.json", "config/runtime/budgets.json", "config/release/release-policy.json",
        "config/data/data-governance.json", "config/operations/operations-policy.json", "config/contracts/migration-policy.json",
        "config/design/design-intake.json", "config/design/design-assurance.json", ".github/CODEOWNERS",
        "schemas/config-base.schema.json", "schemas/project-state.schema.json", "schemas/agent-work-queue.schema.json",
        "schemas/supervisor-state.schema.json", "schemas/agent-catalog.schema.json", "schemas/consent-requests.schema.json",
        "schemas/design-intake.schema.json", "schemas/requirements-traceability.schema.json",
        "scripts/bootstrap_instance.py", "scripts/anpos_guard.py", "scripts/claim_slot.py", "scripts/supervisor_lease.py",
        "scripts/lease_control.py", "scripts/coordination_mutation.py", "scripts/consent_guard.py",
        "scripts/install_quality_capabilities.py", "scripts/configure_dependabot.py",
        "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", "blueprints/github/dependabot.yml",
        "blueprints/github/workflows/codeql-actions.yml", "blueprints/github/workflows/dependency-review.yml",
        "blueprints/github/workflows/governance-audit.yml", "blueprints/github/workflows/innovation-scout.yml",
        "blueprints/github/workflows/protocol-update-watch.yml", "blueprints/github/workflows/repository-quality.yml",
        "blueprints/github/workflows/scorecard.yml", "blueprints/github/workflows/technology-update-watch.yml",
    ]
    for relative in required:
        if not (ROOT / relative).is_file():
            fail(f"missing required protocol/blueprint file: {relative}")


def validate_json_schemas() -> None:
    if Draft202012Validator is None:
        fail("jsonschema dependency missing; install requirements-anpos.txt before repository validation")
        return
    base = load_json("schemas/config-base.schema.json")
    try:
        Draft202012Validator.check_schema(base)
    except Exception as exc:
        fail(f"schemas/config-base.schema.json: invalid schema: {exc}")
        return

    # Every machine config gets at least the formal base schema.
    for base_dir in [ROOT / "config", ROOT / ".ai"]:
        for path in sorted(base_dir.rglob("*.json")) if base_dir.exists() else []:
            relative = path.relative_to(ROOT).as_posix()
            instance = load_json(relative)
            if instance:
                for error in Draft202012Validator(base).iter_errors(instance):
                    fail(f"{relative}: base schema violation: {error.message}")

    mapping = {
        "config/ai/project-state.json": "schemas/project-state.schema.json",
        "config/coordination/agent-work-queue.json": "schemas/agent-work-queue.schema.json",
        "config/coordination/supervisor-state.json": "schemas/supervisor-state.schema.json",
        "config/ai/agent-catalog.json": "schemas/agent-catalog.schema.json",
        "config/consent/consent-requests.json": "schemas/consent-requests.schema.json",
        "config/design/design-intake.json": "schemas/design-intake.schema.json",
        "config/traceability/requirements-traceability.json": "schemas/requirements-traceability.schema.json",
    }
    for instance_path, schema_path in mapping.items():
        schema = load_json(schema_path)
        instance = load_json(instance_path)
        try:
            Draft202012Validator.check_schema(schema)
            validator = Draft202012Validator(schema)
            for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path)):
                location = "/".join(str(v) for v in error.absolute_path) or "<root>"
                fail(f"{instance_path} [{location}]: {error.message}")
        except Exception as exc:
            fail(f"{schema_path}: schema validation failure: {exc}")


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
    if not isinstance(current, str) or not re.fullmatch(r"\d+\.\d+\.\d+", current):
        fail("protocol version must be numeric semantic major.minor.patch")
        return
    if migrations.get("current_protocol_version") != current:
        fail("protocol version: migrations.current_protocol_version must match version.json")
    if instance.get("instance_status") == "template_source" and instance.get("source_protocol_version") != current:
        fail("protocol version: template source instance.source_protocol_version must match version.json")
    last = version.get("last_protocol_migration")
    applied = migrations.get("applied_migrations", [])
    if last and not any(isinstance(r, dict) and r.get("id") == last and r.get("status") == "applied" and r.get("to_version") == current for r in applied):
        fail("last_protocol_migration must reference an applied migration to the current version")


def validate_template_boundary() -> None:
    instance = load_json("config/protocol/instance.json")
    if instance.get("instance_status") != "template_source":
        return
    pm = load_json("config/integrations/project-management.json")
    linear = load_json("config/integrations/linear-sync.json")
    agents = load_json("config/ai/agent-catalog.json")
    rules = load_json("config/github/ruleset-policy.json")
    quality = load_json("config/quality/quality-policy.json")
    supervisor = load_json("config/coordination/supervisor-state.json")
    queue = load_json("config/coordination/agent-work-queue.json")

    if pm.get("status") != "template_blueprint" or pm.get("activation_scope") != "child_project_only":
        fail("template source: PM provider state must remain template_blueprint/child_project_only")
    selection = pm.get("selection") or {}
    if selection.get("status") != "not_selected" or selection.get("sync_enabled") is not False:
        fail("template source: PM provider must remain unselected and unsynchronized")
    for key in ("selected_provider_id", "selected_provider_name", "workspace_or_org_id", "workspace_or_org_name", "external_project_id", "external_project_name", "external_project_url", "connected_at", "verified_at"):
        if selection.get(key) not in (None, ""):
            fail(f"template source: PM runtime field {key} must be empty")

    if linear.get("enabled") is not False or any((linear.get("project") or {}).get(k) not in (None, "") for k in ("name", "id", "url")):
        fail("template source: Linear adapter must remain disabled/unmapped")
    if agents.get("available_agents") or agents.get("selected_agents"):
        fail("template source: project-specific AI agent pool must be empty")
    assignments = agents.get("role_assignments") or {}
    if assignments.get("supervisor_agent_id") not in (None, "") or assignments.get("worker_agent_ids"):
        fail("template source: AI role assignments must remain empty")

    if supervisor.get("last_pm_sync_at") not in (None, "") or supervisor.get("supervisor", {}).get("status") != "unassigned":
        fail("template source: Supervisor runtime must remain unassigned/unmapped")
    if int(queue.get("schema_version", 0)) < 4 or int(supervisor.get("schema_version", 0)) < 4:
        fail("template source: coordination schemas must be hardening version >=4")
    if queue.get("slots"):
        fail("template source: work queue must not contain child runtime slots")

    if rules.get("status") != "template_blueprint" or rules.get("activation_scope") != "child_project_only":
        fail("template source: GitHub Rules must remain child-project blueprint")
    if (rules.get("setup_flow") or {}).get("ask_user_before_applying") is not True:
        fail("template source: child GitHub Rules must require user decision")
    if (rules.get("rules") or {}).get("require_code_owner_review") is not True:
        fail("GitHub Rules blueprint must require CODEOWNER review for protected control-plane paths")

    if quality.get("status") != "template_blueprint" or quality.get("apply_to_template_source") is not False:
        fail("template source: Code Quality must remain inactive blueprint")
    active = ROOT / ".github" / "workflows"
    if active.exists() and any(active.glob("*.y*ml")):
        fail("template source: child runtime workflows must not exist in active .github/workflows")
    if (ROOT / ".github" / "dependabot.yml").exists():
        fail("template source: child Dependabot config must not be active")

    for path in [
        "config/security/control-plane-policy.json", "config/security/trust-policy.json", "config/security/threat-model.json",
        "config/runtime/budgets.json", "config/release/release-policy.json", "config/data/data-governance.json",
        "config/operations/operations-policy.json", "config/contracts/migration-policy.json", "config/integrations/sync-authority.json",
        "config/design/design-assurance.json",
    ]:
        if load_json(path).get("status") != "template_blueprint":
            fail(f"template source: {path} must remain template_blueprint")


def validate_control_plane() -> None:
    ownership = load_json("config/github/path-ownership.json")
    rules = load_json("config/github/ruleset-policy.json")
    security = load_json("config/security/control-plane-policy.json")
    patterns = {r.get("pattern") for r in ownership.get("rules", []) if isinstance(r, dict)}
    for expected in ["/AGENTS.md", "/.ai/**", "/blueprints/**", "/scripts/**", "/config/coordination/**", "/config/security/**"]:
        if expected not in patterns:
            fail(f"path ownership missing protected control-plane pattern {expected}")
    if (rules.get("rules") or {}).get("require_code_owner_review") is not True:
        fail("ruleset policy must require CODEOWNER review")
    lock_policy = rules.get("coordination_ref_policy") or {}
    if lock_policy.get("restrict_create_update_delete_to_trusted_runtime_when_supported") is not True:
        fail("coordination ref namespaces must require trusted-runtime protection policy")
    if security.get("protected_control_plane") is not True:
        fail("control-plane security policy must mark control plane protected")
    codeowners = (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
    for marker in ["/AGENTS.md", "/.ai/", "/blueprints/", "/scripts/", "/config/security/"]:
        if marker not in codeowners:
            fail(f"CODEOWNERS missing protected marker {marker}")


def validate_provider_catalogs() -> None:
    pm = load_json("config/integrations/project-management.json")
    providers = pm.get("providers", [])
    provider_ids = ids(providers, "project-management providers")
    recommended = (pm.get("selection_flow") or {}).get("recommended_provider_id")
    if recommended and recommended not in provider_ids:
        fail(f"project-management recommended provider {recommended} is not in provider catalog")
    if "linear" not in provider_ids or not pm.get("adapter_contract"):
        fail("project-management provider catalog must include Linear adapter and common adapter contract")


def validate_ai_graph() -> None:
    options_doc = load_json("config/ai/options-bank.json")
    modules_doc = load_json("config/ai/modules-bank.json")
    execution_doc = load_json("config/ai/execution-plan.json")
    queue_doc = load_json("config/coordination/agent-work-queue.json")
    alerts_doc = load_json("config/coordination/agent-alerts.json")
    consents_doc = load_json("config/consent/consent-requests.json")
    trace_doc = load_json("config/traceability/requirements-traceability.json")
    option_ids = ids(options_doc.get("options", []), "options")
    module_ids = ids(modules_doc.get("modules", []), "modules")
    phase_ids = ids(execution_doc.get("phases", []), "phases")
    work_unit_ids = ids(execution_doc.get("work_units", []), "work_units")
    ids(queue_doc.get("slots", []), "coordination slots")
    ids(alerts_doc.get("alerts", []), "agent alerts")
    ids(consents_doc.get("requests", []), "consent requests")

    for module in modules_doc.get("modules", []):
        if isinstance(module, dict):
            check_refs(module.get("option_ids", []), option_ids, f"module {module.get('id')} option_ids")
            check_refs(module.get("dependencies", []), module_ids, f"module {module.get('id')} dependencies")
    for phase in execution_doc.get("phases", []):
        if isinstance(phase, dict):
            check_refs(phase.get("module_ids", []), module_ids, f"phase {phase.get('id')} module_ids")
            check_refs(phase.get("dependencies", []), phase_ids, f"phase {phase.get('id')} dependencies")
    for unit in execution_doc.get("work_units", []):
        if isinstance(unit, dict):
            if unit.get("phase_id") and unit.get("phase_id") not in phase_ids:
                fail(f"work unit {unit.get('id')}: unknown phase_id")
            if unit.get("module_id") and unit.get("module_id") not in module_ids:
                fail(f"work unit {unit.get('id')}: unknown module_id")
            check_refs(unit.get("dependencies", []), work_unit_ids, f"work unit {unit.get('id')} dependencies")
    for link in trace_doc.get("links", []):
        if isinstance(link, dict):
            rid = str(link.get("requirement_id", "<unknown>"))
            check_refs(link.get("option_ids", []), option_ids, f"trace {rid} option_ids")
            check_refs(link.get("module_ids", []), module_ids, f"trace {rid} module_ids")
            check_refs(link.get("work_unit_ids", []), work_unit_ids, f"trace {rid} work_unit_ids")


def validate_coordination() -> None:
    queue = load_json("config/coordination/agent-work-queue.json")
    supervisor = load_json("config/coordination/supervisor-state.json")
    machine = load_json("config/protocol/state-machine.json")
    if int(queue.get("schema_version", 0)) < 4:
        fail("agent-work-queue schema_version must be >=4")
    if int(supervisor.get("schema_version", 0)) < 4:
        fail("supervisor-state schema_version must be >=4")
    sup = supervisor.get("supervisor") or {}
    if sup.get("status") == "active":
        for key in ["agent_id", "identity_ref", "heartbeat_at", "lease_id", "lease_expires_at", "fencing_token", "election_ref"]:
            if sup.get(key) in (None, ""):
                fail(f"active Supervisor missing {key}")
        if sup.get("lease_status") != "active":
            fail("active Supervisor must have active lease_status")
    q_status = set(queue.get("status_values", []))
    transitions = machine.get("worker_slot_transitions", {})
    if set(transitions) != q_status:
        fail("state-machine worker states must match queue status_values")
    for state, targets in transitions.items():
        for target in targets:
            if target not in q_status:
                fail(f"state-machine transition {state}->{target} targets unknown state")
    for slot in queue.get("slots", []):
        if not isinstance(slot, dict):
            continue
        if slot.get("status") in {"claimed", "in_progress", "blocked", "submitted_for_review", "changes_requested", "approved"}:
            for key in ["claim_ref", "claimant", "claimant_identity_ref", "claim_id", "claim_branch", "coordination_epoch", "fencing_token", "lease_expires_at", "base_sha"]:
                if slot.get(key) in (None, ""):
                    fail(f"slot {slot.get('id')}: active claim missing {key}")
            if slot.get("lease_status") != "active":
                fail(f"slot {slot.get('id')}: active claim must have active lease_status")


def validate_workflow_tree(directory: Path, label: str) -> None:
    action_pattern = re.compile(r"^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)", re.MULTILINE)
    full_sha = re.compile(r"^[0-9a-fA-F]{40}$")
    for path in sorted(directory.glob("*.y*ml")) if directory.exists() else []:
        relative = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        if "permissions:" not in text:
            fail(f"{label} {relative}: explicit permissions block is required")
        if re.search(r"permissions:\s*write-all", text):
            fail(f"{label} {relative}: permissions: write-all is forbidden")
        if re.search(r"^\s*pull_request_target\s*:", text, re.MULTILINE):
            fail(f"{label} {relative}: pull_request_target requires explicit security exception")
        if "persist-credentials: true" in text:
            fail(f"{label} {relative}: checkout persist-credentials must not be true")
        if "comment-summary-in-pr: always" in text and "pull-requests: write" not in text:
            fail(f"{label} {relative}: PR commenting requested without pull-requests: write")
        if "source /tmp/protocol-env" in text:
            fail(f"{label} {relative}: repository-derived shell env must not be sourced")
        for match in action_pattern.finditer(text):
            action, ref = match.groups()
            if not action.startswith("./") and not full_sha.fullmatch(ref):
                fail(f"{label} {relative}: {action}@{ref} is not pinned to a full 40-character commit SHA")


def validate_workflows() -> None:
    validate_workflow_tree(ROOT / "blueprints" / "github" / "workflows", "blueprint")
    validate_workflow_tree(ROOT / ".github" / "workflows", "active")


def main() -> int:
    validate_required_files()
    validate_json_schemas()
    validate_manifest()
    validate_protocol_versioning()
    validate_template_boundary()
    validate_control_plane()
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
