export type ServiceConfig = {
  databaseUrl: string;
  githubWebhookSecret: string;
  githubAppId: string;
  githubAppPrivateKeyPem: string;
  entitlementPrivateKeyPem: string;
  entitlementKeyId: string;
  entitlementIssuer: string;
  operatorToken: string;
};

function value(name: string): string | null {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : null;
}

function pem(name: string): string | null {
  const raw = value(name);
  return raw ? raw.replace(/\\n/g, "\n") : null;
}

const REQUIRED = [
  "DATABASE_URL",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_KEY_ID",
  "ANPOS_OPERATOR_TOKEN",
  "ANPOS_MARKETPLACE_PLAN_MAP",
  "ANPOS_ORG_SEAT_LIMITS",
  "GITHUB_VENDOR_INSTALLATION_ID",
  "ANPOS_PRIVATE_TEMPLATE_REPO",
];

export function missingConfig(): string[] {
  return REQUIRED.filter((name) => !value(name));
}

export function configurationProblems(): string[] {
  const problems = missingConfig().map((name) => `missing:${name}`);
  const databaseUrl = value("DATABASE_URL");
  if (databaseUrl && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) problems.push("invalid:DATABASE_URL");
  const webhookSecret = value("GITHUB_WEBHOOK_SECRET");
  if (webhookSecret && webhookSecret.length < 32) problems.push("weak:GITHUB_WEBHOOK_SECRET");
  const operatorToken = value("ANPOS_OPERATOR_TOKEN");
  if (operatorToken && operatorToken.length < 32) problems.push("weak:ANPOS_OPERATOR_TOKEN");
  const appId = value("GITHUB_APP_ID");
  if (appId && !/^\d+$/.test(appId)) problems.push("invalid:GITHUB_APP_ID");
  const installationId = value("GITHUB_VENDOR_INSTALLATION_ID");
  if (installationId && !/^\d+$/.test(installationId)) problems.push("invalid:GITHUB_VENDOR_INSTALLATION_ID");
  const repository = value("ANPOS_PRIVATE_TEMPLATE_REPO");
  if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) problems.push("invalid:ANPOS_PRIVATE_TEMPLATE_REPO");
  const keyId = value("ANPOS_ENTITLEMENT_KEY_ID");
  if (keyId && !/^[A-Za-z0-9._:-]{3,100}$/.test(keyId)) problems.push("invalid:ANPOS_ENTITLEMENT_KEY_ID");
  const issuer = value("ANPOS_ENTITLEMENT_ISSUER");
  if (issuer) {
    try { if (new URL(issuer).protocol !== "https:") problems.push("invalid:ANPOS_ENTITLEMENT_ISSUER"); }
    catch { problems.push("invalid:ANPOS_ENTITLEMENT_ISSUER"); }
  }
  for (const name of ["ANPOS_MARKETPLACE_PLAN_MAP", "ANPOS_ORG_SEAT_LIMITS"]) {
    const raw = value(name);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) problems.push(`invalid:${name}`);
      } catch { problems.push(`invalid:${name}`); }
    }
  }
  const githubKey = pem("GITHUB_APP_PRIVATE_KEY");
  if (githubKey && !githubKey.includes("BEGIN") || githubKey && !githubKey.includes("PRIVATE KEY")) {
    problems.push("invalid:GITHUB_APP_PRIVATE_KEY");
  }
  const entitlementKey = pem("ANPOS_ENTITLEMENT_PRIVATE_KEY");
  if (entitlementKey && (!entitlementKey.includes("BEGIN") || !entitlementKey.includes("PRIVATE KEY"))) {
    problems.push("invalid:ANPOS_ENTITLEMENT_PRIVATE_KEY");
  }
  return [...new Set(problems)];
}

export function serviceConfig(): ServiceConfig {
  const problems = configurationProblems();
  if (problems.length) {
    throw new Error(`Commercial service is not configured: ${problems.join(", ")}`);
  }
  return {
    databaseUrl: value("DATABASE_URL")!,
    githubWebhookSecret: value("GITHUB_WEBHOOK_SECRET")!,
    githubAppId: value("GITHUB_APP_ID")!,
    githubAppPrivateKeyPem: pem("GITHUB_APP_PRIVATE_KEY")!,
    entitlementPrivateKeyPem: pem("ANPOS_ENTITLEMENT_PRIVATE_KEY")!,
    entitlementKeyId: value("ANPOS_ENTITLEMENT_KEY_ID")!,
    entitlementIssuer: value("ANPOS_ENTITLEMENT_ISSUER") ?? "https://license.anpos.dev",
    operatorToken: value("ANPOS_OPERATOR_TOKEN")!,
  };
}
