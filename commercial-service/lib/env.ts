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

export function missingConfig(): string[] {
  const required = [
    "DATABASE_URL",
    "GITHUB_WEBHOOK_SECRET",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "ANPOS_ENTITLEMENT_PRIVATE_KEY",
    "ANPOS_ENTITLEMENT_KEY_ID",
    "ANPOS_OPERATOR_TOKEN",
  ];
  return required.filter((name) => !value(name));
}

export function serviceConfig(): ServiceConfig {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(`Commercial service is not configured: ${missing.join(", ")}`);
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
