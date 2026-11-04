-- Exposure layer for impact-based triggers (roadmap A3). Additive and idempotent; requires PostGIS
-- (schema.sql) and is read by app/impact.py through proactive_store.exposure_within.
--
-- Rows are either the clearly labelled synthetic exercise seed (db/seed_exposure.sql, synthetic=true)
-- or features loaded by the offline importer (app/exposure_import.py) from user-supplied OSM (ODbL)
-- or WorldPop (CC BY 4.0) extracts, with source, licence and attribution recorded per row.
-- Exposure never creates cases, proposals, tasks, approvals or warnings. Counts inside a footprint
-- are rehearsal inputs, not damage, casualty or inundation estimates.
CREATE TABLE IF NOT EXISTS exposure_features (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('hospital','school','shelter','road_segment','population_cell')),
  name TEXT CHECK (name IS NULL OR length(name) <= 200),
  geom geometry(Geometry, 4326) NOT NULL
    CHECK (GeometryType(geom) IN ('POINT','MULTIPOINT','LINESTRING','MULTILINESTRING','POLYGON','MULTIPOLYGON')),
  -- count: people for population_cell, 1 for a facility or road segment.
  count BIGINT NOT NULL DEFAULT 1 CHECK (count >= 0 AND count < 1000000000000),
  weight DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1000),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 200),
  source_ref TEXT CHECK (source_ref IS NULL OR length(source_ref) <= 200),
  licence TEXT NOT NULL CHECK (length(licence) BETWEEN 1 AND 200),
  attribution TEXT CHECK (attribution IS NULL OR length(attribution) <= 300),
  synthetic BOOLEAN NOT NULL,
  provenance_sha256 TEXT NOT NULL CHECK (provenance_sha256 ~ '^[0-9a-f]{64}$'),
  import_batch TEXT NOT NULL CHECK (import_batch ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Real (non-synthetic) rows must carry an attribution line for their licence.
  CHECK (synthetic OR attribution IS NOT NULL)
);

-- Re-running the seed or the importer is idempotent: one row per provenance digest.
CREATE UNIQUE INDEX IF NOT EXISTS exposure_features_provenance_idx ON exposure_features(provenance_sha256);
CREATE INDEX IF NOT EXISTS exposure_features_geography_idx ON exposure_features USING GIST ((geom::geography));
CREATE INDEX IF NOT EXISTS exposure_features_kind_idx ON exposure_features(kind);
