-- Exercise incident query indexes, applied idempotently to fresh and existing dev volumes.
-- Trigram GIN index assists ILIKE searches as data grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS incidents_hazard_type_trgm_idx
  ON incidents USING GIN (hazard_type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS incidents_status_created_idx
  ON incidents (status, created_at DESC);
