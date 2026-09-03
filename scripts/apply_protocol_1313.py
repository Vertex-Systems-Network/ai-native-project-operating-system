#!/usr/bin/env python3
"""Apply ANPOS 1.3.13 persistent source continuous-certification bookkeeping once."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_PROTOCOL = "1.3.12"
NEW_PROTOCOL = "1.3.13"
OLD_SERVICE = "0.3.5"
NEW_SERVICE = "0.3.6"
MIGRATION_ID = "ANPOS-1.3.12-to-1.3.13"
RUNTIME_CONTRACT = "split-github-app-v1"
SOURCE_CI_ASSETS = [
    ".github/workflows/source-continuous-certification.yml",
    "scripts/validate_source_continuous_certification.py",
    "tests/test_source_continuous_certification.py",
]


def load_json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def write_json(relative: str, value: dict) -> None:
    (ROOT / relative).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: expected marker not found: {old!r}")
    return text.replace(old, new, 1)


def main() -> int:
    version = load_json("config/protocol/version.json")
    package = load_json("commercial-service/package.json")
    lock = load_json("commercial-service/package-lock.json")
    instance = load_json("config/protocol/instance.json")
    migrations = load_json("config/protocol/migrations.json")
    boundary = load_json("config/licensing/vendor-source-boundary.json")

    if version.get("version") != OLD_PROTOCOL:
        raise SystemExit(f"expected protocol {OLD_PROTOCOL}, got {version.get('version')!r}")
    if package.get("version") != OLD_SERVICE:
        raise SystemExit(f"expected commercial service {OLD_SERVICE}, got {package.get('version')!r}")
    if (package.get("anpos") or {}).get("source_protocol_version") != OLD_PROTOCOL:
        raise SystemExit("commercial service protocol identity does not match 1.3.12 base")
    if (package.get("anpos") or {}).get("runtime_contract") != RUNTIME_CONTRACT:
        raise SystemExit("commercial service runtime contract drifted")
    if migrations.get("current_protocol_version") != OLD_PROTOCOL:
        raise SystemExit("migration ledger current version does not match 1.3.12 base")
    if instance.get("source_protocol_version") != OLD_PROTOCOL:
        raise SystemExit("instance source protocol version does not match 1.3.12 base")
    if boundary.get("activation_scope") != "canonical_vendor_source_management_only":
        raise SystemExit("vendor source boundary activation scope is invalid")

    version["version"] = NEW_PROTOCOL
    version["last_protocol_migration"] = MIGRATION_ID
    write_json("config/protocol/version.json", version)

    instance["source_protocol_version"] = NEW_PROTOCOL
    note = (
        " ANPOS 1.3.13 adds a canonical-source-only persistent GitHub Actions certification guard for pull requests to main and pushes to main. "
        "The workflow is repository-guarded, read-only, SHA-pinned, runs the full source/commercial/vendor certification suite, and is stripped from customer child/vendor-template outputs. "
        "GitHub branch protection/ruleset enforcement remains separate authenticated repository administration evidence and is not inferred from workflow presence."
    )
    notes = str(instance.get("notes") or "")
    if "ANPOS 1.3.13 adds a canonical-source-only persistent GitHub Actions certification guard" not in notes:
        instance["notes"] = notes.rstrip() + note
    write_json("config/protocol/instance.json", instance)

    existing_ids = {row.get("id") for row in migrations.get("applied_migrations", []) if isinstance(row, dict)}
    if MIGRATION_ID in existing_ids:
        raise SystemExit(f"migration {MIGRATION_ID} already exists unexpectedly")
    migrations["current_protocol_version"] = NEW_PROTOCOL
    migrations.setdefault("applied_migrations", []).append(
        {
            "id": MIGRATION_ID,
            "from_version": OLD_PROTOCOL,
            "to_version": NEW_PROTOCOL,
            "detected_at": "2026-09-04T00:00:00+05:00",
            "impact": [
                "Add a permanent canonical-source GitHub Actions certification workflow for pull requests targeting main and pushes to main instead of relying only on temporary release workflows",
                "Keep the source certification workflow read-only, repository-guarded, concurrency-bounded and pinned to immutable GitHub Action commit SHAs",
                "Run the complete Python test/validator suite, deterministic vendor export and exact handoff verification, locked npm audit, TypeScript tests and Next.js build on every source certification run",
                "Add a dedicated validator and regression tests so the persistent source CI contract cannot silently lose core gates, gain write/secrets authority, or use floating Action refs",
                "Classify the persistent source CI workflow/validator/tests as canonical-vendor-source-only so customer child repositories and anpos-commercial-template exports do not inherit source maintenance automation",
                "Replace the previous source test that required zero workflows with an exact allowlist for the single guarded source certification workflow",
                "Bump deployable commercial service identity because /api/version must attest the canonical ANPOS 1.3.13 source protocol identity",
                "Do not claim or fabricate GitHub branch protection/ruleset enforcement; authenticated repository settings currently remain an external governance control"
            ],
            "project_conflicts": [],
            "requires_owner_consent": False,
            "child_migration_rule": "The persistent certification workflow is canonical-source-only and is stripped from customer/template exports. Existing child repositories keep their normal child workflow model and should not copy this source-maintenance workflow merely by adopting protocol 1.3.13.",
            "status": "applied",
            "applied_at": "2026-09-04T00:00:00+05:00",
            "verification_evidence": [
                ".github/workflows/source-continuous-certification.yml is committed only on the canonical source and triggers on pull_request/main plus push/main",
                "scripts/validate_source_continuous_certification.py fails on write permissions, secret references, floating Action refs, missing certification gates, or missing vendor-boundary exclusions",
                "tests/test_source_continuous_certification.py covers read-only repository guard, immutable Action refs, full certification markers, and source-only stripping",
                "config/licensing/vendor-source-boundary.json strips all three source continuous-certification assets from customer/template exports",
                "GitHub branch protection/ruleset enforcement remains external evidence and is not marked verified by this migration"
            ]
        }
    )
    template = migrations.get("migration_record_template")
    if isinstance(template, dict):
        template["id"] = "ANPOS-1.3.13-to-NEXT"
        template["from_version"] = NEW_PROTOCOL
        if "to_version" in template:
            template["to_version"] = "NEXT"
    write_json("config/protocol/migrations.json", migrations)

    package["version"] = NEW_SERVICE
    package.setdefault("anpos", {})["source_protocol_version"] = NEW_PROTOCOL
    package["anpos"]["runtime_contract"] = RUNTIME_CONTRACT
    write_json("commercial-service/package.json", package)

    lock["version"] = NEW_SERVICE
    root_package = (lock.get("packages") or {}).get("")
    if not isinstance(root_package, dict):
        raise SystemExit("commercial-service/package-lock.json missing root package metadata")
    root_package["version"] = NEW_SERVICE
    write_json("commercial-service/package-lock.json", lock)

    vendor_only = boundary.get("vendor_only_paths")
    if not isinstance(vendor_only, list):
        raise SystemExit("vendor source boundary vendor_only_paths must be a list")
    for path in SOURCE_CI_ASSETS:
        if path not in vendor_only:
            vendor_only.append(path)
    if len(vendor_only) != len(set(vendor_only)):
        raise SystemExit("vendor source boundary contains duplicate vendor_only_paths")
    write_json("config/licensing/vendor-source-boundary.json", boundary)

    readme_path = ROOT / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    readme = replace_once(readme, "**Current protocol:** `1.3.12`", "**Current protocol:** `1.3.13`", "README protocol")
    readme = replace_once(
        readme,
        "- no child-project runtime/quality workflows or Dependabot config are active under source `.github/`;",
        "- no child-project runtime/quality workflows or Dependabot config are active under source `.github/`; the only active source workflow is the repository-guarded, read-only continuous certification guard, and it is stripped from customer/vendor-template outputs;",
        "README source workflow boundary",
    )
    section = """## Persistent source continuous certification in 1.3.13

The canonical source now retains exactly one active GitHub Actions workflow: `.github/workflows/source-continuous-certification.yml`.

- It runs on pull requests targeting `main` and on pushes to `main`.
- It is hard-bound to `Vertex-Systems-Network/ai-native-project-operating-system`, uses read-only repository permissions, does not consume repository secrets, disables checkout credential persistence, and pins GitHub Actions to immutable commit SHAs.
- It runs the complete Python conformance/validator suite, deterministic vendor export + exact handoff verification, locked npm audit, commercial TypeScript tests, and the Next.js production build.
- Its workflow, validator, and regression test are canonical-vendor-source-only assets and are removed from customer child repositories and `anpos-commercial-template` exports through the committed vendor source boundary.
- Workflow success is CI evidence only. GitHub branch protection/rulesets, required-check enforcement, bypass policy, and review requirements remain repository-administration controls that must be independently configured and re-read before they can be called enforced.

"""
    if "## Persistent source continuous certification in 1.3.13" not in readme:
        readme = replace_once(readme, "## New child-project startup\n", section + "## New child-project startup\n", "README section insertion")
    readme_path.write_text(readme, encoding="utf-8")

    governance_path = ROOT / "GITHUB-GOVERNANCE.md"
    governance = governance_path.read_text(encoding="utf-8")
    old_block = """- Rules policy is an inactive reusable blueprint;
- missing child rules on the canonical source are not project-governance drift;
- do not silently apply child merge/ruleset settings to the source;
- `blueprints/github/workflows/governance-audit.yml` stays inactive on the source;
- source repository settings are maintained separately from the child-project flow.
"""
    new_block = """- Rules policy is an inactive reusable child-project blueprint;
- missing child rules on the canonical source are not child-project governance drift;
- do not silently apply child merge/ruleset settings to the source;
- `blueprints/github/workflows/governance-audit.yml` stays inactive on the source;
- the canonical source may retain exactly one source-maintenance workflow, `.github/workflows/source-continuous-certification.yml`, which is repository-guarded, read-only and stripped from customer/vendor-template outputs;
- source branch protection/rulesets, review requirements, bypass actors and required-check enforcement are repository settings maintained and verified separately from child-project policy and from CI workflow presence.
"""
    governance = replace_once(governance, old_block, new_block, "GITHUB governance source boundary")
    governance_path.write_text(governance, encoding="utf-8")

    test_path = ROOT / "tests" / "test_control_plane.py"
    tests = test_path.read_text(encoding="utf-8")
    old_test = '''    def test_source_has_no_active_child_workflows(self):
        workflow_dir = ROOT / ".github" / "workflows"
        active = list(workflow_dir.glob("*.yml")) + list(workflow_dir.glob("*.yaml")) if workflow_dir.exists() else []
        self.assertEqual(active, [])
'''
    new_test = '''    def test_source_has_only_guarded_source_certification_workflow(self):
        workflow_dir = ROOT / ".github" / "workflows"
        active = sorted(
            [p.name for p in workflow_dir.glob("*.yml")] +
            [p.name for p in workflow_dir.glob("*.yaml")]
        ) if workflow_dir.exists() else []
        self.assertEqual(active, ["source-continuous-certification.yml"])
        source = (workflow_dir / "source-continuous-certification.yml").read_text()
        self.assertIn(
            "github.repository == 'Vertex-Systems-Network/ai-native-project-operating-system'",
            source,
        )
'''
    tests = replace_once(tests, old_test, new_test, "control-plane source workflow regression")
    test_path.write_text(tests, encoding="utf-8")

    # This helper is a one-shot migration aid and must not remain in canonical source.
    Path(__file__).unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
