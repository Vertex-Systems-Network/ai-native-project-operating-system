import { createPrivateKey, sign } from "node:crypto";
import { serviceConfig } from "./env";

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

type GitHubAppRole = "marketplace" | "vendor";

function githubAppJwt(role: GitHubAppRole): string {
  const cfg = serviceConfig();
  const now = Math.floor(Date.now() / 1000);
  const appId = role === "marketplace" ? cfg.githubMarketplaceAppId : cfg.githubVendorAppId;
  const privateKeyPem = role === "marketplace"
    ? cfg.githubMarketplaceAppPrivateKeyPem
    : cfg.githubVendorAppPrivateKeyPem;
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

function privateTemplateRepository(): { full: string; owner: string; repo: string } {
  const repository = process.env.ANPOS_PRIVATE_TEMPLATE_REPO;
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("ANPOS_PRIVATE_TEMPLATE_REPO is not configured");
  }
  const [owner, repo] = repository.split("/", 2);
  return { full: repository, owner, repo };
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

async function vendorInstallationToken(operation: "archive" | "collaborator"): Promise<string> {
  const installationId = process.env.GITHUB_VENDOR_INSTALLATION_ID;
  if (!installationId || !/^\d+$/.test(installationId)) throw new Error("GITHUB_VENDOR_INSTALLATION_ID is not configured");
  const repository = privateTemplateRepository();
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

export async function templateArchiveRedirect(ref: string): Promise<{ repository: string; location: string }> {
  const repository = privateTemplateRepository();
  const safeRef = ref.trim();
  if (!safeRef || safeRef.length > 200 || /[\r\n]/.test(safeRef)) throw new Error("Invalid template ref");
  const token = await vendorInstallationToken("archive");
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/zipball/${encodeURIComponent(safeRef)}`,
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
  return { repository: repository.full, location };
}

export async function inviteTemplateCollaborator(username: string): Promise<{ repository: string; status: number }> {
  const repository = privateTemplateRepository();
  const token = await vendorInstallationToken("collaborator");
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
  const token = await vendorInstallationToken("collaborator");
  const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}/collaborators/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: githubHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (![204, 404].includes(response.status)) throw new Error(`Template collaborator revocation failed: ${response.status}`);
  return { repository: repository.full, status: response.status };
}
