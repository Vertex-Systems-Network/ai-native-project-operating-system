#!/usr/bin/env python3
"""Acquire or inspect the single-Supervisor lease using epoch-fenced GitHub refs."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "config/coordination/supervisor-state.json"


def now(): return datetime.now(timezone.utc)
def iso(v): return v.isoformat()

def repo_name() -> str:
    if os.getenv("GITHUB_REPOSITORY"):
        return os.environ["GITHUB_REPOSITORY"]
    remote = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], cwd=ROOT, text=True).strip().removesuffix(".git")
    return remote.split(":", 1)[1] if remote.startswith("git@github.com:") else remote.split("github.com/", 1)[1]

def base_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()

def parse_time(value):
    return datetime.fromisoformat(value) if value else None

def acquire_remote(repo: str, ref: str, sha: str) -> None:
    result = subprocess.run(["gh", "api", f"repos/{repo}/git/refs", "-f", f"ref=refs/heads/{ref}", "-f", f"sha={sha}"], cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit("Supervisor election lost or GitHub ref creation failed.\n" + result.stderr.strip())


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--agent-id", required=True)
    p.add_argument("--agent-type", default="supervisor")
    p.add_argument("--lease-minutes", type=int, default=30)
    p.add_argument("--repository")
    p.add_argument("--base-sha")
    p.add_argument("--remote-lock", action="store_true")
    p.add_argument("--apply-state", action="store_true")
    args = p.parse_args()

    state = json.loads(STATE.read_text(encoding="utf-8"))
    current = state.get("supervisor") or {}
    expiry = parse_time(current.get("lease_expires_at"))
    if current.get("status") == "active" and expiry and expiry > now():
        raise SystemExit(f"Active Supervisor lease still valid for {current.get('agent_id')} until {expiry.isoformat()}.")

    epoch = int(state.get("coordination_epoch") or 0) + 1
    lease_id = str(uuid.uuid4())
    acquired = now()
    expires = acquired + timedelta(minutes=max(5, args.lease_minutes))
    sha = args.base_sha or base_sha()
    repo = args.repository or repo_name()
    election_ref = f"supervisor/epoch-{epoch:06d}"
    fencing = f"{epoch}:{lease_id}"

    print(json.dumps({"epoch": epoch, "election_ref": election_ref, "lease_id": lease_id, "fencing_token": fencing, "expires_at": iso(expires)}, indent=2))
    if not args.remote_lock:
        print("DRY RUN - no Supervisor lease acquired.")
        return 0

    acquire_remote(repo, election_ref, sha)
    if not args.apply_state:
        print("Election ref acquired; persist Supervisor state before coordination writes.")
        return 0

    state["coordination_epoch"] = epoch
    state["status"] = "active"
    state["supervisor"] = {
        "status": "active",
        "agent_id": args.agent_id,
        "agent_type": args.agent_type,
        "branch": election_ref,
        "active_module_id": None,
        "active_work_unit_id": None,
        "started_at": iso(acquired),
        "heartbeat_at": iso(acquired),
        "lease_id": lease_id,
        "lease_expires_at": iso(expires),
        "fencing_token": fencing,
        "election_ref": election_ref,
    }
    state["last_reconciled_main_sha"] = sha
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print("Supervisor lease acquired and local state mirror updated. Every coordination write must verify the current fencing token.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
