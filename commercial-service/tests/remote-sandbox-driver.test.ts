import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRemoteSandboxResponseSignature,
  buildRemoteSandboxSignature,
  remoteSandboxTrustedSourceHeaders,
  RemoteEphemeralSandboxDriver,
} from "../lib/remote-sandbox-driver";
import {
  executeWithSandboxDriver,
  normalizeSandboxRequest,
  SandboxRequestError,
} from "../lib/execution-sandbox";

test("sandbox source identity is immutable and normalized", () => {
  const request = normalizeSandboxRequest({
    workspace_id: "repo-123",
    source: {
      provider: "github",
      repository_full_name: "Example/Repo",
      commit_sha: "A".repeat(40),
    },
    command: ["npm", "test"],
  });
  assert.equal(request.source?.repository_full_name, "Example/Repo");
  assert.equal(request.source?.commit_sha, "a".repeat(40));

  assert.throws(
    () => normalizeSandboxRequest({
      workspace_id: "repo",
      source: { provider: "github", repository_full_name: "https://github.com/x/y" as string, commit_sha: "a".repeat(40) },
      command: ["true"],
    }),
    (error: unknown) => error instanceof SandboxRequestError && error.code === "invalid_source_identity",
  );
});

test("Vercel trusted-source token is fetched only for the exact public service origin", async () => {
  const priorBase = process.env.ANPOS_PUBLIC_BASE_URL;
  process.env.ANPOS_PUBLIC_BASE_URL = "https://anpos.example.test";
  let calls = 0;
  const provider = async () => {
    calls += 1;
    return "header.payload.signature";
  };
  try {
    assert.deepEqual(
      await remoteSandboxTrustedSourceHeaders("https://anpos.example.test/v1/execute", provider),
      { "x-vercel-trusted-oidc-idp-token": "header.payload.signature" },
    );
    assert.equal(calls, 1);
    assert.deepEqual(
      await remoteSandboxTrustedSourceHeaders("https://other.example.test/v1/execute", provider),
      {},
    );
    assert.equal(calls, 1);
  } finally {
    if (priorBase === undefined) delete process.env.ANPOS_PUBLIC_BASE_URL;
    else process.env.ANPOS_PUBLIC_BASE_URL = priorBase;
  }
});

test("remote sandbox signatures bind exact body timestamp nonce and response request id", () => {
  const secret = "s".repeat(48);
  const one = buildRemoteSandboxSignature({ secret, timestamp: "100", nonce: "abc", body: "{}" });
  const two = buildRemoteSandboxSignature({ secret, timestamp: "100", nonce: "abc", body: "{\"x\":1}" });
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.notEqual(one, two);
  assert.notEqual(
    buildRemoteSandboxResponseSignature({ secret, requestId: "a", body: "{}" }),
    buildRemoteSandboxResponseSignature({ secret, requestId: "b", body: "{}" }),
  );
});

test("remote sandbox driver sends names-only environment and validates signed destruction evidence", async () => {
  const secret = "s".repeat(48);
  const driver = new RemoteEphemeralSandboxDriver(
    "anpos-remote-e2e",
    "https://sandbox.example.test/v1/execute",
    secret,
    120,
    (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://sandbox.example.test/v1/execute");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      const headers = new Headers(init?.headers);
      const body = String(init?.body);
      const timestamp = headers.get("x-anpos-sandbox-timestamp")!;
      const nonce = headers.get("x-anpos-sandbox-nonce")!;
      assert.equal(
        headers.get("x-anpos-sandbox-signature"),
        buildRemoteSandboxSignature({ secret, timestamp, nonce, body }),
      );
      const payload = JSON.parse(body);
      assert.equal(payload.workspace.base, "github_commit");
      assert.equal(payload.workspace.source.repository_full_name, "Example/Repo");
      assert.equal(payload.workspace.source.commit_sha, "a".repeat(40));
      assert.equal(payload.workspace.destroy_after_execution, true);
      assert.equal(payload.execution.network, "deny");
      assert.deepEqual(payload.execution.environment_variable_names, ["CI", "NODE_ENV"]);
      assert.deepEqual(payload.artifacts.output_paths, ["dist/result.txt"]);
      assert.equal(payload.artifacts.input_files[0].path, ".anpos-input/plan.json");
      assert.equal(body.includes("TOKEN=value"), false);

      const responseBody = JSON.stringify({
        protocol_version: 2,
        request_id: payload.request_id,
        driver_id: "anpos-remote-e2e",
        isolation: "remote_ephemeral",
        workspace_id: "repo-123",
        workspace_destroyed: true,
        network: "deny",
        exit_code: 0,
        stdout: "ok",
        stderr: "",
        timed_out: false,
        output_truncated: false,
        duration_ms: 20,
        output_files: [{
          path: "dist/result.txt",
          mode: "100644",
          content_base64: Buffer.from("done").toString("base64"),
          sha256: "a4c3ed04a95a3da14a9d235c83d868bed7c0f45cf7f3faa751ee8f50598d2211",
          bytes: 4,
        }],
      });
      return new Response(responseBody, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Anpos-Sandbox-Response-Signature": buildRemoteSandboxResponseSignature({
            secret,
            requestId: payload.request_id,
            body: responseBody,
          }),
        },
      });
    }) as typeof fetch,
  );

  const result = await executeWithSandboxDriver({
    workspace_id: "repo-123",
    source: {
      provider: "github",
      repository_full_name: "Example/Repo",
      commit_sha: "a".repeat(40),
    },
    command: ["npm", "test"],
    environment_variable_names: ["CI", "NODE_ENV"],
    input_files: [{
      path: ".anpos-input/plan.json",
      mode: "100644",
      content_base64: Buffer.from("{}").toString("base64"),
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      bytes: 2,
    }],
    output_paths: ["dist/result.txt"],
    network: "deny",
  }, driver);
  assert.equal(result.exit_code, 0);
  assert.equal(result.isolation, "remote_ephemeral");
  assert.equal(result.output_files?.[0].path, "dist/result.txt");
});

test("remote sandbox driver fails closed on unsigned or non-destroyed response", async () => {
  const driver = new RemoteEphemeralSandboxDriver(
    "anpos-remote-e2e",
    "https://sandbox.example.test/v1/execute",
    "s".repeat(48),
    120,
    (async () => Response.json({
      protocol_version: 2,
      request_id: "wrong",
      driver_id: "anpos-remote-e2e",
      isolation: "remote_ephemeral",
      workspace_id: "repo",
      workspace_destroyed: false,
      network: "deny",
      exit_code: 0,
      stdout: "",
      stderr: "",
      timed_out: false,
      output_truncated: false,
      duration_ms: 1,
      output_files: [],
    })) as typeof fetch,
  );

  await assert.rejects(
    () => executeWithSandboxDriver({
      workspace_id: "repo",
      source: { provider: "github", repository_full_name: "Example/Repo", commit_sha: "a".repeat(40) },
      command: ["true"],
    }, driver),
    (error: unknown) => error instanceof SandboxRequestError
      && ["remote_sandbox_response_signature_invalid", "invalid_remote_sandbox_response"].includes(error.code),
  );
});
