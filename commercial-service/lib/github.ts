import { createHash, createPrivateKey, sign } from "node:crypto";
import packageJson from "@/package.json";
import { marketplaceAppConfig, premiumDistributionConfig, serviceConfig, vendorDistributionConfig } from "./env";
import { parsePremiumReleaseManifest, type VerifiedPremiumRelease } from "./premium-releases";
import {
  parseTemplateReleaseManifest,
  parseTemplateReleasePlanManifest,
  type VerifiedTemplateRelease,
  type VerifiedTemplateReleasePlan,
} from "./releases";

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

type GitHubAppRole = "marketplace" | "vendor";

function githubAppJwt(role: GitHubAppRole): string {
  const now = Math.floor(Date.now() / 1000);
  let appId: string;
  let privateKeyPem: string;
  if (role === "marketplace") {
    const cfg = marketplaceAppConfig();
    appId = cfg.githubMarketplaceAppId;
    privateKeyPem = cfg.githubMarketplaceAppPrivateKeyPem;
  } else {
    const cfg = vendorDistributionConfig();
    appId = cfg.githubVendorAppId;
    privateKeyPem = cfg.githubVendorAppPrivateKeyPem;
  }
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 8 * 60, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), createPrivateKey(privateKeyPem)).toString("base64url");
  return `${signingInput}.${signature}`;
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "ANPOS-Commercial-Service/1.0",
});

function privateRepository(full: string): { full: string; owner: string; repo: string } {
  const [owner, repo, ...rest] = full.split("/");
  if (!owner || !repo || rest.length) throw new Error("INVALID_VENDOR_REPOSITORY");
  return { full, owner, repo };
}

function privateTemplateRepository(): { full: string; owner: string; repo: string } {
  return privateRepository(vendorDistributionConfig().privateTemplateRepo);
}

function privatePremiumRepository(): { full: string; owner: string; repo: string } {
  return privateRepository(premiumDistributionConfig().privatePremiumRepo);
}

const serviceIdentity = packageJson as {
  anpos?: { source_protocol_version?: string };
};

function sourceProtocolVersion(): string {
  const value = serviceIdentity.anpos?.source_protocol_version;
  if (!value) throw new Error("SOURCE_PROTOCOL_VERSION_UNAVAILABLE");
  return value;
}

export type MarketplaceSubscription = {
  id: number;
  login: string;
  type: string;
  marketplace_purchase?: {
    billing_cycle?: string | null;
    next_billing_date?: string | null;
    unit_count?: number | null;
    on_free_trial?: boolean;
    free_trial_ends_on?: string | null;
    updated_at?: string | null;
    plan?: { id: number; number?: number; name?: string; state?: string };
  };
};

type MarketplaceRepositoryInstallation = {
  id?: number;
  suspended_at?: string | null;
  permissions?: Record<string, string>;
  single_file_paths?: string[] | null;
};

export type MarketplaceUserRepository = {
  id: number;
  full_name: string;
  private: boolean;
  archived: boolean;
  default_branch: string;
};

export type MarketplaceListingPlan = {
  id: number;
  number: number;
  name: string;
  state: string;
  price_model: string | null;
  monthly_price_in_cents: number | null;
  yearly_price_in_cents: number | null;
  has_free_trial: boolean;
};

export async function listMarketplacePlans(): Promise<MarketplaceListingPlan[]> {
  const response = await fetch("https://api.github.com/marketplace_listing/plans?per_page=100&page=1", {
    headers: githubHeaders(githubAppJwt("marketplace")),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`MARKETPLACE_PLANS_LOOKUP_FAILED_${response.status}`);
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) throw new Error("MARKETPLACE_PLANS_RESPONSE_INVALID");
  return body.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = Number(row.id);
    const number = Number(row.number);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const state = typeof row.state === "string" ? row.state.trim() : "";
    if (
      !Number.isSafeInteger(id) || id <= 0
      || !Number.isSafeInteger(number) || number <= 0
      || !name || name.length > 120
      || !state || state.length > 40
    ) return [];
    const monthly = row.monthly_price_in_cents == null ? null : Number(row.monthly_price_in_cents);
    const yearly = row.yearly_price_in_cents == null ? null : Number(row.yearly_price_in_cents);
    return [{
      id,
      number,
      name,
      state,
      price_model: typeof row.price_model === "string" ? row.price_model : null,
      monthly_price_in_cents: Number.isSafeInteger(monthly) && Number(monthly) >= 0 ? Number(monthly) : null,
      yearly_price_in_cents: Number.isSafeInteger(yearly) && Number(yearly) >= 0 ? Number(yearly) : null,
      has_free_trial: row.has_free_trial === true,
    }];
  });
}

export async function getMarketplaceSubscription(accountId: number): Promise<MarketplaceSubscription | null> {
  const response = await fetch(`https://api.github.com/marketplace_listing/accounts/${accountId}`, {
    headers: githubHeaders(githubAppJwt("marketplace")),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub Marketplace reconciliation failed: ${response.status}`);
  return response.json() as Promise<MarketplaceSubscription>;
}

export async function verifyMarketplaceRepositoryAuditInstallation(
  owner: string,
  repo: string,
  requiredSingleFilePaths: readonly string[],
): Promise<number> {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    throw new Error("INVALID_MARKETPLACE_REPOSITORY");
  }
  if (!requiredSingleFilePaths.length || requiredSingleFilePaths.length > 10) {
    throw new Error("INVALID_MARKETPLACE_AUDIT_PATHS");
  }
  for (const path of requiredSingleFilePaths) {
    if (!path || path.length > 255 || path.startsWith("/") || path.includes("..") || /[\r\n]/.test(path)) {
      throw new Error("INVALID_MARKETPLACE_AUDIT_PATHS");
    }
  }

  const installationResponse = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
    {
      headers: githubHeaders(githubAppJwt("marketplace")),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (installationResponse.status === 404) throw new Error("MARKETPLACE_APP_NOT_INSTALLED_FOR_REPOSITORY");
  if (!installationResponse.ok) throw new Error(`MARKETPLACE_APP_INSTALLATION_LOOKUP_FAILED_${installationResponse.status}`);
  const installation = await installationResponse.json() as MarketplaceRepositoryInstallation;
  if (!Number.isSafeInteger(installation.id) || Number(installation.id) <= 0) {
    throw new Error("MARKETPLACE_APP_INSTALLATION_INVALID");
  }
  if (installation.suspended_at) throw new Error("MARKETPLACE_APP_INSTALLATION_SUSPENDED");

  const singleFilePermission = installation.permissions?.single_file;
  if (!singleFilePermission || !["read", "write"].includes(singleFilePermission)) {
    throw new Error("MARKETPLACE_APP_SINGLE_FILE_READ_REQUIRED");
  }
  const grantedPaths = new Set((installation.single_file_paths ?? []).map((path) => String(path)));
  const missingPaths = requiredSingleFilePaths.filter((path) => !grantedPaths.has(path));
  if (missingPaths.length) throw new Error("MARKETPLACE_APP_AUDIT_PATHS_NOT_GRANTED");
  return Number(installation.id);
}

export async function listMarketplaceUserInstallationRepositories(
  userToken: string,
  installationId: number,
  page = 1,
  perPage = 100,
): Promise<{ total_count: number; repositories: MarketplaceUserRepository[] }> {
  if (!userToken || userToken.length > 4096) throw new Error("UNAUTHORIZED_GITHUB");
  if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error("INVALID_INSTALLATION_ID");
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Error("INVALID_PAGE");
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new Error("INVALID_PER_PAGE");
  const response = await fetch(
    `https://api.github.com/user/installations/${installationId}/repositories?per_page=${perPage}&page=${page}`,
    {
      headers: githubHeaders(userToken),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if ([401, 403, 404].includes(response.status)) throw new Error("MARKETPLACE_INSTALLATION_USER_ACCESS_REQUIRED");
  if (!response.ok) throw new Error(`MARKETPLACE_USER_REPOSITORIES_FAILED_${response.status}`);
  const body = await response.json() as { total_count?: number; repositories?: Array<Record<string, unknown>> };
  const repositories = Array.isArray(body.repositories) ? body.repositories : [];
  return {
    total_count: Number.isSafeInteger(body.total_count) ? Number(body.total_count) : repositories.length,
    repositories: repositories.flatMap((repo) => {
      const id = Number(repo.id);
      const fullName = typeof repo.full_name === "string" ? repo.full_name : "";
      const defaultBranch = typeof repo.default_branch === "string" ? repo.default_branch : "";
      if (!Number.isSafeInteger(id) || id <= 0 || !fullName || !defaultBranch) return [];
      return [{
        id,
        full_name: fullName,
        private: repo.private === true,
        archived: repo.archived === true,
        default_branch: defaultBranch,
      }];
    }),
  };
}

export async function verifyMarketplaceUserInstallationAccess(userToken: string, installationId: number): Promise<void> {
  await listMarketplaceUserInstallationRepositories(userToken, installationId, 1, 1);
}

async function vendorInstallationToken(
  repository: { full: string; owner: string; repo: string },
  operation: "archive" | "collaborator",
): Promise<string> {
  const cfg = vendorDistributionConfig();
  const installationId = cfg.githubVendorInstallationId;
  const permissions = operation === "collaborator"
    ? { administration: "write" }
    : { contents: "read" };
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { ...githubHeaders(githubAppJwt("vendor")), "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: [repository.repo], permissions }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Vendor installation token failed: ${response.status}`);
  const body = await response.json() as { token?: string };
  if (!body.token) throw new Error("Vendor installation token missing");
  return body.token;
}

export type CommercialReleaseMetadata = VerifiedTemplateRelease & {
  repository: string;
  release_ref: string;
};

export async function templateReleaseManifest(): Promise<CommercialReleaseMetadata> {
  const cfg = vendorDistributionConfig();
  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken(repository, "archive");
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/EXPORT-MANIFEST.json?ref=${cfg.commercialReleaseRef}`,
    {
      headers: { ...githubHeaders(token), Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Commercial release manifest failed: ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) {
    throw new Error("COMMERCIAL_RELEASE_MANIFEST_TOO_LARGE");
  }
  const raw = await response.text();
  if (!raw || raw.length > 2 * 1024 * 1024) throw new Error("COMMERCIAL_RELEASE_MANIFEST_TOO_LARGE");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("INVALID_COMMERCIAL_RELEASE_MANIFEST_JSON"); }
  const manifest = parseTemplateReleaseManifest(parsed);
  return {
    ...manifest,
    repository: repository.full,
    release_ref: cfg.commercialReleaseRef,
  };
}

export type CommercialReleasePlanSnapshot = VerifiedTemplateReleasePlan & {
  repository: string;
  release_ref: string;
};

export async function templateReleasePlanSnapshot(): Promise<CommercialReleasePlanSnapshot> {
  const cfg = vendorDistributionConfig();
  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken(repository, "archive");
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/EXPORT-MANIFEST.json?ref=${cfg.commercialReleaseRef}`,
    {
      headers: { ...githubHeaders(token), Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Commercial release manifest failed: ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) {
    throw new Error("COMMERCIAL_RELEASE_MANIFEST_TOO_LARGE");
  }
  const raw = await response.text();
  if (!raw || raw.length > 2 * 1024 * 1024) throw new Error("COMMERCIAL_RELEASE_MANIFEST_TOO_LARGE");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("INVALID_COMMERCIAL_RELEASE_MANIFEST_JSON"); }
  const manifest = parseTemplateReleasePlanManifest(parsed);
  return {
    ...manifest,
    repository: repository.full,
    release_ref: cfg.commercialReleaseRef,
  };
}

export type TemplateReleaseMaterializationRequest = {
  path: string;
  git_object: string;
  sha256: string;
  size: number;
  git_mode: "100644" | "100755";
};

export type MaterializedTemplateReleaseFile = TemplateReleaseMaterializationRequest & {
  content_base64: string;
};

const MAX_TEMPLATE_MATERIALIZATION_FILES = 5_000;
const MAX_TEMPLATE_MATERIALIZATION_BYTES = 24 * 1024 * 1024;
const TEMPLATE_BLOB_CONCURRENCY = 8;

function safeTemplateMaterializationPath(value: string): boolean {
  if (!value || value.length > 512 || value.startsWith("/") || value.includes("\\") || /[\r\n\0]/.test(value)) return false;
  return value.split("/").every((part) => part && part !== "." && part !== ".." && part !== ".git");
}

export async function materializeTemplateReleaseFiles(
  files: TemplateReleaseMaterializationRequest[],
): Promise<MaterializedTemplateReleaseFile[]> {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_TEMPLATE_MATERIALIZATION_FILES) {
    throw new Error("INVALID_TEMPLATE_MATERIALIZATION_FILES");
  }
  const seen = new Set<string>();
  let expectedBytes = 0;
  const normalized = files.map((file) => {
    if (
      !file
      || !safeTemplateMaterializationPath(file.path)
      || seen.has(file.path)
      || !/^[0-9a-f]{40}$/i.test(file.git_object)
      || !/^[0-9a-f]{64}$/i.test(file.sha256)
      || !Number.isSafeInteger(file.size)
      || file.size < 0
      || !["100644", "100755"].includes(file.git_mode)
    ) throw new Error("INVALID_TEMPLATE_MATERIALIZATION_FILE");
    seen.add(file.path);
    expectedBytes += file.size;
    if (expectedBytes > MAX_TEMPLATE_MATERIALIZATION_BYTES) {
      throw new Error("TEMPLATE_MATERIALIZATION_BYTES_EXCEEDED");
    }
    return {
      path: file.path,
      git_object: file.git_object.toLowerCase(),
      sha256: file.sha256.toLowerCase(),
      size: file.size,
      git_mode: file.git_mode,
    };
  });

  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken(repository, "archive");
  const results = new Array<MaterializedTemplateReleaseFile>(normalized.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= normalized.length) return;
      const file = normalized[index];
      const response = await fetch(
        `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/blobs/${file.git_object}`,
        {
          headers: githubHeaders(token),
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) throw new Error(`TEMPLATE_RELEASE_BLOB_READ_FAILED_${response.status}`);
      const body = await response.json() as { sha?: string; encoding?: string; content?: string; size?: number };
      if (
        body.sha?.toLowerCase() !== file.git_object
        || body.encoding !== "base64"
        || typeof body.content !== "string"
        || Number(body.size) !== file.size
      ) throw new Error("TEMPLATE_RELEASE_BLOB_IDENTITY_MISMATCH");
      const compact = body.content.replace(/\s+/g, "");
      let raw: Buffer;
      try { raw = Buffer.from(compact, "base64"); }
      catch { throw new Error("TEMPLATE_RELEASE_BLOB_ENCODING_INVALID"); }
      if (
        raw.length !== file.size
        || createHash("sha256").update(raw).digest("hex") !== file.sha256
      ) throw new Error("TEMPLATE_RELEASE_BLOB_DIGEST_MISMATCH");
      results[index] = {
        ...file,
        content_base64: raw.toString("base64"),
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(TEMPLATE_BLOB_CONCURRENCY, normalized.length) }, () => worker()),
  );
  return results;
}

export async function templateArchiveRedirect(): Promise<{ repository: string; release_ref: string; location: string }> {
  const cfg = vendorDistributionConfig();
  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken(repository, "archive");
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/zipball/${cfg.commercialReleaseRef}`,
    {
      headers: githubHeaders(token),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status !== 302) throw new Error(`Template archive redirect failed: ${response.status}`);
  const location = response.headers.get("location");
  if (!location) throw new Error("Template archive redirect missing");
  const destination = new URL(location);
  if (destination.protocol !== "https:" || destination.hostname !== "codeload.github.com") {
    throw new Error("Unexpected template archive redirect host");
  }
  return { repository: repository.full, release_ref: cfg.commercialReleaseRef, location };
}

export type PremiumReleaseMetadata = VerifiedPremiumRelease & {
  repository: string;
  release_ref: string;
  manifest_sha256: string;
};

export async function premiumReleaseManifest(): Promise<PremiumReleaseMetadata> {
  const cfg = premiumDistributionConfig();
  const repository = privatePremiumRepository();
  const token = await vendorInstallationToken(repository, "archive");
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/ANPOS-PREMIUM-MANIFEST.json?ref=${cfg.premiumReleaseRef}`,
    {
      headers: { ...githubHeaders(token), Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Premium release manifest failed: ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) throw new Error("PREMIUM_RELEASE_MANIFEST_TOO_LARGE");
  const raw = Buffer.from(await response.arrayBuffer());
  if (!raw.length || raw.length > 2 * 1024 * 1024) throw new Error("PREMIUM_RELEASE_MANIFEST_TOO_LARGE");
  const manifestSha256 = createHash("sha256").update(raw).digest("hex");
  if (manifestSha256 !== cfg.premiumManifestSha256) throw new Error("PREMIUM_RELEASE_MANIFEST_DIGEST_MISMATCH");

  let parsed: unknown;
  try { parsed = JSON.parse(raw.toString("utf8")); }
  catch { throw new Error("INVALID_PREMIUM_RELEASE_MANIFEST_JSON"); }
  const manifest = parsePremiumReleaseManifest(parsed, sourceProtocolVersion());
  if (manifest.content_set_sha256 !== cfg.premiumContentSetSha256) throw new Error("PREMIUM_RELEASE_CONTENT_SET_DIGEST_MISMATCH");

  return {
    ...manifest,
    repository: repository.full,
    release_ref: cfg.premiumReleaseRef,
    manifest_sha256: manifestSha256,
  };
}

export async function premiumArchiveRedirect(): Promise<{ repository: string; release_ref: string; location: string }> {
  const cfg = premiumDistributionConfig();
  const repository = privatePremiumRepository();
  const token = await vendorInstallationToken(repository, "archive");
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/zipball/${cfg.premiumReleaseRef}`,
    {
      headers: githubHeaders(token),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status !== 302) throw new Error(`Premium archive redirect failed: ${response.status}`);
  const location = response.headers.get("location");
  if (!location) throw new Error("Premium archive redirect missing");
  const destination = new URL(location);
  if (destination.protocol !== "https:" || destination.hostname !== "codeload.github.com") {
    throw new Error("Unexpected premium archive redirect host");
  }
  return { repository: repository.full, release_ref: cfg.premiumReleaseRef, location };
}

export async function inviteTemplateCollaborator(username: string): Promise<{ repository: string; status: number }> {
  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken(repository, "collaborator");
  const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}/collaborators/${encodeURIComponent(username)}`, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ permission: "pull" }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (![201, 204].includes(response.status)) throw new Error(`Template collaborator provisioning failed: ${response.status}`);
  return { repository: repository.full, status: response.status };
}

export async function removeTemplateCollaborator(username: string): Promise<{ repository: string; status: number }> {
  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken(repository, "collaborator");
  const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}/collaborators/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: githubHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (![204, 404].includes(response.status)) throw new Error(`Template collaborator revocation failed: ${response.status}`);
  return { repository: repository.full, status: response.status };
}
