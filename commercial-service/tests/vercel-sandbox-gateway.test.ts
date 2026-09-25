import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  handleSandboxGatewayRequest,
  SandboxGatewayError,
  type SandboxGatewayDependencies,
} from "../lib/vercel-sandbox-gateway";
import {
  buildRemoteSandboxResponseSignature,
  buildRemoteSandboxSignature,
} from "../lib/remote-sandbox-driver";

const DRIVER = "remote_ephemeral_signed_gateway_v1";
const SECRET = "sandbox-test-secret-".repeat(3);

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

type FileRow = { content: Buffer; mode: number };

class FakeSandbox {
  files = new Map<string, FileRow>();
  stopped = false;
  currentSession() { return { networkPolicy: "deny-all" }; }

  async writeFiles(files: Array<{ path: string; content: string | Uint8Array; mode?: number }>) {
    for (const file of files) {
      this.files.set(file.path, {
        content: typeof file.content === "string" ? Buffer.from(file.content) : Buffer.from(file.content),
        mode: file.mode ?? 0o644,
      });
    }
  }

  async readFileToBuffer(file: { path: string }) {
    return this.files.get(file.path)?.content ?? null;
  }

  async runCommand(command: string, args: string[] = []) {
    if (command === "mkdir") return result(0);
    if (command === "python3" && args[0] === "-c" && args[1]?.includes("sys.version_info")) return result(0);
    if (command === "python3" && args[0] === "-c" && args[1]?.includes("socket.create_connection")) return result(1);
    if (command === "python3" && args[0] === ".anpos-gateway-internal/executor.py") {
      const cfg = JSON.parse(this.files.get(".anpos-gateway-internal/execution.json")!.content.toString("utf8"));
      assert.deepEqual(cfg.argv, ["python3", ".anpos-input/apply.py"]);
      this.files.set("workspace/result.txt", { content: Buffer.from("sandbox-output\\n"), mode: 0o644 });
      this.files.set(".anpos-gateway-internal/execution-result.json", {
        content: Buffer.from(JSON.stringify({
          exit_code: 0,
          stdout: '{"ok":true}\\n',
          stderr: "",
          timed_out: false,
          output_truncated: false,
          duration_ms: 17,
        })),
        mode: 0o644,
      });
      return result(0);
    }
    if (command === "python3" && args[0] === ".anpos-gateway-internal/collect.py") {
      const file = this.files.get("workspace/result.txt")!;
      this.files.set(".anpos-gateway-internal/output-meta.json", {
        content: Buffer.from(JSON.stringify([{
          path: "result.txt",
          mode: "100644",
          bytes: file.content.length,
          sha256: sha256(file.content),
        }])),
        mode: 0o644,
      });
      return result(0);
    }
    throw new Error("unexpected fake command: " + command + " " + args.join(" "));
  }

  async stop() {
    this.stopped = true;
    return { status: "stopped" };
  }
}

function result(exitCode: number) {
  return {
    exitCode,
    durationMs: 1,
    async stdout() { return ""; },
    async stderr() { return ""; },
  };
}

function wire(overrides: Record<string, unknown> = {}) {
  const input = Buffer.from("print('runner')\\n");
  return {
    protocol_version: 2,
    request_id: randomUUID(),
    driver_id: DRIVER,
    isolation: "remote_ephemeral",
    workspace: {
      id: "anpos-test",
      mode: "ephemeral_copy_on_write",
      base: "empty",
      destroy_after_execution: true,
      source: null,
    },
    execution: {
      argv: ["python3", ".anpos-input/apply.py"],
      working_directory: "workspace",
      environment_variable_names: [],
      timeout_seconds: 30,
      max_output_bytes: 64 * 1024,
      network: "deny",
    },
    artifacts: {
      input_files: [{
        path: ".anpos-input/apply.py",
        mode: "100644",
        content_base64: input.toString("base64"),
        sha256: sha256(input),
        bytes: input.length,
      }],
      output_paths: ["result.txt"],
      max_output_bytes: 1024 * 1024,
    },
    ...overrides,
  };
}

function signedRequest(payload: any, now = new Date("2026-09-25T12:00:00.000Z"), signatureOverride?: string) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const nonce = "abcdefghijklmnopqrstuvwx";
  const signature = signatureOverride ?? buildRemoteSandboxSignature({
    secret: SECRET,
    timestamp,
    nonce,
    body,
  });
  return new Request("https://sandbox.example.test/v1/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-anpos-sandbox-protocol": "2",
      "x-anpos-sandbox-driver": DRIVER,
      "x-anpos-sandbox-timestamp": timestamp,
      "x-anpos-sandbox-nonce": nonce,
      "x-anpos-sandbox-signature": signature,
    },
    body,
  });
}

function configure() {
  process.env.ANPOS_SANDBOX_DRIVER_ID = DRIVER;
  process.env.ANPOS_SANDBOX_SIGNING_SECRET = SECRET;
  process.env.ANPOS_SANDBOX_REQUEST_SKEW_SECONDS = "120";
}

function clear() {
  delete process.env.ANPOS_SANDBOX_DRIVER_ID;
  delete process.env.ANPOS_SANDBOX_SIGNING_SECRET;
  delete process.env.ANPOS_SANDBOX_REQUEST_SKEW_SECONDS;
}

test("signed Vercel sandbox gateway request executes with deny-all and exact output artifact", async () => {
  clear();
  configure();
  const now = new Date("2026-09-25T12:00:00.000Z");
  const sandbox = new FakeSandbox();
  let replayClaims = 0;
  const dependencies: SandboxGatewayDependencies = {
    now: () => now,
    createSandbox: async (timeoutMs) => {
      assert.equal(timeoutMs, 75_000);
      return sandbox;
    },
    claimReplay: async () => {
      replayClaims += 1;
      return true;
    },
  };
  const payload = wire();
  const response = await handleSandboxGatewayRequest(signedRequest(payload, now), dependencies);
  assert.equal(response.status, 200);
  const body = await response.text();
  const parsed = JSON.parse(body);
  assert.equal(parsed.workspace_destroyed, true);
  assert.equal(parsed.network, "deny");
  assert.equal(parsed.exit_code, 0);
  assert.equal(parsed.output_files.length, 1);
  assert.equal(parsed.output_files[0].path, "result.txt");
  assert.equal(Buffer.from(parsed.output_files[0].content_base64, "base64").toString(), "sandbox-output\\n");
  assert.equal(sandbox.stopped, true);
  assert.equal(replayClaims, 1);
  assert.equal(
    response.headers.get("x-anpos-sandbox-response-signature"),
    buildRemoteSandboxResponseSignature({ secret: SECRET, requestId: payload.request_id, body }),
  );
  clear();
});

test("sandbox gateway rejects bad signatures before replay claim", async () => {
  clear();
  configure();
  let claimed = false;
  await assert.rejects(
    handleSandboxGatewayRequest(
      signedRequest(wire(), new Date("2026-09-25T12:00:00.000Z"), "0".repeat(64)),
      {
        now: () => new Date("2026-09-25T12:00:00.000Z"),
        claimReplay: async () => { claimed = true; return true; },
      },
    ),
    (error: any) => error instanceof SandboxGatewayError && error.status === 401,
  );
  assert.equal(claimed, false);
  clear();
});

test("sandbox gateway rejects replayed nonce", async () => {
  clear();
  configure();
  await assert.rejects(
    handleSandboxGatewayRequest(
      signedRequest(wire(), new Date("2026-09-25T12:00:00.000Z")),
      {
        now: () => new Date("2026-09-25T12:00:00.000Z"),
        claimReplay: async () => false,
      },
    ),
    (error: any) => error instanceof SandboxGatewayError && error.status === 409 && error.code === "sandbox_request_replayed",
  );
  clear();
});

test("sandbox gateway fails closed on source mode environment forwarding and oversized live timeout", async () => {
  clear();
  configure();
  const now = new Date("2026-09-25T12:00:00.000Z");
  const cases = [
    wire({ workspace: { id: "anpos-test", mode: "ephemeral_copy_on_write", base: "github_commit", destroy_after_execution: true, source: { provider: "github", repository_full_name: "o/r", commit_sha: "a".repeat(40) } } }),
    wire({ execution: { argv: ["python3", ".anpos-input/apply.py"], working_directory: "workspace", environment_variable_names: ["SECRET"], timeout_seconds: 30, max_output_bytes: 65536, network: "deny" } }),
    wire({ execution: { argv: ["python3", ".anpos-input/apply.py"], working_directory: "workspace", environment_variable_names: [], timeout_seconds: 241, max_output_bytes: 65536, network: "deny" } }),
  ];
  for (const payload of cases) {
    await assert.rejects(
      handleSandboxGatewayRequest(signedRequest(payload, now), {
        now: () => now,
        claimReplay: async () => true,
      }),
      (error: any) => error instanceof SandboxGatewayError && error.status === 422,
    );
  }
  clear();
});
