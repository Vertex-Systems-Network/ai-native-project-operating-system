import { sandboxGatewayConfigurationProblems } from "@/lib/env";
import { handleSandboxGatewayRequest, SandboxGatewayError } from "@/lib/vercel-sandbox-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const problems = sandboxGatewayConfigurationProblems();
  if (problems.length) {
    return Response.json(
      { ok: false, error: "sandbox_gateway_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    return await handleSandboxGatewayRequest(request);
  } catch (error) {
    if (error instanceof SandboxGatewayError) {
      return Response.json(
        { ok: false, error: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { ok: false, error: "sandbox_gateway_internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
