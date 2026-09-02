import { timingSafeEqual } from "node:crypto";
import { serviceConfig } from "./env";

function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireOperator(request: Request): void {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !equalSecret(token, serviceConfig().operatorToken)) throw new Error("UNAUTHORIZED_OPERATOR");
}

type GitHubUser = { id: number; login: string; type: string };

async function githubGet(path: string, token: string) {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "ANPOS-Commercial-Service/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function requireGithubAccountAccess(request: Request, target: { github_account_id: number; github_login: string; github_account_type: string }): Promise<GitHubUser> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED_GITHUB");

  const userResponse = await githubGet("/user", token);
  if (!userResponse.ok) throw new Error("UNAUTHORIZED_GITHUB");
  const user = await userResponse.json() as GitHubUser;
  if (user.id === target.github_account_id) return user;

  if (target.github_account_type === "Organization") {
    const membership = await githubGet(`/user/memberships/orgs/${encodeURIComponent(target.github_login)}`, token);
    if (membership.ok) {
      const body = await membership.json() as { state?: string };
      if (body.state === "active") return user;
    }
  }
  throw new Error("FORBIDDEN_GITHUB_ACCOUNT");
}
