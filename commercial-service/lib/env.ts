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
  githubVendorInstallationId: string;
  privateTemplateRepo: string;
  entitlementPrivateKeyPem: string;
  entitlementKeyId: string;
  entitlementIssuer: string;
  operatorToken: string;
  commercialReleaseRef: string;
};

export type PremiumDistributionConfig = {
  privatePremiumRepo: string;
  premiumReleaseRef: string;
  premiumManifestSha256: string;
  premiumContentSetSha256: string;
};

export type McpOAuthConfig = {
  publicBaseUrl: string;
  resourceUrl: string;
  allowedClientIds: string[];
  allowedRedirectUris: string[];
  accessTokenTtlSeconds: number;
};

export type SupervisorAppConfig = {
  githubSupervisorAppId: string;
  githubSupervisorClientId: string;
  githubSupervisorClientSecret: string;
  publicBaseUrl: string;
  sessionSecret: string;
};

export type SandboxGatewayConfig = {
  driverId: string;
  signingSecret: string;
  requestSkewSeconds: number;
};

export type RemoteSandboxConfig = SandboxGatewayConfig & {
  endpoint: string;
};

export type InternalSupervisorReadTestGrant = {
  githubLogin: string;
  expiresAt: string;
};

export type PaidBillingProvider = "github_marketplace" | "paddle";

export type PaddleConfig = {
  environment: "sandbox" | "production";
  apiKey: string;
  webhookSecret: string;
  clientToken: string;
  checkoutUrl: string;
  webhookToleranceSeconds: number;
};

const INTERNAL_SUPERVISOR_READ_TEST_MAX_TTL_MS = 48 * 60 * 60 * 1000;

function rawValue(name: string): string | null {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : null;
}

function value(name: string): string | null {
  return rawValue(name);
}

function pem(name: string): string | null {
  const raw = value(name);
  return raw ? raw.replace(/\\n/g, "\n") : null;
}

const MARKETPLACE_APP_REQUIRED = [
  "ANPOS_MARKETPLACE_APP_ID",
  "ANPOS_MARKETPLACE_APP_PRIVATE_KEY",
  "ANPOS_MARKETPLACE_CLIENT_ID",
  "ANPOS_MARKETPLACE_CLIENT_SECRET",
  "ANPOS_PUBLIC_BASE_URL",
  "ANPOS_SESSION_SECRET",
] as const;

const COMMUNITY_LAUNCH_REQUIRED = [
  "DATABASE_URL",
  "ANPOS_GITHUB_WEBHOOK_SECRET",
  ...MARKETPLACE_APP_REQUIRED,
  "ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID",
] as const;

const FULL_REQUIRED = [
  "DATABASE_URL",
  "ANPOS_GITHUB_WEBHOOK_SECRET",
  ...MARKETPLACE_APP_REQUIRED,
  "ANPOS_VENDOR_APP_ID",
  "ANPOS_VENDOR_APP_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_KEY_ID",
  "ANPOS_OPERATOR_TOKEN",
  "ANPOS_ORG_SEAT_LIMITS",
  "ANPOS_VENDOR_INSTALLATION_ID",
  "ANPOS_PRIVATE_TEMPLATE_REPO",
  "ANPOS_COMMERCIAL_RELEASE_REF",
] as const;

const PREMIUM_DISTRIBUTION_REQUIRED = [
  "ANPOS_PRIVATE_PREMIUM_REPO",
  "ANPOS_PREMIUM_RELEASE_REF",
  "ANPOS_PREMIUM_MANIFEST_SHA256",
  "ANPOS_PREMIUM_CONTENT_SET_SHA256",
] as const;

function missing(required: readonly string[]): string[] {
  return required.filter((name) => !value(name)).map((name) => `missing:${name}`);
}

export function missingConfig(): string[] {
  return configurationProblems()
    .filter((problem) => problem.startsWith("missing:"))
    .map((problem) => problem.slice("missing:".length));
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
  const webhookSecret = value("ANPOS_GITHUB_WEBHOOK_SECRET");
  if (requiredSet.has("ANPOS_GITHUB_WEBHOOK_SECRET") && webhookSecret && webhookSecret.length < 32) {
    problems.push("weak:ANPOS_GITHUB_WEBHOOK_SECRET");
  }
  const operatorToken = value("ANPOS_OPERATOR_TOKEN");
  if (requiredSet.has("ANPOS_OPERATOR_TOKEN") && operatorToken && operatorToken.length < 32) {
    problems.push("weak:ANPOS_OPERATOR_TOKEN");
  }
  const sessionSecret = value("ANPOS_SESSION_SECRET");
  if (requiredSet.has("ANPOS_SESSION_SECRET") && sessionSecret && sessionSecret.length < 32) {
    problems.push("weak:ANPOS_SESSION_SECRET");
  }
  const marketplaceClientSecret = value("ANPOS_MARKETPLACE_CLIENT_SECRET");
  if (requiredSet.has("ANPOS_MARKETPLACE_CLIENT_SECRET") && marketplaceClientSecret && marketplaceClientSecret.length < 32) {
    problems.push("weak:ANPOS_MARKETPLACE_CLIENT_SECRET");
  }

  const marketplaceAppId = value("ANPOS_MARKETPLACE_APP_ID");
  if (requiredSet.has("ANPOS_MARKETPLACE_APP_ID") && marketplaceAppId && !/^\d+$/.test(marketplaceAppId)) {
    problems.push("invalid:ANPOS_MARKETPLACE_APP_ID");
  }
  const marketplaceClientId = value("ANPOS_MARKETPLACE_CLIENT_ID");
  if (requiredSet.has("ANPOS_MARKETPLACE_CLIENT_ID") && marketplaceClientId && !/^[A-Za-z0-9._-]{10,100}$/.test(marketplaceClientId)) {
    problems.push("invalid:ANPOS_MARKETPLACE_CLIENT_ID");
  }

  const publicBaseUrl = value("ANPOS_PUBLIC_BASE_URL");
  if (requiredSet.has("ANPOS_PUBLIC_BASE_URL") && publicBaseUrl && !validHttpsBaseUrl(publicBaseUrl)) {
    problems.push("invalid:ANPOS_PUBLIC_BASE_URL");
  }

  const communityPlanId = value("ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID");
  if (requiredSet.has("ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID") && communityPlanId && !/^\d+$/.test(communityPlanId)) {
    problems.push("invalid:ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID");
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

  validatePrivateKeyMarker("ANPOS_MARKETPLACE_APP_PRIVATE_KEY", problems);

  if (includeVendorSeparation) {
    const vendorAppId = value("ANPOS_VENDOR_APP_ID");
    if (vendorAppId && !/^\d+$/.test(vendorAppId)) problems.push("invalid:ANPOS_VENDOR_APP_ID");
    if (marketplaceAppId && vendorAppId && marketplaceAppId === vendorAppId) {
      problems.push("unsafe:ANPOS_APP_ROLE_SEPARATION");
    }

    const installationId = value("ANPOS_VENDOR_INSTALLATION_ID");
    if (installationId && !/^\d+$/.test(installationId)) problems.push("invalid:ANPOS_VENDOR_INSTALLATION_ID");
    const repository = value("ANPOS_PRIVATE_TEMPLATE_REPO");
    if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) problems.push("invalid:ANPOS_PRIVATE_TEMPLATE_REPO");
    const releaseRef = value("ANPOS_COMMERCIAL_RELEASE_REF");
    if (releaseRef && !/^[0-9a-f]{40}$/.test(releaseRef)) problems.push("invalid:ANPOS_COMMERCIAL_RELEASE_REF");
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

    validatePrivateKeyMarker("ANPOS_VENDOR_APP_PRIVATE_KEY", problems);
    const marketplaceKey = pem("ANPOS_MARKETPLACE_APP_PRIVATE_KEY");
    const vendorKey = pem("ANPOS_VENDOR_APP_PRIVATE_KEY");
    if (marketplaceKey && vendorKey && marketplaceKey === vendorKey) {
      problems.push("unsafe:ANPOS_APP_PRIVATE_KEY_REUSE");
    }
    validatePrivateKeyMarker("ANPOS_ENTITLEMENT_PRIVATE_KEY", problems);
  }

  return [...new Set(problems)];
}

export function paidBillingProvider(): PaidBillingProvider {
  const raw = rawValue("ANPOS_PAID_BILLING_PROVIDER") ?? "github_marketplace";
  if (raw === "github_marketplace" || raw === "paddle") return raw;
  throw new Error("Invalid ANPOS_PAID_BILLING_PROVIDER");
}

function paddlePriceMapProblem(): string | null {
  const raw = rawValue("ANPOS_PADDLE_PRICE_MAP");
  if (!raw) return "missing:ANPOS_PADDLE_PRICE_MAP";
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return "invalid:ANPOS_PADDLE_PRICE_MAP"; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid:ANPOS_PADDLE_PRICE_MAP";
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (!entries.length) return "invalid:ANPOS_PADDLE_PRICE_MAP";
  for (const [key, priceId] of entries) {
    if (!/^(developer|pro|team|enterprise):(month|year)$/.test(key)) return "invalid:ANPOS_PADDLE_PRICE_MAP";
    if (typeof priceId !== "string" || !/^pri_[a-z\d]{26}$/.test(priceId)) return "invalid:ANPOS_PADDLE_PRICE_MAP";
  }
  return null;
}

export function paddleConfigurationProblems(): string[] {
  const problems: string[] = [];
  for (const name of ["ANPOS_PADDLE_API_KEY", "ANPOS_PADDLE_WEBHOOK_SECRET", "ANPOS_PADDLE_CLIENT_TOKEN", "ANPOS_PADDLE_CHECKOUT_URL"] as const) {
    if (!rawValue(name)) problems.push(`missing:${name}`);
  }
  const environment = rawValue("ANPOS_PADDLE_ENVIRONMENT") ?? "production";
  if (!["sandbox", "production"].includes(environment)) problems.push("invalid:ANPOS_PADDLE_ENVIRONMENT");
  const apiKey = rawValue("ANPOS_PADDLE_API_KEY");
  if (apiKey && apiKey.length < 20) problems.push("weak:ANPOS_PADDLE_API_KEY");
  const webhookSecret = rawValue("ANPOS_PADDLE_WEBHOOK_SECRET");
  if (webhookSecret && webhookSecret.length < 32) problems.push("weak:ANPOS_PADDLE_WEBHOOK_SECRET");
  const clientToken = rawValue("ANPOS_PADDLE_CLIENT_TOKEN");
  if (clientToken) {
    if (environment === "sandbox" && !clientToken.startsWith("test_")) problems.push("invalid:ANPOS_PADDLE_CLIENT_TOKEN");
    if (environment === "production" && !clientToken.startsWith("live_")) problems.push("invalid:ANPOS_PADDLE_CLIENT_TOKEN");
  }
  const priceMapProblem = paddlePriceMapProblem();
  if (priceMapProblem) problems.push(priceMapProblem);
  const checkoutUrl = rawValue("ANPOS_PADDLE_CHECKOUT_URL");
  if (checkoutUrl) {
    try {
      const url = new URL(checkoutUrl);
      const publicUrl = rawValue("ANPOS_PUBLIC_BASE_URL");
      if (
        url.protocol !== "https:"
        || url.username
        || url.password
        || url.search
        || url.hash
        || url.pathname.replace(/\/$/, "") !== "/billing/checkout"
        || (publicUrl && url.origin !== new URL(publicUrl).origin)
      ) problems.push("invalid:ANPOS_PADDLE_CHECKOUT_URL");
    } catch {
      problems.push("invalid:ANPOS_PADDLE_CHECKOUT_URL");
    }
  }
  const tolerance = rawValue("ANPOS_PADDLE_WEBHOOK_TOLERANCE_SECONDS");
  if (tolerance) {
    const parsed = Number(tolerance);
    if (!Number.isSafeInteger(parsed) || parsed < 5 || parsed > 300) {
      problems.push("invalid:ANPOS_PADDLE_WEBHOOK_TOLERANCE_SECONDS");
    }
  }
  return [...new Set(problems)];
}

export function paddleConfig(): PaddleConfig {
  const problems = paddleConfigurationProblems();
  if (problems.length) throw new Error(`Paddle billing is not configured: ${problems.join(", ")}`);
  const environment = (rawValue("ANPOS_PADDLE_ENVIRONMENT") ?? "production") as "sandbox" | "production";
  return {
    environment,
    apiKey: rawValue("ANPOS_PADDLE_API_KEY")!,
    webhookSecret: rawValue("ANPOS_PADDLE_WEBHOOK_SECRET")!,
    clientToken: rawValue("ANPOS_PADDLE_CLIENT_TOKEN")!,
    checkoutUrl: rawValue("ANPOS_PADDLE_CHECKOUT_URL")!,
    webhookToleranceSeconds: Number(rawValue("ANPOS_PADDLE_WEBHOOK_TOLERANCE_SECONDS") ?? "30"),
  };
}

export function internalSupervisorReadTestGrantConfigured(): boolean {
  return Boolean(
    rawValue("ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN")
    || rawValue("ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT"),
  );
}

export function internalSupervisorReadTestConfigurationProblems(now = new Date()): string[] {
  const problems: string[] = [];
  const login = rawValue("ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN");
  const expiresAt = rawValue("ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT");
  if (!login && !expiresAt) return problems;
  if (!login) problems.push("missing:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN");
  else if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) {
    problems.push("invalid:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN");
  }
  if (!expiresAt) problems.push("missing:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT");
  else {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      problems.push("invalid:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT");
    } else if (expiresAtMs <= now.getTime()) {
      problems.push("expired:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT");
    } else if (expiresAtMs - now.getTime() > INTERNAL_SUPERVISOR_READ_TEST_MAX_TTL_MS) {
      problems.push("unsafe:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_TTL_TOO_LONG");
    }
  }
  return [...new Set(problems)];
}

export function internalSupervisorReadTestGrant(now = new Date()): InternalSupervisorReadTestGrant | null {
  if (internalSupervisorReadTestConfigurationProblems(now).length) return null;
  const githubLogin = rawValue("ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN");
  const expiresAt = rawValue("ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT");
  if (!githubLogin || !expiresAt) return null;
  return { githubLogin, expiresAt };
}

export function internalSupervisorReadTestGrantActiveForLogin(login: string, now = new Date()): boolean {
  const grant = internalSupervisorReadTestGrant(now);
  return Boolean(grant && grant.githubLogin.toLowerCase() === login.trim().toLowerCase());
}

function premiumPaidPlanConfigured(): boolean {
  const provider = paidBillingProvider();
  const raw = value(provider === "paddle" ? "ANPOS_PADDLE_PRICE_MAP" : "ANPOS_MARKETPLACE_PLAN_MAP");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (provider === "paddle") {
      return Object.keys(parsed as Record<string, unknown>).some((key) => /^(pro|team|enterprise):(month|year)$/.test(key));
    }
    return Object.values(parsed as Record<string, unknown>).some((planId) => ["pro", "team", "enterprise"].includes(String(planId)));
  } catch {
    return false;
  }
}

export function premiumDistributionConfigurationProblems(): string[] {
  const problems = missing(PREMIUM_DISTRIBUTION_REQUIRED);
  const repository = value("ANPOS_PRIVATE_PREMIUM_REPO");
  if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) problems.push("invalid:ANPOS_PRIVATE_PREMIUM_REPO");
  const templateRepository = value("ANPOS_PRIVATE_TEMPLATE_REPO");
  if (repository && templateRepository && repository === templateRepository) problems.push("unsafe:ANPOS_PREMIUM_REPOSITORY_MUST_BE_DISTINCT");
  const releaseRef = value("ANPOS_PREMIUM_RELEASE_REF");
  if (releaseRef && !/^[0-9a-f]{40}$/.test(releaseRef)) problems.push("invalid:ANPOS_PREMIUM_RELEASE_REF");
  for (const name of ["ANPOS_PREMIUM_MANIFEST_SHA256", "ANPOS_PREMIUM_CONTENT_SET_SHA256"] as const) {
    const digest = value(name);
    if (digest && !/^[0-9a-f]{64}$/.test(digest)) problems.push(`invalid:${name}`);
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
  const problems = commonProblems(FULL_REQUIRED, true);
  try {
    const provider = paidBillingProvider();
    if (provider === "github_marketplace") {
      problems.push(...commonProblems(["ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID", "ANPOS_MARKETPLACE_PLAN_MAP"], false));
    } else {
      problems.push(...paddleConfigurationProblems());
    }
  } catch {
    problems.push("invalid:ANPOS_PAID_BILLING_PROVIDER");
  }
  try {
    if (premiumPaidPlanConfigured()) problems.push(...premiumDistributionConfigurationProblems());
  } catch {
    // The provider-specific validation above already reports the invalid provider/configuration.
  }
  if (internalSupervisorReadTestGrantConfigured()) {
    problems.push(...internalSupervisorReadTestConfigurationProblems());
    problems.push("unsafe:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_ACTIVE");
  }
  return [...new Set(problems)];
}

export function databaseConfig(): { databaseUrl: string } {
  const problems = commonProblems(["DATABASE_URL"], false);
  if (problems.length) throw new Error(`Database is not configured: ${problems.join(", ")}`);
  return { databaseUrl: value("DATABASE_URL")! };
}

export function webhookConfig(): { githubWebhookSecret: string } {
  const problems = commonProblems(["ANPOS_GITHUB_WEBHOOK_SECRET"], false);
  if (problems.length) throw new Error(`Marketplace webhook is not configured: ${problems.join(", ")}`);
  return { githubWebhookSecret: value("ANPOS_GITHUB_WEBHOOK_SECRET")! };
}

export function sandboxGatewayConfigurationProblems(): string[] {
  const problems: string[] = [];
  const driverId = rawValue("ANPOS_SANDBOX_DRIVER_ID");
  const signingSecret = rawValue("ANPOS_SANDBOX_SIGNING_SECRET");
  const skew = rawValue("ANPOS_SANDBOX_REQUEST_SKEW_SECONDS");

  if (!driverId) problems.push("missing:ANPOS_SANDBOX_DRIVER_ID");
  else if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,100}$/.test(driverId)) {
    problems.push("invalid:ANPOS_SANDBOX_DRIVER_ID");
  }

  if (!signingSecret) problems.push("missing:ANPOS_SANDBOX_SIGNING_SECRET");
  else if (signingSecret.length < 32) problems.push("weak:ANPOS_SANDBOX_SIGNING_SECRET");

  if (skew) {
    const parsed = Number(skew);
    if (!Number.isSafeInteger(parsed) || parsed < 30 || parsed > 300) {
      problems.push("invalid:ANPOS_SANDBOX_REQUEST_SKEW_SECONDS");
    }
  }
  return [...new Set(problems)];
}

export function sandboxGatewayConfig(): SandboxGatewayConfig {
  const problems = sandboxGatewayConfigurationProblems();
  if (problems.length) throw new Error(`Sandbox gateway is not configured: ${problems.join(", ")}`);
  return {
    driverId: rawValue("ANPOS_SANDBOX_DRIVER_ID")!,
    signingSecret: rawValue("ANPOS_SANDBOX_SIGNING_SECRET")!,
    requestSkewSeconds: Number(rawValue("ANPOS_SANDBOX_REQUEST_SKEW_SECONDS") ?? "120"),
  };
}

export function remoteSandboxConfigurationProblems(): string[] {
  const problems = [...sandboxGatewayConfigurationProblems()];
  const endpoint = rawValue("ANPOS_SANDBOX_ENDPOINT");

  if (!endpoint) problems.push("missing:ANPOS_SANDBOX_ENDPOINT");
  else {
    try {
      const url = new URL(endpoint);
      if (
        url.protocol !== "https:"
        || url.username
        || url.password
        || url.search
        || url.hash
        || url.pathname.replace(/\/$/, "") !== "/v1/execute"
      ) problems.push("invalid:ANPOS_SANDBOX_ENDPOINT");
    } catch {
      problems.push("invalid:ANPOS_SANDBOX_ENDPOINT");
    }
  }
  return [...new Set(problems)];
}

export function remoteSandboxConfig(): RemoteSandboxConfig {
  const problems = remoteSandboxConfigurationProblems();
  if (problems.length) throw new Error(`Remote sandbox is not configured: ${problems.join(", ")}`);
  return {
    endpoint: rawValue("ANPOS_SANDBOX_ENDPOINT")!,
    driverId: rawValue("ANPOS_SANDBOX_DRIVER_ID")!,
    signingSecret: rawValue("ANPOS_SANDBOX_SIGNING_SECRET")!,
    requestSkewSeconds: Number(rawValue("ANPOS_SANDBOX_REQUEST_SKEW_SECONDS") ?? "120"),
  };
}

export function supervisorAppConfigurationProblems(): string[] {
  const problems = commonProblems(["ANPOS_PUBLIC_BASE_URL", "ANPOS_SESSION_SECRET"], false);
  const appId = value("ANPOS_GITHUB_SUPERVISOR_APP_ID");
  const clientId = value("ANPOS_GITHUB_SUPERVISOR_CLIENT_ID");
  const clientSecret = value("ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET");
  if (!appId) problems.push("missing:ANPOS_GITHUB_SUPERVISOR_APP_ID");
  else if (!/^\d+$/.test(appId)) problems.push("invalid:ANPOS_GITHUB_SUPERVISOR_APP_ID");
  if (!clientId) problems.push("missing:ANPOS_GITHUB_SUPERVISOR_CLIENT_ID");
  else if (!/^[A-Za-z0-9._-]{10,100}$/.test(clientId)) problems.push("invalid:ANPOS_GITHUB_SUPERVISOR_CLIENT_ID");
  if (!clientSecret) problems.push("missing:ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET");
  else if (clientSecret.length < 32) problems.push("weak:ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET");

  const marketplaceAppId = value("ANPOS_MARKETPLACE_APP_ID");
  const vendorAppId = value("ANPOS_VENDOR_APP_ID");
  if (appId && marketplaceAppId && appId === marketplaceAppId) problems.push("unsafe:ANPOS_SUPERVISOR_MARKETPLACE_APP_COLLISION");
  if (appId && vendorAppId && appId === vendorAppId) problems.push("unsafe:ANPOS_SUPERVISOR_VENDOR_APP_COLLISION");
  const marketplaceClientId = value("ANPOS_MARKETPLACE_CLIENT_ID");
  if (clientId && marketplaceClientId && clientId === marketplaceClientId) problems.push("unsafe:ANPOS_SUPERVISOR_MARKETPLACE_CLIENT_COLLISION");
  const marketplaceClientSecret = value("ANPOS_MARKETPLACE_CLIENT_SECRET");
  if (clientSecret && marketplaceClientSecret && clientSecret === marketplaceClientSecret) {
    problems.push("unsafe:ANPOS_SUPERVISOR_MARKETPLACE_SECRET_REUSE");
  }
  return [...new Set(problems)];
}

export function supervisorAppConfig(): SupervisorAppConfig {
  const problems = supervisorAppConfigurationProblems();
  if (problems.length) throw new Error(`Supervisor App is not configured: ${problems.join(", ")}`);
  return {
    githubSupervisorAppId: value("ANPOS_GITHUB_SUPERVISOR_APP_ID")!,
    githubSupervisorClientId: value("ANPOS_GITHUB_SUPERVISOR_CLIENT_ID")!,
    githubSupervisorClientSecret: value("ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET")!,
    publicBaseUrl: value("ANPOS_PUBLIC_BASE_URL")!.replace(/\/$/, ""),
    sessionSecret: value("ANPOS_SESSION_SECRET")!,
  };
}

export function marketplaceAppConfig(): MarketplaceAppConfig {
  const problems = marketplaceAppConfigurationProblems();
  if (problems.length) {
    throw new Error(`Marketplace App is not configured: ${problems.join(", ")}`);
  }
  return {
    githubMarketplaceAppId: value("ANPOS_MARKETPLACE_APP_ID")!,
    githubMarketplaceAppPrivateKeyPem: pem("ANPOS_MARKETPLACE_APP_PRIVATE_KEY")!,
    githubMarketplaceClientId: value("ANPOS_MARKETPLACE_CLIENT_ID")!,
    githubMarketplaceClientSecret: value("ANPOS_MARKETPLACE_CLIENT_SECRET")!,
    publicBaseUrl: value("ANPOS_PUBLIC_BASE_URL")!.replace(/\/$/, ""),
    sessionSecret: value("ANPOS_SESSION_SECRET")!,
  };
}

export function serviceConfig(): ServiceConfig {
  const problems = commonProblems(FULL_REQUIRED, true);
  if (problems.length) {
    throw new Error(`Commercial service is not configured: ${problems.join(", ")}`);
  }
  return {
    ...marketplaceAppConfig(),
    databaseUrl: value("DATABASE_URL")!,
    githubWebhookSecret: value("ANPOS_GITHUB_WEBHOOK_SECRET")!,
    githubVendorAppId: value("ANPOS_VENDOR_APP_ID")!,
    githubVendorAppPrivateKeyPem: pem("ANPOS_VENDOR_APP_PRIVATE_KEY")!,
    githubVendorInstallationId: value("ANPOS_VENDOR_INSTALLATION_ID")!,
    privateTemplateRepo: value("ANPOS_PRIVATE_TEMPLATE_REPO")!,
    entitlementPrivateKeyPem: pem("ANPOS_ENTITLEMENT_PRIVATE_KEY")!,
    entitlementKeyId: value("ANPOS_ENTITLEMENT_KEY_ID")!,
    entitlementIssuer: value("ANPOS_ENTITLEMENT_ISSUER") ?? "https://license.anpos.dev",
    operatorToken: value("ANPOS_OPERATOR_TOKEN")!,
    commercialReleaseRef: value("ANPOS_COMMERCIAL_RELEASE_REF")!,
  };
}

function httpsAllowlist(name: string): string[] {
  const raw = rawValue(name);
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

export function mcpOAuthConfigurationProblems(): string[] {
  const problems: string[] = [];
  const base = rawValue("ANPOS_PUBLIC_BASE_URL");
  if (!base) problems.push("missing:ANPOS_PUBLIC_BASE_URL");
  else if (!validHttpsBaseUrl(base)) problems.push("invalid:ANPOS_PUBLIC_BASE_URL");

  for (const name of ["ANPOS_MCP_ALLOWED_CLIENT_IDS", "ANPOS_MCP_ALLOWED_REDIRECT_URIS"] as const) {
    const values = httpsAllowlist(name);
    if (!values.length) {
      problems.push(`missing:${name}`);
      continue;
    }
    for (const item of values) {
      try {
        const url = new URL(item);
        if (url.protocol !== "https:" || url.username || url.password || url.hash) problems.push(`invalid:${name}`);
      } catch {
        problems.push(`invalid:${name}`);
      }
    }
  }

  const ttl = rawValue("ANPOS_MCP_ACCESS_TOKEN_TTL_SECONDS");
  if (ttl) {
    const parsed = Number(ttl);
    if (!Number.isSafeInteger(parsed) || parsed < 900 || parsed > 28_800) {
      problems.push("invalid:ANPOS_MCP_ACCESS_TOKEN_TTL_SECONDS");
    }
  }
  return [...new Set(problems)];
}

export function mcpOAuthConfig(): McpOAuthConfig {
  const problems = mcpOAuthConfigurationProblems();
  if (problems.length) throw new Error(`MCP OAuth is not configured: ${problems.join(", ")}`);
  const publicBaseUrl = rawValue("ANPOS_PUBLIC_BASE_URL")!.replace(/\/$/, "");
  return {
    publicBaseUrl,
    resourceUrl: `${publicBaseUrl}/mcp`,
    allowedClientIds: httpsAllowlist("ANPOS_MCP_ALLOWED_CLIENT_IDS"),
    allowedRedirectUris: httpsAllowlist("ANPOS_MCP_ALLOWED_REDIRECT_URIS"),
    accessTokenTtlSeconds: Number(rawValue("ANPOS_MCP_ACCESS_TOKEN_TTL_SECONDS") ?? "3600"),
  };
}

export function premiumDistributionConfig(): PremiumDistributionConfig {
  const problems = premiumDistributionConfigurationProblems();
  if (problems.length) throw new Error(`Premium distribution is not configured: ${problems.join(", ")}`);
  return {
    privatePremiumRepo: value("ANPOS_PRIVATE_PREMIUM_REPO")!,
    premiumReleaseRef: value("ANPOS_PREMIUM_RELEASE_REF")!,
    premiumManifestSha256: value("ANPOS_PREMIUM_MANIFEST_SHA256")!,
    premiumContentSetSha256: value("ANPOS_PREMIUM_CONTENT_SET_SHA256")!,
  };
}
