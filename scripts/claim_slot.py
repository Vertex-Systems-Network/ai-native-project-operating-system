#!/usr/bin/env python3
"""Claim an ANPOS worker slot using a deterministic GitHub ref as the lock.

The GitHub ref creation is the arbitration point; queue JSON mirrors the winner.
Use --remote-lock for a real claim. Without it the script is a dry-run planner.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "config/coordination/agent-work-queue.json"
SUPERVISOR = ROOT / "config/coordination/supervisor-state.json"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def infer_repo() -> str:
    if os.getenv("GITHUB_REPOSITORY"):
        return os.environ["GITHUB_REPOSITORY"]
    remote = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], cwd=ROOT, text=True).strip().removesuffix(".git")
    if remote.startswith("git@github.com:"):
        return remote.split(":", 1)[1]
    return remote.split("github.com/", 1)[1]


def infer_base_sha() -> str:
    for ref in ("origin/main", "main", "HEAD"):
        try:
            return subprocess.check_output(["git", "rev-parse", ref], cwd=ROOT, text=True).strip()
        except Exception:
            pass
    raise SystemExit("Unable to resolve base SHA; pass --base-sha.")


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def dependency_ready(slot: dict[str, Any], slots: list[dict[str, Any]]) -> bool:
    deps = set(slot.get("dependencies") or [])
    if not deps:
        return True
    completed = {
        str(s.get("work_unit_id"))
        for s in slots
        if s.get("status") in {"merged", "completed"} and s.get("work_unit_id")
    }
    return deps.issubset(completed)


def pick_slot(queue: dict[str, Any], requested: str | None) -> dict[str, Any]:
    slots = [s for s in queue.get("slots", []) if isinstance(s, dict)]
    candidates = [
        s for s in slots
        if s.get("status") == "free" and dependency_ready(s, slots)
        and (requested is None or s.get("id") == requested)
    ]
    if not candidates:
        raise SystemExit("No valid dependency-satisfied free slot found.")
    candidates.sort(key=lambda s: (-int(s.get("priority") or 0), str(s.get("id"))))
    return candidates[0]


def create_lock(repo: str, ref: str, sha: str) -> None:
    cmd = ["gh", "api", f"repos/{repo}/git/refs", "-f", f"ref=refs/heads/{ref}", "-f", f"sha={sha}"]
    result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(
            "Atomic claim lost or GitHub ref creation failed. No queue claim was written.\n" + result.stderr.strip()
        )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--slot-id")
    p.add_argument("--agent-id", required=True)
    p.add_argument("--agent-type", default="generic")
    p.add_argument("--base-sha")
    p.add_argument("--repository")
    p.add_argument("--lease-minutes", type=int, default=90)
    p.add_argument("--remote-lock", action="store_true", help="Create the deterministic GitHub ref; required for a real distributed claim")
    p.add_argument("--apply-state", action="store_true", help="Write the queue mirror after the remote lock succeeds")
    args = p.parse_args()

    queue = load(QUEUE)
    supervisor = load(SUPERVISOR)
    slot = pick_slot(queue, args.slot_id)
    epoch = int(supervisor.get("coordination_epoch") or 0)
    base_sha = args.base_sha or infer_base_sha()
    repo = args.repository or infer_repo()
    claim_ref = f"claims/epoch-{epoch:06d}/{slot['id']}"
    lease_id = str(uuid.uuid4())
    claimed = utcnow()
    expires = claimed + timedelta(minutes=max(5, args.lease_minutes))

    print(json.dumps({
        "slot_id": slot["id"], "claim_ref": claim_ref, "base_sha": base_sha,
        "agent_id": args.agent_id, "lease_id": lease_id, "lease_expires_at": iso(expires),
        "coordination_epoch": epoch,
    }, indent=2))

    if not args.remote_lock:
        print("DRY RUN - remote lock not created; this is not a distributed claim.")
        return 0

    create_lock(repo, claim_ref, base_sha)
    if not args.apply_state:
        print("Remote lock created. Caller must persist queue mirror before substantive work.")
        return 0

    slot.update({
        "status": "claimed",
        "claim_branch": claim_ref,
        "claimant": args.agent_id,
        "agent_type": args.agent_type,
        "base_sha": base_sha,
        "claim_id": lease_id,
        "claim_nonce": lease_id,
        "lease_expires_at": iso(expires),
        "coordination_epoch": epoch,
        "claimed_at": iso(claimed),
        "heartbeat_at": iso(claimed),
        "fencing_token": f"{epoch}:{lease_id}",
    })
    queue["updated_at"] = iso(claimed)
    QUEUE.write_text(json.dumps(queue, indent=2) + "\n", encoding="utf-8")
    print("Remote lock won and local queue mirror updated. Commit/push the mirror before implementation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
