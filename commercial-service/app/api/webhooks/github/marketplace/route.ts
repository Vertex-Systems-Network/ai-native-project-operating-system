import { randomUUID } from "node:crypto";
import { db, ensureSchema } from "@/lib/db";
import { sha256, verifyGithubWebhook } from "@/lib/crypto";
import { reconcileEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-hub-signature-256");
  const deliveryId = request.headers.get("x-github-delivery");
  const eventName = request.headers.get("x-github-event");
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  if (!deliveryId || !eventName || !verifyGithubWebhook(raw, signature)) {
    return Response.json({ ok: false, error: "invalid_webhook" }, { status: 401 });
  }
  if (eventName !== "marketplace_purchase") {
    return Response.json({ ok: true, ignored: true }, { status: 200 });
  }

  let payload: any;
  try { payload = JSON.parse(raw.toString("utf8")); }
  catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const action = String(payload?.action ?? "");
  if (!new Set(["purchased", "changed", "cancelled"]).has(action)) {
    return Response.json({ ok: true, ignored: true, action }, { status: 200 });
  }
  const accountId = Number(payload?.marketplace_purchase?.account?.id ?? payload?.marketplace_purchase?.id ?? 0);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return Response.json({ ok: false, error: "missing_account_id" }, { status: 422 });
  }

  await ensureSchema();
  const inserted = await db().query(
    `INSERT INTO marketplace_deliveries(delivery_id,event_name,action,github_account_id,payload_sha256)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (delivery_id) DO NOTHING RETURNING delivery_id`,
    [deliveryId, eventName, action, accountId, sha256(raw)],
  );
  if (!inserted.rowCount) return Response.json({ ok: true, duplicate: true }, { status: 200 });

  try {
    const result = await reconcileEntitlement(accountId, requestId);
    await db().query("UPDATE marketplace_deliveries SET processed_at=NOW(),result=$2 WHERE delivery_id=$1", [deliveryId, JSON.stringify(result.state)]);
    return Response.json({ ok: true, account_id: accountId, state: result.state }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "unknown_error";
    await db().query("UPDATE marketplace_deliveries SET processed_at=NOW(),result='error',error=$2 WHERE delivery_id=$1", [deliveryId, message]);
    return Response.json({ ok: false, error: "reconciliation_failed", request_id: requestId }, { status: 503 });
  }
}
