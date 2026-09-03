import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { signEntitlement } from "../lib/crypto";
import { configurationProblems } from "../lib/env";
import { idempotencyKeyFrom, readJsonBody, requestIdFrom, RequestInputError } from "../lib/http";
import { marketplacePlanMap, organizationSeatCapacity } from "../lib/plans";

const entitlementKeys = generateKeyPairSync("ed25519");
const entitlementPrivateKey = entitlementKeys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

const MANAGED_ENV = [
  "DATABASE_URL", "GITHUB_WEBHOOK_SECRET", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY",
  "ANPOS_ENTITLEMENT_PRIVATE_KEY", "ANPOS_ENTITLEMENT_KEY_ID", "ANPOS_ENTITLEMENT_ISSUER",
  "ANPOS_OPERATOR_TOKEN", "ANPOS_MARKETPLACE_PLAN_MAP", "ANPOS_ORG_SEAT_LIMITS",
  "GITHUB_VENDOR_INSTALLATION_ID", "ANPOS_PRIVATE_TEMPLATE_REPO",
] as const;

function configure() {
  process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/anpos";
  process.env.GITHUB_WEBHOOK_SECRET = "w".repeat(48);
  process.env.GITHUB_APP_ID = "123456";
  process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nplaceholder\n-----END RSA PRIVATE KEY-----";
  process.env.ANPOS_ENTITLEMENT_PRIVATE_KEY = entitlementPrivateKey;
  process.env.ANPOS_ENTITLEMENT_KEY_ID = "test-key-1";
  process.env.ANPOS_ENTITLEMENT_ISSUER = "https://license.example.test";
  process.env.ANPOS_OPERATOR_TOKEN = "o".repeat(48);
  process.env.ANPOS_MARKETPLACE_PLAN_MAP = JSON.stringify({ "1001": "developer", "1002": "pro", "1003": "team", "1004": "enterprise" });
  process.env.ANPOS_ORG_SEAT_LIMITS = JSON.stringify({ developer: 1, pro: 2, team: 10, enterprise: 100 });
  process.env.GITHUB_VENDOR_INSTALLATION_ID = "12345678";
  process.env.ANPOS_PRIVATE_TEMPLATE_REPO = "Vertex-Systems-Network/anpos-commercial-template";
}

function clearManagedEnv() {
  for (const key of MANAGED_ENV) delete process.env[key];
}

test("plan mapping and organization capacities fail closed", () => {
  clearManagedEnv();
  configure();
  assert.equal(marketplacePlanMap()["1003"], "team");
  assert.equal(organizationSeatCapacity("team", null), 10);
  assert.equal(organizationSeatCapacity("team", 27), 27);

  process.env.ANPOS_MARKETPLACE_PLAN_MAP = JSON.stringify({ "1003": "unknown-plan" });
  assert.throws(() => marketplacePlanMap(), /Invalid ANPOS_MARKETPLACE_PLAN_MAP/);
  process.env.ANPOS_ORG_SEAT_LIMITS = JSON.stringify({ team: 0 });
  assert.throws(() => organizationSeatCapacity("team", null), /ORGANIZATION_SEAT_CAPACITY_NOT_CONFIGURED/);
});

test("user entitlement is v1 and organization seat entitlement is principal-bound v2", () => {
  clearManagedEnv();
  configure();
  const common = {
    issuer: "https://license.example.test",
    license_id: "11111111-1111-4111-8111-111111111111",
    plan_id: "pro",
    seats: 1,
    entitlements: ["private_template_access"],
    issued_at: "2026-09-03T00:00:00.000Z",
    not_before: "2026-09-03T00:00:00.000Z",
    expires_at: "2026-09-04T00:00:00.000Z",
  };
  const personal = signEntitlement({
    ...common,
    subject: { github_account_id: 101, github_account_type: "User", github_login: "alice" },
  });
  assert.equal(personal.format_version, 1);
  assert.equal("principal" in personal, false);
  assert.ok(personal.signature.length > 40);

  const organization = signEntitlement({
    ...common,
    subject: { github_account_id: 202, github_account_type: "Organization", github_login: "acme" },
    principal: { github_user_id: 303, github_login: "bob" },
  });
  assert.equal(organization.format_version, 2);
  assert.deepEqual(organization.principal, { github_user_id: 303, github_login: "bob" });
  assert.ok(organization.signature.length > 40);
});

test("configuration rejects weak or missing production controls", () => {
  clearManagedEnv();
  configure();
  assert.deepEqual(configurationProblems(), []);
  process.env.GITHUB_WEBHOOK_SECRET = "short";
  process.env.ANPOS_OPERATOR_TOKEN = "tiny";
  const problems = configurationProblems();
  assert.ok(problems.includes("weak:GITHUB_WEBHOOK_SECRET"));
  assert.ok(problems.includes("weak:ANPOS_OPERATOR_TOKEN"));
  delete process.env.ANPOS_ORG_SEAT_LIMITS;
  assert.ok(configurationProblems().includes("missing:ANPOS_ORG_SEAT_LIMITS"));
});

test("request parser bounds bodies and sanitizes caller-controlled identifiers", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "not valid spaces", "idempotency-key": "safe-key_123" },
    body: JSON.stringify({ value: 7 }),
  });
  assert.deepEqual(await readJsonBody<{ value: number }>(request, 1024), { value: 7 });
  assert.match(requestIdFrom(request), /^[0-9a-f-]{36}$/i);
  assert.equal(idempotencyKeyFrom(request), "safe-key_123");

  const oversized = new Request("https://example.test/api", { method: "POST", body: "x".repeat(2048) });
  await assert.rejects(() => readJsonBody(oversized, 128), (error: unknown) => {
    return error instanceof RequestInputError && error.status === 413 && error.code === "request_body_too_large";
  });
});
