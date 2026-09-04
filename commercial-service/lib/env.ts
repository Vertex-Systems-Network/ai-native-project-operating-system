export type MarketplaceAppConfig = {
  githubMarketplaceAppId: string;
  githubMarketplaceAppPrivateKeyPem: string;
  githubMarketplaceClientId: string;
  githubMarketplaceClientSecret: string;
  publicBaseUrl: string;
  sessionSecret: string;
};

export type ServiceConfig = MarketplaceAppConfig & {
  databaseUrl: string;
  githubWebhookSecret: string;
  githubVendorAppId: string;
  githubVendorAppPrivateKeyPem: string;
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

const MARKETPLACE_APP_REQUIRED = [
  "GITHUB_MARKETPLACE_APP_ID",
  "GITHUB_MARKETPLACE_APP_PRIVATE_KEY",
  "GITHUB_MARKETPLACE_CLIENT_ID",
  "GITHUB_MARKETPLACE_CLIENT_SECRET",
  "ANPOS_PUBLIC_BASE_URL",
  "ANPOS_SESSION_SECRET",
] as const;

const COMMUNITY_LAUNCH_REQUIRED = [
  "DATABASE_URL",
  "GITHUB_WEBHOOK_SECRET",
  ...MARKETPLACE_APP_REQUIRED,
  "ANPOS_MARKETPLACE_PLAN_MAP",
] as const;

const FULL_REQUIRED = [
  ...COMMUNITY_LAUNCH_REQUIRED,
  "GITHUB_VENDOR_APP_ID",
  "GITHUB_VENDOR_APP_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_KEY_ID",
  "ANPOS_OPERATOR_TOKEN",
  "ANPOS_ORG_SEAT_LIMITS",
  "GITHUB_VENDOR_INSTALLATION_ID",
  "ANPOS_PRIVATE_TEMPLATE_REPO",
] as const;

function missing(required: readonly string[]): string[] {
  return required.filter((name) => !value(name)).map((name) => `missing:${name}`);
}

export function missingConfig(): string[] {
  return missing(FULL_REQUIRED).map((problem) => problem.slice("missing:".length));
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

function commonProblems(required: readonly string[], includeVendorSeparation: boolean): string[] {
  const problems = missing(required);
  const requiredSet = new Set(required);

  const databaseUrl = value("DATABASE_URL");
  if (requiredSet.has("DATABASE_URL") && databaseUrl && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    problems.push("invalid:DATABASE_URL");
  }
  const webhookSecret = value("GITHUB_WEBHOOK_SECRET");
  if (requiredSet.has("GITHUB_WEBHOOK_SECRET") && webhookSecret && webhookSecret.length < 32) {
    problems.push("weak:GITHUB_WEBHOOK_SECRET");
  }
  const operatorToken = value("ANPOS_OPERATOR_TOKEN");
  if (requiredSet.has("ANPOS_OPERATOR_TOKEN") && operatorToken && operatorToken.length < 32) {
    problems.push("weak:ANPOS_OPERATOR_TOKEN");
  }
  const sessionSecret = value("ANPOS_SESSION_SECRET");
  if (requiredSet.has("ANPOS_SESSION_SECRET") && sessionSecret && sessionSecret.length < 32) {
    problems.push("weak:ANPOS_SESSION_SECRET");
  }
  const marketplaceClientSecret = value("GITHUB_MARKETPLACE_CLIENT_SECRET");
  if (requiredSet.has("GITHUB_MARKETPLACE_CLIENT_SECRET") && marketplaceClientSecret && marketplaceClientSecret.length < 32) {
    problems.push("weak:GITHUB_MARKETPLACE_CLIENT_SECRET");
  }

  const marketplaceAppId = value("GITHUB_MARKETPLACE_APP_ID");
  if (requiredSet.has("GITHUB_MARKETPLACE_APP_ID") && marketplaceAppId && !/^\d+$/.test(marketplaceAppId)) {
    problems.push("invalid:GITHUB_MARKETPLACE_APP_ID");
  }
  const marketplaceClientId = value("GITHUB_MARKETPLACE_CLIENT_ID");
  if (requiredSet.has("GITHUB_MARKETPLACE_CLIENT_ID") && marketplaceClientId && !/^[A-Za-z0-9._-]{10,100}$/.test(marketplaceClientId)) {
    problems.push("invalid:GITHUB_MARKETPLACE_CLIENT_ID");
  }

  const publicBaseUrl = value("ANPOS_PUBLIC_BASE_URL");
  if (requiredSet.has("ANPOS_PUBLIC_BASE_URL") && publicBaseUrl && !validHttpsBaseUrl(publicBaseUrl)) {
    problems.push("invalid:ANPOS_PUBLIC_BASE_URL");
  }

  if (requiredSet.has("ANPOS_MARKETPLACE_PLAN_MAP")) {
    const raw = value("ANPOS_MARKETPLACE_PLAN_MAP");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) problems.push("invalid:ANPOS_MARKETPLACE_PLAN_MAP");
      } catch {
        problems.push("invalid:ANPOS_MARKETPLACE_PLAN_MAP");
      }
    }
  }

  validatePrivateKeyMarker("GITHUB_MARKETPLACE_APP_PRIVATE_KEY", problems);

  if (includeVendorSeparation) {
    const vendorAppId = value("GITHUB_VENDOR_APP_ID");
    if (vendorAppId && !/^\d+$/.test(vendorAppId)) problems.push("invalid:GITHUB_VENDOR_APP_ID");
    if (marketplaceAppId && vendorAppId && marketplaceAppId === vendorAppId) {
      problems.push("unsafe:GITHUB_APP_ROLE_SEPARATION");
    }

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
    const seatLimits = value("ANPOS_ORG_SEAT_LIMITS");
    if (seatLimits) {
      try {
        const parsed = JSON.parse(seatLimits);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) problems.push("invalid:ANPOS_ORG_SEAT_LIMITS");
      } catch {
        problems.push("invalid:ANPOS_ORG_SEAT_LIMITS");
      }
    }

    validatePrivateKeyMarker("GITHUB_VENDOR_APP_PRIVATE_KEY", problems);
    const marketplaceKey = pem("GITHUB_MARKETPLACE_APP_PRIVATE_KEY");
    const vendorKey = pem("GITHUB_VENDOR_APP_PRIVATE_KEY");
    if (marketplaceKey && vendorKey && marketplaceKey === vendorKey) {
      problems.push("unsafe:GITHUB_APP_PRIVATE_KEY_REUSE");
    }
    validatePrivateKeyMarker("ANPOS_ENTITLEMENT_PRIVATE_KEY", problems);
  }

  return [...new Set(problems)];
}

export function marketplaceAppConfigurationProblems(): string[] {
  return commonProblems(MARKETPLACE_APP_REQUIRED, false);
}

export function communityLaunchConfigurationProblems(): string[] {
  return commonProblems(COMMUNITY_LAUNCH_REQUIRED, false);
}

export function configurationProblems(): string[] {
  return commonProblems(FULL_REQUIRED, true);
}

export function databaseConfig(): { databaseUrl: string } {
  const problems = commonProblems(["DATABASE_URL"], false);
  if (problems.length) throw new Error(`Database is not configured: ${problems.join(", ")}`);
  return { databaseUrl: value("DATABASE_URL")! };
}

export function webhookConfig(): { githubWebhookSecret: string } {
  const problems = commonProblems(["GITHUB_WEBHOOK_SECRET"], false);
  if (problems.length) throw new Error(`Marketplace webhook is not configured: ${problems.join(", ")}`);
  return { githubWebhookSecret: value("GITHUB_WEBHOOK_SECRET")! };
}

export function marketplaceAppConfig(): MarketplaceAppConfig {
  const problems = marketplaceAppConfigurationProblems();
  if (problems.length) {
    throw new Error(`Marketplace App is not configured: ${problems.join(", ")}`);
  }
  return {
    githubMarketplaceAppId: value("GITHUB_MARKETPLACE_APP_ID")!,
    githubMarketplaceAppPrivateKeyPem: pem("GITHUB_MARKETPLACE_APP_PRIVATE_KEY")!,
    githubMarketplaceClientId: value("GITHUB_MARKETPLACE_CLIENT_ID")!,
    githubMarketplaceClientSecret: value("GITHUB_MARKETPLACE_CLIENT_SECRET")!,
    publicBaseUrl: value("ANPOS_PUBLIC_BASE_URL")!.replace(/\/$/, ""),
    sessionSecret: value("ANPOS_SESSION_SECRET")!,
  };
}

export function serviceConfig(): ServiceConfig {
  const problems = configurationProblems();
  if (problems.length) {
    throw new Error(`Commercial service is not configured: ${problems.join(", ")}`);
  }
  return {
    ...marketplaceAppConfig(),
    databaseUrl: value("DATABASE_URL")!,
    githubWebhookSecret: value("GITHUB_WEBHOOK_SECRET")!,
    githubVendorAppId: value("GITHUB_VENDOR_APP_ID")!,
    githubVendorAppPrivateKeyPem: pem("GITHUB_VENDOR_APP_PRIVATE_KEY")!,
    entitlementPrivateKeyPem: pem("ANPOS_ENTITLEMENT_PRIVATE_KEY")!,
    entitlementKeyId: value("ANPOS_ENTITLEMENT_KEY_ID")!,
    entitlementIssuer: value("ANPOS_ENTITLEMENT_ISSUER") ?? "https://license.anpos.dev",
    operatorToken: value("ANPOS_OPERATOR_TOKEN")!,
  };
}
