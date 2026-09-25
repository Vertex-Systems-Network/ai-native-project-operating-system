#!/usr/bin/env python3
"""Static safety checks for the vendor-only ANPOS commercial backend."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "commercial-service"
ERRORS: list[str] = []

REQUIRED = [
    "package.json", "tsconfig.json", "next.config.ts", ".env.example", "README.md",
    "lib/env.ts", "lib/db.ts", "lib/crypto.ts", "lib/github.ts", "lib/auth.ts", "lib/session.ts", "lib/entitlements.ts",
    "lib/http.ts", "lib/rate-limit.ts", "lib/plans.ts", "lib/seats.ts", "lib/template-access.ts", "lib/repository-audit.ts", "lib/repository-supervisor-runtime.ts", "lib/repository-supervisor-write.ts", "lib/repository-supervisor-planner.ts", "lib/repository-supervisor-full-apply.ts", "lib/full-plan-sandbox-runner.ts", "lib/plugin-entitlements.ts", "lib/mcp-auth.ts", "lib/mcp-runtime.ts", "lib/execution-sandbox.ts", "lib/remote-sandbox-driver.ts", "lib/sandbox-live-probe.ts", "lib/releases.ts",
    "migrations/001_baseline.sql", "migrations/002_mcp_oauth.sql", "migrations/003_repository_supervisor_write.sql", "migrations/004_repository_supervisor_planner.sql", "migrations/005_repository_supervisor_full_apply.sql", "migrations/006_guarded_empty_repository_initialization.sql", "scripts/migrate.ts", "scripts/guarded-build-migrate.ts", "scripts/verify-repository-supervisor-e2e.ts", "tests/security.test.ts", "tests/repository-audit.test.ts", "tests/repository-supervisor-runtime.test.ts", "tests/repository-supervisor-write.test.ts", "tests/repository-supervisor-planner.test.ts", "tests/repository-supervisor-full-apply.test.ts", "tests/plugin-entitlements.test.ts", "tests/mcp-auth.test.ts", "tests/mcp-runtime.test.ts", "tests/execution-sandbox.test.ts", "tests/remote-sandbox-driver.test.ts", "tests/sandbox-live-probe.test.ts",
    "tests/community-launch.test.ts", "tests/release-channel.test.ts",
    "app/api/health/route.ts", "app/api/ready/route.ts", "app/api/ready/community/route.ts", "app/api/ready/mcp/route.ts", "app/api/ready/sandbox/route.ts", "app/api/ready/sandbox/live/route.ts",
    "app/api/webhooks/github/marketplace/route.ts", "app/api/v1/plugin/entitlements/current/route.ts", "app/mcp/route.ts",
    "app/.well-known/oauth-protected-resource/route.ts", "app/.well-known/oauth-authorization-server/route.ts",
    "app/oauth/authorize/route.ts", "app/oauth/token/route.ts", "app/api/auth/mcp/github/callback/route.ts",
    "app/api/auth/github/callback/route.ts", "app/setup/github/route.ts", "app/community/page.tsx", "app/community/CommunityClient.tsx",
    "app/api/v1/keys/route.ts", "app/api/v1/entitlements/current/route.ts", "app/api/v1/reconcile/route.ts",
    "app/api/v1/provision/route.ts", "app/api/v1/seats/route.ts", "app/api/v1/template/archive/route.ts", "app/api/v1/releases/current/route.ts",
    "app/api/v1/access/reconcile/route.ts", "app/api/v1/audit/repository/route.ts", "app/api/v1/audit/repositories/route.ts",
]


def fail(message: str) -> None:
    ERRORS.append(message)


def text(relative: str) -> str:
    path = SERVICE / relative
    if not path.is_file():
        fail(f"missing commercial service file: commercial-service/{relative}")
        return ""
    return path.read_text(encoding="utf-8")


def require_markers(relative: str, markers: tuple[str, ...], label: str) -> None:
    source = text(relative)
    for marker in markers:
        if marker not in source:
            fail(f"{label} missing marker: {marker}")


def main() -> int:
    for relative in REQUIRED:
        text(relative)

    package = json.loads(text("package.json") or "{}")
    if package.get("private") is not True:
        fail("commercial-service/package.json must remain private:true")
    for script in ("prebuild", "build", "typecheck", "test:unit", "migrate", "certify", "verify:e2e"):
        if script not in (package.get("scripts") or {}):
            fail(f"commercial service missing npm script: {script}")
    if (package.get("scripts") or {}).get("prebuild") != "tsx scripts/guarded-build-migrate.ts":
        fail("commercial service prebuild must remain the guarded build migration hook")
    if package.get("devDependencies", {}).get("tsx") != "4.23.13":
        fail("commercial service test/migration TypeScript runner must remain explicitly pinned")
    if package.get("dependencies", {}).get("@vercel/oidc") != "3.2.0":
        fail("commercial service must pin @vercel/oidc 3.2.0 for protected same-origin sandbox calls")

    env_example = text(".env.example")
    for name in (
        "DATABASE_URL", "ANPOS_GITHUB_WEBHOOK_SECRET",
        "ANPOS_MARKETPLACE_APP_ID", "ANPOS_MARKETPLACE_APP_PRIVATE_KEY",
        "ANPOS_MARKETPLACE_CLIENT_ID", "ANPOS_MARKETPLACE_CLIENT_SECRET",
        "ANPOS_GITHUB_SUPERVISOR_APP_ID", "ANPOS_GITHUB_SUPERVISOR_CLIENT_ID", "ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET",
        "ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID",
        "ANPOS_VENDOR_APP_ID", "ANPOS_VENDOR_APP_PRIVATE_KEY",
        "ANPOS_MARKETPLACE_PLAN_MAP", "ANPOS_ORG_SEAT_LIMITS", "ANPOS_ENTITLEMENT_PRIVATE_KEY",
        "ANPOS_ENTITLEMENT_KEY_ID", "ANPOS_OPERATOR_TOKEN", "ANPOS_VENDOR_INSTALLATION_ID",
        "ANPOS_PRIVATE_TEMPLATE_REPO", "ANPOS_COMMERCIAL_RELEASE_REF", "ANPOS_COLLABORATOR_PROVISIONING_ENABLED", "ANPOS_MAX_WEBHOOK_BYTES",
        "ANPOS_PUBLIC_BASE_URL", "ANPOS_SESSION_SECRET",
        "ANPOS_MCP_ALLOWED_CLIENT_IDS", "ANPOS_MCP_ALLOWED_REDIRECT_URIS", "ANPOS_MCP_ACCESS_TOKEN_TTL_SECONDS",
        "ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN", "ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT",
        "ANPOS_SANDBOX_ENDPOINT", "ANPOS_SANDBOX_DRIVER_ID", "ANPOS_SANDBOX_SIGNING_SECRET", "ANPOS_SANDBOX_REQUEST_SKEW_SECONDS",
    ):
        if name not in env_example:
            fail(f"commercial service environment contract missing {name}")
    if "GITHUB_APP_ID=" in env_example or "GITHUB_APP_PRIVATE_KEY=" in env_example:
        fail("commercial service environment contract must not advertise legacy single-App credentials")
    if "ANPOS_COLLABORATOR_PROVISIONING_ENABLED=false" not in env_example:
        fail("collaborator provisioning must be off by default in the environment example")
    if "Keep Community outside ANPOS_MARKETPLACE_PLAN_MAP" not in env_example:
        fail("environment example must keep Community identity outside the paid Marketplace plan map")
    if "ANPOS_TEMPLATE_REF=" in env_example:
        fail("paid delivery must not advertise a mutable template branch ref")

    all_source = "\n".join(path.read_text(encoding="utf-8") for path in SERVICE.rglob("*.ts") if path.is_file())
    for forbidden in ("BEGIN PRIVATE KEY-----\\nMII", "ghp_", "github_pat_", "postgresql://postgres:"):
        if forbidden in all_source:
            fail(f"commercial service source appears to contain a committed secret marker: {forbidden}")

    require_markers(
        "lib/env.ts",
        (
            "ANPOS_MARKETPLACE_APP_ID", "ANPOS_MARKETPLACE_APP_PRIVATE_KEY",
            "ANPOS_MARKETPLACE_CLIENT_ID", "ANPOS_MARKETPLACE_CLIENT_SECRET",
            "ANPOS_PUBLIC_BASE_URL", "ANPOS_SESSION_SECRET", "ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID",
            "communityLaunchConfigurationProblems", "marketplaceAppConfig", "databaseConfig", "webhookConfig",
            "mcpOAuthConfigurationProblems", "mcpOAuthConfig", "ANPOS_MCP_ALLOWED_CLIENT_IDS", "ANPOS_MCP_ALLOWED_REDIRECT_URIS",
            "internalSupervisorReadTestConfigurationProblems", "internalSupervisorReadTestGrantActiveForLogin",
            "ANPOS_INTERNAL_SUPERVISOR_READ_TEST_LOGIN", "ANPOS_INTERNAL_SUPERVISOR_READ_TEST_EXPIRES_AT",
            "unsafe:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_ACTIVE", "unsafe:ANPOS_INTERNAL_SUPERVISOR_READ_TEST_TTL_TOO_LONG",
            "supervisorAppConfigurationProblems", "supervisorAppConfig",
            "remoteSandboxConfigurationProblems", "remoteSandboxConfig",
            "ANPOS_SANDBOX_ENDPOINT", "ANPOS_SANDBOX_DRIVER_ID", "ANPOS_SANDBOX_SIGNING_SECRET",
            "ANPOS_GITHUB_SUPERVISOR_APP_ID", "ANPOS_GITHUB_SUPERVISOR_CLIENT_ID", "ANPOS_GITHUB_SUPERVISOR_CLIENT_SECRET",
            "unsafe:ANPOS_SUPERVISOR_MARKETPLACE_APP_COLLISION", "unsafe:ANPOS_SUPERVISOR_VENDOR_APP_COLLISION",
            "unsafe:ANPOS_SUPERVISOR_MARKETPLACE_CLIENT_COLLISION", "unsafe:ANPOS_SUPERVISOR_MARKETPLACE_SECRET_REUSE",
            "ANPOS_VENDOR_APP_ID", "ANPOS_VENDOR_APP_PRIVATE_KEY", "ANPOS_COMMERCIAL_RELEASE_REF", "commercialReleaseRef",
            "unsafe:ANPOS_APP_ROLE_SEPARATION", "unsafe:ANPOS_APP_PRIVATE_KEY_REUSE",
            "weak:ANPOS_MARKETPLACE_CLIENT_SECRET", "weak:ANPOS_SESSION_SECRET",
        ),
        "commercial configuration",
    )
    require_markers(
        "lib/plans.ts",
        (
            "communityMarketplacePlanId", "resolveMarketplacePlan", 'planId: "community"', "paid: false",
            "ANPOS_COMMUNITY_MARKETPLACE_PLAN_ID", "marketplacePlanMap", "marketplaceId === communityId",
            'developer: ["private_template_access", "protocol_update_channel"]',
        ),
        "Marketplace plan resolution",
    )
    require_markers(
        "app/api/webhooks/github/marketplace/route.ts",
        (
            "x-hub-signature-256", "x-github-delivery", "marketplace_purchase", "readRawBody",
            "delivery_id_payload_mismatch", "already_processing", "processing_started_at", "status='error'",
            "payload?.marketplace_purchase?.account?.id",
        ),
        "Marketplace webhook",
    )
    require_markers(
        "lib/releases.ts",
        (
            "parseTemplateReleaseManifest", "parseTemplateReleasePlanManifest", "VerifiedTemplateReleasePlan",
            "canonical-minus-vendor-only-paths", "committed_git_blobs_at_head",
            "tracked_source_only", "contains_secrets", "COMMERCIAL_RELEASE_FILE_COUNT_MISMATCH",
            "COMMERCIAL_RELEASE_TOTAL_BYTES_MISMATCH", "INVALID_COMMERCIAL_RELEASE_FILE_DIGEST",
        ),
        "certified release manifest verifier",
    )
    require_markers(
        "lib/github.ts",
        (
            "marketplace_listing/accounts", "2026-03-10", "RSA-SHA256", "access_tokens", "permissions",
            'githubAppJwt("marketplace")', 'githubAppJwt("vendor")', "marketplaceAppConfig", "serviceConfig",
            "githubMarketplaceAppId", "githubVendorAppId",
            'contents: "read"', 'administration: "write"', "zipball", "redirect: \"manual\"",
            "removeTemplateCollaborator", "codeload.github.com", "verifyMarketplaceRepositoryAuditInstallation",
            "MARKETPLACE_APP_SINGLE_FILE_READ_REQUIRED", "MARKETPLACE_APP_AUDIT_PATHS_NOT_GRANTED",
            "/user/installations/", "listMarketplaceUserInstallationRepositories", "verifyMarketplaceUserInstallationAccess",
            "templateReleaseManifest", "templateReleasePlanSnapshot", "parseTemplateReleasePlanManifest",
            "EXPORT-MANIFEST.json", "application/vnd.github.raw+json", "commercialReleaseRef",
        ),
        "GitHub client",
    )
    require_markers(
        "lib/session.ts",
        (
            "marketplaceAppConfig", "aes-256-gcm", "__Host-anpos_session", "__Host-anpos_oauth_state", "HttpOnly", "Secure", "SameSite=Lax",
            "createOAuthFlowState", "codeChallenge", "code_verifier", "consumeOAuthFlowState", "createGithubSessionCookie",
            "MAX_SESSION_TTL_SECONDS", "githubSessionFromRequest",
        ),
        "Community OAuth/session protection",
    )
    require_markers(
        "lib/crypto.ts",
        ("webhookConfig", "timingSafeEqual", "Ed25519", "base64url", "principal?", "claims.principal ? 2 : 1"),
        "entitlement/webhook cryptography",
    )
    require_markers(
        "lib/auth.ts",
        ("githubSessionTokenFromRequest", "githubUserFromToken", "authenticatedGithubContext", "requireGithubAccountAccessForContext"),
        "GitHub authentication",
    )
    require_markers(
        "lib/entitlements.ts",
        (
            "listBillingAccountsForPrincipal",
            "organization_seat_assignments",
            "s.status='active'",
            "e.github_account_type='User' AND e.github_account_id=$1",
            "e.github_account_type='Organization' AND s.github_user_id=$1",
        ),
        "principal-scoped billing account discovery",
    )
    entitlement_source = text("lib/entitlements.ts")
    if "SELECT DISTINCT" in entitlement_source and "LOWER(e.github_login)" in entitlement_source:
        fail("billing account discovery must not combine SELECT DISTINCT with a non-selected LOWER(github_login) ORDER BY expression")

    require_markers(
        "app/setup/github/route.ts",
        (
            "marketplaceAppConfig", "installation_id", "createOAuthFlowState", "https://github.com/login/oauth/authorize",
            "code_challenge", "code_challenge_method", "S256", "Set-Cookie", "no-store",
        ),
        "Marketplace Setup OAuth handoff",
    )
    require_markers(
        "app/api/auth/github/callback/route.ts",
        (
            "marketplaceAppConfig", "consumeOAuthFlowState", "https://github.com/login/oauth/access_token", "code_verifier",
            "githubUserFromToken", "verifyMarketplaceUserInstallationAccess", "createGithubSessionCookie",
            "does not persist GitHub refresh_token", "Set-Cookie",
        ),
        "Marketplace OAuth callback",
    )
    require_markers(
        "lib/repository-audit.ts",
        (
            "COMMUNITY_AUDIT_PATHS", "MAX_CONTROL_FILE_BYTES", "source_code_read: false",
            "not_persisted_by_repository_audit", "uninitialized_child", "active_child", "partial_or_malformed",
            "verifyMarketplaceRepositoryAuditInstallation", "repositoryMetadata", "control_files_present",
            "userToken",
        ),
        "Community repository audit engine",
    )
    require_markers(
        "lib/repository-supervisor-runtime.ts",
        (
            "normalizeGithubRepositoryLocator", "resolveGithubRepository", "profileGithubAccount",
            "readGithubRepositoryFiles", "listGithubRepositoryTree", "auditGithubRepository", "getGithubRepositoryAssurance",
            "SUPERVISOR_AUDIT_PATHS", "immutable_ref_required", "github_repository_tree_truncated",
            "summarizeAssurance(assurance, 83, 96)",
        ),
        "Repository Supervisor GitHub runtime foundation",
    )
    require_markers(
        "lib/plugin-entitlements.ts",
        (
            "PLUGIN_CAPABILITIES", "community_repository_readiness_audit", "repository_supervisor_read",
            "repository_supervisor_write", "protocol_update_channel", "private_template_access",
            "organization_seat_required", "repository_supervisor_write", "implemented: true", "requirePluginCapability",
        ),
        "Plugin subscription entitlement capability bridge",
    )
    require_markers(
        "tests/plugin-entitlements.test.ts",
        (
            "Community stays limited to bounded readiness capability",
            "Developer entitlement authorizes Repository Supervisor read and guarded write capabilities",
            "principal mismatch and inactive billing",
            "Organization paid capability requires an active assigned seat",
        ),
        "Plugin entitlement bridge unit tests",
    )
    require_markers(
        "app/api/v1/plugin/entitlements/current/route.ts",
        (
            "x-anpos-account-id", "requireGithubAccountAccess", "reconcileEntitlement",
            "buildPluginCapabilityMatrix", "plugin_entitlement_bridge",
            "authenticated_github_principal_plus_x_anpos_account_id", "github_marketplace",
            "private, no-store",
        ),
        "Plugin entitlement bridge API",
    )
    require_markers(
        "lib/mcp-auth.ts",
        (
            "MCP_OAUTH_STATE_COOKIE_NAME", "MCP_SCOPES", "createMcpAuthorizationStart",
            "validateMcpClientMetadata", "MCP_CLIENT_METADATA_TIMEOUT_MS", "MCP_CLIENT_METADATA_MAX_BYTES",
            'redirect: "error"', "MCP_OAUTH_CLIENT_METADATA_ID_MISMATCH",
            "MCP_OAUTH_CLIENT_METADATA_REDIRECT_MISMATCH", "MCP_OAUTH_CLIENT_METADATA_TOKEN_AUTH_UNSUPPORTED",
            "consumeMcpAuthorizationState", "issueMcpAuthorizationCode", "redeemMcpAuthorizationCode",
            "authenticateMcpRequest", "mcpBearerChallenge", "code_challenge_method", "S256",
            "mcp_oauth_authorization_codes", "mcp_oauth_access_tokens", "supervisorAppConfig",
            "anpos:profile", "anpos:repo:read", "anpos:repo:write",
        ),
        "Repository Supervisor MCP OAuth broker",
    )
    require_markers(
        "lib/remote-sandbox-driver.ts",
        (
            'import { getVercelOidcToken } from "@vercel/oidc";',
            "await getVercelOidcToken()",
            "remoteSandboxTrustedSourceHeaders",
            "endpointUrl.origin !== publicUrl.origin",
            "x-vercel-trusted-oidc-idp-token",
        ),
        "protected same-origin sandbox OIDC forwarding",
    )
    require_markers(
        "lib/mcp-runtime.ts",
        (
            "MCP_TOOL_DEFINITIONS", "server/discover", "2026-07-28", "repository_profile",
            '"openai/profile": true', "repository_list_billing_accounts", "listBillingAccountsForPrincipal", "buildPluginCapabilityMatrix",
            "internalSupervisorReadTestGrantActiveForLogin", "internal_read_test_grant", "internal_read_test_grant_read_only",
            "repository_resolve", "repository_audit", "repository_get_assurance",
            "billing_account_id", "authorizeRepositorySupervisorCapability", "requireMcpScope",
            "repository_plan_anpos_change", "repository_apply_anpos_change", "repository_open_change_request",
            "repository_get_change_request", "repository_get_ci", "repository_merge_change_request",
            "createGithubFullAnposPlan", "applyGithubSupervisorPlan", "bootstrap_empty", "bootstrap_child", "adopt_existing", "repair_partial", "upgrade_active",
        ),
        "Repository Supervisor MCP runtime",
    )
    require_markers(
        "app/mcp/route.ts",
        (
            "authenticateMcpRequest", "mcpBearerChallenge", "handleMcpRpc", "WWW-Authenticate",
            "readJsonBody", "65_536", "Allow", "POST",
        ),
        "Repository Supervisor MCP HTTP route",
    )
    require_markers(
        "app/.well-known/oauth-protected-resource/route.ts",
        ("authorization_servers", "bearer_methods_supported", "anpos:profile", "anpos:repo:read", "anpos:repo:write"),
        "MCP protected resource metadata",
    )
    require_markers(
        "app/.well-known/oauth-authorization-server/route.ts",
        (
            "authorization_endpoint", "token_endpoint", "authorization_code", "S256",
            "client_id_metadata_document_supported", "authorization_response_iss_parameter_supported",
        ),
        "MCP authorization server metadata",
    )
    require_markers(
        "app/oauth/authorize/route.ts",
        ("createMcpAuthorizationStart", "Set-Cookie", "Referrer-Policy", "no-store"),
        "MCP OAuth authorization route",
    )
    require_markers(
        "app/api/auth/mcp/github/callback/route.ts",
        (
            "consumeMcpAuthorizationState", "issueMcpAuthorizationCode", "githubUserFromToken",
            "code_verifier", "access_denied", "destination.searchParams.set(\"iss\"",
            "does not persist GitHub refresh_token",
        ),
        "MCP GitHub OAuth callback",
    )
    require_markers(
        "app/oauth/token/route.ts",
        (
            "application/x-www-form-urlencoded", "authorization_code", "redeemMcpAuthorizationCode",
            "code_verifier", "resource", "access_token", "Bearer", "no-store",
        ),
        "MCP OAuth token route",
    )
    require_markers(
        "app/api/ready/mcp/route.ts",
        (
            "mcpOAuthConfigurationProblems", "ensureSchema", "repository_supervisor_mcp",
            "protected_resource_metadata", "authorization_server_metadata", "supervisorAppConfigurationProblems", "write_scope_available: true",
            "internalSupervisorReadTestConfigurationProblems", "internal_read_test_active",
        ),
        "MCP readiness gate",
    )
    require_markers(
        "tests/mcp-auth.test.ts",
        (
            "exact allowlist, CIMD metadata, resource and PKCE S256",
            "CIMD validation binds exact client identity, redirect and public-client token method",
            "write scope is available only through the dedicated Supervisor App flow", "MCP_OAUTH_CLIENT_NOT_ALLOWED",
            "MCP_OAUTH_CLIENT_METADATA_ID_MISMATCH", "MCP_OAUTH_CLIENT_METADATA_REDIRECT_MISMATCH",
            "MCP_OAUTH_RESOURCE_MISMATCH", "Iv1.supervisor-client-123456",
        ),
        "MCP OAuth unit tests",
    )
    require_markers(
        "tests/mcp-runtime.test.ts",
        (
            "MCP discovery advertises modern stateless tool capability",
            "authenticated profile plus guarded write tool metadata",
            "stable opaque profile", "OAuth challenge metadata on insufficient scope",
        ),
        "MCP runtime unit tests",
    )
    require_markers(
        "lib/execution-sandbox.ts",
        (
            "SandboxDriver", "SandboxFileArtifact", "normalizeSandboxRequest", "normalizeSandboxFileArtifacts", "executeWithSandboxDriver",
            'network: "deny"', "isolated_sandbox_driver_required", "network_access_not_supported",
            "artifact_integrity_mismatch", "unexpected_output_artifact_path", "sandbox_output_artifact_set_mismatch",
        ),
        "Repository Supervisor execution sandbox contract",
    )
    require_markers(
        "lib/vercel-sandbox-gateway.ts",
        (
            "Sandbox.create", 'runtime: "python3.13"', 'networkPolicy: "deny-all"', "persistent: false",
            "sandbox_gateway_request_nonces", "buildRemoteSandboxSignature", "buildRemoteSandboxResponseSignature",
            "sandbox_request_replayed", "sandbox_gateway_source_mode_not_implemented",
            "sandbox_gateway_environment_names_not_implemented", "MAX_LIVE_EXECUTION_SECONDS = 240",
            "workspace_destroyed: true", "safeSandboxArtifactPath", "sandbox_output_integrity_mismatch",
            "root not in resolved.parents", "sandbox_network_deny_not_enforced",
        ),
        "Vercel sandbox gateway",
    )
    require_markers(
        "app/v1/execute/route.ts",
        ("handleSandboxGatewayRequest", "sandboxGatewayConfigurationProblems", "maxDuration = 300", "sandbox_gateway_internal_error"),
        "Vercel sandbox gateway route",
    )
    require_markers(
        "migrations/007_vercel_sandbox_gateway_replay.sql",
        ("sandbox_gateway_request_nonces", "PRIMARY KEY", "request_id UUID NOT NULL UNIQUE", "expires_at"),
        "sandbox replay migration",
    )
    require_markers(
        "tests/vercel-sandbox-gateway.test.ts",
        ("signed Vercel sandbox gateway request executes with deny-all", "rejects bad signatures", "rejects replayed nonce"),
        "Vercel sandbox gateway tests",
    )

    require_markers(
        "lib/remote-sandbox-driver.ts",
        (
            "RemoteEphemeralSandboxDriver", "productionSandboxDriver", "buildRemoteSandboxSignature",
            "buildRemoteSandboxResponseSignature", "remoteSandboxTrustedSourceHeaders", "verifyRemoteSandboxResponseSignature",
            "remoteSandboxConfig", "remote_ephemeral",
            "workspace_destroyed", "network", "deny", "redirect: \"error\"",
            "X-Anpos-Sandbox-Protocol", "protocol_version: 2", "artifacts", "output_files",
            "X-Anpos-Sandbox-Timestamp", "X-Anpos-Sandbox-Nonce", "X-Anpos-Sandbox-Signature",
            "remote_sandbox_response_signature_invalid", "remote_sandbox_artifact_limit_exceeded",
        ),
        "Remote production sandbox driver",
    )
    require_markers(
        "tests/remote-sandbox-driver.test.ts",
        (
            "source identity is immutable and normalized",
            "signatures bind exact body timestamp nonce and response request id",
            "names-only environment and validates signed destruction evidence",
            "fails closed on unsigned or non-destroyed response",
            "trusted-source token is forwarded only to the exact public service origin",
        ),
        "Remote sandbox driver unit tests",
    )
    require_markers(
        "app/api/ready/sandbox/route.ts",
        (
            "remoteSandboxConfigurationProblems", "repository_supervisor_sandbox", "remote_ephemeral",
            "source_driver_ready", "live_gateway_probe", "not_performed_by_readiness_endpoint",
            "protocol_version: 2", "signed_bounded_input_files_plus_exact_output_allowlist",
            "python3>=3.12", "secret_values_in_model_request: false",
        ),
        "Sandbox readiness gate",
    )
    require_markers(
        "lib/sandbox-live-probe.ts",
        (
            "runProductionSandboxLiveProbe", "remoteSandboxTrustedSourceHeaders",
            "verifyRemoteSandboxResponseSignature", "validateRemoteSandboxWireResponse",
            "sandbox_request_replayed", "workspace_destroyed", "network_denied",
            "input_integrity_verified", "output_allowlist_verified", "output_integrity_verified",
        ),
        "Production sandbox live probe",
    )
    require_markers(
        "app/api/ready/sandbox/live/route.ts",
        (
            "VERCEL_ENV", "x-anpos-sandbox-live-probe", "repository_supervisor_sandbox_live",
            "runProductionSandboxLiveProbe", "Cache-Control", "no-store",
        ),
        "Protected sandbox live probe route",
    )
    require_markers(
        "tests/sandbox-live-probe.test.ts",
        (
            "verifies signed execution and replay rejection",
            "x-vercel-trusted-oidc-idp-token",
            "sandbox_request_replayed",
        ),
        "Sandbox live probe unit tests",
    )
    require_markers(
        "scripts/verify-repository-supervisor-e2e.ts",
        (
            "ANPOS_E2E_MCP_ACCESS_TOKEN", "ANPOS_E2E_MODE", "write_prepare", "write_verify_merge",
            "I_ACCEPT_DISPOSABLE_TEST_REPO_MUTATION", "does not busy-wait",
            "repository_profile", "repository_resolve", "repository_audit", "repository_get_assurance",
            "repository_plan_anpos_change", "repository_apply_anpos_change", "repository_open_change_request",
            "repository_get_change_request", "repository_get_ci", "repository_merge_change_request",
            "process.exit(2)", "resulting_default_branch_head_sha",
        ),
        "Repository Supervisor live E2E verifier",
    )
    require_markers(
        "tests/repository-supervisor-runtime.test.ts",
        (
            "repository_resolve binds canonical identity", "repository_profile returns authenticated provider account identity",
            "repository_audit classifies active ANPOS child", "repository_get_assurance requires immutable SHA",
        ),
        "Repository Supervisor runtime unit tests",
    )
    require_markers(
        "tests/execution-sandbox.test.ts",
        (
            "bounded network-denied execution", "rejects host paths", "requires an isolated driver",
            "artifact channel validates canonical base64, digest and output path boundaries",
        ),
        "Repository Supervisor sandbox unit tests",
    )

    require_markers(
        "app/api/v1/audit/repository/route.ts",
        (
            "authenticatedGithubContext", "community_repository_audit", "10, 60", "auditRepository",
            "MARKETPLACE_APP_NOT_INSTALLED_FOR_REPOSITORY", "githubSessionFromRequest", "installation_session_mismatch",
            "Cache-Control", "no-store",
        ),
        "Community repository audit API",
    )
    require_markers(
        "app/api/v1/audit/repositories/route.ts",
        (
            "githubSessionFromRequest", "installation_session_mismatch", "authenticatedGithubContext",
            "listMarketplaceUserInstallationRepositories", "marketplace_installation_user_access_required", "no-store",
        ),
        "Community repository discovery API",
    )
    require_markers(
        "app/community/CommunityClient.tsx",
        ("Repository Readiness Audit", "/api/v1/audit/repositories", "/api/v1/audit/repository", "Application source read"),
        "Community audit customer UI",
    )
    require_markers(
        "lib/entitlements.ts",
        (
            "resolveMarketplacePlan", "resolvedPlan.paid", "requireActiveSeat", "issueEntitlementForPrincipal", "principal:",
            'accountType === "Organization"', "signed_entitlement: envelope", "revokeAllTemplateGrantsForSource", "revoked > 0",
        ),
        "entitlement engine",
    )

    database_runtime = text("lib/db.ts")
    for marker in ("databaseConfig", "commercial_schema_migrations", "007_vercel_sandbox_gateway_replay.sql", "mcp_oauth_authorization_codes", "mcp_oauth_access_tokens", "repository_supervisor_write_plans", "repository_supervisor_write_idempotency", "sandbox_gateway_request_nonces", "to_regclass", "query_timeout", "COMMERCIAL_DATABASE_MIGRATION_REQUIRED"):
        if marker not in database_runtime:
            fail(f"commercial database runtime gate missing marker: {marker}")
    if "CREATE TABLE" in database_runtime.upper():
        fail("normal commercial request runtime must not execute CREATE TABLE migrations")

    require_markers(
        "migrations/001_baseline.sql",
        ("marketplace_deliveries", "rate_limit_windows", "organization_seat_assignments", "template_access_grants", "access_reconciliation_jobs", "commercial_audit_log"),
        "commercial baseline migration",
    )
    require_markers(
        "migrations/002_mcp_oauth.sql",
        (
            "mcp_oauth_authorization_codes", "code_hash", "code_challenge", "consumed_at",
            "mcp_oauth_access_tokens", "token_hash", "github_access_token_ciphertext", "revoked_at",
        ),
        "MCP OAuth migration",
    )
    require_markers(
        "migrations/003_repository_supervisor_write.sql",
        (
            "repository_supervisor_write_plans", "plan_hash", "payload_ciphertext", "expected_target_head_sha",
            "applied_branch", "applied_head_sha", "pull_request_number", "merge_commit_sha",
            "repository_supervisor_write_idempotency", "idempotency_key",
        ),
        "Repository Supervisor write migration",
    )
    require_markers(
        "migrations/004_repository_supervisor_planner.sql",
        (
            "expected_target_head_sha DROP NOT NULL",
            "repository_supervisor_write_plans_expected_head_shape",
            "repository_supervisor_write_plans_mode_status_idx",
        ),
        "Repository Supervisor planner migration",
    )
    require_markers(
        "migrations/005_repository_supervisor_full_apply.sql",
        (
            "apply_operation_id", "apply_lease_expires_at", "sandbox_receipt_sha256",
            "repository_supervisor_write_plans_apply_lease_idx",
            "repository_supervisor_write_plans_sandbox_receipt_shape",
        ),
        "Repository Supervisor full-apply migration",
    )
    require_markers(
        "migrations/006_guarded_empty_repository_initialization.sql",
        (
            "initialization_seed_sha", "initialization_seed_path",
            "repository_supervisor_write_plans_initialization_seed_sha_shape",
            "repository_supervisor_write_plans_initialization_seed_pair",
            ".anpos-bootstrap-seed",
        ),
        "Repository Supervisor guarded empty initialization migration",
    )
    require_markers(
        "migrations/007_vercel_sandbox_gateway_replay.sql",
        (
            "sandbox_gateway_request_nonces", "nonce TEXT PRIMARY KEY", "request_id UUID NOT NULL UNIQUE",
            "expires_at TIMESTAMPTZ NOT NULL", "sandbox_gateway_request_nonces_expires_at_idx",
        ),
        "Vercel sandbox gateway replay migration",
    )
    require_markers(
        "lib/repository-supervisor-planner.ts",
        (
            "buildFullPlannerPayload", "createGithubFullAnposPlan", "templateReleasePlanSnapshot",
            "listGithubRepositoryTree", "bootstrap_empty", "bootstrap_child", "adopt_existing",
            "repair_partial", "upgrade_active", "target_only_digest",
            "preserve_verified_evidence_never_reset_on_adoption_or_upgrade",
            "sandbox_full_plan_v1", "guarded_empty_repository_v1", "conflict_resolution_required",
            "validateStoredFullPlannerPayload", "release_bytes", "action_preview_truncated",
        ),
        "Repository Supervisor full planner runtime",
    )
    require_markers(
        "tests/repository-supervisor-planner.test.ts",
        (
            "bootstrap_empty plans verified release plus child transforms without writes",
            "adopt_existing never auto-overwrites collisions and preserves target-only application files",
            "upgrade_active preserves evidence and flags AI assurance re-verification on material drift",
            "planner mode must match the audited repository classification",
        ),
        "Repository Supervisor full planner unit tests",
    )
    require_markers(
        "lib/repository-supervisor-write.ts",
        (
            "createGithubWritePlan", "persistGithubSupervisorPlan", "loadGithubSupervisorPlanForApply", "applyGithubWritePlan", "openGithubWritePlanPullRequest",
            "getGithubWritePlanPullRequest", "getGithubWritePlanCi", "mergeGithubWritePlanPullRequest",
            "planner_payload_too_large", "sandbox_receipt_sha256",
            "validatePlannedChanges", "validateFeatureBranchName", "target_head_changed_replan_required",
            "canonical_source_write_forbidden", "planned_change_contains_secret_material",
            "refs/heads/", "git/blobs", "git/trees", "git/commits", "check-runs",
            "repository_policy_rejected_merge", "resulting_default_branch_verification_failed",
        ),
        "Repository Supervisor guarded write runtime",
    )
    require_markers(
        "lib/repository-supervisor-full-apply.ts",
        (
            "applyGithubSupervisorPlan", "buildFullApplySandboxRequest", "verifyFullApplySandboxOutputs",
            "materializeTemplateReleaseFiles", "productionSandboxDriver", "sandbox_receipt_sha256",
            "target_head_changed_replan_required", "commercial_release_changed_replan_required",
            "full_plan_conflict_resolution_required", "guarded_empty_repository_v1",
            "empty_repository_initialization_confirmation_required", "initializeEmptyRepositorySeed",
            "empty_repository_seed_not_root_commit", "EMPTY_BOOTSTRAP_SEED_PATH",
            "empty_repository_initialization_recovery_required", "initialization_seed_sha",
            "full_plan_apply_recovery_required", "make_interval", "cleanupBranch",
            "delete_paths", "materializeTemplateReleaseFiles", "source: undefined", "environment_variable_names: []",
        ),
        "Repository Supervisor sandbox-backed full apply runtime",
    )
    require_markers(
        "lib/full-plan-sandbox-runner.ts",
        (
            "FULL_PLAN_SANDBOX_RUNNER", "subprocess.run", "shell=False",
            "bootstrap_empty", "bootstrap_child", "adopt_existing", "release_input_digest_mismatch",
            "unresolved_plan_conflict", "expected_regular_file",
        ),
        "Repository Supervisor isolated full-plan runner",
    )
    require_markers(
        "tests/repository-supervisor-full-apply.test.ts",
        (
            "empty isolated workspace and exact output allowlist",
            "accepts exact release output and rejects non-transform drift",
            "rejects timeout or truncated sandbox evidence",
            "empty bootstrap seed must be the zero-parent root commit",
        ),
        "Repository Supervisor sandbox full-apply unit tests",
    )
    require_markers(
        "tests/repository-supervisor-write.test.ts",
        (
            "bounded sorted change sets and hashes content",
            "rejects vendor/control escape paths and committed secret material",
            "accepts only anpos feature branches and rejects default branch",
        ),
        "Repository Supervisor guarded write unit tests",
    )
    require_markers(
        "scripts/guarded-build-migrate.ts",
        (
            "ANPOS_PRODUCTION_MIGRATE_ON_BUILD", "VERCEL_ENV", "production",
            "EXPORT-MANIFEST.json", "source_revision", 'export_mode !== "service"',
            "DATABASE_URL_UNPOOLED", "DATABASE_URL", "guarded production migration pass",
            "complete and idempotency re-run passed",
        ),
        "guarded production build migration",
    )
    require_markers(
        "scripts/migrate.ts",
        ("async function main", "main().catch", "pg_advisory_lock", "checksum_sha256", "CREATE TABLE IF NOT EXISTS commercial_schema_migrations", "BEGIN", "ROLLBACK", "Applied migration checksum changed"),
        "commercial migration runner",
    )
    require_markers(
        "lib/rate-limit.ts",
        ("ON CONFLICT (scope,subject,window_start)", "request_count=rate_limit_windows.request_count + 1", "Retry-After"),
        "rate limiter",
    )
    require_markers(
        "app/api/v1/seats/route.ts",
        ("requireGithubOrganizationAdmin", "resolveActiveOrganizationMember", "assignSeat", "revokeSeat", "organization_seat_admin"),
        "organization seat API",
    )
    require_markers(
        "app/api/v1/releases/current/route.ts",
        (
            "protocol_update_channel", "reconcileEntitlement", "requireActiveSeat", "templateReleaseManifest",
            "protocol_release_metadata_issued", "certified_protocol_updates", "archive_endpoint", "private, no-store",
        ),
        "certified protocol update channel",
    )
    require_markers(
        "app/api/v1/template/archive/route.ts",
        (
            "templateArchiveRedirect", "templateReleaseManifest", "requireActiveSeat", "template_archive", "release_ref",
            "canonical_source_revision", "Cache-Control", "307",
        ),
        "template archive delivery",
    )
    require_markers(
        "app/api/v1/provision/route.ts",
        ("ANPOS_COLLABORATOR_PROVISIONING_ENABLED", "idempotency_key_conflict", "ON CONFLICT (idempotency_key) DO NOTHING", "recordTemplateAccessGrant", "requireActiveSeat"),
        "collaborator provisioning",
    )
    require_markers(
        "lib/template-access.ts",
        ("retained_due_to_other_active_grant", "removeTemplateCollaborator", "access_reconciliation_jobs", "retry_queued"),
        "template access revocation",
    )
    require_markers(
        "app/api/ready/community/route.ts",
        (
            "communityLaunchConfigurationProblems", "marketplaceAppConfig", "communityMarketplacePlanId",
            "github_marketplace_app_key_must_be_rsa", 'mode: "community"', "ensureSchema", 'db().query("SELECT 1")',
        ),
        "Community readiness gate",
    )
    require_markers(
        "app/api/ready/route.ts",
        (
            "configurationProblems", "githubMarketplaceAppPrivateKeyPem", "githubVendorAppPrivateKeyPem",
            "github_marketplace_app_key_must_be_rsa", "github_vendor_app_key_must_be_rsa",
            '"ed25519"', "organizationSeatCapacity", "ensureSchema",
        ),
        "full commercial readiness gate",
    )
    require_markers(
        "tests/security.test.ts",
        (
            "plan mapping and organization capacities fail closed", "principal-bound v2", "request_body_too_large",
            "weak:ANPOS_GITHUB_WEBHOOK_SECRET", "Marketplace and vendor GitHub App roles cannot collapse",
            "remote sandbox configuration fails closed on weak or unsafe gateway settings",
            "Supervisor App role cannot collapse into Marketplace or Vendor roles",
            "legacy single-app credentials do not satisfy split configuration", "Community OAuth state uses PKCE",
            "Community browser session is encrypted", "ANPOS_COMMERCIAL_RELEASE_REF", "mutable production controls",
        ),
        "commercial security unit tests",
    )
    require_markers(
        "tests/community-launch.test.ts",
        (
            "Community launch config is independent from paid and vendor secrets",
            "Community Marketplace identity stays outside paid plan mapping",
            "Community Marketplace plan identity fails closed when malformed",
            "missing:ANPOS_VENDOR_APP_ID", "paid: false",
        ),
        "Community launch unit tests",
    )
    require_markers(
        "tests/release-channel.test.ts",
        (
            "certified release manifest requires deterministic template export evidence",
            "commercial release manifest rejects mutable or unverifiable identity",
            "paid plans include certified update channel while provider compatibility stays core",
            "protocol_update_channel", "standard_provider_adapters",
        ),
        "certified release channel unit tests",
    )
    require_markers(
        "tests/repository-audit.test.ts",
        (
            "exactly ten ANPOS control files", "baseline_present", "uninitialized_child",
            "canonical_source", "needs_repair", "not_anpos",
        ),
        "Community repository audit unit tests",
    )

    entitlement_schema = json.loads((ROOT / "schemas/license-entitlement.schema.json").read_text(encoding="utf-8"))
    schema_text = json.dumps(entitlement_schema, sort_keys=True)
    for marker in ('"principal"', '"format_version"', '"const": 2', '"github_account_type": {"const": "Organization"}'):
        if marker not in schema_text:
            fail(f"license entitlement schema missing seat-bound envelope marker: {marker}")

    api_contract = json.loads((ROOT / "blueprints/commercial/service-api-contract.json").read_text(encoding="utf-8"))
    if api_contract.get("schema_version") != 18:
        fail("commercial service API contract must be schema_version 18")
    contract_text = json.dumps(api_contract, sort_keys=True)
    for marker in (
        "/v1/releases/current", "/v1/template/archive", "/v1/seats", "/v1/access/reconcile", "/v1/audit/repository", "/v1/plugin/entitlements/current",
        "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/oauth/authorize", "/oauth/token", "/mcp", "/v1/execute", "/api/ready/mcp", "/api/ready/sandbox",
        "organization_consumption_requires_explicit_seat_principal", "community_repository_audit_must_not_read_application_source",
        "paid_release_ref_must_be_immutable_commit_sha", "paid_release_manifest_must_be_verified_before_metadata_or_archive_delivery",
        "protocol_update_channel", '"single_file": "read"', "not_persisted_by_repository_audit",
        "mcp_oauth_pkce_s256_required", "mcp_resource_parameter_binding_required",
        "mcp_cimd_metadata_validation_required", "mcp_cimd_exact_allowlist_before_fetch_required",
        "mcp_cimd_redirect_follow_forbidden", "mcp_cimd_selected_redirect_must_be_metadata_bound",
        "mcp_access_tokens_opaque_short_lived_and_server_side_hashed",
        "repository_supervisor_uses_dedicated_github_app_role",
        "marketplace_app_must_not_be_widened_for_supervisor_writes",
        "supervisor_write_plan_must_be_server_issued_and_expected_head_bound",
        "supervisor_force_push_forbidden",
        "supervisor_normal_non_empty_direct_default_branch_write_forbidden",
        "supervisor_empty_repository_seed_is_only_default_branch_exception",
        "supervisor_merge_must_verify_resulting_default_branch_head",
        "sandbox_production_driver_source", "sandbox_request_signature", "sandbox_response_signature",
        "sandbox_source_binding", "sandbox_network_default_deny", "sandbox_workspace_destroy_after_execution_required",
        "sandbox_live_probe_must_be_production_only",
        "sandbox_live_probe_must_use_trusted_oidc_protected_deployment",
        "sandbox_live_probe_signing_secret_never_leaves_service",
        "sandbox_same_origin_vercel_oidc_must_not_be_forwarded_cross_origin",
        "sandbox_live_probe_must_verify_response_hmac_and_replay_rejection",
        "sandbox_source_ready_is_not_live_gateway_evidence",
        "sandbox_vercel_gateway_source",
        "sandbox_vercel_gateway_route",
        "sandbox_vercel_gateway_microvm_required",
        "sandbox_vercel_gateway_network_deny_all_required",
        "sandbox_vercel_gateway_durable_replay_ledger_required",
        "sandbox_vercel_gateway_signed_success_requires_workspace_destroyed",
        "sandbox_vercel_gateway_live_empty_workspace_only",
        "sandbox_vercel_gateway_environment_forwarding_forbidden",
        "sandbox_vercel_gateway_live_execution_timeout_seconds", "github_runtime_e2e_verifier",
        "github_runtime_e2e_live_evidence_contract", "github_runtime_e2e_source_harness_is_not_live_evidence",
        "github_runtime_e2e_never_busy_waits_for_ci",
        "supervisor_full_planner_source", "supervisor_full_planner_verified_release_identity_required",
        "supervisor_full_planner_immutable_target_tree_required_for_non_empty_targets",
        "supervisor_full_planner_target_only_files_preserved",
        "supervisor_full_planner_adoption_collisions_never_auto_overwritten",
        "supervisor_full_planner_requirements_83_96_evidence_preserved",
        "supervisor_full_planner_material_ai_drift_requires_reverification",
        "supervisor_full_planner_mcp_output_bounded",
        "sandbox_protocol_version", "sandbox_artifact_channel", "sandbox_runtime_requirement",
        "supervisor_full_plan_apply_source", "supervisor_full_plan_apply_requires_conflict_free",
        "supervisor_full_plan_apply_reverifies_release_and_target_head",
        "supervisor_full_plan_apply_customer_provider_token_never_forwarded_to_sandbox",
        "supervisor_full_plan_apply_signed_receipt_required_for_merge",
        "supervisor_full_plan_apply_uses_operation_lease",
        "supervisor_full_plan_conflict_resolution_source",
        "supervisor_full_plan_conflict_resolution_source_plan_hash_required",
        "supervisor_full_plan_conflict_resolution_target_git_object_required",
        "supervisor_full_plan_conflict_resolution_migration_review_ack_required",
        "supervisor_bootstrap_empty_guarded_source",
        "supervisor_bootstrap_empty_explicit_confirmation_required",
        "supervisor_bootstrap_empty_single_default_branch_seed_exception",
        "supervisor_bootstrap_empty_seed_path",
        "supervisor_bootstrap_empty_zero_parent_root_required",
        "supervisor_bootstrap_empty_seed_removed_on_feature_branch",
        "supervisor_bootstrap_empty_post_seed_failure_requires_recovery",
        "supervisor_non_empty_direct_default_branch_write_forbidden",
    ):
        if marker not in contract_text:
            fail(f"commercial service API contract missing marker: {marker}")

    sandbox_policy = json.loads((ROOT / "config/runtime/execution-sandbox.json").read_text(encoding="utf-8"))
    if sandbox_policy.get("schema_version") != 4:
        fail("execution sandbox policy must be schema_version 4")
    if sandbox_policy.get("status") != "vercel_gateway_source_implemented_live_gateway_evidence_pending":
        fail("execution sandbox policy must preserve source-ready/live-evidence-pending boundary")
    production_driver = sandbox_policy.get("production_driver", {})
    for key, expected in (
        ("id", "remote_ephemeral_signed_gateway_v1"),
        ("source", "commercial-service/lib/remote-sandbox-driver.ts"),
        ("readiness_endpoint", "/api/ready/sandbox"),
        ("transport", "https_post"),
        ("protocol_version", 2),
        ("workspace_source_binding", "github_repository_full_name_plus_immutable_commit_sha_or_explicit_empty"),
        ("artifact_channel", "signed_bounded_input_files_plus_exact_output_allowlist"),
        ("workspace_destroy_after_execution", True),
        ("redirects", "forbidden"),
        ("source_ready", True),
        ("live_gateway_evidence", "pending"),
        ("gateway_source", "commercial-service/lib/vercel-sandbox-gateway.ts"),
        ("gateway_route", "/v1/execute"),
        ("gateway_runtime", "vercel_sandbox_python3.13"),
        ("gateway_isolation", "firecracker_microvm"),
        ("gateway_network_policy", "deny-all"),
        ("gateway_replay_ledger", "sandbox_gateway_request_nonces"),
        ("gateway_live_execution_timeout_seconds", 240),
        ("gateway_function_max_duration_seconds", 300),
        ("environment_variable_forwarding_live", False),
    ):
        if production_driver.get(key) != expected:
            fail(f"execution sandbox production driver mismatch: {key}")

    planner_policy = json.loads((ROOT / "config/runtime/repository-supervisor-planner.json").read_text(encoding="utf-8"))
    if planner_policy.get("schema_version") != 4 or planner_policy.get("status") != "source_planner_policy":
        fail("Repository Supervisor planner policy identity is invalid")
    if planner_policy.get("modes") != ["bootstrap_empty", "bootstrap_child", "adopt_existing", "repair_partial", "upgrade_active"]:
        fail("Repository Supervisor planner policy must define the exact full planner modes")
    if planner_policy.get("target_only_rule") != "preserve":
        fail("Repository Supervisor planner must preserve target-only files")
    if planner_policy.get("adoption_collision_rule") != "manual_merge":
        fail("Repository Supervisor adoption collisions must remain manual-merge")
    if planner_policy.get("requirements_83_96_rule") != "preserve_verified_evidence_never_reset_on_adoption_or_upgrade":
        fail("Repository Supervisor planner must preserve Requirements 83-96 evidence")
    planner_apply = planner_policy.get("apply_runtime") or {}
    if planner_apply.get("source") != "commercial-service/lib/repository-supervisor-full-apply.ts":
        fail("Repository Supervisor planner apply runtime source is invalid")
    if planner_apply.get("sandbox_protocol_version") != 2:
        fail("Repository Supervisor full apply must require sandbox protocol v2")
    if planner_apply.get("conflict_free_required") is not True:
        fail("Repository Supervisor full apply must require conflict-free plans")
    if planner_apply.get("conflict_resolution") != "explicit_resolved_plan_v1":
        fail("Repository Supervisor conflict resolution runtime contract is invalid")
    for key in (
        "conflict_resolution_requires_exact_source_plan_hash",
        "conflict_resolution_requires_exact_target_git_object",
        "migration_review_use_release_requires_acknowledgement",
        "resolved_plan_is_new_immutable_plan",
    ):
        if planner_apply.get(key) is not True:
            fail(f"Repository Supervisor resolved-plan policy missing: {key}")
    if planner_apply.get("bootstrap_empty") != "guarded_root_seed_then_feature_branch_pr_v1":
        fail("Repository Supervisor empty-repository apply contract is invalid")
    if planner_apply.get("eligible_modes") != ["bootstrap_empty", "bootstrap_child", "adopt_existing", "repair_partial", "upgrade_active"]:
        fail("Repository Supervisor full apply eligible modes are invalid")
    if planner_apply.get("empty_repository_direct_default_branch_exception") != "single_verified_zero_parent_seed_only":
        fail("Repository Supervisor empty bootstrap must allow only the single seed exception")
    if planner_apply.get("empty_repository_seed_path") != ".anpos-bootstrap-seed":
        fail("Repository Supervisor empty bootstrap seed path is invalid")
    if planner_apply.get("empty_repository_seed_removed_on_feature_branch") is not True:
        fail("Repository Supervisor empty bootstrap seed must be removed on the feature branch")
    if planner_apply.get("empty_repository_explicit_confirmation_required") is not True:
        fail("Repository Supervisor empty bootstrap must require explicit confirmation")
    if planner_apply.get("empty_repository_recovery_after_seed_failure") != "apply_recovery_required":
        fail("Repository Supervisor post-seed failures must require recovery")
    if planner_apply.get("customer_provider_token_forwarded_to_sandbox") is not False:
        fail("Repository Supervisor must never forward customer provider token to sandbox")
    if planner_apply.get("merge_requires_sandbox_receipt") is not True:
        fail("Repository Supervisor full-plan merge must require sandbox receipt")
    planner_vendor_boundary = json.loads((ROOT / "config/licensing/vendor-source-boundary.json").read_text(encoding="utf-8"))
    if "config/runtime/repository-supervisor-planner.json" not in planner_vendor_boundary.get("vendor_only_paths", []):
        fail("Repository Supervisor planner policy must remain vendor-only")
    if "schemas/repository-supervisor-planner.schema.json" not in planner_vendor_boundary.get("vendor_only_paths", []):
        fail("Repository Supervisor planner schema must remain vendor-only")

    e2e_contract = json.loads((ROOT / "config/runtime/repository-supervisor-e2e.json").read_text(encoding="utf-8"))
    if e2e_contract.get("status") != "source_harness_implemented_live_evidence_pending":
        fail("repository-supervisor-e2e.json must remain live-evidence pending until real receipts exist")
    modes = {row.get("id"): row for row in e2e_contract.get("modes", [])}
    if set(modes) != {"read", "write_prepare", "write_verify_merge"}:
        fail("Repository Supervisor E2E contract must define exact read/write_prepare/write_verify_merge phases")
    if modes.get("write_verify_merge", {}).get("busy_wait") is not False:
        fail("Repository Supervisor E2E must not busy-wait for CI")
    live_evidence = e2e_contract.get("live_evidence", {})
    if live_evidence.get("status") != "pending" or any(
        live_evidence.get(key) is not None
        for key in ("service_origin", "repository", "read_receipt", "write_receipt", "verified_at")
    ):
        fail("Repository Supervisor live E2E evidence must not be invented in source")

    supervisor_manifest = json.loads((ROOT / "blueprints/commercial/github-supervisor-app-manifest.example.json").read_text(encoding="utf-8"))
    if supervisor_manifest.get("role") != "repository_supervisor_app":
        fail("Supervisor GitHub App manifest must declare repository_supervisor_app role")
    supervisor_permissions = supervisor_manifest.get("repository_permissions", {})
    for permission, level in (("metadata", "read"), ("contents", "write"), ("pull_requests", "write"), ("checks", "read"), ("statuses", "read"), ("workflows", "write")):
        if supervisor_permissions.get(permission) != level:
            fail(f"Supervisor GitHub App manifest missing least-privilege permission: {permission}:{level}")
    if "administration" in supervisor_permissions:
        fail("Supervisor GitHub App must not request Administration permission by default")
    vendor_boundary = json.loads((ROOT / "config/licensing/vendor-source-boundary.json").read_text(encoding="utf-8"))
    if "blueprints/commercial/github-supervisor-app-manifest.example.json" not in vendor_boundary.get("vendor_only_paths", []):
        fail("Supervisor GitHub App blueprint must remain vendor-only")

    catalog = json.loads((ROOT / "config/licensing/product-catalog.json").read_text(encoding="utf-8"))
    plans_source = text("lib/plans.ts")
    for plan in catalog.get("plans", []):
        plan_id = plan.get("id")
        if plan_id and f"{plan_id}:" not in plans_source:
            fail(f"commercial runtime plan map missing catalog plan: {plan_id}")
        for entitlement in plan.get("entitlements", []):
            if entitlement not in plans_source:
                fail(f"commercial runtime plan features missing catalog entitlement: {plan_id}:{entitlement}")
        if "standard_provider_adapters" in plan.get("entitlements", []):
            fail(f"core provider compatibility must not be sold as paid entitlement: {plan_id}")

    control = json.loads((ROOT / "config/security/control-plane-policy.json").read_text(encoding="utf-8"))
    if "/commercial-service/**" not in control.get("protected_paths", []):
        fail("commercial service must be a protected control-plane path")
    ownership = json.loads((ROOT / "config/github/path-ownership.json").read_text(encoding="utf-8"))
    if not any(rule.get("pattern") == "/commercial-service/**" and rule.get("independent_review_required") is True for rule in ownership.get("rules", [])):
        fail("commercial service must require independent protected review")
    codeowners = (ROOT / ".github/CODEOWNERS").read_text(encoding="utf-8")
    if "/commercial-service/" not in codeowners:
        fail("source CODEOWNERS must protect commercial-service")

    bootstrap = (ROOT / "scripts/bootstrap_child.py").read_text(encoding="utf-8")
    if "commercial-service" not in bootstrap or "shutil.rmtree" not in bootstrap:
        fail("canonical child bootstrap must strip vendor-only commercial service")

    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for marker in ("commercial-service/node_modules/", "commercial-service/.next/", "commercial-service/.vercel/"):
        if marker not in ignore:
            fail(f".gitignore missing commercial service generated path: {marker}")

    if any((SERVICE / name).exists() for name in (".env", ".vercel", "node_modules", ".next")):
        fail("commercial service source must not contain local secrets/build/runtime artifacts")

    if ERRORS:
        print("ANPOS commercial service validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("ANPOS commercial service static checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
