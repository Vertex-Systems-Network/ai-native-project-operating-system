import assert from "node:assert/strict";
import test from "node:test";
import {
  communityLaunchConfigurationProblems,
  configurationProblems,
  marketplaceAppConfig,
} from "../lib/env";
import {
  communityMarketplacePlanId,
  marketplacePlanMap,
  resolveMarketplacePlan,
} from "../lib/plans";

const MANAGED_ENV = [
  "DATABASE_URL", "ANPOS_GITHUB_WEBHOOK_SECRET",
  "ANPOS_MARKETPLACE_APP_ID", "ANPOS_MARKETPLACE_APP_PRIVATE_KEY",
  "ANPOS_MARKETPLACE_CLIENT_ID", "ANPOS_MARKETPLACE_CLIENT_SECRET",
  "ANPOS_PUBLIC_BASE_URL", "ANPOS_SESSION_SECRET", "ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID",
  "ANPOS_MARKETPLACE_PLAN_MAP", "ANPOS_ORG_SEAT_LIMITS",
  "ANPOS_VENDOR_APP_ID", "ANPOS_VENDOR_APP_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_PRIVATE_KEY", "ANPOS_ENTITLEMENT_KEY_ID", "ANPOS_OPERATOR_TOKEN",
  "ANPOS_VENDOR_INSTALLATION_ID", "ANPOS_PRIVATE_TEMPLATE_REPO",
] as const;

function clearManagedEnv() {
  for (const key of MANAGED_ENV) delete process.env[key];
}

function configureCommunityOnly() {
  process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/anpos";
  process.env.ANPOS_GITHUB_WEBHOOK_SECRET = "w".repeat(48);
  process.env.ANPOS_MARKETPLACE_APP_ID = "123456";
  process.env.ANPOS_MARKETPLACE_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\ncommunity-placeholder\n-----END RSA PRIVATE KEY-----";
  process.env.ANPOS_MARKETPLACE_CLIENT_ID = "Iv1.community-client-123456";
  process.env.ANPOS_MARKETPLACE_CLIENT_SECRET = "c".repeat(48);
  process.env.ANPOS_PUBLIC_BASE_URL = "https://community.example.test";
  process.env.ANPOS_SESSION_SECRET = "s".repeat(48);
  process.env.ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID = "9000";
}

test("Community launch config is independent from paid and vendor secrets", () => {
  clearManagedEnv();
  configureCommunityOnly();

  assert.deepEqual(communityLaunchConfigurationProblems(), []);
  assert.equal(marketplaceAppConfig().publicBaseUrl, "https://community.example.test");

  const fullProblems = configurationProblems();
  assert.ok(fullProblems.includes("missing:ANPOS_MARKETPLACE_PLAN_MAP"));
  assert.ok(fullProblems.includes("missing:ANPOS_ENTITLEMENT_PRIVATE_KEY"));
  assert.ok(fullProblems.includes("missing:ANPOS_ORG_SEAT_LIMITS"));
});


test("Developer-only paid launch does not require Vendor Distribution App configuration", () => {
  clearManagedEnv();
  configureCommunityOnly();
  process.env.ANPOS_MARKETPLACE_PLAN_MAP = JSON.stringify({ "9001": "developer" });
  process.env.ANPOS_ENTITLEMENT_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nembedded-release-test\n-----END PRIVATE KEY-----";
  process.env.ANPOS_ENTITLEMENT_KEY_ID = "developer-key";
  process.env.ANPOS_OPERATOR_TOKEN = "o".repeat(48);
  process.env.ANPOS_ORG_SEAT_LIMITS = JSON.stringify({ developer: 1 });

  const problems = configurationProblems();
  assert.equal(problems.includes("missing:ANPOS_VENDOR_APP_ID"), false);
  assert.equal(problems.includes("missing:ANPOS_VENDOR_APP_PRIVATE_KEY"), false);
  assert.equal(problems.includes("missing:ANPOS_VENDOR_INSTALLATION_ID"), false);
  assert.equal(problems.includes("missing:ANPOS_PRIVATE_TEMPLATE_REPO"), false);
  assert.equal(problems.includes("missing:ANPOS_COMMERCIAL_RELEASE_REF"), false);
});

test("Community Marketplace identity stays outside paid plan mapping", () => {
  clearManagedEnv();
  configureCommunityOnly();
  process.env.ANPOS_MARKETPLACE_PLAN_MAP = JSON.stringify({
    "9001": "developer",
    "9002": "pro",
    "9003": "team",
    "9004": "enterprise",
  });

  assert.equal(communityMarketplacePlanId(), 9000);
  assert.deepEqual(resolveMarketplacePlan(9000), { planId: "community", features: [], paid: false });
  assert.equal(resolveMarketplacePlan(9001).planId, "developer");
  assert.equal(resolveMarketplacePlan(9001).paid, true);

  process.env.ANPOS_MARKETPLACE_PLAN_MAP = JSON.stringify({ "9000": "developer" });
  assert.throws(() => marketplacePlanMap(), /Invalid ANPOS_MARKETPLACE_PLAN_MAP/);

  process.env.ANPOS_MARKETPLACE_PLAN_MAP = JSON.stringify({ "9001": "community" });
  assert.throws(() => marketplacePlanMap(), /Invalid ANPOS_MARKETPLACE_PLAN_MAP/);
});

test("Community Marketplace plan identity fails closed when malformed", () => {
  clearManagedEnv();
  configureCommunityOnly();
  process.env.ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID = "not-a-plan";

  assert.ok(communityLaunchConfigurationProblems().includes("invalid:ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID"));
  assert.throws(() => communityMarketplacePlanId(), /not configured|Invalid/);
});
