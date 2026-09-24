import { createHash } from "node:crypto";
import type { SandboxFileArtifact } from "./execution-sandbox";

export const FULL_PLAN_SANDBOX_RUNNER = String.raw`from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd().resolve()
INPUT_ROOT = ROOT / ".anpos-input"
RELEASE_ROOT = INPUT_ROOT / "release"
PLAN_PATH = INPUT_ROOT / "plan.json"
WRITE_ACTIONS = {"add_from_release", "replace_from_release", "bootstrap_transform"}
NO_WRITE_ACTIONS = {"unchanged", "preserve_project_state"}
BOOTSTRAP_MODES = {"bootstrap_child", "adopt_existing"}


def safe_relative(value: str) -> Path:
    if not value or "\x00" in value or "\r" in value or "\n" in value or "\\" in value:
        raise RuntimeError("invalid_plan_path")
    candidate = Path(value)
    if candidate.is_absolute() or any(part in {"", ".", "..", ".git"} for part in candidate.parts):
        raise RuntimeError("invalid_plan_path")
    return candidate


def ensure_regular(path: Path) -> None:
    if not path.exists() or not path.is_file() or path.is_symlink():
        raise RuntimeError("expected_regular_file")


plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
mode = str(plan.get("mode") or "")
if mode not in {"bootstrap_child", "adopt_existing", "repair_partial", "upgrade_active"}:
    raise RuntimeError("unsupported_full_apply_mode")
if plan.get("conflict_free") is not True or plan.get("safe_to_apply") is not True:
    raise RuntimeError("unsafe_full_plan")
if plan.get("apply_implementation") != "sandbox_full_plan_v1":
    raise RuntimeError("full_apply_contract_mismatch")

actions = plan.get("actions")
if not isinstance(actions, list) or len(actions) > 5000:
    raise RuntimeError("invalid_plan_actions")

output_paths = []
for row in actions:
    if not isinstance(row, dict):
        raise RuntimeError("invalid_plan_action")
    action = str(row.get("action") or "")
    rel = safe_relative(str(row.get("path") or ""))
    if action in {"manual_merge", "migration_review"}:
        raise RuntimeError("unresolved_plan_conflict")
    copy_for_bootstrap = mode in BOOTSTRAP_MODES and action == "unchanged"
    if action in NO_WRITE_ACTIONS and not copy_for_bootstrap:
        continue
    if action not in WRITE_ACTIONS and not copy_for_bootstrap:
        raise RuntimeError("unsupported_plan_action")

    source = (RELEASE_ROOT / rel).resolve()
    destination = (ROOT / rel).resolve()
    if RELEASE_ROOT.resolve() not in source.parents:
        raise RuntimeError("release_path_escape")
    if ROOT not in destination.parents:
        raise RuntimeError("workspace_path_escape")
    ensure_regular(source)
    data = source.read_bytes()
    expected_sha = str(row.get("release_sha256") or "").lower()
    if hashlib.sha256(data).hexdigest() != expected_sha:
        raise RuntimeError("release_input_digest_mismatch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    mode_bits = 0o755 if row.get("release_mode") == "100755" else 0o644
    destination.chmod(mode_bits)
    if action in WRITE_ACTIONS:
        output_paths.append(rel.as_posix())

if mode in BOOTSTRAP_MODES:
    context = plan.get("bootstrap_context")
    target = plan.get("target")
    if not isinstance(context, dict) or not isinstance(target, dict):
        raise RuntimeError("bootstrap_context_required")
    repository = str(target.get("repository_full_name") or "")
    project_name = str(context.get("project_name") or "")
    owner = str(context.get("github_owner") or "")
    capability = str(context.get("github_security_capability") or "unknown")
    capability_arg = "auto" if capability == "unknown" else capability
    bootstrap = ROOT / "scripts" / "bootstrap_instance.py"
    ensure_regular(bootstrap)
    env = dict(os.environ)
    env.pop("ANPOS_GITHUB_SECURITY_CAPABLE", None)
    subprocess.run(
        [
            sys.executable,
            str(bootstrap),
            "--apply",
            "--repository",
            repository,
            "--project-name",
            project_name,
            "--github-owner",
            owner,
            "--github-security-capability",
            capability_arg,
        ],
        cwd=ROOT,
        env=env,
        check=True,
        shell=False,
        stdin=subprocess.DEVNULL,
    )

expected_outputs = set(output_paths)
for row in actions:
    if row.get("action") == "bootstrap_transform":
        expected_outputs.add(safe_relative(str(row.get("path") or "")).as_posix())

for rel_text in sorted(expected_outputs):
    path = (ROOT / safe_relative(rel_text)).resolve()
    if ROOT not in path.parents:
        raise RuntimeError("workspace_path_escape")
    ensure_regular(path)

receipt = {
    "protocol_version": 1,
    "mode": mode,
    "planned_actions": len(actions),
    "output_paths": len(expected_outputs),
}
print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
`;

export function sandboxUtf8Artifact(
  path: string,
  content: string,
  mode: "100644" | "100755" = "100644",
): SandboxFileArtifact {
  const raw = Buffer.from(content, "utf8");
  return {
    path,
    mode,
    content_base64: raw.toString("base64"),
    sha256: createHash("sha256").update(raw).digest("hex"),
    bytes: raw.length,
  };
}
