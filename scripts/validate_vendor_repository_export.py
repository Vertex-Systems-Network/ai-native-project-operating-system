#!/usr/bin/env python3
"""Static contract validation for deterministic ANPOS vendor repository export."""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "scripts" / "export_vendor_repositories.py"
TESTS = ROOT / "tests" / "test_vendor_repository_export.py"
VENDOR_QUALITY_BLUEPRINT = ROOT / "blueprints" / "commercial" / "vendor-launch-quality.yml"
CHILD_QUALITY_BLUEPRINT = ROOT / "blueprints" / "github" / "workflows" / "repository-quality.yml"
BOUNDARY = ROOT / "config" / "licensing" / "vendor-source-boundary.json"
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

    if not BOUNDARY.is_file():
        fail("missing config/licensing/vendor-source-boundary.json")
        boundary = {}
    else:
        try:
            boundary = json.loads(BOUNDARY.read_text(encoding="utf-8"))
        except Exception as exc:
            fail(f"vendor source boundary is not valid JSON: {exc}")
            boundary = {}
    if boundary.get("activation_scope") != "canonical_vendor_source_management_only":
        fail("vendor source boundary activation scope must remain canonical_vendor_source_management_only")
    vendor_only = set(boundary.get("vendor_only_paths") or [])
    for required in (
        "commercial-service",
        "scripts/export_vendor_repositories.py",
        "scripts/validate_vendor_repository_export.py",
        "tests/test_vendor_repository_export.py",
        "scripts/verify_commercial_production.py",
        "blueprints/commercial/production-launch-checklist.json",
        "blueprints/commercial/vendor-launch-quality.yml",
    ):
        if required not in vendor_only:
            fail(f"vendor source boundary missing required path: {required}")

    require_markers(
        source,
        (
            'SERVICE_REPOSITORY_NAME = "anpos-commercial-service"',
            'TEMPLATE_REPOSITORY_NAME = "anpos-commercial-template"',
            'VENDOR_BOUNDARY_REPOSITORY_PATH = "config/licensing/vendor-source-boundary.json"',
            'source_material": "committed_git_blobs_at_head"',
            '"cat-file", "blob"',
            '"ls-tree", "-r", "-z", "HEAD"',
            '"show", f"HEAD:{VENDOR_BOUNDARY_REPOSITORY_PATH}"',
            'tracked working tree is dirty',
            'secret-like tracked file must not be exported',
            'symlink export is refused',
            'output directory must be outside the canonical source repository',
            'export target already exists',
            'canonical-minus-vendor-only-paths',
            'path_matches_vendor_only(entry.path, vendor_only_paths)',
            'contains_secrets": False',
        ),
        "vendor exporter",
    )
    require_markers(
        tests,
        (
            "test_service_export_strips_prefix_and_uses_committed_blob_provenance",
            "test_template_export_excludes_all_vendor_only_paths",
            "test_untracked_secret_is_never_exported",
            "test_tracked_secret_like_file_fails_closed",
            "test_dirty_tracked_tree_rejected_but_override_still_exports_head_blob",
            "test_existing_target_is_non_destructive",
            "test_output_inside_canonical_repository_is_refused",
            "test_invalid_committed_vendor_boundary_fails_closed",
            "test_committed_symlink_is_refused",
        ),
        "vendor exporter tests",
    )

    if not VENDOR_QUALITY_BLUEPRINT.is_file():
        fail("missing blueprints/commercial/vendor-launch-quality.yml")
    else:
        quality = VENDOR_QUALITY_BLUEPRINT.read_text(encoding="utf-8")
        require_markers(
            quality,
            (
                "python scripts/validate_vendor_repository_export.py",
                "scripts/.trusted-base-vendor-export-validator.py",
                "tests.test_vendor_repository_export",
            ),
            "vendor-only quality blueprint export integration",
        )

    child_quality = CHILD_QUALITY_BLUEPRINT.read_text(encoding="utf-8") if CHILD_QUALITY_BLUEPRINT.is_file() else ""
    if "validate_vendor_repository_export.py" in child_quality or "test_vendor_repository_export" in child_quality:
        fail("child repository-quality blueprint must not depend on vendor-only export files")

    bootstrap = (ROOT / "scripts" / "bootstrap_child.py").read_text(encoding="utf-8")
    require_markers(
        bootstrap,
        (
            "VENDOR_BOUNDARY_PATH",
            "load_vendor_only_paths",
            'activation_scope") != "canonical_vendor_source_management_only"',
            "for relative in vendor_only_paths",
        ),
        "child bootstrap vendor source boundary",
    )

    if ERRORS:
        print("ANPOS vendor repository export validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS vendor repository export static checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
