import { remoteSandboxConfig, remoteSandboxConfigurationProblems } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const problems = remoteSandboxConfigurationProblems();
  if (problems.length) {
    return Response.json({
      ok: false,
      mode: "repository_supervisor_sandbox",
      problems,
      live_gateway_probe: "not_performed_by_readiness_endpoint",
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cfg = remoteSandboxConfig();
  return Response.json({
    ok: true,
    mode: "repository_supervisor_sandbox",
    driver: {
      id: cfg.driverId,
      isolation: "remote_ephemeral",
      protocol_version: 2,
      endpoint_host: new URL(cfg.endpoint).host,
      request_authentication: "hmac_sha256_body_hash_timestamp_nonce",
      response_authentication: "hmac_sha256_request_id_body_hash",
      workspace: "ephemeral_copy_on_write_destroy_after_execution",
      source_binding: "github_repository_plus_immutable_commit_sha_or_explicit_empty",
      artifact_channel: "signed_bounded_input_files_plus_exact_output_allowlist",
      runtime_requirements: ["python3>=3.12"],
      network: "deny",
      secret_values_in_model_request: false,
    },
    source_driver_ready: true,
    live_gateway_probe: "not_performed_by_readiness_endpoint",
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
