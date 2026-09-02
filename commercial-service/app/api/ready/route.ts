import { db, ensureSchema } from "@/lib/db";
import { missingConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const missing = missingConfig();
  if (!process.env.ANPOS_MARKETPLACE_PLAN_MAP) missing.push("ANPOS_MARKETPLACE_PLAN_MAP");
  if (missing.length) {
    return Response.json({ ok: false, status: "not_configured", missing }, { status: 503 });
  }
  try {
    await ensureSchema();
    await db().query("SELECT 1");
    return Response.json({ ok: true, status: "ready" }, { status: 200 });
  } catch {
    return Response.json({ ok: false, status: "database_unavailable" }, { status: 503 });
  }
}
