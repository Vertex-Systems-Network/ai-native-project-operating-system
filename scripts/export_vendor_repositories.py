#!/usr/bin/env python3
"""Export vendor-only ANPOS repositories from committed canonical source.

The exporter deliberately reads only Git-tracked files. It creates a private-service
source tree and/or a customer-template source tree without copying untracked local
files such as credentials. Outputs include deterministic provenance manifests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SERVICE_PREFIX = PurePosixPath("commercial-service")
SERVICE_REPOSITORY_NAME = "anpos-commercial-service"
TEMPLATE_REPOSITORY_NAME = "anpos-commercial-template"
MANIFEST_NAME = "EXPORT-MANIFEST.json"
FORBIDDEN_PARTS = {".git", ".bundle", ".next", ".vercel", "node_modules", "__pycache__", ".pytest_cache"}
FORBIDDEN_SECRET_NAMES = {".env", "id_rsa", "id_ed25519"}
FORBIDDEN_SECRET_SUFFIXES = {".pem", ".p12", ".pfx"}
SERVICE_GITIGNORE = """node_modules/\n.next/\n.vercel/\n.env\n.env.*\n!.env.example\n*.pem\n*.p12\n*.pfx\n"""


class ExportError(RuntimeError):
    pass


def run_git(source_root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=source_root, check=False, capture_output=True, text=True
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
        raise ExportError(detail)
    return result.stdout


def tracked_files(source_root: Path) -> list[PurePosixPath]:
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=source_root, check=False, capture_output=True
    )
    if result.returncode != 0:
        raise ExportError(result.stderr.decode("utf-8", errors="replace").strip() or "git ls-files failed")
    paths = [PurePosixPath(item.decode("utf-8")) for item in result.stdout.split(b"\0") if item]
    return sorted(paths, key=lambda value: value.as_posix())


def is_forbidden_secret(relative: PurePosixPath) -> bool:
    name = relative.name.lower()
    if name in FORBIDDEN_SECRET_NAMES:
        return True
    if name.startswith(".env.") and name != ".env.example":
        return True
    return relative.suffix.lower() in FORBIDDEN_SECRET_SUFFIXES


def validate_source_path(source_root: Path, relative: PurePosixPath) -> Path:
    if relative.is_absolute() or ".." in relative.parts:
        raise ExportError(f"unsafe tracked path: {relative.as_posix()}")
    if any(part in FORBIDDEN_PARTS for part in relative.parts):
        raise ExportError(f"generated/runtime path must not be tracked or exported: {relative.as_posix()}")
    if is_forbidden_secret(relative):
        raise ExportError(f"secret-like tracked file must not be exported: {relative.as_posix()}")
    source = source_root.joinpath(*relative.parts)
    if source.is_symlink():
        raise ExportError(f"symlink export is refused: {relative.as_posix()}")
    if not source.is_file():
        raise ExportError(f"tracked path is not a regular file: {relative.as_posix()}")
    return source


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_revision(source_root: Path) -> tuple[str, str]:
    revision = run_git(source_root, "rev-parse", "HEAD").strip()
    tree = run_git(source_root, "rev-parse", "HEAD^{tree}").strip()
    return revision, tree


def ensure_clean_tracked_tree(source_root: Path) -> None:
    dirty = run_git(source_root, "status", "--porcelain", "--untracked-files=no").strip()
    if dirty:
        raise ExportError("tracked working tree is dirty; commit or restore tracked changes before vendor export")


def select_paths(paths: list[PurePosixPath], mode: str) -> list[tuple[PurePosixPath, PurePosixPath]]:
    selected: list[tuple[PurePosixPath, PurePosixPath]] = []
    service_prefix = SERVICE_PREFIX.as_posix() + "/"
    for source_relative in paths:
        text = source_relative.as_posix()
        if mode == "service":
            if not text.startswith(service_prefix):
                continue
            target_relative = PurePosixPath(text[len(service_prefix):])
        elif mode == "template":
            if text == SERVICE_PREFIX.as_posix() or text.startswith(service_prefix):
                continue
            target_relative = source_relative
        else:
            raise ExportError(f"unknown export mode: {mode}")
        selected.append((source_relative, target_relative))
    if not selected:
        raise ExportError(f"no tracked files selected for {mode} export")
    return selected


def copy_selected(
    source_root: Path,
    destination: Path,
    selected: list[tuple[PurePosixPath, PurePosixPath]],
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for source_relative, target_relative in selected:
        source = validate_source_path(source_root, source_relative)
        if is_forbidden_secret(target_relative):
            raise ExportError(f"secret-like export target refused: {target_relative.as_posix()}")
        target = destination.joinpath(*target_relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        records.append(
            {
                "path": target_relative.as_posix(),
                "origin": source_relative.as_posix(),
                "size": target.stat().st_size,
                "sha256": sha256(target),
            }
        )
    return records


def write_generated_service_gitignore(destination: Path, records: list[dict[str, object]]) -> None:
    target = destination / ".gitignore"
    if target.exists():
        return
    target.write_text(SERVICE_GITIGNORE, encoding="utf-8", newline="\n")
    records.append(
        {
            "path": ".gitignore",
            "origin": "generated:vendor-service-gitignore",
            "size": target.stat().st_size,
            "sha256": sha256(target),
        }
    )


def write_manifest(
    destination: Path,
    *,
    mode: str,
    revision: str,
    source_tree: str,
    records: list[dict[str, object]],
) -> None:
    records.sort(key=lambda item: str(item["path"]))
    manifest = {
        "schema_version": 1,
        "export_mode": mode,
        "source_revision": revision,
        "source_tree": source_tree,
        "source_scope": "commercial-service/" if mode == "service" else "canonical-minus-commercial-service",
        "tracked_source_only": True,
        "contains_secrets": False,
        "files": records,
        "file_count": len(records),
        "total_bytes": sum(int(item["size"]) for item in records),
    }
    (destination / MANIFEST_NAME).write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )


def export_repositories(
    source_root: Path,
    output_root: Path,
    *,
    modes: tuple[str, ...] = ("service", "template"),
    allow_dirty_tracked: bool = False,
) -> dict[str, Path]:
    source_root = source_root.resolve()
    output_root = output_root.resolve()
    if source_root == output_root or source_root in output_root.parents:
        raise ExportError("output directory must be outside the canonical source repository")
    if not allow_dirty_tracked:
        ensure_clean_tracked_tree(source_root)

    revision, tree = source_revision(source_root)
    tracked = tracked_files(source_root)
    target_names = {
        "service": SERVICE_REPOSITORY_NAME,
        "template": TEMPLATE_REPOSITORY_NAME,
    }
    for mode in modes:
        if mode not in target_names:
            raise ExportError(f"unknown export mode: {mode}")
        if (output_root / target_names[mode]).exists():
            raise ExportError(f"export target already exists: {output_root / target_names[mode]}")

    output_root.mkdir(parents=True, exist_ok=True)
    stage_root = Path(tempfile.mkdtemp(prefix=".anpos-vendor-export-", dir=output_root))
    staged: dict[str, Path] = {}
    try:
        for mode in modes:
            destination = stage_root / target_names[mode]
            destination.mkdir(parents=True)
            records = copy_selected(source_root, destination, select_paths(tracked, mode))
            if mode == "service":
                write_generated_service_gitignore(destination, records)
            write_manifest(destination, mode=mode, revision=revision, source_tree=tree, records=records)
            staged[mode] = destination

        final: dict[str, Path] = {}
        for mode in modes:
            target = output_root / target_names[mode]
            os.replace(staged[mode], target)
            final[mode] = target
        return final
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Parent directory outside the canonical repository")
    parser.add_argument("--mode", choices=("all", "service", "template"), default="all")
    parser.add_argument(
        "--allow-dirty-tracked",
        action="store_true",
        help="Development-only override; production/vendor migration should export a clean tracked tree",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    modes = ("service", "template") if args.mode == "all" else (args.mode,)
    try:
        outputs = export_repositories(
            ROOT,
            args.output,
            modes=modes,
            allow_dirty_tracked=args.allow_dirty_tracked,
        )
    except ExportError as exc:
        print(f"ANPOS vendor export failed: {exc}", file=sys.stderr)
        return 1
    for mode, path in outputs.items():
        print(f"{mode}: {path}")
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main())
