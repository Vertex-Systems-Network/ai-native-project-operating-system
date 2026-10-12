from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ChildBootstrapEndToEndTests(unittest.TestCase):
    """A freshly bootstrapped child must pass the same gates its repository-quality workflow runs."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.child = Path(cls._tmp.name) / "child"
        shutil.copytree(ROOT, cls.child, ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules", ".next"))
        cls.git("init", "-q")
        cls.git("add", "-A")
        cls.git("commit", "-q", "-m", "copy of canonical source")
        cls.bootstrap = cls.run_in_child(
            "scripts/bootstrap_child.py", "--apply",
            "--repository", "example/example-child",
            "--project-name", "Example Child",
            "--github-owner", "example-owner",
            "--github-security-capability", "unavailable",
        )
        if cls.bootstrap.returncode == 0:
            # bootstrap_child.py asks for its changes to be committed before development; tracked-file checks depend on it.
            cls.git("add", "-A")
            cls.git("commit", "-q", "-m", "bootstrap child")

    @classmethod
    def git(cls, *args: str) -> None:
        subprocess.run(
            ["git", "-c", "user.name=anpos-test", "-c", "user.email=anpos-test@example.invalid", "-c", "commit.gpgsign=false", *args],
            cwd=cls.child, check=True, capture_output=True,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    @classmethod
    def run_in_child(cls, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, *args], cwd=cls.child, text=True, capture_output=True, timeout=300)

    def test_bootstrap_succeeds(self) -> None:
        self.assertEqual(self.bootstrap.returncode, 0, self.bootstrap.stdout + self.bootstrap.stderr)

    def test_no_vendor_workflow_or_service_is_inherited(self) -> None:
        boundary = json.loads((ROOT / "config/licensing/vendor-source-boundary.json").read_text(encoding="utf-8"))
        for relative in boundary["vendor_only_paths"]:
            self.assertFalse((self.child / relative).exists(), relative)
        workflows = self.child / ".github" / "workflows"
        for path in workflows.glob("*.yml") if workflows.exists() else []:
            self.assertNotIn("Vertex-Systems-Network/ai-native-project-operating-system", path.read_text(encoding="utf-8"), path.name)

    def test_manifest_only_references_existing_paths(self) -> None:
        manifest = json.loads((self.child / ".ai/manifest.json").read_text(encoding="utf-8"))
        paths = list(manifest["common"]) + [p for files in manifest["roles"].values() for p in files]
        missing = [p for p in paths if not (self.child / p).exists()]
        self.assertEqual(missing, [])

    def test_child_validators_pass(self) -> None:
        for script in ["scripts/validate_ai_native_repo.py", "scripts/validate_commercial_licensing.py"]:
            result = self.run_in_child(script)
            self.assertEqual(result.returncode, 0, f"{script}:\n{result.stdout}{result.stderr}")

    def test_child_unit_tests_pass(self) -> None:
        result = self.run_in_child("-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py")
        self.assertEqual(result.returncode, 0, result.stderr[-4000:])


if __name__ == "__main__":
    unittest.main()
