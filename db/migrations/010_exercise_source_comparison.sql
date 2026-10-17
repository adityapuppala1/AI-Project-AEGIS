-- Explicit synthetic comparison policy. Nullable means the source is not
-- comparable; all fields are required together to prevent inferred matching.
ALTER TABLE exercise_data_sources
  ADD COLUMN IF NOT EXISTS comparison_group TEXT,
  ADD COLUMN IF NOT EXISTS comparison_window_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS comparison_tolerance NUMERIC;

ALTER TABLE exercise_data_sources DROP CONSTRAINT IF EXISTS exercise_source_comparison_complete;
ALTER TABLE exercise_data_sources ADD CONSTRAINT exercise_source_comparison_complete CHECK (
  (comparison_group IS NULL AND comparison_window_seconds IS NULL AND comparison_tolerance IS NULL)
  OR
  (comparison_group ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
   AND comparison_window_seconds BETWEEN 60 AND 86400
   AND comparison_tolerance >= 0 AND comparison_tolerance <= 1000000)
);

CREATE INDEX IF NOT EXISTS exercise_sources_comparison_group_idx
  ON exercise_data_sources(agency_id, comparison_group)
  WHERE comparison_group IS NOT NULL;
