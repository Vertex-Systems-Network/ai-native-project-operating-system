import { requireActiveSeat } from "./seats";

export const PLUGIN_CAPABILITIES = {
  community_repository_readiness_audit: {
    implemented: true,
    paid: false,
    requires_entitlements: [],
    organization_seat_required: false,
  },
  repository_supervisor_read: {
    implemented: true,
    paid: true,
    requires_entitlements: ["protocol_update_channel"],
    organization_seat_required: true,
  },
  repository_supervisor_write: {
    implemented: false,
    paid: true,
    requires_entitlements: ["private_template_access", "protocol_update_channel"],
    organization_seat_required: true,
  },
} as const;

export type PluginCapability = keyof typeof PLUGIN_CAPABILITIES;

export type PluginEntitlementSnapshot = {
  state: string;
  github_account_id: number;
  github_account_type: "User" | "Organization" | null;
  github_login: string | null;
  plan_id: string | null;
  entitlements: string[];
};

export type PluginPrincipal = {
  id: number;
  login: string;
};

export type PluginCapabilityDecision = {
  capability: PluginCapability;
  allowed: boolean;
  paid: boolean;
  implemented: boolean;
  required_entitlements: string[];
  reason:
    | "allowed"
    | "entitlement_not_active"
    | "principal_account_mismatch"
    | "account_identity_unavailable"
    | "capability_not_entitled"
    | "organization_seat_required"
    | "capability_not_implemented";
};

const ACTIVE_STATES = new Set(["active", "trial", "grace"]);

function normalizedFeatures(snapshot: PluginEntitlementSnapshot): Set<string> {
  return new Set(Array.isArray(snapshot.entitlements) ? snapshot.entitlements.map(String) : []);
}

export function evaluatePluginCapability(
  snapshot: PluginEntitlementSnapshot,
  principal: PluginPrincipal,
  capability: PluginCapability,
  organizationSeatActive = false,
): PluginCapabilityDecision {
  const definition = PLUGIN_CAPABILITIES[capability];
  const base = {
    capability,
    paid: definition.paid,
    implemented: definition.implemented,
    required_entitlements: [...definition.requires_entitlements],
  };

  if (!ACTIVE_STATES.has(String(snapshot.state))) {
    return { ...base, allowed: false, reason: "entitlement_not_active" };
  }
  if (snapshot.github_account_type === "User" && snapshot.github_account_id !== principal.id) {
    return { ...base, allowed: false, reason: "principal_account_mismatch" };
  }
  if (snapshot.github_account_type !== "User" && snapshot.github_account_type !== "Organization") {
    return { ...base, allowed: false, reason: "account_identity_unavailable" };
  }

  const features = normalizedFeatures(snapshot);
  if (definition.requires_entitlements.some((feature) => !features.has(feature))) {
    return { ...base, allowed: false, reason: "capability_not_entitled" };
  }
  if (
    definition.organization_seat_required &&
    snapshot.github_account_type === "Organization" &&
    !organizationSeatActive
  ) {
    return { ...base, allowed: false, reason: "organization_seat_required" };
  }
  if (!definition.implemented) {
    return { ...base, allowed: false, reason: "capability_not_implemented" };
  }
  return { ...base, allowed: true, reason: "allowed" };
}

export async function buildPluginCapabilityMatrix(
  snapshot: PluginEntitlementSnapshot,
  principal: PluginPrincipal,
): Promise<Record<PluginCapability, PluginCapabilityDecision>> {
  let organizationSeatActive = false;
  if (snapshot.github_account_type === "Organization" && ACTIVE_STATES.has(String(snapshot.state))) {
    try {
      await requireActiveSeat(snapshot.github_account_id, principal.id);
      organizationSeatActive = true;
    } catch {
      organizationSeatActive = false;
    }
  }

  const entries = (Object.keys(PLUGIN_CAPABILITIES) as PluginCapability[]).map((capability) => [
    capability,
    evaluatePluginCapability(snapshot, principal, capability, organizationSeatActive),
  ]);
  return Object.fromEntries(entries) as Record<PluginCapability, PluginCapabilityDecision>;
}

export async function requirePluginCapability(
  snapshot: PluginEntitlementSnapshot,
  principal: PluginPrincipal,
  capability: PluginCapability,
): Promise<PluginCapabilityDecision> {
  const matrix = await buildPluginCapabilityMatrix(snapshot, principal);
  const decision = matrix[capability];
  if (!decision.allowed) throw new Error(`PLUGIN_CAPABILITY_DENIED:${decision.reason}`);
  return decision;
}
