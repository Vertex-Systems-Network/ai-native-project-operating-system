import { createMcpAuthorizationStart } from "@/lib/mcp-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const start = createMcpAuthorizationStart(new URL(request.url));
    return new Response(null, {
      status: 303,
      headers: {
        Location: start.githubAuthorizeUrl,
        "Set-Cookie": start.stateCookie,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.toLowerCase() : "mcp_oauth_authorization_invalid";
    return Response.json({ ok: false, error: code }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
