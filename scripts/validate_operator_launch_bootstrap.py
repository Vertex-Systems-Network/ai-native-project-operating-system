#!/usr/bin/env python3
"""Static and behavioral validation for secret-safe operator launch bootstrap tooling."""
from __future__ import annotations

import ast
import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "scripts/render_operator_launch_bootstrap.py"
DOC = ROOT / "blueprints/commercial/operator-launch-bootstrap.md"
TESTS = ROOT / "tests/test_operator_launch_bootstrap.py"
BOUNDARY = ROOT / "config/licensing/vendor-source-boundary.json"
VENDOR_QUALITY = ROOT / "blueprints/commercial/vendor-launch-quality.yml"
CHILD_QUALITY = ROOT / "blueprints/github/workflows/repository-quality.yml"
MARKETPLACE_BLUEPRINT = ROOT / "blueprints/commercial/github-marketplace-app-manifest.example.json"
VENDOR_BLUEPRINT = ROOT / "blueprints/commercial/github-vendor-app-manifest.example.json"
ENV_EXAMPLE = ROOT / "commercial-service/.env.example"
ERRORS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


def read(path: Path) -> str:
    if not path.is_file():
        fail(f"missing {path.relative_to(ROOT)}")
        return ""
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> dict:
    try:
        data = json.loads(read(path) or "{}")
    except Exception as exc:
        fail(f"{path.relative_to(ROOT)} is not valid JSON: {exc}")
        return {}
    if not isinstance(data, dict):
        fail(f"{path.relative_to(ROOT)} must contain a JSON object")
        return {}
    return data


def parse_query(url: str) -> dict[str, list[str]]:
    return urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)


def render(extra: list[str] | None = None) -> dict:
    command = [
        sys.executable,
        str(RENDERER),
        "--organization",
        "Vertex-Systems-Network",
        "--service-base-url",
        "https://license.example.test",
        "--homepage-url",
        "https://example.test/anpos",
    ]
    if extra:
        command.extend(extra)
    try:
        result = subprocess.run(command, cwd=ROOT, check=True, text=True, capture_output=True)
        data = json.loads(result.stdout)
    except Exception as exc:
        fail(f"operator launch renderer behavioral check failed: {exc}")
        return {}
    if not isinstance(data, dict):
        fail("operator launch renderer output must be a JSON object")
        return {}
    return data


def main() -> int:
    renderer_source = read(RENDERER)
    doc = read(DOC)
    tests_source = read(TESTS)
    vendor_quality = read(VENDOR_QUALITY)
    child_quality = read(CHILD_QUALITY)
    env_example = read(ENV_EXAMPLE)

    for source, path in ((renderer_source, RENDERER), (tests_source, TESTS)):
        if source:
            try:
                ast.parse(source, filename=str(path))
            except SyntaxError as exc:
                fail(f"{path.relative_to(ROOT)} is not valid Python: {exc}")

    for forbidden in (
        "--private-key",
        "--webhook-secret",
        "--database-url",
        "--operator-token",
        "--marketplace-plan-id",
        "--price",
    ):
        if forbidden in renderer_source:
            fail(f"operator launch renderer must not accept secret/business-authority CLI flag: {forbidden}")

    for marker in (
        "GITHUB_MARKETPLACE_APP_ID",
        "GITHUB_MARKETPLACE_APP_PRIVATE_KEY",
        "GITHUB_VENDOR_APP_ID",
        "GITHUB_VENDOR_APP_PRIVATE_KEY",
        "GITHUB_VENDOR_INSTALLATION_ID",
        "ANPOS_PRIVATE_TEMPLATE_REPO",
        "legacy_single_app_environment_keys_forbidden",
        "launch_authorized",
        "marketplace_purchase",
        "administration",
        "contents",
    ):
        if marker not in renderer_source:
            fail(f"operator launch renderer missing marker: {marker}")

    data = render()
    if data:
        if data.get("status") != "operator_actions_required" or data.get("launch_authorized") is not False:
            fail("operator launch renderer must remain fail-closed and non-authoritative")
        apps = data.get("github_apps") or {}
        marketplace = apps.get("marketplace") or {}
        vendor = apps.get("vendor_distribution") or {}
        if marketplace.get("public") is not True or vendor.get("public") is not False:
            fail("operator launch renderer must preserve public Marketplace/private Vendor App split")
        mq = parse_query(str(marketplace.get("registration_url") or ""))
        vq = parse_query(str(vendor.get("registration_url") or ""))
        if mq.get("public") != ["true"] or mq.get("webhook_active") != ["true"]:
            fail("Marketplace registration URL must prefill public visibility and active webhook")
        if mq.get("events[]") != ["marketplace_purchase"]:
            fail("Marketplace registration URL must subscribe to marketplace_purchase")
        if mq.get("webhook_url") != ["https://license.example.test/api/webhooks/github/marketplace"]:
            fail("Marketplace registration URL must target the commercial Marketplace webhook")
        if "administration" in mq or "contents" in mq:
            fail("Marketplace registration URL must not request vendor template repository permissions")
        if vq.get("public") != ["false"] or vq.get("webhook_active") != ["false"]:
            fail("Vendor registration URL must prefill private visibility and disabled webhook")
        if vq.get("contents") != ["read"] or "administration" in vq:
            fail("Vendor default registration must remain archive-only Contents: read")
        if set(data.get("legacy_single_app_environment_keys_forbidden") or []) != {"GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"}:
            fail("operator handoff must explicitly forbid legacy single-App environment keys")

        serialized = json.dumps(data, sort_keys=True)
        for secret_marker in ("BEGIN PRIVATE KEY", "github_pat_", "ghp_", "postgresql://"):
            if secret_marker in serialized:
                fail(f"operator handoff output appears to contain secret material: {secret_marker}")

    collaborator = render(["--enable-collaborator-provisioning"])
    if collaborator:
        vendor = ((collaborator.get("github_apps") or {}).get("vendor_distribution") or {})
        vq = parse_query(str(vendor.get("registration_url") or ""))
        if vq.get("administration") != ["write"]:
            fail("collaborator mode must explicitly add Vendor Administration: write")

    marketplace_blueprint = load_json(MARKETPLACE_BLUEPRINT)
    vendor_blueprint = load_json(VENDOR_BLUEPRINT)
    if (marketplace_blueprint.get("required_defaults") or {}).get("public") is not True:
        fail("operator renderer depends on public Marketplace App blueprint")
    archive = ((vendor_blueprint.get("minimum_permissions_by_capability") or {}).get("archive_first_delivery") or {})
    if archive.get("contents") != "read" or "administration" in archive:
        fail("operator renderer depends on archive-only Vendor App blueprint")

    for env_name in (
        "GITHUB_MARKETPLACE_APP_ID",
        "GITHUB_MARKETPLACE_APP_PRIVATE_KEY",
        "GITHUB_VENDOR_APP_ID",
        "GITHUB_VENDOR_APP_PRIVATE_KEY",
        "GITHUB_VENDOR_INSTALLATION_ID",
        "ANPOS_PRIVATE_TEMPLATE_REPO",
    ):
        if env_name not in env_example:
            fail(f"commercial service 0.3.0 environment example missing operator handoff key: {env_name}")
    for legacy in ("\nGITHUB_APP_ID=", "\nGITHUB_APP_PRIVATE_KEY="):
        if legacy in env_example:
            fail("commercial service environment example must not restore legacy single-App credentials")

    for marker in (
        "secret-safe renderer",
        "public Marketplace App",
        "private Vendor Distribution App",
        "GITHUB_MARKETPLACE_APP_ID",
        "GITHUB_VENDOR_APP_ID",
        "Legacy `GITHUB_APP_ID`",
        "/api/ready",
        "Re-check current GitHub App and GitHub Marketplace requirements",
    ):
        if marker not in doc:
            fail(f"operator launch bootstrap documentation missing marker: {marker}")

    boundary = load_json(BOUNDARY)
    vendor_only = set(boundary.get("vendor_only_paths") or [])
    for relative in (
        "blueprints/commercial/operator-launch-bootstrap.md",
        "scripts/render_operator_launch_bootstrap.py",
        "scripts/validate_operator_launch_bootstrap.py",
        "tests/test_operator_launch_bootstrap.py",
    ):
        if relative not in vendor_only:
            fail(f"vendor source boundary missing operator bootstrap path: {relative}")

    if "python scripts/validate_operator_launch_bootstrap.py" not in vendor_quality:
        fail("vendor launch quality blueprint must run operator launch bootstrap validator")
    if "tests.test_operator_launch_bootstrap" not in vendor_quality:
        fail("vendor launch quality blueprint must run operator launch bootstrap tests")
    if "validate_operator_launch_bootstrap.py" in child_quality or "test_operator_launch_bootstrap" in child_quality:
        fail("child repository quality blueprint must not depend on vendor-only operator bootstrap tooling")

    if ERRORS:
        print("ANPOS operator launch bootstrap validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS operator launch bootstrap checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
