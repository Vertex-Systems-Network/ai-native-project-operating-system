CREATE TABLE IF NOT EXISTS sandbox_gateway_request_nonces (
  nonce TEXT PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  driver_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT sandbox_gateway_request_nonces_nonce_shape
    CHECK (nonce ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT sandbox_gateway_request_nonces_driver_shape
    CHECK (driver_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,100}$'),
  CONSTRAINT sandbox_gateway_request_nonces_expiry_order
    CHECK (expires_at > received_at)
);

CREATE INDEX IF NOT EXISTS sandbox_gateway_request_nonces_expires_at_idx
  ON sandbox_gateway_request_nonces(expires_at);
