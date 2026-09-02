import { randomUUID } from "node:crypto";
import { requireGithubAccountAccess } from "@/lib/auth";
import { db, ensureSchema, transaction } from "@/lib/db";
import { getEntitlement, reconcileEntitlement } from "@/lib/entitlements";
import { inviteTemplateCollaborator } from "@/lib/github";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return Response.json({ ok: false, error: "valid_idempotency-key_required" }, { status: 400 });
  }
  let body: { account_id?: number } = {};
  try { body = await request.json(); } catch {}
  const accountId = Number(body.account_id ?? 0);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) return Response.json({ ok: false, error: "valid_account_id_required" }, { status: 400 });

  await ensureSchema();
  const current = await getEntitlement(accountId);
  if (!current) return Response.json({ ok: false, error: "entitlement_not_found" }, { status: 404 });
  try { await requireGithubAccountAccess(request, current); }
  catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED_GITHUB";
    return Response.json({ ok: false, error: code.toLowerCase() }, { status: code.startsWith("FORBIDDEN") ? 403 : 401 });
  }

  const existingRequest = await db().query("SELECT status,result FROM provisioning_requests WHERE idempotency_key=$1", [idempotencyKey]);
  if (existingRequest.rowCount) return Response.json({ ok: existingRequest.rows[0].status === "completed", replay: true, result: existingRequest.rows[0].result }, { status: 200 });

  const refreshed = await reconcileEntitlement(accountId, request.headers.get("x-request-id") ?? randomUUID());
  if (!["active", "trial", "grace"].includes(refreshed.state) || !refreshed.entitlements?.includes("private_template_access")) {
    return Response.json({ ok: false, error: "private_template_not_entitled" }, { status: 403 });
  }
  const verified = await getEntitlement(accountId);
  if (!verified) return Response.json({ ok: false, error: "entitlement_not_found_after_reconcile" }, { status: 503 });
  if (verified.github_account_type !== "User") {
    return Response.json({ ok: false, error: "organization_seat_assignment_required" }, { status: 409 });
  }

  await db().query(
    "INSERT INTO provisioning_requests(idempotency_key,github_account_id,action,status) VALUES ($1,$2,'private_template_access','processing')",
    [idempotencyKey, accountId],
  );
  try {
    const result = await inviteTemplateCollaborator(verified.github_login);
    await transaction(async (client) => {
      await client.query("UPDATE provisioning_requests SET status='completed',result=$2::jsonb,completed_at=NOW() WHERE idempotency_key=$1", [idempotencyKey, JSON.stringify(result)]);
      await client.query("INSERT INTO commercial_audit_log(request_id,event_type,github_account_id,metadata) VALUES ($1,'private_template_access_provisioned',$2,$3::jsonb)", [idempotencyKey, accountId, JSON.stringify({ repository: result.repository })]);
    });
    return Response.json({ ok: true, provisioned: true, repository: result.repository, invitation_status: result.status }, { status: result.status === 201 ? 202 : 200 });
  } catch {
    await db().query("UPDATE provisioning_requests SET status='failed',result=$2::jsonb,completed_at=NOW() WHERE idempotency_key=$1", [idempotencyKey, JSON.stringify({ error: "provisioning_failed" })]);
    return Response.json({ ok: false, error: "provisioning_failed" }, { status: 503 });
  }
}
