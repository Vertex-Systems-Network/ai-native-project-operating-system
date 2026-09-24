import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { remoteSandboxConfig } from "./env";
import {
  SandboxRequestError,
  normalizeSandboxFileArtifacts,
  type NormalizedSandboxExecutionRequest,
  type SandboxDriver,
  type SandboxExecutionResult,
  type SandboxFileArtifact,
} from "./execution-sandbox";

type FetchLike = typeof fetch;

type RemoteSandboxWireRequest = {
  protocol_version: 2;
  request_id: string;
  driver_id: string;
  isolation: "remote_ephemeral";
  workspace: {
    id: string;
    mode: "ephemeral_copy_on_write";
    base: "github_commit" | "empty";
    destroy_after_execution: true;
    source: NormalizedSandboxExecutionRequest["source"];
  };
  execution: {
    argv: string[];
    working_directory: string;
    environment_variable_names: string[];
    timeout_seconds: number;
    max_output_bytes: number;
    network: "deny";
  };
  artifacts: {
    input_files: SandboxFileArtifact[];
    output_paths: string[];
    max_output_bytes: number;
  };
};

type RemoteSandboxWireResponse = {
  protocol_version?: number;
  request_id?: string;
  driver_id?: string;
  isolation?: string;
  workspace_id?: string;
  workspace_destroyed?: boolean;
  network?: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  timed_out?: boolean;
  output_truncated?: boolean;
  duration_ms?: number;
  output_files?: SandboxFileArtifact[];
};

const RESPONSE_OVERHEAD_BYTES = 64 * 1024;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function sameHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const a = Buffer.from(left.toLowerCase(), "hex");
  const b = Buffer.from(right.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function canonicalBody(request: RemoteSandboxWireRequest): string {
  return JSON.stringify(request);
}

export function buildRemoteSandboxSignature(input: {
  secret: string;
  timestamp: string;
  nonce: string;
  body: string;
}): string {
  return hmacHex(input.secret, `request.${input.timestamp}.${input.nonce}.${sha256(input.body)}`);
}

export function buildRemoteSandboxResponseSignature(input: {
  secret: string;
  requestId: string;
  body: string;
}): string {
  return hmacHex(input.secret, `response.${input.requestId}.${sha256(input.body)}`);
}

function wireRequest(
  driverId: string,
  request: NormalizedSandboxExecutionRequest,
): RemoteSandboxWireRequest {
  return {
    protocol_version: 2,
    request_id: randomUUID(),
    driver_id: driverId,
    isolation: "remote_ephemeral",
    workspace: {
      id: request.workspace_id,
      mode: "ephemeral_copy_on_write",
      base: request.source ? "github_commit" : "empty",
      destroy_after_execution: true,
      source: request.source,
    },
    execution: {
      argv: request.command,
      working_directory: request.working_directory,
      environment_variable_names: request.environment_variable_names,
      timeout_seconds: request.timeout_seconds,
      max_output_bytes: request.max_output_bytes,
      network: "deny",
    },
    artifacts: {
      input_files: request.input_files,
      output_paths: request.output_paths,
      max_output_bytes: request.max_artifact_bytes,
    },
  };
}

function validateResponse(
  response: RemoteSandboxWireResponse,
  request: RemoteSandboxWireRequest,
): SandboxExecutionResult {
  if (
    response.protocol_version !== 2
    || response.request_id !== request.request_id
    || response.driver_id !== request.driver_id
    || response.isolation !== "remote_ephemeral"
    || response.workspace_id !== request.workspace.id
    || response.workspace_destroyed !== true
    || response.network !== "deny"
    || !Number.isInteger(response.exit_code)
    || typeof response.stdout !== "string"
    || typeof response.stderr !== "string"
    || typeof response.timed_out !== "boolean"
    || typeof response.output_truncated !== "boolean"
    || !Number.isFinite(response.duration_ms)
    || Number(response.duration_ms) < 0
  ) throw new SandboxRequestError("invalid_remote_sandbox_response");

  const outputFiles = normalizeSandboxFileArtifacts(
    response.output_files,
    request.artifacts.max_output_bytes,
    new Set(request.artifacts.output_paths),
  );
  if (outputFiles.length !== request.artifacts.output_paths.length) {
    throw new SandboxRequestError("sandbox_output_artifact_set_mismatch");
  }

  return {
    driver_id: request.driver_id,
    isolation: "remote_ephemeral",
    exit_code: Number(response.exit_code),
    stdout: response.stdout,
    stderr: response.stderr,
    timed_out: response.timed_out,
    output_truncated: response.output_truncated,
    duration_ms: Number(response.duration_ms),
    output_files: outputFiles,
  };
}

export class RemoteEphemeralSandboxDriver implements SandboxDriver {
  readonly isolation = "remote_ephemeral" as const;

  constructor(
    readonly id: string,
    private readonly endpoint: string,
    private readonly signingSecret: string,
    private readonly requestSkewSeconds: number,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async execute(request: NormalizedSandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const wire = wireRequest(this.id, request);
    const body = canonicalBody(wire);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(18).toString("base64url");
    const signature = buildRemoteSandboxSignature({
      secret: this.signingSecret,
      timestamp,
      nonce,
      body,
    });

    const controller = new AbortController();
    const outerTimeoutMs = Math.min(
      (request.timeout_seconds + Math.max(15, this.requestSkewSeconds)) * 1000,
      1_200_000,
    );
    const timer = setTimeout(() => controller.abort(), outerTimeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Anpos-Sandbox-Protocol": "2",
          "X-Anpos-Sandbox-Driver": this.id,
          "X-Anpos-Sandbox-Timestamp": timestamp,
          "X-Anpos-Sandbox-Nonce": nonce,
          "X-Anpos-Sandbox-Signature": signature,
        },
        body,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new SandboxRequestError("remote_sandbox_unavailable");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new SandboxRequestError("remote_sandbox_authentication_failed");
      }
      if (response.status === 409) throw new SandboxRequestError("remote_sandbox_replay_or_workspace_conflict");
      if (response.status === 413) throw new SandboxRequestError("remote_sandbox_artifact_limit_exceeded");
      if (response.status === 429) throw new SandboxRequestError("remote_sandbox_capacity_limited");
      throw new SandboxRequestError("remote_sandbox_execution_failed");
    }

    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") throw new SandboxRequestError("invalid_remote_sandbox_response");

    const maxResponseBytes = request.max_output_bytes + request.max_artifact_bytes + RESPONSE_OVERHEAD_BYTES;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared && (!Number.isSafeInteger(declared) || declared > maxResponseBytes)) {
      throw new SandboxRequestError("remote_sandbox_response_too_large");
    }

    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length > maxResponseBytes) throw new SandboxRequestError("remote_sandbox_response_too_large");
    const responseBody = raw.toString("utf8");
    const responseSignature = response.headers.get("x-anpos-sandbox-response-signature") ?? "";
    const expectedResponseSignature = buildRemoteSandboxResponseSignature({
      secret: this.signingSecret,
      requestId: wire.request_id,
      body: responseBody,
    });
    if (!sameHex(responseSignature, expectedResponseSignature)) {
      throw new SandboxRequestError("remote_sandbox_response_signature_invalid");
    }

    let parsed: RemoteSandboxWireResponse;
    try { parsed = JSON.parse(responseBody) as RemoteSandboxWireResponse; }
    catch { throw new SandboxRequestError("invalid_remote_sandbox_response"); }
    return validateResponse(parsed, wire);
  }
}

export function productionSandboxDriver(fetchImpl: FetchLike = fetch): RemoteEphemeralSandboxDriver {
  const config = remoteSandboxConfig();
  return new RemoteEphemeralSandboxDriver(
    config.driverId,
    config.endpoint,
    config.signingSecret,
    config.requestSkewSeconds,
    fetchImpl,
  );
}
