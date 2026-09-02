import { randomUUID } from "node:crypto";
import { requireOperator } from "@/lib/auth";
import { reconcileEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { requireOperator(request); }
  catch { return Response.json({ ok: false, error: "unauthorized" }, { status: 401 }); }

  let body: { account_id?: number } = {};
  try { body = await request.json(); } catch {}
  const accountId = Number(body.account_id ?? 0);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return Response.json({ ok: false, error: "valid_account_id_required" }, { status: 400 });
  }
  try {
    const result = await reconcileEntitlement(accountId, request.headers.get("x-request-id") ?? randomUUID());
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch {
    return Response.json({ ok: false, error: "reconciliation_failed" }, { status: 503 });
  }
}
