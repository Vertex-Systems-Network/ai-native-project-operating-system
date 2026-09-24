import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePluginCapability,
  type PluginEntitlementSnapshot,
} from "../lib/plugin-entitlements";

const USER = { id: 42, login: "octo" };

function snapshot(overrides: Partial<PluginEntitlementSnapshot> = {}): PluginEntitlementSnapshot {
  return {
    state: "active",
    github_account_id: 42,
    github_account_type: "User",
    github_login: "octo",
    plan_id: "community",
    entitlements: [],
    ...overrides,
  };
}

test("Community stays limited to bounded readiness capability", () => {
  const current = snapshot();
  assert.equal(
    evaluatePluginCapability(current, USER, "community_repository_readiness_audit").allowed,
    true,
  );
  const supervisor = evaluatePluginCapability(current, USER, "repository_supervisor_read");
  assert.equal(supervisor.allowed, false);
  assert.equal(supervisor.reason, "capability_not_entitled");
});

test("Developer entitlement authorizes Repository Supervisor read and guarded write capabilities", () => {
  const current = snapshot({
    plan_id: "developer",
    entitlements: ["private_template_access", "protocol_update_channel"],
  });
  const read = evaluatePluginCapability(current, USER, "repository_supervisor_read");
  assert.equal(read.allowed, true);
  assert.equal(read.reason, "allowed");

  const write = evaluatePluginCapability(current, USER, "repository_supervisor_write");
  assert.equal(write.allowed, true);
  assert.equal(write.reason, "allowed");
});

test("Plugin capability evaluation fails closed on principal mismatch and inactive billing", () => {
  const paid = snapshot({
    plan_id: "developer",
    entitlements: ["private_template_access", "protocol_update_channel"],
  });
  assert.equal(
    evaluatePluginCapability(paid, { id: 99, login: "other" }, "repository_supervisor_read").reason,
    "principal_account_mismatch",
  );
  assert.equal(
    evaluatePluginCapability({ ...paid, state: "cancelled" }, USER, "repository_supervisor_read").reason,
    "entitlement_not_active",
  );
});

test("Organization paid capability requires an active assigned seat while Community audit does not", () => {
  const organization = snapshot({
    github_account_id: 9001,
    github_account_type: "Organization",
    github_login: "example-org",
    plan_id: "developer",
    entitlements: ["private_template_access", "protocol_update_channel"],
  });

  const audit = evaluatePluginCapability(
    organization,
    USER,
    "community_repository_readiness_audit",
    false,
  );
  assert.equal(audit.allowed, true);

  const noSeat = evaluatePluginCapability(organization, USER, "repository_supervisor_read", false);
  assert.equal(noSeat.allowed, false);
  assert.equal(noSeat.reason, "organization_seat_required");

  const withSeat = evaluatePluginCapability(organization, USER, "repository_supervisor_read", true);
  assert.equal(withSeat.allowed, true);
});
