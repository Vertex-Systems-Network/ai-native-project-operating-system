import { sha256 } from "@/lib/crypto";
import { db, ensureSchema } from "@/lib/db";
import { reconcilePaddleSubscription } from "@/lib/entitlements";
import { inputErrorResponse, readRawBody, requestIdFrom } from "@/lib/http";
import { verifyPaddleWebhook } from "@/lib/paddle";

export const runtime = "nodejs";

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.trialing",
  "subscription.updated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

function webhookBodyLimit(): number {
  const configured = Number(process.env.ANPOS_MAX_WEBHOOK_BYTES ?? "1048576");
  if (!Number.isFinite(configured)) return 1_048_576;
  return Math.min(Math.max(Math.trunc(configured), 65_536), 2_097_152);
}

export async function POST(request: Request) {
  let raw: Buffer;
  try { raw = await readRawBody(request, webhookBodyLimit()); }
  catch (error) { return inputErrorResponse(error) ?? Response.json({ ok: false, error: "invalid_webhook_body" }, { status: 400 }); }

  if (!verifyPaddleWebhook(raw, request.headers.get("paddle-signature"))) {
    return Response.json({ ok: false, error: "invalid_webhook" }, { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw.toString("utf8")); }
  catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const eventId = String(payload?.event_id ?? "");
  const eventType = String(payload?.event_type ?? "");
  const requestId = requestIdFrom(request);
  if (!/^evt_[a-z\d]{26}$/.test(eventId) || !eventType || eventType.length > 100) {
    return Response.json({ ok: false, error: "invalid_event_identity" }, { status: 422 });
  }
  if (!SUBSCRIPTION_EVENTS.has(eventType)) {
    return Response.json({ ok: true, ignored: true, event_type: eventType.slice(0, 100) }, { status: 200 });
  }

  const subscriptionId = String(payload?.data?.id ?? "");
  if (!/^sub_[a-z\d]{26}$/.test(subscriptionId)) {
    return Response.json({ ok: false, error: "missing_subscription_id" }, { status: 422 });
  }

  await ensureSchema();
  const digest = sha256(raw);
  const claimed = await db().query(
    `INSERT INTO billing_provider_deliveries(
       provider,event_id,event_type,payload_sha256,status,attempts,processing_started_at
     ) VALUES ('paddle',$1,$2,$3,'processing',1,NOW())
     ON CONFLICT (provider,event_id) DO UPDATE SET
       status='processing',
       attempts=COALESCE(billing_provider_deliveries.attempts,0)+1,
       processing_started_at=NOW(),
       error=NULL
     WHERE billing_provider_deliveries.payload_sha256=EXCLUDED.payload_sha256
       AND (
         billing_provider_deliveries.status IN ('received','error')
         OR (
           billing_provider_deliveries.status='processing'
           AND billing_provider_deliveries.processing_started_at < NOW() - interval '15 minutes'
         )
       )
     RETURNING event_id,status,attempts`,
    [eventId, eventType, digest],
  );

  if (!claimed.rowCount) {
    const existing = await db().query(
      "SELECT payload_sha256,status FROM billing_provider_deliveries WHERE provider='paddle' AND event_id=$1",
      [eventId],
    );
    const row = existing.rows[0];
    if (!row || row.payload_sha256 !== digest) {
      return Response.json({ ok: false, error: "event_id_payload_mismatch", request_id: requestId }, { status: 409 });
    }
    if (row.status === "completed") return Response.json({ ok: true, duplicate: true }, { status: 200 });
    return Response.json({ ok: true, already_processing: true }, { status: 202 });
  }

  try {
    const result = await reconcilePaddleSubscription(subscriptionId, requestId);
    await db().query(
      "UPDATE billing_provider_deliveries SET status='completed',processed_at=NOW(),result=$3,error=NULL WHERE provider='paddle' AND event_id=$1 AND event_type=$2",
      [eventId, eventType, JSON.stringify({ state: result.state, account_id: result.github_account_id })],
    );
    return Response.json({
      ok: true,
      billing_provider: "paddle",
      account_id: result.github_account_id,
      state: result.state,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "unknown_error";
    await db().query(
      "UPDATE billing_provider_deliveries SET status='error',processed_at=NOW(),result='error',error=$3 WHERE provider='paddle' AND event_id=$1 AND event_type=$2",
      [eventId, eventType, message],
    );
    return Response.json({ ok: false, error: "reconciliation_failed", request_id: requestId }, { status: 503 });
  }
}
