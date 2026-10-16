-- Synthetic spatial correlation only. This is not a real infrastructure map.
-- Source locations may be NULL; exclude unknown location from all matching.
ALTER TABLE exercise_data_sources ADD COLUMN IF NOT EXISTS location GEOMETRY(Point,4326);
CREATE INDEX IF NOT EXISTS exercise_data_sources_geom_idx
    ON exercise_data_sources USING GIST (location);

CREATE TABLE IF NOT EXISTS exercise_geo_assets (
    id UUID PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id),
    asset_name TEXT NOT NULL CHECK (length(asset_name) BETWEEN 3 AND 160),
    asset_kind TEXT NOT NULL CHECK (asset_kind IN ('exercise_hospital', 'exercise_road', 'exercise_shelter', 'exercise_drainage')),
    location GEOMETRY(Point,4326) NOT NULL,
    synthetic BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic IS TRUE),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS exercise_geo_assets_geom_idx
    ON exercise_geo_assets USING GIST (location);
CREATE INDEX IF NOT EXISTS exercise_geo_assets_agency_idx
    ON exercise_geo_assets (agency_id, asset_kind);
