#!/usr/bin/env python3
"""Shared ANPOS authorization/fencing helpers.

This module enforces repository-visible policy. A durable orchestrator must also
authenticate callers at the host boundary; repository JSON is never a substitute
for OAuth/GitHub App/MCP/agent-host identity verification.
"""
from __future__ import annotations

import fnmatch
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def load_json(relative: str) -> dict[str, Any]:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def now() -> datetime:
    return datetime.now(timezone.utc)


def _agent_id(record: Any) -> str | None:
    if isinstance(record, str):
        return record
    if isinstance(record, dict):
        value = record.get("id")
        return str(value) if value else None
    return None


def selected_agent(agent_id: str) -> dict[str, Any]:
    catalog = load_json("config/ai/agent-catalog.json")
    for record in catalog.get("selected_agents", []):
        if _agent_id(record) == agent_id:
            if not isinstance(record, dict):
                raise PermissionError(
                    f"Selected agent {agent_id} lacks a structured verified identity record."
                )
            return record
    raise PermissionError(f"Agent {agent_id} is not in the selected child-project agent pool.")


def require_verified_agent(agent_id: str, role: str) -> dict[str, Any]:
    agent = selected_agent(agent_id)
    if agent.get("identity_verified") is not True:
        raise PermissionError(f"Agent {agent_id} identity is not verified by the active runtime.")
    roles = {str(v).lower() for v in (agent.get("roles") or [])}
    if role.lower() not in roles:
        raise PermissionError(f"Agent {agent_id} is not authorized for role {role}.")
    expires = parse_time((agent.get("runtime_identity") or {}).get("expires_at"))
    if expires and expires <= now():
        raise PermissionError(f"Agent {agent_id} runtime identity evidence is expired.")
    return agent


def live_supervisor() -> tuple[dict[str, Any], dict[str, Any]]:
    state = load_json("config/coordination/supervisor-state.json")
    supervisor = state.get("supervisor") or {}
    expiry = parse_time(supervisor.get("lease_expires_at"))
    if supervisor.get("status") != "active" or not expiry or expiry <= now():
        raise PermissionError("No live authoritative Supervisor lease exists for Worker dispatch.")
    return state, supervisor


def _matches_eligibility(slot: dict[str, Any], agent: dict[str, Any], role: str) -> bool:
    values = {str(v) for v in (slot.get("eligibility") or [])}
    if not values or "ANY" in values:
        return True
    ids = {str(agent.get("id")), str(agent.get("provider", "")), role}
    ids.update(str(v) for v in (agent.get("capabilities") or []))
    return bool(values & ids)


def authorize_slot_claim(slot: dict[str, Any], agent_id: str, role: str = "worker") -> dict[str, Any]:
    agent = require_verified_agent(agent_id, role)
    if not _matches_eligibility(slot, agent, role):
        raise PermissionError(f"Agent {agent_id} does not satisfy slot eligibility {slot.get('eligibility')}.")
    required_roles = {str(v).lower() for v in (slot.get("required_roles") or [])}
    if required_roles and role.lower() not in required_roles:
        raise PermissionError(f"Slot requires role(s) {sorted(required_roles)}; caller role is {role}.")
    required_caps = {str(v) for v in (slot.get("required_capabilities") or [])}
    agent_caps = {str(v) for v in (agent.get("capabilities") or [])}
    missing = required_caps - agent_caps
    if missing:
        raise PermissionError(f"Agent {agent_id} is missing capabilities: {sorted(missing)}")
    if "SUPERVISOR_ONLY" in {str(v) for v in (slot.get("eligibility") or [])} and role.lower() != "supervisor":
        raise PermissionError("SUPERVISOR_ONLY work cannot be claimed by a Worker.")
    return agent


def path_allowed(agent: dict[str, Any], path: str) -> bool:
    permissions = agent.get("permissions") or {}
    denied = permissions.get("denied_paths") or []
    allowed = permissions.get("allowed_paths") or ["**"]
    normalized = path.lstrip("/")
    if any(fnmatch.fnmatch(normalized, p.lstrip("/")) for p in denied):
        return False
    return any(fnmatch.fnmatch(normalized, p.lstrip("/")) for p in allowed)


def authorize_slot_paths(slot: dict[str, Any], agent: dict[str, Any]) -> None:
    for path in slot.get("allowed_paths") or []:
        if not path_allowed(agent, str(path)):
            raise PermissionError(f"Agent {agent.get('id')} is not authorized for slot path {path}.")


def verify_fencing(expected_epoch: int, expected_token: str, actor_agent_id: str | None = None) -> dict[str, Any]:
    state, supervisor = live_supervisor()
    if int(state.get("coordination_epoch") or 0) != int(expected_epoch):
        raise PermissionError("Coordination epoch is stale.")
    if str(supervisor.get("fencing_token") or "") != str(expected_token):
        raise PermissionError("Supervisor fencing token is stale or invalid.")
    if actor_agent_id and str(supervisor.get("agent_id")) != str(actor_agent_id):
        raise PermissionError("Shared coordination mutation actor is not the active Supervisor.")
    return state


def validate_handoff(slot: dict[str, Any]) -> None:
    required = [
        "id", "work_unit_id", "base_sha", "required_capabilities", "allowed_paths",
        "acceptance_criteria", "required_checks"
    ]
    missing = [key for key in required if slot.get(key) in (None, "", [])]
    if missing:
        raise ValueError(f"Slot handoff envelope missing required field(s): {', '.join(missing)}")


if __name__ == "__main__":
    print("ANPOS guard library. Import from coordination scripts; it is not a standalone authority service.")
