ALTER TABLE repository_supervisor_write_plans
  ADD COLUMN IF NOT EXISTS apply_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS apply_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sandbox_receipt_sha256 TEXT;

CREATE INDEX IF NOT EXISTS repository_supervisor_write_plans_apply_lease_idx
  ON repository_supervisor_write_plans(status, apply_lease_expires_at)
  WHERE status = 'applying';

ALTER TABLE repository_supervisor_write_plans
  ADD CONSTRAINT repository_supervisor_write_plans_sandbox_receipt_shape
  CHECK (
    sandbox_receipt_sha256 IS NULL
    OR sandbox_receipt_sha256 ~ '^[0-9a-f]{64}$'
  );
