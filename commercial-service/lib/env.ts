export type ServiceConfig = {
  databaseUrl: string;
  githubWebhookSecret: string;
  githubMarketplaceAppId: string;
  githubMarketplaceAppPrivateKeyPem: string;
  githubMarketplaceClientId: string;
  githubMarketplaceClientSecret: string;
  githubVendorAppId: string;
  githubVendorAppPrivateKeyPem: string;
  entitlementPrivateKeyPem: string;
  entitlementKeyId: string;
  entitlementIssuer: string;
  operatorToken: string;
  publicBaseUrl: string;
  sessionSecret: string;
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
  "GITHUB_MARKETPLACE_APP_ID",
  "GITHUB_MARKETPLACE_APP_PRIVATE_KEY",
  "GITHUB_MARKETPLACE_CLIENT_ID",
  "GITHUB_MARKETPLACE_CLIENT_SECRET",
  "GITHUB_VENDOR_APP_ID",
  "GITHUB_VENDOR_APP_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_KEY_ID",
  "ANPOS_OPERATOR_TOKEN",
  "ANPOS_MARKETPLACE_PLAN_MAP",
  "ANPOS_ORG_SEAT_LIMITS",
  "GITHUB_VENDOR_INSTALLATION_ID",
  "ANPOS_PRIVATE_TEMPLATE_REPO",
  "ANPOS_PUBLIC_BASE_URL",
  "ANPOS_SESSION_SECRET",
];

export function missingConfig(): string[] {
  return REQUIRED.filter((name) => !value(name));
}

function validatePrivateKeyMarker(name: string, problems: string[]): void {
  const key = pem(name);
  if (key && (!key.includes("BEGIN") || !key.includes("PRIVATE KEY"))) {
    problems.push(`invalid:${name}`);
  }
}

function validHttpsBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function configurationProblems(): string[] {
  const problems = missingConfig().map((name) => `missing:${name}`);
  const databaseUrl = value("DATABASE_URL");
  if (databaseUrl && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) problems.push("invalid:DATABASE_URL");
  const webhookSecret = value("GITHUB_WEBHOOK_SECRET");
  if (webhookSecret && webhookSecret.length < 32) problems.push("weak:GITHUB_WEBHOOK_SECRET");
  const operatorToken = value("ANPOS_OPERATOR_TOKEN");
  if (operatorToken && operatorToken.length < 32) problems.push("weak:ANPOS_OPERATOR_TOKEN");
  const sessionSecret = value("ANPOS_SESSION_SECRET");
  if (sessionSecret && sessionSecret.length < 32) problems.push("weak:ANPOS_SESSION_SECRET");
  const marketplaceClientSecret = value("GITHUB_MARKETPLACE_CLIENT_SECRET");
  if (marketplaceClientSecret && marketplaceClientSecret.length < 32) problems.push("weak:GITHUB_MARKETPLACE_CLIENT_SECRET");

  const marketplaceAppId = value("GITHUB_MARKETPLACE_APP_ID");
  if (marketplaceAppId && !/^\d+$/.test(marketplaceAppId)) problems.push("invalid:GITHUB_MARKETPLACE_APP_ID");
  const marketplaceClientId = value("GITHUB_MARKETPLACE_CLIENT_ID");
  if (marketplaceClientId && !/^[A-Za-z0-9._-]{10,100}$/.test(marketplaceClientId)) {
    problems.push("invalid:GITHUB_MARKETPLACE_CLIENT_ID");
  }
  const vendorAppId = value("GITHUB_VENDOR_APP_ID");
  if (vendorAppId && !/^\d+$/.test(vendorAppId)) problems.push("invalid:GITHUB_VENDOR_APP_ID");
  if (marketplaceAppId && vendorAppId && marketplaceAppId === vendorAppId) {
    problems.push("unsafe:GITHUB_APP_ROLE_SEPARATION");
  }

  const publicBaseUrl = value("ANPOS_PUBLIC_BASE_URL");
  if (publicBaseUrl && !validHttpsBaseUrl(publicBaseUrl)) problems.push("invalid:ANPOS_PUBLIC_BASE_URL");

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

  validatePrivateKeyMarker("GITHUB_MARKETPLACE_APP_PRIVATE_KEY", problems);
  validatePrivateKeyMarker("GITHUB_VENDOR_APP_PRIVATE_KEY", problems);
  const marketplaceKey = pem("GITHUB_MARKETPLACE_APP_PRIVATE_KEY");
  const vendorKey = pem("GITHUB_VENDOR_APP_PRIVATE_KEY");
  if (marketplaceKey && vendorKey && marketplaceKey === vendorKey) {
    problems.push("unsafe:GITHUB_APP_PRIVATE_KEY_REUSE");
  }
  validatePrivateKeyMarker("ANPOS_ENTITLEMENT_PRIVATE_KEY", problems);
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
    githubMarketplaceAppId: value("GITHUB_MARKETPLACE_APP_ID")!,
    githubMarketplaceAppPrivateKeyPem: pem("GITHUB_MARKETPLACE_APP_PRIVATE_KEY")!,
    githubMarketplaceClientId: value("GITHUB_MARKETPLACE_CLIENT_ID")!,
    githubMarketplaceClientSecret: value("GITHUB_MARKETPLACE_CLIENT_SECRET")!,
    githubVendorAppId: value("GITHUB_VENDOR_APP_ID")!,
    githubVendorAppPrivateKeyPem: pem("GITHUB_VENDOR_APP_PRIVATE_KEY")!,
    entitlementPrivateKeyPem: pem("ANPOS_ENTITLEMENT_PRIVATE_KEY")!,
    entitlementKeyId: value("ANPOS_ENTITLEMENT_KEY_ID")!,
    entitlementIssuer: value("ANPOS_ENTITLEMENT_ISSUER") ?? "https://license.anpos.dev",
    operatorToken: value("ANPOS_OPERATOR_TOKEN")!,
    publicBaseUrl: value("ANPOS_PUBLIC_BASE_URL")!.replace(/\/$/, ""),
    sessionSecret: value("ANPOS_SESSION_SECRET")!,
  };
}
