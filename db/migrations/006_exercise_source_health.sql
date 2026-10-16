-- Synthetic source registry. This is NOT an operational integration registry.
CREATE TABLE IF NOT EXISTS exercise_data_sources (
  id UUID PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 160),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('rain_gauge','water_level','field_report','drainage_status')),
  metric_label TEXT NOT NULL,
  metric_unit TEXT NOT NULL,
  expected_interval_seconds INTEGER NOT NULL CHECK (expected_interval_seconds BETWEEN 60 AND 86400),
  warning_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5 CHECK (warning_multiplier >= 1 AND warning_multiplier <= 10),
  stale_multiplier NUMERIC(4,2) NOT NULL DEFAULT 4 CHECK (stale_multiplier > warning_multiplier AND stale_multiplier <= 50),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS exercise_sources_agency_idx ON exercise_data_sources(agency_id, name);

CREATE TABLE IF NOT EXISTS exercise_source_samples (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES exercise_data_sources(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  metric_value NUMERIC(12,3) NOT NULL CHECK (metric_value >= 0),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('synthetic_curated','synthetic_unverified')),
  synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE),
  CHECK (ingested_at >= observed_at)
);
CREATE INDEX IF NOT EXISTS exercise_source_samples_time_idx
  ON exercise_source_samples (source_id, observed_at DESC, id DESC);
