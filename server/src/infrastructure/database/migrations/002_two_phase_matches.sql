ALTER TABLE match_runs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cache_key TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS result_payload JSONB;

UPDATE match_runs
SET status = 'complete'
WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_runs_status_check'
  ) THEN
    ALTER TABLE match_runs
      ADD CONSTRAINT match_runs_status_check
      CHECK (status IN ('ranking_ready', 'explaining', 'complete', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS match_runs_cache_key_idx
  ON match_runs (cache_key, status, updated_at DESC);
