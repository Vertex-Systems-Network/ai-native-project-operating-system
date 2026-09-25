ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'github_marketplace',
  ADD COLUMN IF NOT EXISTS billing_provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_provider_price_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_provider_status TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_billing_provider_subscription_idx
  ON entitlements(billing_provider, billing_provider_subscription_id)
  WHERE billing_provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_provider_deliveries (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  attempts INTEGER NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  result TEXT,
  error TEXT,
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS billing_provider_deliveries_status_idx
  ON billing_provider_deliveries(provider, status, received_at DESC);
