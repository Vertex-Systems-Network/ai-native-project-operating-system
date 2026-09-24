import assert from "node:assert/strict";
import test from "node:test";
import {
  executeWithSandboxDriver,
  normalizeSandboxRequest,
  SandboxRequestError,
  type SandboxDriver,
} from "../lib/execution-sandbox";

test("sandbox request normalizes to bounded network-denied execution", () => {
  const request = normalizeSandboxRequest({
    workspace_id: "repo-123",
    command: ["npm", "test"],
    working_directory: "workspace/app",
    environment_variable_names: ["CI", "NODE_ENV", "CI"],
  });
  assert.deepEqual(request.command, ["npm", "test"]);
  assert.equal(request.network, "deny");
  assert.equal(request.timeout_seconds, 300);
  assert.equal(request.max_output_bytes, 512 * 1024);
  assert.deepEqual(request.environment_variable_names, ["CI", "NODE_ENV"]);
});

test("sandbox rejects host paths, shell-like multiline args, network enablement and raw env values", () => {
  assert.throws(
    () => normalizeSandboxRequest({ workspace_id: "repo", command: ["npm", "test"], working_directory: "../host" }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "invalid_working_directory",
  );
  assert.throws(
    () => normalizeSandboxRequest({ workspace_id: "repo", command: ["sh", "echo ok\nrm -rf /"] }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "invalid_command",
  );
  assert.throws(
    () => normalizeSandboxRequest({ workspace_id: "repo", command: ["npm", "test"], network: "allow" as "deny" }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "network_access_not_supported",
  );
  assert.throws(
    () => normalizeSandboxRequest({ workspace_id: "repo", command: ["npm", "test"], environment_variable_names: ["TOKEN=value"] }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "invalid_environment_variable_names",
  );
});

test("sandbox execution requires an isolated driver and validates driver evidence", async () => {
  const driver: SandboxDriver = {
    id: "test-container",
    isolation: "container",
    async execute(request) {
      assert.equal(request.network, "deny");
      return {
        driver_id: "test-container",
        isolation: "container",
        exit_code: 0,
        stdout: "ok",
        stderr: "",
        timed_out: false,
        output_truncated: false,
        duration_ms: 12,
      };
    },
  };
  const result = await executeWithSandboxDriver({ workspace_id: "repo", command: ["python", "-m", "pytest"] }, driver);
  assert.equal(result.exit_code, 0);
  assert.equal(result.driver_id, "test-container");

  await assert.rejects(
    () => executeWithSandboxDriver(
      { workspace_id: "repo", command: ["true"] },
      { id: "", isolation: "container", execute: driver.execute },
    ),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "isolated_sandbox_driver_required",
  );
});

test("sandbox artifact channel validates canonical base64, digest and output path boundaries", () => {
  const payload = Buffer.from("safe\n", "utf8");
  const request = normalizeSandboxRequest({
    workspace_id: "repo",
    command: ["python3", "runner.py"],
    input_files: [{
      path: ".anpos-input/file.txt",
      mode: "100644",
      content_base64: payload.toString("base64"),
      sha256: "93d868f3b59590f611d7646894ce8def1cea5ad63a9af0d9ccc56e9bc6968c11",
      bytes: payload.length,
    }],
    output_paths: ["config/result.json"],
  });
  assert.equal(request.input_files[0].path, ".anpos-input/file.txt");
  assert.deepEqual(request.output_paths, ["config/result.json"]);

  assert.throws(
    () => normalizeSandboxRequest({
      workspace_id: "repo",
      command: ["true"],
      output_paths: [".git/config"],
    }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "invalid_output_path",
  );
  assert.throws(
    () => normalizeSandboxRequest({
      workspace_id: "repo",
      command: ["true"],
      input_files: [{
        path: "input.txt",
        mode: "100644",
        content_base64: payload.toString("base64"),
        sha256: "0".repeat(64),
        bytes: payload.length,
      }],
    }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "artifact_integrity_mismatch",
  );
});
