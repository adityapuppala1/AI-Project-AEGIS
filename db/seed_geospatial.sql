-- Fictional geographic teaching fixtures; map coordinates are approximate
-- demonstration points and do NOT identify real hospitals, roads, shelters or
-- drainage assets. Never interpret these as official GIS layers.
UPDATE exercise_data_sources
SET location = ST_SetSRID(ST_MakePoint(78.4510,17.4055),4326)
WHERE id='c3000000-0000-4000-8000-000000000001'
  AND agency_id='11111111-1111-4111-8111-111111111111' AND synthetic IS TRUE;

UPDATE exercise_data_sources
SET location = ST_SetSRID(ST_MakePoint(78.4890,17.3870),4326)
WHERE id='c3000000-0000-4000-8000-000000000002'
  AND agency_id='11111111-1111-4111-8111-111111111111' AND synthetic IS TRUE;

UPDATE exercise_data_sources
SET location = ST_SetSRID(ST_MakePoint(78.4690,17.4260),4326)
WHERE id='c3000000-0000-4000-8000-000000000003'
  AND agency_id='11111111-1111-4111-8111-111111111111' AND synthetic IS TRUE;

-- D4 deliberately has no location: unknown geography cannot be correlated.
UPDATE exercise_data_sources SET location = NULL
WHERE id='c3000000-0000-4000-8000-000000000004'
  AND agency_id='11111111-1111-4111-8111-111111111111' AND synthetic IS TRUE;

INSERT INTO exercise_geo_assets (id, agency_id, asset_name, asset_kind, location)
VALUES
('e5000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
 'Fictional care facility Alpha', 'exercise_hospital', ST_SetSRID(ST_MakePoint(78.4502,17.4049),4326)),
('e5000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
 'Fictional road junction Beta', 'exercise_road', ST_SetSRID(ST_MakePoint(78.4610,17.4084),4326)),
('e5000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
 'Fictional temporary shelter Gamma', 'exercise_shelter', ST_SetSRID(ST_MakePoint(78.4894,17.3833),4326)),
('e5000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
 'Fictional drainage point Delta', 'exercise_drainage', ST_SetSRID(ST_MakePoint(78.4694,17.4227),4326)),
('e5000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111',
 'Fictional road crossing Epsilon', 'exercise_road', ST_SetSRID(ST_MakePoint(78.5079,17.3706),4326))
ON CONFLICT (id) DO NOTHING;
