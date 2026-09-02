#!/usr/bin/env python3
"""Static safety checks for the vendor-only ANPOS commercial backend."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "commercial-service"
ERRORS: list[str] = []

REQUIRED = [
    "package.json", "tsconfig.json", "next.config.ts", ".env.example", "README.md",
    "lib/env.ts", "lib/db.ts", "lib/crypto.ts", "lib/github.ts", "lib/auth.ts", "lib/entitlements.ts",
    "app/api/health/route.ts", "app/api/ready/route.ts", "app/api/webhooks/github/marketplace/route.ts",
    "app/api/v1/keys/route.ts", "app/api/v1/entitlements/current/route.ts", "app/api/v1/reconcile/route.ts",
    "app/api/v1/provision/route.ts",
]


def fail(message: str) -> None:
    ERRORS.append(message)


def text(relative: str) -> str:
    path = SERVICE / relative
    if not path.is_file():
        fail(f"missing commercial service file: commercial-service/{relative}")
        return ""
    return path.read_text(encoding="utf-8")


def main() -> int:
    for relative in REQUIRED:
        text(relative)

    package = json.loads(text("package.json") or "{}")
    if package.get("private") is not True:
        fail("commercial-service/package.json must remain private:true")
    for script in ("build", "typecheck"):
        if script not in (package.get("scripts") or {}):
            fail(f"commercial service missing npm script: {script}")

    env_example = text(".env.example")
    for secret_name in (
        "GITHUB_WEBHOOK_SECRET", "GITHUB_APP_PRIVATE_KEY", "ANPOS_ENTITLEMENT_PRIVATE_KEY", "ANPOS_OPERATOR_TOKEN"
    ):
        if secret_name not in env_example:
            fail(f"commercial service environment contract missing {secret_name}")

    all_source = "\n".join(path.read_text(encoding="utf-8") for path in SERVICE.rglob("*.ts") if path.is_file())
    for forbidden in ("BEGIN PRIVATE KEY-----\\nMII", "ghp_", "github_pat_", "postgresql://postgres:"):
        if forbidden in all_source:
            fail(f"commercial service source appears to contain a committed secret marker: {forbidden}")

    webhook = text("app/api/webhooks/github/marketplace/route.ts")
    for marker in ("x-hub-signature-256", "x-github-delivery", "marketplace_purchase", "reconcileEntitlement"):
        if marker not in webhook:
            fail(f"Marketplace webhook missing security/reconciliation marker: {marker}")

    github_client = text("lib/github.ts")
    for marker in ("marketplace_listing/accounts", "2026-03-10", "RSA-SHA256", "access_tokens"):
        if marker not in github_client:
            fail(f"GitHub client missing required current integration marker: {marker}")

    crypto = text("lib/crypto.ts")
    for marker in ("timingSafeEqual", "Ed25519", "base64url"):
        if marker not in crypto:
            fail(f"entitlement cryptography missing marker: {marker}")

    provision = text("app/api/v1/provision/route.ts")
    for marker in ("idempotency-key", "organization_seat_assignment_required", "private_template_access"):
        if marker not in provision:
            fail(f"provisioning guard missing marker: {marker}")

    control = json.loads((ROOT / "config/security/control-plane-policy.json").read_text(encoding="utf-8"))
    if "/commercial-service/**" not in control.get("protected_paths", []):
        fail("commercial service must be a protected control-plane path")
    ownership = json.loads((ROOT / "config/github/path-ownership.json").read_text(encoding="utf-8"))
    if not any(rule.get("pattern") == "/commercial-service/**" and rule.get("independent_review_required") is True for rule in ownership.get("rules", [])):
        fail("commercial service must require independent protected review")
    codeowners = (ROOT / ".github/CODEOWNERS").read_text(encoding="utf-8")
    if "/commercial-service/" not in codeowners:
        fail("source CODEOWNERS must protect commercial-service")

    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for marker in ("commercial-service/node_modules/", "commercial-service/.next/", "commercial-service/.vercel/"):
        if marker not in ignore:
            fail(f".gitignore missing commercial service generated path: {marker}")

    if any((SERVICE / name).exists() for name in (".env", ".vercel", "node_modules", ".next")):
        fail("commercial service source must not contain local secrets/build/runtime artifacts")

    if ERRORS:
        print("ANPOS commercial service validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS commercial service static checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
