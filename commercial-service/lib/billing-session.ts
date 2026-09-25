import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { marketplaceAppConfig } from "./env";

export const BILLING_SESSION_COOKIE_NAME = "__Host-anpos_billing_session";
export const BILLING_OAUTH_STATE_COOKIE_NAME = "__Host-anpos_billing_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MAX_SESSION_TTL_SECONDS = 8 * 60 * 60;
const TOKEN_VERSION = 1;

type BillingOAuthState = {
  v: 1;
  nonce: string;
  code_verifier: string;
  exp: number;
};

type BillingBrowserSession = {
  v: 1;
  access_token: string;
  expires_at: number;
  github_user_id: number;
  github_login: string;
  issued_at: number;
};

function key(): Buffer {
  return createHash("sha256")
    .update(marketplaceAppConfig().sessionSecret, "utf8")
    .update("\0anpos-billing-session-v1", "utf8")
    .digest();
}

function seal(value: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  return Buffer.concat([Buffer.from([TOKEN_VERSION]), iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function unseal<T>(token: string): T {
  if (!token || token.length > 16_384) throw new Error("INVALID_BILLING_SESSION");
  const raw = Buffer.from(token, "base64url");
  if (raw.length < 31 || raw[0] !== TOKEN_VERSION) throw new Error("INVALID_BILLING_SESSION");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(1, 13));
    decipher.setAuthTag(raw.subarray(13, 29));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(29)), decipher.final()]).toString("utf8")) as T;
  } catch {
    throw new Error("INVALID_BILLING_SESSION");
  }
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return rawValue.join("=") || null;
  }
  return null;
}

function secureCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function safeLogin(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearBillingCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function createBillingOAuthFlowState(): { state: string; cookie: string; codeChallenge: string } {
  const now = Math.floor(Date.now() / 1000);
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const payload: BillingOAuthState = {
    v: 1,
    nonce: state,
    code_verifier: codeVerifier,
    exp: now + OAUTH_STATE_TTL_SECONDS,
  };
  return {
    state,
    cookie: secureCookie(BILLING_OAUTH_STATE_COOKIE_NAME, seal(payload), OAUTH_STATE_TTL_SECONDS),
    codeChallenge: createHash("sha256").update(codeVerifier, "ascii").digest("base64url"),
  };
}

export function consumeBillingOAuthFlowState(request: Request, state: string): { codeVerifier: string } {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(state)) throw new Error("BILLING_OAUTH_STATE_INVALID");
  const cookie = cookieValue(request, BILLING_OAUTH_STATE_COOKIE_NAME);
  if (!cookie) throw new Error("BILLING_OAUTH_STATE_MISSING");
  const payload = unseal<BillingOAuthState>(cookie);
  const now = Math.floor(Date.now() / 1000);
  if (payload.v !== 1 || payload.exp < now || !/^[A-Za-z0-9_-]{43,128}$/.test(payload.code_verifier)) {
    throw new Error("BILLING_OAUTH_STATE_EXPIRED");
  }
  if (!equal(payload.nonce, state)) throw new Error("BILLING_OAUTH_STATE_INVALID");
  return { codeVerifier: payload.code_verifier };
}

export function createBillingSessionCookie(input: {
  accessToken: string;
  expiresInSeconds: number;
  githubUserId: number;
  githubLogin: string;
}): string {
  if (!input.accessToken || input.accessToken.length > 4096) throw new Error("INVALID_GITHUB_ACCESS_TOKEN");
  if (!Number.isSafeInteger(input.githubUserId) || input.githubUserId <= 0 || !safeLogin(input.githubLogin)) {
    throw new Error("INVALID_BILLING_GITHUB_IDENTITY");
  }
  const ttl = Math.min(Math.max(input.expiresInSeconds, 60), MAX_SESSION_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);
  return secureCookie(BILLING_SESSION_COOKIE_NAME, seal({
    v: 1,
    access_token: input.accessToken,
    expires_at: now + ttl,
    github_user_id: input.githubUserId,
    github_login: input.githubLogin,
    issued_at: now,
  } satisfies BillingBrowserSession), ttl);
}

export function billingSessionTokenFromRequest(request: Request): string | null {
  const cookie = cookieValue(request, BILLING_SESSION_COOKIE_NAME);
  if (!cookie) return null;
  try {
    const session = unseal<BillingBrowserSession>(cookie);
    const now = Math.floor(Date.now() / 1000);
    if (
      session.v !== 1
      || !session.access_token
      || session.access_token.length > 4096
      || !Number.isSafeInteger(session.github_user_id)
      || session.github_user_id <= 0
      || !safeLogin(session.github_login)
      || !Number.isSafeInteger(session.issued_at)
      || !Number.isSafeInteger(session.expires_at)
      || session.expires_at <= now
      || session.issued_at > now + 60
    ) return null;
    return session.access_token;
  } catch {
    return null;
  }
}
