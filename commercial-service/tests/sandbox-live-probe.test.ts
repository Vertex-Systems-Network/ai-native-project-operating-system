import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { runProductionSandboxLiveProbe } from "../lib/sandbox-live-probe";
import { buildRemoteSandboxResponseSignature } from "../lib/remote-sandbox-driver";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("production sandbox live probe verifies signed execution and replay rejection", async () => {
  const names = [
    "ANPOS_SANDBOX_ENDPOINT",
    "ANPOS_SANDBOX_DRIVER_ID",
    "ANPOS_SANDBOX_SIGNING_SECRET",
    "ANPOS_SANDBOX_REQUEST_SKEW_SECONDS",
    "ANPOS_PUBLIC_BASE_URL",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const secret = "s".repeat(48);
  process.env.ANPOS_SANDBOX_ENDPOINT = "https://anpos.example.test/v1/execute";
  process.env.ANPOS_SANDBOX_DRIVER_ID = "remote_ephemeral_signed_gateway_v1";
  process.env.ANPOS_SANDBOX_SIGNING_SECRET = secret;
  process.env.ANPOS_SANDBOX_REQUEST_SKEW_SECONDS = "120";
  process.env.ANPOS_PUBLIC_BASE_URL = "https://anpos.example.test";

  let calls = 0;
  let firstBody = "";
  let firstNonce = "";
  try {
    const evidence = await runProductionSandboxLiveProbe((async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-vercel-trusted-oidc-idp-token"), "header.payload.signature");
      assert.equal(headers.get("x-anpos-sandbox-protocol"), "2");
      const body = String(init?.body ?? "");
      if (calls === 1) {
        firstBody = body;
        firstNonce = headers.get("x-anpos-sandbox-nonce") ?? "";
        const wire = JSON.parse(body);
        assert.equal(wire.workspace.base, "empty");
        assert.equal(wire.workspace.source, null);
        assert.equal(wire.execution.network, "deny");
        assert.deepEqual(wire.execution.environment_variable_names, []);
        assert.equal(wire.artifacts.input_files.length, 1);
        assert.deepEqual(wire.artifacts.output_paths, ["probe/output.txt"]);
        const outputContent = "ANPOS_SANDBOX_LIVE_PROBE_OK\n";
        const responseBody = JSON.stringify({
          protocol_version: 2,
          request_id: wire.request_id,
          driver_id: "remote_ephemeral_signed_gateway_v1",
          isolation: "remote_ephemeral",
          workspace_id: wire.workspace.id,
          workspace_destroyed: true,
          network: "deny",
          exit_code: 0,
          stdout: "python=3.13.2\n",
          stderr: "",
          timed_out: false,
          output_truncated: false,
          duration_ms: 77,
          output_files: [{
            path: "probe/output.txt",
            mode: "100644",
            content_base64: Buffer.from(outputContent).toString("base64"),
            sha256: sha256(Buffer.from(outputContent)),
            bytes: Buffer.byteLength(outputContent),
          }],
        });
        return new Response(responseBody, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Anpos-Sandbox-Response-Signature": buildRemoteSandboxResponseSignature({
              secret,
              requestId: wire.request_id,
              body: responseBody,
            }),
          },
        });
      }

      assert.equal(body, firstBody);
      assert.equal(headers.get("x-anpos-sandbox-nonce"), firstNonce);
      return Response.json({ ok: false, error: "sandbox_request_replayed" }, { status: 409 });
    }) as typeof fetch, async () => "header.payload.signature");

    assert.equal(calls, 2);
    assert.equal(evidence.driver_id, "remote_ephemeral_signed_gateway_v1");
    assert.equal(evidence.python_runtime, "3.13.2");
    assert.equal(evidence.network_denied, true);
    assert.equal(evidence.workspace_destroyed, true);
    assert.equal(evidence.request_hmac_accepted, true);
    assert.equal(evidence.response_hmac_verified, true);
    assert.equal(evidence.replay_rejected, true);
    assert.equal(evidence.input_integrity_verified, true);
    assert.equal(evidence.output_allowlist_verified, true);
    assert.equal(evidence.output_integrity_verified, true);
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
