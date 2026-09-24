CREATE TABLE IF NOT EXISTS repository_write_plans (
  plan_id UUID PRIMARY KEY,
  github_repository_id BIGINT NOT NULL,
  repository_full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  expected_target_head_sha TEXT NOT NULL,
  created_by_github_user_id BIGINT NOT NULL,
  billing_account_id BIGINT NOT NULL,
  plan_digest_sha256 TEXT NOT NULL,
  changes_ciphertext TEXT NOT NULL,
  change_count INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  commit_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  applied_branch_name TEXT,
  resulting_head_sha TEXT,
  opened_change_request_id BIGINT
);
CREATE INDEX IF NOT EXISTS repository_write_plans_lookup_idx
  ON repository_write_plans(github_repository_id, created_by_github_user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS repository_write_operations (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  plan_id UUID,
  github_repository_id BIGINT NOT NULL,
  created_by_github_user_id BIGINT NOT NULL,
  request_digest_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS repository_write_operations_repo_idx
  ON repository_write_operations(github_repository_id, created_by_github_user_id, created_at DESC);
