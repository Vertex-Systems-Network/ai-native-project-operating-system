import { createHash, randomBytes, randomUUID } from "node:crypto";
import { remoteSandboxConfig } from "./env";
import {
  normalizeSandboxRequest,
  SandboxRequestError,
  type SandboxFileArtifact,
} from "./execution-sandbox";
import {
  buildRemoteSandboxSignature,
  buildRemoteSandboxWireRequest,
  remoteSandboxTrustedSourceHeaders,
  validateRemoteSandboxWireResponse,
  verifyRemoteSandboxResponseSignature,
  type RemoteSandboxWireResponse,
  type VercelOidcTokenProvider,
} from "./remote-sandbox-driver";

type FetchLike = typeof fetch;

export type SandboxLiveProbeEvidence = {
  driver_id: string;
  isolation: "remote_ephemeral";
  gateway_endpoint_host: string;
  python_runtime: string;
  network_denied: true;
  workspace_destroyed: true;
  request_hmac_accepted: true;
  response_hmac_verified: true;
  replay_rejected: true;
  input_integrity_verified: true;
  output_allowlist_verified: true;
  output_integrity_verified: true;
  input_sha256: string;
  output_sha256: string;
  output_bytes: number;
  duration_ms: number;
  request_id: string;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifact(path: string, content: string): SandboxFileArtifact {
  const bytes = Buffer.from(content, "utf8");
  return {
    path,
    mode: "100644",
    content_base64: bytes.toString("base64"),
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

function sameOriginWithPublicBase(endpoint: string): boolean {
  const base = process.env.ANPOS_PUBLIC_BASE_URL?.trim();
  if (!base) return false;
  try {
    return new URL(endpoint).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

async function readJsonBody(response: Response, maxBytes: number): Promise<{ raw: string; parsed: any }> {
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > maxBytes) throw new SandboxRequestError("sandbox_live_probe_response_too_large");
  const text = raw.toString("utf8");
  try {
    return { raw: text, parsed: JSON.parse(text) };
  } catch {
    throw new SandboxRequestError("sandbox_live_probe_response_invalid");
  }
}

export async function runProductionSandboxLiveProbe(
  fetchImpl: FetchLike = fetch,
  oidcTokenProvider?: VercelOidcTokenProvider,
): Promise<SandboxLiveProbeEvidence> {
  const config = remoteSandboxConfig();
  const trustedSourceHeaders = await remoteSandboxTrustedSourceHeaders(config.endpoint, oidcTokenProvider);
  if (sameOriginWithPublicBase(config.endpoint) && !trustedSourceHeaders["x-vercel-trusted-oidc-idp-token"]) {
    throw new SandboxRequestError("sandbox_live_probe_same_origin_oidc_unavailable");
  }

  const inputContent = "anpos-sandbox-live-probe-input-v1\n";
  const outputContent = "ANPOS_SANDBOX_LIVE_PROBE_OK\n";
  const input = artifact("probe/input.txt", inputContent);
  const expectedOutputSha256 = sha256(Buffer.from(outputContent, "utf8"));
  const python = [
    "from pathlib import Path",
    "import hashlib,sys",
    "data=Path('probe/input.txt').read_bytes()",
    `assert hashlib.sha256(data).hexdigest()==${JSON.stringify(input.sha256)}`,
    `Path('probe/output.txt').write_text(${JSON.stringify(outputContent)},encoding='utf-8')`,
    "print(f'python={sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
  ].join(";");

  const normalized = normalizeSandboxRequest({
    workspace_id: `live-probe-${randomBytes(10).toString("hex")}`,
    command: ["python3", "-c", python],
    working_directory: "workspace",
    environment_variable_names: [],
    timeout_seconds: 45,
    max_output_bytes: 64 * 1024,
    max_artifact_bytes: 1024 * 1024,
    input_files: [input],
    output_paths: ["probe/output.txt"],
    network: "deny",
  });

  const requestId = randomUUID();
  const wire = buildRemoteSandboxWireRequest(config.driverId, normalized, requestId);
  const body = JSON.stringify(wire);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(18).toString("base64url");
  const signature = buildRemoteSandboxSignature({
    secret: config.signingSecret,
    timestamp,
    nonce,
    body,
  });
  const headers = {
    ...trustedSourceHeaders,
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Anpos-Sandbox-Protocol": "2",
    "X-Anpos-Sandbox-Driver": config.driverId,
    "X-Anpos-Sandbox-Timestamp": timestamp,
    "X-Anpos-Sandbox-Nonce": nonce,
    "X-Anpos-Sandbox-Signature": signature,
  };

  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new SandboxRequestError("sandbox_live_probe_gateway_unavailable");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new SandboxRequestError("sandbox_live_probe_gateway_authentication_failed");
    }
    throw new SandboxRequestError(`sandbox_live_probe_gateway_http_${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new SandboxRequestError("sandbox_live_probe_response_invalid");
  const first = await readJsonBody(response, 2 * 1024 * 1024);
  const responseSignature = response.headers.get("x-anpos-sandbox-response-signature") ?? "";
  if (!verifyRemoteSandboxResponseSignature({
    secret: config.signingSecret,
    requestId,
    body: first.raw,
    signature: responseSignature,
  })) {
    throw new SandboxRequestError("sandbox_live_probe_response_signature_invalid");
  }

  const result = validateRemoteSandboxWireResponse(first.parsed as RemoteSandboxWireResponse, wire);
  if (result.exit_code !== 0 || result.timed_out || result.output_truncated || result.stderr) {
    throw new SandboxRequestError("sandbox_live_probe_execution_failed");
  }
  const runtime = /^python=(\d+)\.(\d+)\.(\d+)\s*$/.exec(result.stdout);
  if (!runtime) throw new SandboxRequestError("sandbox_live_probe_runtime_evidence_invalid");
  const runtimeMajor = Number(runtime[1]);
  const runtimeMinor = Number(runtime[2]);
  if (runtimeMajor < 3 || (runtimeMajor === 3 && runtimeMinor < 12)) {
    throw new SandboxRequestError("sandbox_live_probe_runtime_too_old");
  }

  const output = result.output_files?.[0];
  if (
    !output
    || result.output_files?.length !== 1
    || output.path !== "probe/output.txt"
    || output.sha256 !== expectedOutputSha256
    || Buffer.from(output.content_base64, "base64").toString("utf8") !== outputContent
  ) {
    throw new SandboxRequestError("sandbox_live_probe_output_integrity_failed");
  }

  let replay: Response;
  try {
    replay = await fetchImpl(config.endpoint, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new SandboxRequestError("sandbox_live_probe_replay_check_unavailable");
  }
  if (replay.status !== 409) throw new SandboxRequestError("sandbox_live_probe_replay_not_rejected");
  const replayBody = await readJsonBody(replay, 64 * 1024);
  if (replayBody.parsed?.error !== "sandbox_request_replayed") {
    throw new SandboxRequestError("sandbox_live_probe_replay_reason_invalid");
  }

  return {
    driver_id: config.driverId,
    isolation: "remote_ephemeral",
    gateway_endpoint_host: new URL(config.endpoint).host,
    python_runtime: `${runtimeMajor}.${runtimeMinor}.${runtime[3]}`,
    network_denied: true,
    workspace_destroyed: true,
    request_hmac_accepted: true,
    response_hmac_verified: true,
    replay_rejected: true,
    input_integrity_verified: true,
    output_allowlist_verified: true,
    output_integrity_verified: true,
    input_sha256: input.sha256,
    output_sha256: output.sha256,
    output_bytes: output.bytes,
    duration_ms: result.duration_ms,
    request_id: requestId,
  };
}
