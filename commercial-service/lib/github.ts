import { createPrivateKey, sign } from "node:crypto";
import { serviceConfig } from "./env";

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function githubAppJwt(): string {
  const cfg = serviceConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 8 * 60, iss: cfg.githubAppId }));
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), createPrivateKey(cfg.githubAppPrivateKeyPem)).toString("base64url");
  return `${signingInput}.${signature}`;
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "ANPOS-Commercial-Service/1.0",
});

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
    headers: githubHeaders(githubAppJwt()),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub Marketplace reconciliation failed: ${response.status}`);
  return response.json() as Promise<MarketplaceSubscription>;
}

async function vendorInstallationToken(): Promise<string> {
  const installationId = process.env.GITHUB_VENDOR_INSTALLATION_ID;
  if (!installationId || !/^\d+$/.test(installationId)) throw new Error("GITHUB_VENDOR_INSTALLATION_ID is not configured");
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: githubHeaders(githubAppJwt()),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Vendor installation token failed: ${response.status}`);
  const body = await response.json() as { token?: string };
  if (!body.token) throw new Error("Vendor installation token missing");
  return body.token;
}

export async function inviteTemplateCollaborator(username: string): Promise<{ repository: string; status: number }> {
  const repository = process.env.ANPOS_PRIVATE_TEMPLATE_REPO;
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("ANPOS_PRIVATE_TEMPLATE_REPO is not configured");
  const token = await vendorInstallationToken();
  const response = await fetch(`https://api.github.com/repos/${repository}/collaborators/${encodeURIComponent(username)}`, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ permission: "pull" }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (![201, 204].includes(response.status)) throw new Error(`Template collaborator provisioning failed: ${response.status}`);
  return { repository, status: response.status };
}
