CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  code_challenge TEXT NOT NULL,
  github_user_id BIGINT NOT NULL,
  github_login TEXT NOT NULL,
  github_access_token_ciphertext TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_codes_expiry_idx
  ON mcp_oauth_authorization_codes(expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS mcp_oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  github_user_id BIGINT NOT NULL,
  github_login TEXT NOT NULL,
  github_access_token_ciphertext TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_access_tokens_expiry_idx
  ON mcp_oauth_access_tokens(expires_at, revoked_at);
