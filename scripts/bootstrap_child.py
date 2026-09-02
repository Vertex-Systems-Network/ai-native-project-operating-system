#!/usr/bin/env python3
"""Canonical ANPOS child bootstrap entrypoint.

Runs the normal child initializer and then strips vendor-only commercial runtime
source from child repositories so customer/template copies cannot retain the
seller's billing backend implementation.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR_ONLY_PATHS = ("commercial-service",)


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--apply", action="store_true")
    known, passthrough = parser.parse_known_args()

    command = [sys.executable, str(ROOT / "scripts" / "bootstrap_instance.py")]
    if known.apply:
        command.append("--apply")
    command.extend(passthrough)

    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0:
        return result.returncode

    if not known.apply:
        print("NOTE: canonical child bootstrap will remove vendor-only paths on --apply:")
        for relative in VENDOR_ONLY_PATHS:
            print(f"- {relative}/")
        return 0

    removed: list[str] = []
    for relative in VENDOR_ONLY_PATHS:
        target = ROOT / relative
        if target.is_dir():
            shutil.rmtree(target)
            removed.append(relative)
        elif target.exists():
            target.unlink()
            removed.append(relative)

    print("Vendor-only source removed from child repository:" if removed else "No vendor-only source present in child repository.")
    for relative in removed:
        print(f"- {relative}/")
    print("NEXT: commit the generated child initialization changes, including vendor-only removals, before project development.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
