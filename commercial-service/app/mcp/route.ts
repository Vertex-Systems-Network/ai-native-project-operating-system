import { readJsonBody } from "@/lib/http";
import { authenticateMcpRequest, mcpBearerChallenge } from "@/lib/mcp-auth";
import { handleMcpRpc } from "@/lib/mcp-runtime";

export const runtime = "nodejs";

function authFailure(description: string): Response {
  return Response.json({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32001, message: "Unauthorized" },
  }, {
    status: 401,
    headers: {
      "WWW-Authenticate": mcpBearerChallenge("invalid_token", description),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let principal;
  try {
    principal = await authenticateMcpRequest(request);
  } catch {
    return authFailure("Connect the ANPOS Repository Supervisor account to continue.");
  }

  try {
    const body = await readJsonBody<unknown>(request, 65_536);
    const result = await handleMcpRpc(body, principal);
    if (!result.body) {
      return new Response(null, { status: result.status, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(result.body, {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Internal error" },
    }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function GET() {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: "POST",
      "Cache-Control": "no-store",
    },
  });
}
