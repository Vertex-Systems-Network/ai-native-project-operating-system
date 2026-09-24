import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFeatureBranchName,
  validatePlannedChanges,
} from "../lib/repository-supervisor-write";

test("guarded write validates bounded sorted change sets and hashes content", () => {
  const result = validatePlannedChanges([
    { path: "src/z.ts", operation: "upsert", content: "export const z = 1;\n" },
    { path: "src/a.ts", operation: "upsert", content: "export const a = 1;\n" },
    { path: "docs/old.md", operation: "delete" },
  ]);
  assert.deepEqual(result.map((row) => row.path), ["docs/old.md", "src/a.ts", "src/z.ts"]);
  assert.equal(result[0].content_sha256, null);
  assert.match(String(result[1].content_sha256), /^[0-9a-f]{64}$/);
});

test("guarded write rejects vendor/control escape paths and committed secret material", () => {
  for (const path of [
    ".env",
    ".github/workflows/ci.yml",
    ".github/CODEOWNERS",
    "commercial-service/lib/secret.ts",
    "blueprints/commercial/live.json",
    "../escape.txt",
  ]) {
    assert.throws(
      () => validatePlannedChanges([{ path, operation: "upsert", content: "safe" }]),
      /invalid_planned_change_path/,
    );
  }
  assert.throws(
    () => validatePlannedChanges([{
      path: "src/config.ts",
      operation: "upsert",
      content: "const key = '-----BEGIN PRIVATE KEY-----';",
    }]),
    /planned_change_contains_secret_material/,
  );
});

test("guarded write accepts only anpos feature branches and rejects default branch", () => {
  assert.equal(validateFeatureBranchName("anpos/m04-guarded-write", "main"), "anpos/m04-guarded-write");
  assert.throws(() => validateFeatureBranchName("main", "main"), /invalid_feature_branch_name/);
  assert.throws(() => validateFeatureBranchName("feature/direct", "main"), /invalid_feature_branch_name/);
  assert.throws(() => validateFeatureBranchName("anpos/../escape", "main"), /invalid_feature_branch_name/);
});
