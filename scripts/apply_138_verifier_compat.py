#!/usr/bin/env python3
"""Preserve the existing launch-validator safety marker while hardening its meaning."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
path = ROOT / "scripts/verify_commercial_production.py"
text = path.read_text(encoding="utf-8")
old = '''        print(\n            "NOTE: production launch is not certified unless --require-ready includes exact expected versions, "\n            "readiness passes, and real Marketplace E2E evidence is recorded."\n        )\n'''
new = '''        print(\n            "NOTE: production launch is not certified unless --require-ready passes and real Marketplace E2E evidence is recorded. "\n            "--require-ready also requires exact expected service/protocol versions and exact deployment identity."\n        )\n'''
if old not in text:
    raise RuntimeError("expected pre-1.3.8 verifier note not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
SELF.unlink()
