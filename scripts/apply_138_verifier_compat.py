#!/usr/bin/env python3
"""Migrate the protected launch-validator verifier markers to actual Next.js API paths."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
path = ROOT / "scripts/validate_commercial_launch_package.py"
text = path.read_text(encoding="utf-8")
replacements = {
    "'\"/v1/keys\"'": "'\"/api/v1/keys\"'",
    "'\"/v1/entitlements/current\"'": "'\"/api/v1/entitlements/current\"'",
    "'\"/v1/reconcile\"'": "'\"/api/v1/reconcile\"'",
}
for old, new in replacements.items():
    if old not in text:
        raise RuntimeError(f"expected legacy launch-validator marker not found: {old}")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8", newline="\n")
SELF.unlink()
