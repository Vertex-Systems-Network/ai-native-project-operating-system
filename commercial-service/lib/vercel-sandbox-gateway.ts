import { createHash, timingSafeEqual } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { db, ensureSchema } from "./db";
import { sandboxGatewayConfig } from "./env";
import {
  normalizeSandboxRequest,
  safeSandboxArtifactPath,
  type NormalizedSandboxExecutionRequest,
  type SandboxFileArtifact,
} from "./execution-sandbox";
import {
  buildRemoteSandboxResponseSignature,
  buildRemoteSandboxSignature,
} from "./remote-sandbox-driver";

const MAX_WIRE_REQUEST_BYTES = 48 * 1024 * 1024;
const MAX_LIVE_EXECUTION_SECONDS = 240;
const INTERNAL_PREFIX = ".anpos-gateway-internal";
const EXECUTOR_PATH = INTERNAL_PREFIX + "/executor.py";
const EXECUTOR_CONFIG_PATH = INTERNAL_PREFIX + "/execution.json";
const EXECUTOR_RESULT_PATH = INTERNAL_PREFIX + "/execution-result.json";
const OUTPUT_PATHS_PATH = INTERNAL_PREFIX + "/output-paths.json";
const OUTPUT_META_PATH = INTERNAL_PREFIX + "/output-meta.json";
const COLLECTOR_PATH = INTERNAL_PREFIX + "/collect.py";

type WireRequest = {
  protocol_version: 2;
  request_id: string;
  driver_id: string;
  isolation: "remote_ephemeral";
  workspace: {
    id: string;
    mode: "ephemeral_copy_on_write";
    base: "github_commit" | "empty";
    destroy_after_execution: true;
    source: unknown;
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

type ExecutorResult = {
  exit_code: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  output_truncated: boolean;
  duration_ms: number;
};

type OutputMeta = Array<{
  path: string;
  mode: "100644" | "100755";
  bytes: number;
  sha256: string;
}>;

type SandboxLike = {
  currentSession(): { networkPolicy?: unknown };
  writeFiles(files: Array<{ path: string; content: string | Uint8Array; mode?: number }>): Promise<unknown>;
  readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null>;
  runCommand(
    command: string,
    args?: string[],
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{
    exitCode: number;
    durationMs?: number;
    stdout(): Promise<string>;
    stderr(): Promise<string>;
  }>;
  stop(): Promise<unknown>;
};

export type SandboxGatewayDependencies = {
  now?: () => Date;
  createSandbox?: (timeoutMs: number) => Promise<SandboxLike>;
  claimReplay?: (input: {
    nonce: string;
    requestId: string;
    driverId: string;
    expiresAt: Date;
  }) => Promise<boolean>;
};

export class SandboxGatewayError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

const EXECUTOR_SOURCE = [
  "from __future__ import annotations",
  "import json",
  "import subprocess",
  "import time",
  "from pathlib import Path",
  "",
  "cfg = json.loads(Path(" + JSON.stringify(EXECUTOR_CONFIG_PATH) + ").read_text(encoding='utf-8'))",
  "started = time.monotonic()",
  "proc = subprocess.Popen(",
  "    cfg['argv'],",
  "    cwd=cfg['cwd'],",
  "    stdin=subprocess.DEVNULL,",
  "    stdout=subprocess.PIPE,",
  "    stderr=subprocess.PIPE,",
  "    shell=False,",
  ")",
  "timed_out = False",
  "try:",
  "    stdout, stderr = proc.communicate(timeout=cfg['timeout_seconds'])",
  "except subprocess.TimeoutExpired:",
  "    timed_out = True",
  "    proc.kill()",
  "    stdout, stderr = proc.communicate()",
  "limit = int(cfg['max_output_bytes'])",
  "combined = len(stdout) + len(stderr)",
  "stdout_kept = stdout[:limit]",
  "remaining = max(0, limit - len(stdout_kept))",
  "stderr_kept = stderr[:remaining]",
  "result = {",
  "    'exit_code': int(proc.returncode if proc.returncode is not None else -1),",
  "    'stdout': stdout_kept.decode('utf-8', errors='ignore'),",
  "    'stderr': stderr_kept.decode('utf-8', errors='ignore'),",
  "    'timed_out': timed_out,",
  "    'output_truncated': combined > limit,",
  "    'duration_ms': int((time.monotonic() - started) * 1000),",
  "}",
  "Path(" + JSON.stringify(EXECUTOR_RESULT_PATH) + ").write_text(json.dumps(result, sort_keys=True, separators=(',', ':')), encoding='utf-8')",
  "",
].join("\n");

const COLLECTOR_SOURCE = [
  "from __future__ import annotations",
  "import hashlib",
  "import json",
  "import stat",
  "from pathlib import Path",
  "",
  "cfg = json.loads(Path(" + JSON.stringify(OUTPUT_PATHS_PATH) + ").read_text(encoding='utf-8'))",
  "root = Path(cfg['cwd']).resolve()",
  "rows = []",
  "for rel in cfg['paths']:",
  "    path = root / rel",
  "    resolved = path.resolve()",
  "    if resolved != root and root not in resolved.parents:",
  "        raise RuntimeError('sandbox_output_path_escape')",
  "    info = path.lstat()",
  "    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):",
  "        raise RuntimeError('sandbox_output_not_regular_file')",
  "    mode = stat.S_IMODE(info.st_mode)",
  "    if mode not in (0o644, 0o755):",
  "        raise RuntimeError('sandbox_output_mode_not_allowed')",
  "    data = path.read_bytes()",
  "    rows.append({",
  "        'path': rel,",
  "        'mode': '100755' if mode == 0o755 else '100644',",
  "        'bytes': len(data),",
  "        'sha256': hashlib.sha256(data).hexdigest(),",
  "    })",
  "Path(" + JSON.stringify(OUTPUT_META_PATH) + ").write_text(json.dumps(rows, sort_keys=True, separators=(',', ':')), encoding='utf-8')",
  "",
].join("\n");

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const a = Buffer.from(left.toLowerCase(), "hex");
  const b = Buffer.from(right.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function header(request: Request, name: string): string {
  return request.headers.get(name)?.trim() ?? "";
}

function requireRequestId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new SandboxGatewayError(422, "invalid_sandbox_request_id");
  }
  return value.toLowerCase();
}

function parseWireRequest(value: unknown, expectedDriverId: string): {
  wire: WireRequest;
  normalized: NormalizedSandboxExecutionRequest;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SandboxGatewayError(422, "invalid_sandbox_request");
  }
  const wire = value as WireRequest;
  requireRequestId(wire.request_id);
  if (
    wire.protocol_version !== 2
    || wire.driver_id !== expectedDriverId
    || wire.isolation !== "remote_ephemeral"
    || !wire.workspace
    || wire.workspace.mode !== "ephemeral_copy_on_write"
    || wire.workspace.destroy_after_execution !== true
    || !wire.execution
    || !wire.artifacts
  ) throw new SandboxGatewayError(422, "invalid_sandbox_request");

  if (wire.workspace.base !== "empty" || wire.workspace.source != null) {
    throw new SandboxGatewayError(422, "sandbox_gateway_source_mode_not_implemented");
  }

  let normalized: NormalizedSandboxExecutionRequest;
  try {
    normalized = normalizeSandboxRequest({
      workspace_id: wire.workspace.id,
      command: wire.execution.argv,
      working_directory: wire.execution.working_directory,
      environment_variable_names: wire.execution.environment_variable_names,
      timeout_seconds: wire.execution.timeout_seconds,
      max_output_bytes: wire.execution.max_output_bytes,
      max_artifact_bytes: wire.artifacts.max_output_bytes,
      input_files: wire.artifacts.input_files,
      output_paths: wire.artifacts.output_paths,
      network: wire.execution.network,
    });
  } catch (error: any) {
    throw new SandboxGatewayError(422, String(error?.code ?? "invalid_sandbox_request"));
  }

  if (normalized.timeout_seconds > MAX_LIVE_EXECUTION_SECONDS) {
    throw new SandboxGatewayError(422, "sandbox_gateway_timeout_exceeds_live_limit");
  }
  if (normalized.environment_variable_names.length) {
    throw new SandboxGatewayError(422, "sandbox_gateway_environment_names_not_implemented");
  }
  for (const path of [
    ...normalized.input_files.map((file) => file.path),
    ...normalized.output_paths,
  ]) {
    if (path === INTERNAL_PREFIX || path.startsWith(INTERNAL_PREFIX + "/")) {
      throw new SandboxGatewayError(422, "sandbox_gateway_internal_path_reserved");
    }
  }
  return { wire, normalized };
}

async function defaultClaimReplay(input: {
  nonce: string;
  requestId: string;
  driverId: string;
  expiresAt: Date;
}): Promise<boolean> {
  await ensureSchema();
  await db().query("DELETE FROM sandbox_gateway_request_nonces WHERE expires_at < NOW()");
  const result = await db().query(
    "INSERT INTO sandbox_gateway_request_nonces(nonce,request_id,driver_id,expires_at) " +
    "VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING nonce",
    [input.nonce, input.requestId, input.driverId, input.expiresAt],
  );
  return Boolean(result.rowCount);
}

async function defaultCreateSandbox(timeoutMs: number): Promise<SandboxLike> {
  return Sandbox.create({
    runtime: "python3.13",
    timeout: timeoutMs,
    networkPolicy: "deny-all",
    persistent: false,
  });
}

function directorySet(request: NormalizedSandboxExecutionRequest): string[] {
  const values = new Set<string>([request.working_directory, INTERNAL_PREFIX]);
  for (const file of request.input_files) {
    const parts = (request.working_directory + "/" + file.path).split("/");
    parts.pop();
    while (parts.length) {
      values.add(parts.join("/"));
      parts.pop();
    }
  }
  return [...values].filter(Boolean).sort();
}

async function mkdirBatches(sandbox: SandboxLike, directories: string[]): Promise<void> {
  for (let i = 0; i < directories.length; i += 64) {
    const result = await sandbox.runCommand("mkdir", ["-p", ...directories.slice(i, i + 64)], { timeoutMs: 15_000 });
    if (result.exitCode !== 0) throw new SandboxGatewayError(502, "sandbox_workspace_prepare_failed");
  }
}

async function writeInputFiles(
  sandbox: SandboxLike,
  request: NormalizedSandboxExecutionRequest,
): Promise<void> {
  const files = request.input_files.map((file) => ({
    path: request.working_directory + "/" + file.path,
    content: Buffer.from(file.content_base64, "base64"),
    mode: file.mode === "100755" ? 0o755 : 0o644,
  }));
  for (let i = 0; i < files.length; i += 100) {
    await sandbox.writeFiles(files.slice(i, i + 100));
  }
}

async function proveRuntimeAndNetwork(sandbox: SandboxLike): Promise<void> {
  if (sandbox.currentSession().networkPolicy !== "deny-all") {
    throw new SandboxGatewayError(502, "sandbox_network_policy_not_denied");
  }
  const runtime = await sandbox.runCommand(
    "python3",
    ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3,12) else 9)"],
    { timeoutMs: 10_000 },
  );
  if (runtime.exitCode !== 0) throw new SandboxGatewayError(502, "sandbox_python_runtime_too_old");

  const network = await sandbox.runCommand(
    "python3",
    ["-c", "import socket; socket.create_connection(('1.1.1.1',443),2); raise SystemExit(0)"],
    { timeoutMs: 5_000 },
  );
  if (network.exitCode === 0) throw new SandboxGatewayError(502, "sandbox_network_deny_not_enforced");
}

async function executeCommand(
  sandbox: SandboxLike,
  request: NormalizedSandboxExecutionRequest,
): Promise<ExecutorResult> {
  await sandbox.writeFiles([
    { path: EXECUTOR_PATH, content: EXECUTOR_SOURCE, mode: 0o644 },
    {
      path: EXECUTOR_CONFIG_PATH,
      content: JSON.stringify({
        argv: request.command,
        cwd: request.working_directory,
        timeout_seconds: request.timeout_seconds,
        max_output_bytes: request.max_output_bytes,
      }),
      mode: 0o600,
    },
  ]);
  const wrapper = await sandbox.runCommand(
    "python3",
    [EXECUTOR_PATH],
    { timeoutMs: (request.timeout_seconds + 15) * 1000 },
  );
  if (wrapper.exitCode !== 0) throw new SandboxGatewayError(502, "sandbox_executor_failed");
  const raw = await sandbox.readFileToBuffer({ path: EXECUTOR_RESULT_PATH });
  if (!raw || raw.length > request.max_output_bytes + 16_384) {
    throw new SandboxGatewayError(502, "sandbox_executor_result_invalid");
  }
  let parsed: ExecutorResult;
  try { parsed = JSON.parse(raw.toString("utf8")) as ExecutorResult; }
  catch { throw new SandboxGatewayError(502, "sandbox_executor_result_invalid"); }
  if (
    !Number.isInteger(parsed.exit_code)
    || typeof parsed.stdout !== "string"
    || typeof parsed.stderr !== "string"
    || typeof parsed.timed_out !== "boolean"
    || typeof parsed.output_truncated !== "boolean"
    || !Number.isFinite(parsed.duration_ms)
    || parsed.duration_ms < 0
    || Buffer.byteLength(parsed.stdout, "utf8") + Buffer.byteLength(parsed.stderr, "utf8") > request.max_output_bytes
  ) throw new SandboxGatewayError(502, "sandbox_executor_result_invalid");
  return parsed;
}

async function collectOutputs(
  sandbox: SandboxLike,
  request: NormalizedSandboxExecutionRequest,
): Promise<SandboxFileArtifact[]> {
  await sandbox.writeFiles([
    { path: COLLECTOR_PATH, content: COLLECTOR_SOURCE, mode: 0o644 },
    {
      path: OUTPUT_PATHS_PATH,
      content: JSON.stringify({ cwd: request.working_directory, paths: request.output_paths }),
      mode: 0o600,
    },
  ]);
  const collect = await sandbox.runCommand("python3", [COLLECTOR_PATH], { timeoutMs: 30_000 });
  if (collect.exitCode !== 0) throw new SandboxGatewayError(422, "sandbox_output_collection_failed");
  const metaRaw = await sandbox.readFileToBuffer({ path: OUTPUT_META_PATH });
  if (!metaRaw || metaRaw.length > 2 * 1024 * 1024) {
    throw new SandboxGatewayError(502, "sandbox_output_metadata_invalid");
  }
  let meta: OutputMeta;
  try { meta = JSON.parse(metaRaw.toString("utf8")) as OutputMeta; }
  catch { throw new SandboxGatewayError(502, "sandbox_output_metadata_invalid"); }
  if (!Array.isArray(meta) || meta.length !== request.output_paths.length) {
    throw new SandboxGatewayError(422, "sandbox_output_artifact_set_mismatch");
  }
  const expected = new Set(request.output_paths);
  const output: SandboxFileArtifact[] = [];
  let total = 0;
  for (const row of meta) {
    if (
      !row
      || !expected.has(row.path)
      || !safeSandboxArtifactPath(row.path)
      || (row.mode !== "100644" && row.mode !== "100755")
      || !Number.isSafeInteger(row.bytes)
      || row.bytes < 0
      || !/^[0-9a-f]{64}$/.test(row.sha256)
    ) throw new SandboxGatewayError(422, "sandbox_output_metadata_invalid");
    expected.delete(row.path);
    const content = await sandbox.readFileToBuffer({
      path: request.working_directory + "/" + row.path,
    });
    if (!content || content.length !== row.bytes || sha256(content) !== row.sha256) {
      throw new SandboxGatewayError(422, "sandbox_output_integrity_mismatch");
    }
    total += content.length;
    if (total > request.max_artifact_bytes) {
      throw new SandboxGatewayError(413, "sandbox_output_artifact_limit_exceeded");
    }
    output.push({
      path: row.path,
      mode: row.mode,
      content_base64: content.toString("base64"),
      sha256: row.sha256,
      bytes: content.length,
    });
  }
  if (expected.size) throw new SandboxGatewayError(422, "sandbox_output_artifact_set_mismatch");
  return output.sort((a, b) => a.path.localeCompare(b.path));
}

export async function handleSandboxGatewayRequest(
  request: Request,
  dependencies: SandboxGatewayDependencies = {},
): Promise<Response> {
  const cfg = sandboxGatewayConfig();
  const now = dependencies.now?.() ?? new Date();
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new SandboxGatewayError(415, "sandbox_content_type_required");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared && (!Number.isSafeInteger(declared) || declared > MAX_WIRE_REQUEST_BYTES)) {
    throw new SandboxGatewayError(413, "sandbox_request_too_large");
  }
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_WIRE_REQUEST_BYTES) throw new SandboxGatewayError(413, "sandbox_request_too_large");
  const body = raw.toString("utf8");

  const timestampText = header(request, "x-anpos-sandbox-timestamp");
  const nonce = header(request, "x-anpos-sandbox-nonce");
  const signature = header(request, "x-anpos-sandbox-signature");
  const protocol = header(request, "x-anpos-sandbox-protocol");
  const driver = header(request, "x-anpos-sandbox-driver");
  const timestamp = Number(timestampText);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    protocol !== "2"
    || driver !== cfg.driverId
    || !Number.isSafeInteger(timestamp)
    || Math.abs(nowSeconds - timestamp) > cfg.requestSkewSeconds
    || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
  ) throw new SandboxGatewayError(401, "sandbox_request_authentication_failed");

  const expected = buildRemoteSandboxSignature({
    secret: cfg.signingSecret,
    timestamp: timestampText,
    nonce,
    body,
  });
  if (!sameHex(signature, expected)) {
    throw new SandboxGatewayError(401, "sandbox_request_authentication_failed");
  }

  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch { throw new SandboxGatewayError(422, "invalid_sandbox_request_json"); }
  const { wire, normalized } = parseWireRequest(parsed, cfg.driverId);

  const claimReplay = dependencies.claimReplay ?? defaultClaimReplay;
  const claimed = await claimReplay({
    nonce,
    requestId: requireRequestId(wire.request_id),
    driverId: cfg.driverId,
    expiresAt: new Date(now.getTime() + cfg.requestSkewSeconds * 2_000),
  });
  if (!claimed) throw new SandboxGatewayError(409, "sandbox_request_replayed");

  const createSandbox = dependencies.createSandbox ?? defaultCreateSandbox;
  let sandbox: SandboxLike | null = null;
  let stopped = false;
  try {
    sandbox = await createSandbox((normalized.timeout_seconds + 45) * 1000);
    await proveRuntimeAndNetwork(sandbox);
    await mkdirBatches(sandbox, directorySet(normalized));
    await writeInputFiles(sandbox, normalized);
    const execution = await executeCommand(sandbox, normalized);
    const outputFiles = await collectOutputs(sandbox, normalized);
    await sandbox.stop();
    stopped = true;

    const responseBody = JSON.stringify({
      protocol_version: 2,
      request_id: wire.request_id,
      driver_id: cfg.driverId,
      isolation: "remote_ephemeral",
      workspace_id: normalized.workspace_id,
      workspace_destroyed: true,
      network: "deny",
      exit_code: execution.exit_code,
      stdout: execution.stdout,
      stderr: execution.stderr,
      timed_out: execution.timed_out,
      output_truncated: execution.output_truncated,
      duration_ms: execution.duration_ms,
      output_files: outputFiles,
    });
    const responseSignature = buildRemoteSandboxResponseSignature({
      secret: cfg.signingSecret,
      requestId: wire.request_id,
      body: responseBody,
    });
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Anpos-Sandbox-Response-Signature": responseSignature,
      },
    });
  } finally {
    if (sandbox && !stopped) {
      try { await sandbox.stop(); }
      catch {
        // No signed success response is emitted unless the primary stop completed.
      }
    }
  }
}
