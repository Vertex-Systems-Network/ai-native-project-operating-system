#!/usr/bin/env python3
"""Initialize a child repository created from the ANPOS template.

The source repository is an inert template. This script activates child-project
runtime state and installs child runtime blueprints. It does NOT connect a live
project-management provider, attach development AIs, or apply GitHub repository
rules; those actions are completed by the AI/user setup flow afterward.

Dry-run by default. Use --apply to write changes. The template source repository
is protected unless --allow-source is explicitly supplied for deliberate tests.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REPO = "Vertex-Systems-Network/ai-native-project-operating-system"
BLUEPRINT_ROOT = ROOT / "blueprints" / "github"

# Governance is intentionally excluded because GitHub Rules require the explicit
# project-start approval flow before application/monitoring.
AUTO_INSTALL_WORKFLOWS = (
    "codeql-actions.yml",
    "dependency-review.yml",
    "repository-quality.yml",
    "scorecard.yml",
    "technology-update-watch.yml",
    "innovation-scout.yml",
    "protocol-update-watch.yml",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(path: str) -> dict[str, Any]:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def infer_repository() -> str | None:
    env = os.getenv("GITHUB_REPOSITORY")
    if env:
        return env
    try:
        remote = subprocess.check_output(
            ["git", "config", "--get", "remote.origin.url"], cwd=ROOT, text=True
        ).strip()
    except Exception:
        return None
    remote = remote.removesuffix(".git")
    if remote.startswith("git@github.com:"):
        return remote.split(":", 1)[1]
    marker = "github.com/"
    if marker in remote:
        return remote.split(marker, 1)[1]
    return None


def add_runtime_blueprints(changed: dict[str, str]) -> None:
    workflows = BLUEPRINT_ROOT / "workflows"
    for filename in AUTO_INSTALL_WORKFLOWS:
        source = workflows / filename
        if not source.exists():
            raise RuntimeError(f"Missing required child workflow blueprint: {source}")
        changed[f".github/workflows/{filename}"] = source.read_text(encoding="utf-8")

    dependabot = BLUEPRINT_ROOT / "dependabot.yml"
    if not dependabot.exists():
        raise RuntimeError(f"Missing required child Dependabot blueprint: {dependabot}")
    changed[".github/dependabot.yml"] = dependabot.read_text(encoding="utf-8")


def reset_runtime(repository: str, project_name: str, owner: str) -> dict[str, str]:
    timestamp = now()
    changed: dict[str, str] = {}

    protocol = load("config/protocol/version.json")
    instance = load("config/protocol/instance.json")
    instance.update({
        "instance_status": "active_project",
        "instance_id": str(uuid.uuid4()),
        "project_name": project_name,
        "repository": repository,
        "repository_owner": repository.split("/", 1)[0],
        "initialized_at": timestamp,
        "initialized_by": owner,
        "source_protocol_version": protocol.get("version"),
        "bootstrap_completed": True,
    })
    changed["config/protocol/instance.json"] = json.dumps(instance, indent=2) + "\n"

    state = load("config/ai/project-state.json")
    state.update({
        "lifecycle_stage": "not_started",
        "current_phase": None,
        "current_module": None,
        "current_work_unit": None,
        "last_verified_completion": None,
        "next_valid_work_unit": None,
        "outstanding_updates": [],
        "outstanding_removals": [],
        "unresolved_decisions": [
            "Choose a Project Management System or explicitly skip PM integration.",
            "Choose the Development AI agent pool available in the current host.",
            "Ask the user whether to apply the recommended GitHub Rules policy."
        ],
        "critical_defects": [],
        "last_reconciled_repository_ref": None,
        "last_reconciled_at": None,
    })
    if isinstance(state.get("progress"), dict):
        for key in state["progress"]:
            state["progress"][key] = 0
    changed["config/ai/project-state.json"] = json.dumps(state, indent=2) + "\n"

    queue = load("config/coordination/agent-work-queue.json")
    queue["slots"] = []
    queue["updated_at"] = timestamp
    changed["config/coordination/agent-work-queue.json"] = json.dumps(queue, indent=2) + "\n"

    supervisor = load("config/coordination/supervisor-state.json")
    supervisor["coordination_epoch"] = 0
    supervisor["merge_generation"] = 0
    supervisor["last_merge_sha"] = None
    supervisor["last_merge_at"] = None
    supervisor["active_worker_count"] = 0
    supervisor["open_required_action_alert_count"] = 0
    supervisor["last_linear_sync_at"] = None
    supervisor["last_readme_dashboard_update_at"] = None
    supervisor["last_reconciled_main_sha"] = None
    supervisor["status"] = "unassigned"
    supervisor["supervisor"] = {
        "status": "unassigned", "agent_id": None, "agent_type": None, "branch": None,
        "active_module_id": None, "active_work_unit_id": None, "started_at": None,
        "heartbeat_at": None, "lease_id": None, "lease_expires_at": None,
        "fencing_token": None, "election_ref": None,
    }
    changed["config/coordination/supervisor-state.json"] = json.dumps(supervisor, indent=2) + "\n"

    for path, list_key in [
        ("config/coordination/merge-events.json", "events"),
        ("config/coordination/agent-alerts.json", "alerts"),
        ("config/consent/consent-requests.json", "requests"),
    ]:
        doc = load(path)
        doc[list_key] = []
        if "next_sequence" in doc:
            doc["next_sequence"] = 1
        changed[path] = json.dumps(doc, indent=2) + "\n"

    pm = load("config/integrations/project-management.json")
    pm["status"] = "selection_required"
    pm["activation_scope"] = "child_project"
    pm["selection"] = {
        "status": "not_selected",
        "selected_provider_id": None,
        "selected_provider_name": None,
        "workspace_or_org_id": None,
        "workspace_or_org_name": None,
        "external_project_id": None,
        "external_project_name": None,
        "external_project_url": None,
        "connected_at": None,
        "verified_at": None,
        "sync_enabled": False,
    }
    changed["config/integrations/project-management.json"] = json.dumps(pm, indent=2) + "\n"

    # Linear remains one optional adapter and is unbound unless selected later.
    linear = load("config/integrations/linear-sync.json")
    linear["status"] = "not_selected"
    linear["enabled"] = False
    linear["activation_scope"] = "child_project_only_when_selected"
    linear["project"] = {"name": None, "id": None, "url": None}
    for key in [
        "last_successful_sync_at",
        "last_attempt_at",
        "last_error",
        "last_reconciled_main_sha",
        "last_linear_status_update_id",
    ]:
        if key in linear:
            linear[key] = None
    linear["sync_result"] = "provider_not_selected"
    changed["config/integrations/linear-sync.json"] = json.dumps(linear, indent=2) + "\n"

    agents = load("config/ai/agent-catalog.json")
    agents["selection_status"] = "discovery_required"
    agents["available_agents"] = []
    agents["selected_agents"] = []
    agents["suggested_but_unavailable"] = []
    changed["config/ai/agent-catalog.json"] = json.dumps(agents, indent=2) + "\n"

    # Baseline workflows are installed automatically in the child, but must still
    # be observed running successfully before the AI claims them as passing.
    quality = load("config/quality/quality-policy.json")
    quality["status"] = "installed_pending_verification"
    quality["activation_scope"] = "child_project"
    quality["setup_state"] = {
        "baseline_files_installed_by_bootstrap": True,
        "baseline_verification": "pending_first_child_run",
        "stack_specific_tooling": "awaiting_technology_approval",
    }
    changed["config/quality/quality-policy.json"] = json.dumps(quality, indent=2) + "\n"

    # Rules remain a user decision. Bootstrap never mutates repository-admin
    # settings or enables governance auditing before that decision.
    rules = load("config/github/ruleset-policy.json")
    rules["status"] = "pending_user_decision"
    rules["activation_scope"] = "child_project"
    rules["setup_state"] = {
        "user_decision": None,
        "application_status": "not_applied",
        "enforcement_verified": False,
        "governance_audit_installed": False,
    }
    changed["config/github/ruleset-policy.json"] = json.dumps(rules, indent=2) + "\n"

    handle = owner.lstrip("@")
    codeowners = f"""# Generated by scripts/bootstrap_instance.py for {repository}\n* @{handle}\n/.github/ @{handle}\n/config/coordination/ @{handle}\n/config/protocol/ @{handle}\n/config/github/ @{handle}\n/config/consent/ @{handle}\n/schemas/ @{handle}\n/scripts/ @{handle}\n/SECURITY.md @{handle}\n"""
    changed[".github/CODEOWNERS"] = codeowners

    add_runtime_blueprints(changed)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--allow-source", action="store_true")
    parser.add_argument("--repository")
    parser.add_argument("--project-name")
    parser.add_argument("--github-owner", help="Authorized GitHub user/team handle used to render child CODEOWNERS")
    args = parser.parse_args()

    repository = args.repository or infer_repository()
    if not repository or "/" not in repository:
        raise SystemExit("Unable to determine owner/repository. Pass --repository owner/name.")
    if repository == SOURCE_REPO and not args.allow_source:
        raise SystemExit("Refusing to bootstrap the template source repository. Use --allow-source only for deliberate testing.")
    if args.apply and not args.github_owner:
        raise SystemExit("--github-owner is required with --apply so a child repository cannot inherit the template source CODEOWNERS identity.")

    project_name = args.project_name or repository.split("/", 1)[1].replace("-", " ").strip().title()
    preview_owner = args.github_owner or "REQUIRED-ON-APPLY"
    changes = reset_runtime(repository, project_name, preview_owner)

    if not args.apply:
        print("DRY RUN - no files written")
        print("Would initialize child project:", repository)
        if not args.github_owner:
            print("NOTE: --github-owner is required when --apply is used.")
        print("NOTE: Project Management provider selection remains unresolved until the user chooses one or skips.")
        print("NOTE: Development AI selection remains unresolved until runtime discovery + user selection.")
        print("NOTE: Code Quality baseline is installed but remains pending verification until child checks run.")
        print("NOTE: GitHub Rules remain unapplied until the user approves the Rules setup flow.")
        for path in sorted(changes):
            print("-", path)
        return 0

    for relative, content in changes.items():
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    print(f"Initialized ANPOS child project {repository} with {len(changes)} reset/generated files.")
    print("NEXT: choose PM provider, connect/map it if selected, choose Development AI(s), verify Code Quality, then decide GitHub Rules.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
