import { createHash } from "node:crypto";

export type SandboxIsolation = "container" | "microvm" | "remote_ephemeral";

export type SandboxSourceIdentity = {
  provider: "github";
  repository_full_name: string;
  commit_sha: string;
};

export type SandboxFileArtifact = {
  path: string;
  mode: "100644" | "100755";
  content_base64: string;
  sha256: string;
  bytes: number;
};

export type SandboxExecutionRequest = {
  workspace_id: string;
  source?: SandboxSourceIdentity;
  command: string[];
  working_directory?: string;
  environment_variable_names?: string[];
  timeout_seconds?: number;
  max_output_bytes?: number;
  max_artifact_bytes?: number;
  input_files?: SandboxFileArtifact[];
  output_paths?: string[];
  network?: "deny";
};

export type NormalizedSandboxExecutionRequest = {
  workspace_id: string;
  source: SandboxSourceIdentity | null;
  command: string[];
  working_directory: string;
  environment_variable_names: string[];
  timeout_seconds: number;
  max_output_bytes: number;
  max_artifact_bytes: number;
  input_files: SandboxFileArtifact[];
  output_paths: string[];
  network: "deny";
};

export type SandboxExecutionResult = {
  driver_id: string;
  isolation: SandboxIsolation;
  exit_code: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  output_truncated: boolean;
  duration_ms: number;
  output_files?: SandboxFileArtifact[];
};

export interface SandboxDriver {
  readonly id: string;
  readonly isolation: SandboxIsolation;
  execute(request: NormalizedSandboxExecutionRequest): Promise<SandboxExecutionResult>;
}

export class SandboxRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const MAX_ARGS = 128;
const MAX_ARG_BYTES = 16_384;
const MAX_TIMEOUT_SECONDS = 900;
const DEFAULT_TIMEOUT_SECONDS = 300;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_OUTPUT_BYTES = 512 * 1024;
const MAX_ENV_NAMES = 64;
const MAX_ARTIFACT_FILES = 5_000;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const DEFAULT_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_ARTIFACT_PATH_BYTES = 1_024;

function sha256Bytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelativeDirectory(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || /[\r\n\0]/.test(value)) return false;
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

function safeWorkspaceId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function safeEnvironmentName(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]{0,127}$/.test(value);
}

export function safeSandboxArtifactPath(value: string): boolean {
  if (
    !value
    || value.startsWith("/")
    || value.includes("\\")
    || /[\r\n\0]/.test(value)
    || Buffer.byteLength(value, "utf8") > MAX_ARTIFACT_PATH_BYTES
  ) return false;
  const parts = value.split("/");
  return parts.every((part) => part && part !== "." && part !== ".." && part !== ".git");
}

function normalizeSourceIdentity(source: SandboxSourceIdentity | undefined): SandboxSourceIdentity | null {
  if (source === undefined) return null;
  if (
    !source
    || source.provider !== "github"
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository_full_name)
    || !/^[0-9a-f]{40}$/i.test(source.commit_sha)
  ) throw new SandboxRequestError("invalid_source_identity");
  return {
    provider: "github",
    repository_full_name: source.repository_full_name,
    commit_sha: source.commit_sha.toLowerCase(),
  };
}

function decodeCanonicalBase64(value: string): Buffer {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new SandboxRequestError("invalid_artifact_base64");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new SandboxRequestError("invalid_artifact_base64");
  return decoded;
}

export function normalizeSandboxFileArtifacts(
  files: SandboxFileArtifact[] | undefined,
  maxBytes: number,
  allowedPaths?: Set<string>,
): SandboxFileArtifact[] {
  const values = files ?? [];
  if (!Array.isArray(values) || values.length > MAX_ARTIFACT_FILES) {
    throw new SandboxRequestError("invalid_artifact_files");
  }
  const seen = new Set<string>();
  let total = 0;
  return values.map((file) => {
    if (!file || typeof file !== "object" || !safeSandboxArtifactPath(file.path) || seen.has(file.path)) {
      throw new SandboxRequestError("invalid_artifact_path");
    }
    seen.add(file.path);
    if (allowedPaths && !allowedPaths.has(file.path)) throw new SandboxRequestError("unexpected_output_artifact_path");
    if (file.mode !== "100644" && file.mode !== "100755") throw new SandboxRequestError("invalid_artifact_mode");
    if (!/^[0-9a-f]{64}$/i.test(file.sha256)) throw new SandboxRequestError("invalid_artifact_digest");
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new SandboxRequestError("invalid_artifact_size");
    const decoded = decodeCanonicalBase64(file.content_base64);
    if (decoded.length !== file.bytes || sha256Bytes(decoded) !== file.sha256.toLowerCase()) {
      throw new SandboxRequestError("artifact_integrity_mismatch");
    }
    total += decoded.length;
    if (total > maxBytes) throw new SandboxRequestError("artifact_bytes_limit_exceeded");
    return {
      path: file.path,
      mode: file.mode,
      content_base64: file.content_base64,
      sha256: file.sha256.toLowerCase(),
      bytes: file.bytes,
    };
  });
}

function normalizeOutputPaths(paths: string[] | undefined): string[] {
  const values = paths ?? [];
  if (!Array.isArray(values) || values.length > MAX_ARTIFACT_FILES) throw new SandboxRequestError("invalid_output_paths");
  const seen = new Set<string>();
  return values.map((path) => {
    if (typeof path !== "string" || !safeSandboxArtifactPath(path) || seen.has(path)) {
      throw new SandboxRequestError("invalid_output_path");
    }
    seen.add(path);
    return path;
  });
}

export function normalizeSandboxRequest(input: SandboxExecutionRequest): NormalizedSandboxExecutionRequest {
  if (!input || typeof input !== "object") throw new SandboxRequestError("sandbox_request_required");
  if (!safeWorkspaceId(input.workspace_id)) throw new SandboxRequestError("invalid_workspace_id");
  if (!Array.isArray(input.command) || input.command.length < 1 || input.command.length > MAX_ARGS) {
    throw new SandboxRequestError("invalid_command");
  }
  const command = input.command.map((value) => {
    if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > MAX_ARG_BYTES || /[\0\r\n]/.test(value)) {
      throw new SandboxRequestError("invalid_command");
    }
    return value;
  });
  const workingDirectory = input.working_directory ?? "workspace";
  if (!safeRelativeDirectory(workingDirectory)) throw new SandboxRequestError("invalid_working_directory");
  const envNames = input.environment_variable_names ?? [];
  if (!Array.isArray(envNames) || envNames.length > MAX_ENV_NAMES || envNames.some((name) => typeof name !== "string" || !safeEnvironmentName(name))) {
    throw new SandboxRequestError("invalid_environment_variable_names");
  }
  const timeout = input.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_SECONDS) {
    throw new SandboxRequestError("invalid_timeout_seconds");
  }
  const output = input.max_output_bytes ?? DEFAULT_OUTPUT_BYTES;
  if (!Number.isInteger(output) || output < 1024 || output > MAX_OUTPUT_BYTES) {
    throw new SandboxRequestError("invalid_max_output_bytes");
  }
  const artifactBytes = input.max_artifact_bytes ?? DEFAULT_ARTIFACT_BYTES;
  if (!Number.isInteger(artifactBytes) || artifactBytes < 1024 || artifactBytes > MAX_ARTIFACT_BYTES) {
    throw new SandboxRequestError("invalid_max_artifact_bytes");
  }
  if (input.network !== undefined && input.network !== "deny") {
    throw new SandboxRequestError("network_access_not_supported");
  }
  return {
    workspace_id: input.workspace_id,
    source: normalizeSourceIdentity(input.source),
    command,
    working_directory: workingDirectory,
    environment_variable_names: [...new Set(envNames)],
    timeout_seconds: timeout,
    max_output_bytes: output,
    max_artifact_bytes: artifactBytes,
    input_files: normalizeSandboxFileArtifacts(input.input_files, artifactBytes),
    output_paths: normalizeOutputPaths(input.output_paths),
    network: "deny",
  };
}

export async function executeWithSandboxDriver(
  input: SandboxExecutionRequest,
  driver: SandboxDriver,
): Promise<SandboxExecutionResult> {
  if (!driver || !driver.id || !["container", "microvm", "remote_ephemeral"].includes(driver.isolation)) {
    throw new SandboxRequestError("isolated_sandbox_driver_required");
  }
  const request = normalizeSandboxRequest(input);
  const result = await driver.execute(request);
  if (
    result.driver_id !== driver.id
    || result.isolation !== driver.isolation
    || !Number.isInteger(result.exit_code)
    || !Number.isFinite(result.duration_ms)
    || result.duration_ms < 0
  ) {
    throw new SandboxRequestError("invalid_sandbox_driver_result");
  }
  if (Buffer.byteLength(result.stdout, "utf8") + Buffer.byteLength(result.stderr, "utf8") > request.max_output_bytes) {
    throw new SandboxRequestError("sandbox_driver_output_limit_violation");
  }
  const allowed = new Set(request.output_paths);
  const outputFiles = normalizeSandboxFileArtifacts(result.output_files, request.max_artifact_bytes, allowed);
  if (outputFiles.length !== request.output_paths.length || outputFiles.some((file) => !allowed.has(file.path))) {
    throw new SandboxRequestError("sandbox_output_artifact_set_mismatch");
  }
  return { ...result, output_files: outputFiles };
}
