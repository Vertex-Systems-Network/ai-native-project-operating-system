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
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubAppJwt()}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "ANPOS-Commercial-Service/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub Marketplace reconciliation failed: ${response.status}`);
  return response.json() as Promise<MarketplaceSubscription>;
}
