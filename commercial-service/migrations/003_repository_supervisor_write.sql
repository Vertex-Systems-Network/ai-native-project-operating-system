CREATE TABLE IF NOT EXISTS repository_supervisor_write_plans (
  plan_id TEXT PRIMARY KEY,
  github_user_id BIGINT NOT NULL,
  github_login TEXT NOT NULL,
  billing_account_id BIGINT NOT NULL,
  canonical_repository_id TEXT NOT NULL,
  repository_full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  expected_target_head_sha TEXT NOT NULL,
  mode TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  applied_branch TEXT,
  applied_head_sha TEXT,
  pull_request_number BIGINT,
  merge_commit_sha TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS repository_supervisor_write_plans_owner_idx
  ON repository_supervisor_write_plans(github_user_id, billing_account_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS repository_supervisor_write_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES repository_supervisor_write_plans(plan_id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS repository_supervisor_write_idempotency_plan_idx
  ON repository_supervisor_write_idempotency(plan_id, operation, created_at DESC);
