#!/usr/bin/env python3
"""Static contract validation for deterministic ANPOS vendor repository export."""
from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "scripts" / "export_vendor_repositories.py"
TESTS = ROOT / "tests" / "test_vendor_repository_export.py"
ERRORS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


def require_markers(source: str, markers: tuple[str, ...], label: str) -> None:
    for marker in markers:
        if marker not in source:
            fail(f"{label} missing marker: {marker}")


def main() -> int:
    if not EXPORTER.is_file():
        fail("missing scripts/export_vendor_repositories.py")
        source = ""
    else:
        source = EXPORTER.read_text(encoding="utf-8")
        try:
            ast.parse(source, filename=str(EXPORTER))
        except SyntaxError as exc:
            fail(f"vendor exporter is not valid Python: {exc}")

    if not TESTS.is_file():
        fail("missing tests/test_vendor_repository_export.py")
        tests = ""
    else:
        tests = TESTS.read_text(encoding="utf-8")
        try:
            ast.parse(tests, filename=str(TESTS))
        except SyntaxError as exc:
            fail(f"vendor exporter tests are not valid Python: {exc}")

    require_markers(
        source,
        (
            'SERVICE_REPOSITORY_NAME = "anpos-commercial-service"',
            'TEMPLATE_REPOSITORY_NAME = "anpos-commercial-template"',
            'source_material": "committed_git_blobs_at_head"',
            '"cat-file", "blob"',
            '"ls-tree", "-r", "-z", "HEAD"',
            'tracked working tree is dirty',
            'secret-like tracked file must not be exported',
            'symlink export is refused',
            'output directory must be outside the canonical source repository',
            'export target already exists',
            'canonical-minus-commercial-service',
            'contains_secrets": False',
        ),
        "vendor exporter",
    )
    require_markers(
        tests,
        (
            "test_service_export_strips_prefix_and_uses_committed_blob_provenance",
            "test_template_export_excludes_vendor_commercial_service",
            "test_untracked_secret_is_never_exported",
            "test_tracked_secret_like_file_fails_closed",
            "test_dirty_tracked_tree_rejected_but_override_still_exports_head_blob",
            "test_existing_target_is_non_destructive",
            "test_output_inside_canonical_repository_is_refused",
            "test_committed_symlink_is_refused",
        ),
        "vendor exporter tests",
    )

    bootstrap = (ROOT / "scripts" / "bootstrap_child.py").read_text(encoding="utf-8")
    if 'VENDOR_ONLY_PATHS = ("commercial-service",)' not in bootstrap:
        fail("child bootstrap must continue stripping commercial-service from customer repositories")

    commercial_validator = (ROOT / "scripts" / "validate_commercial_service.py").read_text(encoding="utf-8")
    if '"commercial-service" not in bootstrap' not in commercial_validator:
        fail("commercial validator must continue enforcing child bootstrap vendor stripping")

    if ERRORS:
        print("ANPOS vendor repository export validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS vendor repository export static checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
