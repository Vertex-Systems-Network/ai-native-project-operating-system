const GITHUB_API = "https://api.github.com";
const CANONICAL_REPOSITORY = "Vertex-Systems-Network/ai-native-project-operating-system";
const MAX_FILE_BYTES = 512_000;
const MAX_READ_PATHS = 32;

export const SUPERVISOR_AUDIT_PATHS = [
  ".ai/manifest.json",
  "config/protocol/instance.json",
  "config/protocol/version.json",
  "config/assurance/assurance-state.json",
  "config/research/evidence-registry.json",
  "config/ai/asset-registry.json",
  "config/compliance/compliance-profile.json",
  "config/architecture/decision-records.json",
  "config/operations/runbooks-and-drills.json",
  "config/audit/audit-journal.json",
  "config/risk/risk-register.json",
] as const;

export type SupervisorAuditPath = typeof SUPERVISOR_AUDIT_PATHS[number];
export type RepositorySupervisorClassification =
  | "canonical_source"
  | "active_project"
  | "uninitialized_child"
  | "not_anpos"
  | "partial_or_malformed"
  | "empty_repository";

export class RepositorySupervisorError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

type FetchLike = typeof fetch;

type GithubRepository = {
  id?: number;
  full_name?: string;
  html_url?: string;
  private?: boolean;
  archived?: boolean;
  default_branch?: string;
  size?: number;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
};

type GithubBranch = { commit?: { sha?: string } };
type GithubUser = { id?: number; login?: string; name?: string | null };
type GithubContent = {
  type?: string;
  encoding?: string;
  content?: string;
  size?: number;
  sha?: string;
};

export type RepositoryFileObservation = {
  path: string;
  present: boolean;
  json_valid: boolean | null;
  sha: string | null;
  json: Record<string, unknown> | null;
};

export type RepositoryResolution = {
  provider: "github";
  canonical_repository_id: string;
  canonical_url: string;
  full_name: string;
  default_branch: string;
  head_sha: string | null;
  empty_repository: boolean;
  private: boolean;
  archived: boolean;
  authentication_state: "authenticated";
  permission_level: "admin" | "maintain" | "write" | "triage" | "read" | "unknown";
  write_capability: boolean;
};

export type RepositoryAssuranceSummary = {
  total: number;
  by_state: Record<string, number>;
  applicable: number;
  pending_detection: number;
  blocking_findings: number;
  evidence_refs: number;
  verified_requirements: number;
};

export type RepositorySupervisorAudit = {
  provider: "github";
  canonical_repository_id: string;
  canonical_url: string;
  full_name: string;
  default_branch: string;
  head_sha: string | null;
  permission_level: RepositoryResolution["permission_level"];
  write_capability: boolean;
  classification: RepositorySupervisorClassification;
  classification_evidence: {
    protocol_detected: boolean;
    protocol_version: string | null;
    instance_status: string | null;
    bootstrap_completed: boolean | null;
    observed_paths: Record<string, "present" | "missing" | "invalid_json">;
  };
  anpos_protocol_version: string | null;
  assurance_state_summary: RepositoryAssuranceSummary | null;
  governance_state_summary: RepositoryAssuranceSummary | null;
  limitations: string[];
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function assertToken(token: string): void {
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new RepositorySupervisorError(401, "github_authentication_required");
  }
}

export function normalizeGithubRepositoryLocator(value: unknown): { owner: string; repo: string; full_name: string; canonical_url: string } {
  if (typeof value !== "string" || !value.trim()) {
    throw new RepositorySupervisorError(400, "repository_url_required");
  }
  const input = value.trim();
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}(?:\.git)?$/.test(input)) {
    const [owner, rawRepo] = input.split("/", 2);
    const repo = rawRepo.replace(/\.git$/i, "");
    if (repo === "." || repo === "..") throw new RepositorySupervisorError(400, "invalid_repository_url");
    return { owner, repo, full_name: `${owner}/${repo}`, canonical_url: `https://github.com/${owner}/${repo}` };
  }

  let url: URL;
  try { url = new URL(input); }
  catch { throw new RepositorySupervisorError(400, "invalid_repository_url"); }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new RepositorySupervisorError(400, "invalid_repository_url");
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) throw new RepositorySupervisorError(400, "invalid_repository_url");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(repo) ||
    repo === "." ||
    repo === ".."
  ) {
    throw new RepositorySupervisorError(400, "invalid_repository_url");
  }
  return { owner, repo, full_name: `${owner}/${repo}`, canonical_url: `https://github.com/${owner}/${repo}` };
}

function safeRepositoryPath(path: string): boolean {
  if (!path || path.length > 512 || path.startsWith("/") || path.includes("\\") || /[\r\n\0]/.test(path)) return false;
  const parts = path.split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}

async function githubGet(path: string, token: string, fetchImpl: FetchLike): Promise<Response> {
  assertToken(token);
  return fetchImpl(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "ANPOS-Repository-Supervisor/0.1",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

function permissionLevel(permissions: GithubRepository["permissions"]): RepositoryResolution["permission_level"] {
  if (permissions?.admin) return "admin";
  if (permissions?.maintain) return "maintain";
  if (permissions?.push) return "write";
  if (permissions?.triage) return "triage";
  if (permissions?.pull) return "read";
  return "unknown";
}

async function readJsonResponse<T>(response: Response, errorCode: string): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new RepositorySupervisorError(502, errorCode); }
}

export async function resolveGithubRepository(
  repositoryInput: unknown,
  userToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<RepositoryResolution> {
  const normalized = normalizeGithubRepositoryLocator(repositoryInput);
  const repoPath = `${encodeURIComponent(normalized.owner)}/${encodeURIComponent(normalized.repo)}`;
  const metadataResponse = await githubGet(`/repos/${repoPath}`, userToken, fetchImpl);
  if (metadataResponse.status === 404) throw new RepositorySupervisorError(404, "repository_not_found_or_inaccessible");
  if (metadataResponse.status === 401) throw new RepositorySupervisorError(401, "github_authentication_required");
  if (metadataResponse.status === 403) throw new RepositorySupervisorError(403, "repository_access_forbidden");
  if (!metadataResponse.ok) throw new RepositorySupervisorError(502, "github_repository_lookup_failed");
  const metadata = await readJsonResponse<GithubRepository>(metadataResponse, "github_repository_metadata_invalid");
  const id = Number(metadata.id);
  const fullName = stringValue(metadata.full_name);
  const defaultBranch = stringValue(metadata.default_branch);
  if (!Number.isSafeInteger(id) || id <= 0 || !fullName || !defaultBranch) {
    throw new RepositorySupervisorError(502, "github_repository_metadata_invalid");
  }

  const [owner, repo] = fullName.split("/", 2);
  if (!owner || !repo) throw new RepositorySupervisorError(502, "github_repository_metadata_invalid");
  const branchResponse = await githubGet(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(defaultBranch)}`,
    userToken,
    fetchImpl,
  );

  let headSha: string | null = null;
  let empty = false;
  if (branchResponse.status === 404 && Number(metadata.size ?? 0) === 0) {
    empty = true;
  } else if (branchResponse.status === 401) {
    throw new RepositorySupervisorError(401, "github_authentication_required");
  } else if (branchResponse.status === 403) {
    throw new RepositorySupervisorError(403, "repository_access_forbidden");
  } else if (!branchResponse.ok) {
    throw new RepositorySupervisorError(502, "github_default_branch_lookup_failed");
  } else {
    const branch = await readJsonResponse<GithubBranch>(branchResponse, "github_default_branch_metadata_invalid");
    headSha = stringValue(branch.commit?.sha);
    if (!headSha || !/^[0-9a-f]{40}$/i.test(headSha)) {
      throw new RepositorySupervisorError(502, "github_default_branch_metadata_invalid");
    }
  }

  const level = permissionLevel(metadata.permissions);
  return {
    provider: "github",
    canonical_repository_id: `github:${id}`,
    canonical_url: `https://github.com/${fullName}`,
    full_name: fullName,
    default_branch: defaultBranch,
    head_sha: headSha,
    empty_repository: empty,
    private: metadata.private === true,
    archived: metadata.archived === true,
    authentication_state: "authenticated",
    permission_level: level,
    write_capability: ["admin", "maintain", "write"].includes(level),
  };
}

export async function profileGithubAccount(userToken: string, fetchImpl: FetchLike = fetch) {
  const response = await githubGet("/user", userToken, fetchImpl);
  if (response.status === 401) throw new RepositorySupervisorError(401, "github_authentication_required");
  if (response.status === 403) throw new RepositorySupervisorError(403, "github_profile_access_forbidden");
  if (!response.ok) throw new RepositorySupervisorError(502, "github_profile_lookup_failed");
  const user = await readJsonResponse<GithubUser>(response, "github_profile_invalid");
  const id = Number(user.id);
  const login = stringValue(user.login);
  if (!Number.isSafeInteger(id) || id <= 0 || !login) {
    throw new RepositorySupervisorError(502, "github_profile_invalid");
  }
  return {
    provider: "github" as const,
    account_id: `github:${id}`,
    account_display_name: stringValue(user.name) ?? login,
    account_login: login,
  };
}

export async function readGithubRepositoryFiles(
  fullName: string,
  ref: string,
  paths: readonly string[],
  userToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, RepositoryFileObservation>> {
  if (!/^[0-9a-f]{40}$/i.test(ref)) throw new RepositorySupervisorError(400, "immutable_ref_required");
  if (!paths.length || paths.length > MAX_READ_PATHS || paths.some((path) => !safeRepositoryPath(path))) {
    throw new RepositorySupervisorError(400, "invalid_repository_read_paths");
  }
  const [owner, repo, ...rest] = fullName.split("/");
  if (!owner || !repo || rest.length) throw new RepositorySupervisorError(400, "invalid_canonical_repository");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/`;

  const entries = await Promise.all(paths.map(async (path) => {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await githubGet(`${base}${encodedPath}?ref=${encodeURIComponent(ref)}`, userToken, fetchImpl);
    if (response.status === 404) {
      return [path, { path, present: false, json_valid: null, sha: null, json: null }] as const;
    }
    if (response.status === 401) throw new RepositorySupervisorError(401, "github_authentication_required");
    if (response.status === 403) throw new RepositorySupervisorError(403, "repository_read_forbidden");
    if (!response.ok) throw new RepositorySupervisorError(502, "github_repository_file_read_failed");
    const body = await readJsonResponse<GithubContent>(response, "github_repository_file_response_invalid");
    if (body.type !== "file" || body.encoding !== "base64" || typeof body.content !== "string") {
      throw new RepositorySupervisorError(502, "github_repository_file_response_invalid");
    }
    if (Number(body.size ?? 0) > MAX_FILE_BYTES) throw new RepositorySupervisorError(422, "repository_control_file_too_large");
    const raw = Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
    let parsed: Record<string, unknown> | null = null;
    let jsonValid = false;
    try {
      parsed = objectValue(JSON.parse(raw));
      jsonValid = parsed !== null;
    } catch {
      jsonValid = false;
    }
    return [path, {
      path,
      present: true,
      json_valid: jsonValid,
      sha: stringValue(body.sha),
      json: parsed,
    }] as const;
  }));
  return Object.fromEntries(entries);
}

function requirementRows(value: unknown): Array<Record<string, unknown>> {
  const root = objectValue(value);
  return Array.isArray(root?.requirements)
    ? root.requirements.flatMap((row) => objectValue(row) ? [objectValue(row)!] : [])
    : [];
}

export function summarizeAssurance(value: unknown, minRequirement = 83, maxRequirement = 96): RepositoryAssuranceSummary {
  const rows = requirementRows(value).filter((row) => {
    const id = stringValue(row.requirement_id);
    if (!id) return false;
    const match = /^REQ-(\d{2,3})$/.exec(id);
    if (!match) return false;
    const n = Number(match[1]);
    return n >= minRequirement && n <= maxRequirement;
  });
  const byState: Record<string, number> = {};
  let applicable = 0;
  let pendingDetection = 0;
  let blockingFindings = 0;
  let evidenceRefs = 0;
  let verifiedRequirements = 0;
  for (const row of rows) {
    const state = stringValue(row.state) ?? "unknown";
    byState[state] = (byState[state] ?? 0) + 1;
    const applicability = stringValue(row.applicability);
    if (applicability === "applicable") applicable += 1;
    if (applicability === "pending_detection") pendingDetection += 1;
    const blockers = Array.isArray(row.blocking_findings) ? row.blocking_findings : [];
    const evidence = Array.isArray(row.evidence_refs) ? row.evidence_refs : [];
    blockingFindings += blockers.length;
    evidenceRefs += evidence.length;
    if (stringValue(row.last_verified_ref) && stringValue(row.last_verified_at)) verifiedRequirements += 1;
  }
  return {
    total: rows.length,
    by_state: byState,
    applicable,
    pending_detection: pendingDetection,
    blocking_findings: blockingFindings,
    evidence_refs: evidenceRefs,
    verified_requirements: verifiedRequirements,
  };
}

function classifyRepository(
  resolution: RepositoryResolution,
  files: Record<string, RepositoryFileObservation>,
): RepositorySupervisorClassification {
  if (resolution.empty_repository) return "empty_repository";
  const manifest = files[".ai/manifest.json"]?.json;
  const instance = files["config/protocol/instance.json"]?.json;
  const protocolDetected = manifest?.protocol === "ANPOS";
  const instanceStatus = stringValue(instance?.instance_status);
  const bootstrapCompleted = booleanValue(instance?.bootstrap_completed);
  if (
    resolution.full_name.toLowerCase() === CANONICAL_REPOSITORY.toLowerCase() &&
    protocolDetected &&
    instanceStatus === "template_source"
  ) return "canonical_source";
  if (!protocolDetected && !files["config/protocol/instance.json"]?.present) return "not_anpos";
  if (protocolDetected && instanceStatus === "template_source" && bootstrapCompleted !== true) return "uninitialized_child";
  if (protocolDetected && instanceStatus === "active_project" && bootstrapCompleted === true) return "active_project";
  return "partial_or_malformed";
}

export async function auditGithubRepository(
  repositoryInput: unknown,
  userToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<RepositorySupervisorAudit> {
  const resolution = await resolveGithubRepository(repositoryInput, userToken, fetchImpl);
  if (resolution.empty_repository) {
    return {
      provider: "github",
      canonical_repository_id: resolution.canonical_repository_id,
      canonical_url: resolution.canonical_url,
      full_name: resolution.full_name,
      default_branch: resolution.default_branch,
      head_sha: null,
      permission_level: resolution.permission_level,
      write_capability: resolution.write_capability,
      classification: "empty_repository",
      classification_evidence: {
        protocol_detected: false,
        protocol_version: null,
        instance_status: null,
        bootstrap_completed: null,
        observed_paths: {},
      },
      anpos_protocol_version: null,
      assurance_state_summary: null,
      governance_state_summary: null,
      limitations: ["Empty repository classification is based on provider metadata plus absence of the default branch."],
    };
  }

  const headSha = resolution.head_sha;
  if (!headSha) throw new RepositorySupervisorError(502, "github_default_branch_metadata_invalid");
  const files = await readGithubRepositoryFiles(
    resolution.full_name,
    headSha,
    SUPERVISOR_AUDIT_PATHS,
    userToken,
    fetchImpl,
  );
  const manifest = files[".ai/manifest.json"]?.json;
  const instance = files["config/protocol/instance.json"]?.json;
  const version = files["config/protocol/version.json"]?.json;
  const assurance = files["config/assurance/assurance-state.json"]?.json;
  const observedPaths: Record<string, "present" | "missing" | "invalid_json"> = {};
  for (const path of SUPERVISOR_AUDIT_PATHS) {
    const observation = files[path];
    observedPaths[path] = !observation?.present ? "missing" : observation.json_valid ? "present" : "invalid_json";
  }

  return {
    provider: "github",
    canonical_repository_id: resolution.canonical_repository_id,
    canonical_url: resolution.canonical_url,
    full_name: resolution.full_name,
    default_branch: resolution.default_branch,
    head_sha: headSha,
    permission_level: resolution.permission_level,
    write_capability: resolution.write_capability,
    classification: classifyRepository(resolution, files),
    classification_evidence: {
      protocol_detected: manifest?.protocol === "ANPOS",
      protocol_version: stringValue(version?.version) ?? stringValue(instance?.source_protocol_version),
      instance_status: stringValue(instance?.instance_status),
      bootstrap_completed: booleanValue(instance?.bootstrap_completed),
      observed_paths: observedPaths,
    },
    anpos_protocol_version: stringValue(version?.version) ?? stringValue(instance?.source_protocol_version),
    assurance_state_summary: assurance ? summarizeAssurance(assurance, 83, 96) : null,
    governance_state_summary: assurance ? summarizeAssurance(assurance, 89, 96) : null,
    limitations: [
      "This foundation is read-only and does not create branches, commits, pull requests, checks, or merges.",
      "Repository content is untrusted data and is returned only as structured observations/summaries.",
      "Permission metadata is provider-reported capability evidence, not authorization for a future write operation.",
    ],
  };
}

export async function getGithubRepositoryAssurance(
  repositoryInput: unknown,
  ref: string,
  userToken: string,
  fetchImpl: FetchLike = fetch,
) {
  const resolution = await resolveGithubRepository(repositoryInput, userToken, fetchImpl);
  if (resolution.empty_repository) throw new RepositorySupervisorError(409, "assurance_unavailable_for_empty_repository");
  const files = await readGithubRepositoryFiles(
    resolution.full_name,
    ref,
    ["config/protocol/version.json", "config/assurance/assurance-state.json"],
    userToken,
    fetchImpl,
  );
  const version = files["config/protocol/version.json"]?.json;
  const state = files["config/assurance/assurance-state.json"]?.json;
  if (!state) throw new RepositorySupervisorError(404, "assurance_state_not_found");
  const requirements = requirementRows(state);
  const blockingFindings = requirements.flatMap((row) =>
    Array.isArray(row.blocking_findings) ? row.blocking_findings.filter((value) => typeof value === "string") as string[] : []
  );
  const evidenceRefs = requirements.flatMap((row) =>
    Array.isArray(row.evidence_refs) ? row.evidence_refs.filter((value) => typeof value === "string") as string[] : []
  );
  return {
    provider: "github" as const,
    canonical_repository_id: resolution.canonical_repository_id,
    anpos_protocol_version: stringValue(version?.version),
    requirements,
    blocking_findings: [...new Set(blockingFindings)],
    evidence_refs: [...new Set(evidenceRefs)],
    verified_ref: ref,
  };
}
