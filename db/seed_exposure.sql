-- SYNTHETIC exposure seed for the Hyderabad training area (roadmap A3). Requires 015_exposure.sql.
-- Every row is fictional (synthetic = true): names, positions and population counts are invented
-- teaching values that do NOT identify real hospitals, schools, shelters, roads or residents and are
-- NOT census or WorldPop data. Idempotent: fixed ids and ON CONFLICT DO NOTHING.
--
-- Placement is deliberate so impact rules can be rehearsed: the central grid point (17.40, 78.47) and
-- the Musi city reach have exposure, the downstream point (17.30, 78.60) has a little, and the other
-- pilot grid points have none (their impact state is clear whatever the hazard).
INSERT INTO exposure_features (id, kind, name, geom, count, weight, source, source_ref, licence, attribution,
                               synthetic, provenance_sha256, import_batch)
SELECT v.id::uuid, v.kind, v.name, ST_SetSRID(ST_GeomFromText(v.wkt), 4326), v.count, v.weight,
       'aegis_synthetic_exposure_v1', NULL, 'Synthetic AEGIS exercise fixture (no real-world data)',
       'AEGIS synthetic exercise data; not real facilities or population', true,
       encode(sha256(convert_to('aegis-synthetic-exposure-v1:' || v.id, 'UTF8')), 'hex'), 'synthetic-seed-v1'
FROM (VALUES
  ('e6000000-0000-4000-8000-000000000001', 'hospital', 'Fictional care facility Alpha (synthetic)', 'POINT(78.4502 17.4049)', 1, 1.0),
  ('e6000000-0000-4000-8000-000000000002', 'school', 'Fictional school Kappa (synthetic)', 'POINT(78.4720 17.3980)', 1, 1.0),
  ('e6000000-0000-4000-8000-000000000003', 'school', 'Fictional school Lambda (synthetic)', 'POINT(78.4810 17.4105)', 1, 1.0),
  ('e6000000-0000-4000-8000-000000000004', 'shelter', 'Fictional temporary shelter Gamma (synthetic)', 'POINT(78.4650 17.4110)', 1, 1.0),
  ('e6000000-0000-4000-8000-000000000005', 'road_segment', 'Fictional arterial segment Beta (synthetic)', 'LINESTRING(78.4560 17.4000, 78.4700 17.4040, 78.4840 17.4080)', 1, 2.0),
  ('e6000000-0000-4000-8000-000000000006', 'road_segment', 'Fictional bridge approach Epsilon (synthetic)', 'LINESTRING(78.4690 17.3680, 78.4720 17.3600)', 1, 3.0),
  ('e6000000-0000-4000-8000-000000000007', 'population_cell', 'Synthetic population cell C1', 'POLYGON((78.460 17.395, 78.470 17.395, 78.470 17.405, 78.460 17.405, 78.460 17.395))', 9000, 1.0),
  ('e6000000-0000-4000-8000-000000000008', 'population_cell', 'Synthetic population cell C2', 'POLYGON((78.470 17.395, 78.480 17.395, 78.480 17.405, 78.470 17.405, 78.470 17.395))', 12000, 1.0),
  ('e6000000-0000-4000-8000-000000000009', 'population_cell', 'Synthetic population cell C3', 'POLYGON((78.460 17.405, 78.470 17.405, 78.470 17.415, 78.460 17.415, 78.460 17.405))', 8000, 1.0),
  ('e6000000-0000-4000-8000-000000000010', 'population_cell', 'Synthetic population cell C4', 'POLYGON((78.470 17.405, 78.480 17.405, 78.480 17.415, 78.470 17.415, 78.470 17.405))', 6000, 1.0),
  ('e6000000-0000-4000-8000-000000000011', 'population_cell', 'Synthetic population cell M1 (Musi reach)', 'POLYGON((78.465 17.360, 78.475 17.360, 78.475 17.370, 78.465 17.370, 78.465 17.360))', 7000, 1.0),
  ('e6000000-0000-4000-8000-000000000012', 'school', 'Fictional school Mu (synthetic)', 'POINT(78.6020 17.3030)', 1, 1.0),
  ('e6000000-0000-4000-8000-000000000013', 'population_cell', 'Synthetic population cell D1 (downstream)', 'POLYGON((78.595 17.295, 78.605 17.295, 78.605 17.305, 78.595 17.305, 78.595 17.295))', 4000, 1.0)
) AS v(id, kind, name, wkt, count, weight)
ON CONFLICT (id) DO NOTHING;
