-- Idempotent exercise source fixtures. These readings are created only once
-- per UUID; their age increases naturally until the database is reset.
-- NO physical device, official API, or external data feed is connected.
INSERT INTO exercise_data_sources
 (id,agency_id,name,source_kind,metric_label,metric_unit,expected_interval_seconds,warning_multiplier,stale_multiplier)
VALUES
 ('c3000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Rain Gauge A1 (simulation)','rain_gauge','Rainfall accumulation','mm',900,1.5,4),
 ('c3000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  'Water Level B2 (simulation)','water_level','Water depth','cm',600,1.5,4),
 ('c3000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
  'Field Report C3 (simulation)','field_report','Reports received','reports',1800,1.5,4),
 ('c3000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
  'Drainage Status D4 (simulation)','drainage_status','Reported blockages','reports',3600,1.5,4)
ON CONFLICT (id) DO NOTHING;

-- Comparison is opt-in and only joins like-for-like synthetic measurements.
-- A2 provides a second explicitly compatible rainfall observation.
INSERT INTO exercise_data_sources
 (id,agency_id,name,source_kind,metric_label,metric_unit,expected_interval_seconds,warning_multiplier,stale_multiplier,
  comparison_group,comparison_window_seconds,comparison_tolerance)
VALUES
 ('c3000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111',
  'Rain Gauge A2 (simulation)','rain_gauge','Rainfall accumulation','mm',900,1.5,4,
  'synthetic_rainfall_pair',900,5)
ON CONFLICT (id) DO UPDATE SET
 comparison_group=EXCLUDED.comparison_group,
 comparison_window_seconds=EXCLUDED.comparison_window_seconds,
 comparison_tolerance=EXCLUDED.comparison_tolerance;

UPDATE exercise_data_sources
SET comparison_group='synthetic_rainfall_pair', comparison_window_seconds=900, comparison_tolerance=5
WHERE id='c3000000-0000-4000-8000-000000000001'
  AND agency_id='11111111-1111-4111-8111-111111111111' AND synthetic IS TRUE;

INSERT INTO exercise_source_samples
 (id,source_id,observed_at,ingested_at,metric_value,quality_status)
SELECT md5('AEGIS_RAIN_A2_' || n)::uuid,
       'c3000000-0000-4000-8000-000000000005'::uuid,
       NOW() - INTERVAL '11 minutes' - (8-n) * INTERVAL '12 minutes',
       NOW() - INTERVAL '10 minutes' - (8-n) * INTERVAL '12 minutes',
       9 + 3*n,
       'synthetic_curated'
FROM generate_series(1,8) AS n
ON CONFLICT (id) DO NOTHING;

-- Three sources with 8 historical readings each; source D4 intentionally
-- has no readings to demonstrate a distinct NO DATA state.
INSERT INTO exercise_source_samples
 (id,source_id,observed_at,ingested_at,metric_value,quality_status)
SELECT md5('AEGIS_RAIN_A1_' || n)::uuid,
       'c3000000-0000-4000-8000-000000000001'::uuid,
       NOW() - INTERVAL '10 minutes' - (8-n) * INTERVAL '12 minutes',
       NOW() - INTERVAL '9 minutes' - (8-n) * INTERVAL '12 minutes',
       8 + 3*n,
       'synthetic_curated'
FROM generate_series(1,8) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO exercise_source_samples
 (id,source_id,observed_at,ingested_at,metric_value,quality_status)
SELECT md5('AEGIS_WATER_B2_' || n)::uuid,
       'c3000000-0000-4000-8000-000000000002'::uuid,
       NOW() - INTERVAL '22 minutes' - (8-n) * INTERVAL '10 minutes',
       NOW() - INTERVAL '20 minutes' - (8-n) * INTERVAL '10 minutes',
       41 + 4*n,
       'synthetic_curated'
FROM generate_series(1,8) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO exercise_source_samples
 (id,source_id,observed_at,ingested_at,metric_value,quality_status)
SELECT md5('AEGIS_REPORT_C3_' || n)::uuid,
       'c3000000-0000-4000-8000-000000000003'::uuid,
       NOW() - INTERVAL '150 minutes' - (8-n) * INTERVAL '30 minutes',
       NOW() - INTERVAL '147 minutes' - (8-n) * INTERVAL '30 minutes',
       1 + n,
       'synthetic_unverified'
FROM generate_series(1,8) AS n
ON CONFLICT (id) DO NOTHING;
