ALTER TABLE repository_supervisor_write_plans
  ALTER COLUMN expected_target_head_sha DROP NOT NULL;

ALTER TABLE repository_supervisor_write_plans
  ADD CONSTRAINT repository_supervisor_write_plans_expected_head_shape
  CHECK (
    expected_target_head_sha IS NULL
    OR expected_target_head_sha ~ '^[0-9a-f]{40}$'
  );

CREATE INDEX IF NOT EXISTS repository_supervisor_write_plans_mode_status_idx
  ON repository_supervisor_write_plans(mode, status, expires_at DESC);
