export type SandboxIsolation = "container" | "microvm" | "remote_ephemeral";

export type SandboxSourceIdentity = {
  provider: "github";
  repository_full_name: string;
  commit_sha: string;
};

export type SandboxExecutionRequest = {
  workspace_id: string;
  source?: SandboxSourceIdentity;
  command: string[];
  working_directory?: string;
  environment_variable_names?: string[];
  timeout_seconds?: number;
  max_output_bytes?: number;
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
    result.driver_id !== driver.id ||
    result.isolation !== driver.isolation ||
    !Number.isInteger(result.exit_code) ||
    !Number.isFinite(result.duration_ms) ||
    result.duration_ms < 0
  ) {
    throw new SandboxRequestError("invalid_sandbox_driver_result");
  }
  if (Buffer.byteLength(result.stdout, "utf8") + Buffer.byteLength(result.stderr, "utf8") > request.max_output_bytes) {
    throw new SandboxRequestError("sandbox_driver_output_limit_violation");
  }
  return result;
}
