import { remoteSandboxConfigurationProblems } from "@/lib/env";
import { SandboxRequestError } from "@/lib/execution-sandbox";
import { runProductionSandboxLiveProbe } from "@/lib/sandbox-live-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json(
      { ok: false, error: "sandbox_live_probe_production_only" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (request.headers.get("x-anpos-sandbox-live-probe") !== "1") {
    return Response.json(
      { ok: false, error: "sandbox_live_probe_explicit_trigger_required" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const problems = remoteSandboxConfigurationProblems();
  if (problems.length) {
    return Response.json(
      { ok: false, mode: "repository_supervisor_sandbox_live", problems },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const evidence = await runProductionSandboxLiveProbe();
    return Response.json(
      {
        ok: true,
        mode: "repository_supervisor_sandbox_live",
        evidence,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof SandboxRequestError
      ? error.code
      : "sandbox_live_probe_internal_error";
    return Response.json(
      { ok: false, mode: "repository_supervisor_sandbox_live", error: code },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
