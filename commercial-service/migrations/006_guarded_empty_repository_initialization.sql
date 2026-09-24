ALTER TABLE repository_supervisor_write_plans
  ADD COLUMN IF NOT EXISTS initialization_seed_sha TEXT,
  ADD COLUMN IF NOT EXISTS initialization_seed_path TEXT;

ALTER TABLE repository_supervisor_write_plans
  ADD CONSTRAINT repository_supervisor_write_plans_initialization_seed_sha_shape
  CHECK (
    initialization_seed_sha IS NULL
    OR initialization_seed_sha ~ '^[0-9a-f]{40}$'
  );

ALTER TABLE repository_supervisor_write_plans
  ADD CONSTRAINT repository_supervisor_write_plans_initialization_seed_pair
  CHECK (
    (initialization_seed_sha IS NULL AND initialization_seed_path IS NULL)
    OR (
      initialization_seed_sha IS NOT NULL
      AND initialization_seed_path = '.anpos-bootstrap-seed'
    )
  );
