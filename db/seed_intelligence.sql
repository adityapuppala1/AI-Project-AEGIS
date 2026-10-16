-- Deterministic fixture IDs; rerunnable on existing Windows Docker volumes.
-- Times intentionally represent SIMULATED, HISTORICAL observations, never live conditions.
INSERT INTO exercise_incident_events
    (id, incident_id, event_type, occurred_at, summary, actor_label)
VALUES
    ('a1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
     'observation', NOW() - INTERVAL '4 hours',
     'SIMULATION: an exercise water-level observation was added to the case.', 'Exercise sensor fixture'),
    ('a1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
     'assessment', NOW() - INTERVAL '3 hours',
     'SIMULATION: the operator flagged this waterlogging scenario for corroboration.', 'Exercise control desk'),
    ('a1000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
     'coordination', NOW() - INTERVAL '2 hours',
     'SIMULATION: a draft interdepartmental coordination note was prepared; nothing was dispatched.', 'Exercise facilitator'),
    ('a1000000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
     'observation', NOW() - INTERVAL '5 hours',
     'SIMULATION: heavy-rainfall test case was opened from a synthetic observation.', 'Exercise weather feed'),
    ('a1000000-0000-4000-8000-000000000005', '44444444-4444-4444-8444-444444444444',
     'assessment', NOW() - INTERVAL '6 hours',
     'SIMULATION: possible drainage obstruction was marked for training review.', 'Exercise control desk'),
    ('a1000000-0000-4000-8000-000000000006', '55555555-5555-4555-8555-555555555555',
     'observation', NOW() - INTERVAL '3 hours',
     'SIMULATION: a roadway inundation exercise report was attached to the incident.', 'Exercise incident fixture'),
    ('a1000000-0000-4000-8000-000000000007', '66666666-6666-4666-8666-666666666666',
     'resolution', NOW() - INTERVAL '7 hours',
     'SIMULATION: water-level training scenario was marked resolved; no field response took place.', 'Exercise facilitator')
ON CONFLICT (id) DO NOTHING;

INSERT INTO exercise_incident_evidence
    (id, incident_id, source_label, source_kind, summary, observed_at, ingested_at, quality_status)
VALUES
    ('b2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
     'AEGIS synthetic rain gauge A1', 'exercise_sensor',
     'Synthetic rain-gauge sample for training. NOT a measurement of Hyderabad conditions.',
     NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours 55 minutes', 'synthetic_curated'),
    ('b2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
     'AEGIS mock municipal report', 'exercise_report',
     'Fictional waterlogging desk report; an operator must verify any analogous real-world report.',
     NOW() - INTERVAL '3 hours 45 minutes', NOW() - INTERVAL '3 hours 42 minutes', 'synthetic_unverified'),
    ('b2000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333',
     'AEGIS simulated weather feed', 'exercise_sensor',
     'Synthetic rainfall fixture for a repeatable hackathon demonstration.',
     NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours 57 minutes', 'synthetic_curated'),
    ('b2000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444',
     'AEGIS training infrastructure layer', 'exercise_gis',
     'Fictional blockage hint; does not represent a verified drainage-asset location.',
     NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 50 minutes', 'synthetic_unverified'),
    ('b2000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555',
     'AEGIS mock road observation', 'exercise_report',
     'Exercise-only roadway inundation note without real camera imagery or people.',
     NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours 57 minutes', 'synthetic_unverified')
ON CONFLICT (id) DO NOTHING;
