from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ".github/workflows/source-continuous-certification.yml"
HANDOFF_WORKFLOW_PATH = ".github/workflows/immutable-vendor-handoff.yml"
DEPLOY_WORKFLOW_PATH = ".github/workflows/commercial-production-deploy.yml"
MIGRATE_WORKFLOW_PATH = ".github/workflows/commercial-production-migrate.yml"


class SourceContinuousCertificationTests(unittest.TestCase):
    def source(self) -> str:
        result = subprocess.run(
            ["git", "show", f"HEAD:{WORKFLOW_PATH}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout

    def test_source_workflow_is_guarded_read_only_and_main_scoped(self):
        source = self.source()
        self.assertIn("pull_request:", source)
        self.assertIn("push:", source)
        self.assertIn("- main", source)
        self.assertIn("contents: read", source)
        self.assertIn("cancel-in-progress: true", source)
        self.assertIn("github.repository == 'Vertex-Systems-Network/ai-native-project-operating-system'", source)
        self.assertNotIn("pull_request_target:", source)
        self.assertNotIn("secrets.", source)
        self.assertIsNone(
            re.search(r"^\s*[A-Za-z0-9_-]+:\s*write\s*$", source, flags=re.MULTILINE),
            "source CI must remain read-only",
        )

    def test_checkout_is_bound_to_exact_event_source_revision(self):
        source = self.source()
        expression = "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}"
        self.assertIn(f"ref: {expression}", source)
        self.assertIn(f"EXPECTED_SOURCE_SHA: {expression}", source)
        self.assertIn('test "$(git rev-parse HEAD)" = "$EXPECTED_SOURCE_SHA"', source)
        self.assertIn("persist-credentials: false", source)
        self.assertIn("fetch-depth: 0", source)

    def test_actions_are_commit_pinned(self):
        uses_lines = [line.strip() for line in self.source().splitlines() if line.strip().startswith("uses:")]
        self.assertTrue(uses_lines)
        for line in uses_lines:
            self.assertIn("@", line)
            self.assertRegex(line.rsplit("@", 1)[1], r"^[0-9a-f]{40}$")

    def test_full_certification_gates_are_present(self):
        source = self.source()
        for marker in (
            "python -m unittest discover -s tests -p 'test_*.py' -v",
            "python scripts/validate_ai_native_repo.py",
            "python scripts/validate_commercial_licensing.py",
            "python scripts/validate_commercial_service.py",
            "python scripts/validate_vendor_repository_export.py",
            "python scripts/validate_commercial_launch_package.py",
            "python scripts/validate_marketplace_staged_launch.py",
            "python scripts/validate_operator_launch_bootstrap.py",
            "python scripts/validate_deployment_identity.py",
            "python scripts/validate_source_continuous_certification.py",
            "scripts/export_vendor_repositories.py",
            "scripts/verify_vendor_handoff.py",
            "npm audit --audit-level=low",
            "npm run certify",
        ):
            self.assertIn(marker, source)

    def test_immutable_handoff_workflow_uses_verified_receipt_schema(self):
        source = subprocess.run(
            ["git", "show", f"HEAD:{HANDOFF_WORKFLOW_PATH}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        for marker in (
            'service_receipt["canonical_source_revision"]',
            'service_receipt["canonical_source_tree"]',
            'template_receipt["canonical_source_tree"]',
            'identity = service_receipt["artifact_identity"]',
            'identity["source_protocol_version"]',
            'identity["service_version"]',
            'identity["runtime_contract"]',
            'anpos-vendor-handoff-${{ github.sha }}',
        ):
            self.assertIn(marker, source)
        self.assertNotIn('service_receipt["source_tree"]', source)

    def test_guarded_commercial_production_deploy_controller(self):
        source = subprocess.run(
            ["git", "show", f"HEAD:{DEPLOY_WORKFLOW_PATH}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        for marker in (
            "ops/deploy-commercial-*",
            "ref: main",
            "persist-credentials: false",
            "contents: read",
            "scripts/export_vendor_repositories.py",
            "scripts/verify_vendor_handoff.py",
            'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
            "vercel@59.11.7 deploy --prod --yes --force",
        ):
            self.assertIn(marker, source)
        self.assertNotIn("contents: write", source)
        self.assertNotIn("pull_request_target:", source)

    def test_guarded_commercial_database_migration_controller(self):
        source = subprocess.run(
            ["git", "show", f"HEAD:{MIGRATE_WORKFLOW_PATH}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        for marker in (
            "ops/migrate-commercial-*",
            "ref: main",
            "persist-credentials: false",
            "contents: read",
            'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
            "vercel@59.11.7",
            "env run -e production",
            "npm run migrate",
            "Re-run migrator to prove idempotent complete state",
        ):
            self.assertIn(marker, source)
        self.assertNotIn("contents: write", source)
        self.assertNotIn("pull_request_target:", source)

    def test_source_only_ci_assets_are_stripped_from_customer_template_boundary(self):
        boundary = json.loads((ROOT / "config" / "licensing" / "vendor-source-boundary.json").read_text())
        vendor_only = set(boundary["vendor_only_paths"])
        for path in (
            WORKFLOW_PATH,
            DEPLOY_WORKFLOW_PATH,
            MIGRATE_WORKFLOW_PATH,
            "scripts/validate_source_continuous_certification.py",
            "tests/test_source_continuous_certification.py",
        ):
            self.assertIn(path, vendor_only)
        bootstrap = (ROOT / "scripts" / "bootstrap_instance.py").read_text()
        self.assertNotIn("source-continuous-certification.yml", bootstrap)


if __name__ == "__main__":
    unittest.main()
