import { Pool, type PoolClient } from "pg";
import { serviceConfig } from "./env";

let pool: Pool | null = null;
let schemaReady = false;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: serviceConfig().databaseUrl, max: 5, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await db().query(`
    CREATE TABLE IF NOT EXISTS marketplace_deliveries (
      delivery_id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      action TEXT,
      github_account_id BIGINT,
      payload_sha256 TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      result TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      github_account_id BIGINT PRIMARY KEY,
      github_login TEXT NOT NULL,
      github_account_type TEXT NOT NULL,
      license_id UUID NOT NULL,
      plan_id TEXT NOT NULL,
      marketplace_plan_id BIGINT,
      seats INTEGER,
      state TEXT NOT NULL,
      features JSONB NOT NULL DEFAULT '[]'::jsonb,
      billing_cycle TEXT,
      issued_at TIMESTAMPTZ NOT NULL,
      not_before TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ,
      billing_updated_at TIMESTAMPTZ,
      signed_envelope JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS provisioning_requests (
      idempotency_key TEXT PRIMARY KEY,
      github_account_id BIGINT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS commercial_audit_log (
      id BIGSERIAL PRIMARY KEY,
      request_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      github_account_id BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS commercial_audit_account_idx ON commercial_audit_log(github_account_id, created_at DESC);
  `);
  schemaReady = true;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
