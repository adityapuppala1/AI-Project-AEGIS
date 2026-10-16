-- Historical scripted acknowledgements for exercise demonstrations.
-- These are NOT real departmental tasks or notifications. Safe to re-run.
INSERT INTO exercise_agency_tasks (
    id, incident_id, agency_label, task_kind, summary,
    playbook_ref, state, prepared_at, due_at, acknowledged_at, closed_at
) VALUES
(
 'f6000000-0000-4000-8000-000000000001',
 '22222222-2222-4222-8222-222222222222',
 'Fictional drainage liaison', 'desk_review',
 'SIMULATION: Review a fictional waterlogging desk report; no field personnel were assigned.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','acknowledged',
 NOW()-INTERVAL '4 hours', NOW()-INTERVAL '1 hour',
 NOW()-INTERVAL '3 hours',NULL
),
(
 'f6000000-0000-4000-8000-000000000002',
 '22222222-2222-4222-8222-222222222222',
 'Fictional transport desk', 'infrastructure_check_draft',
 'SIMULATION: Draft a roadway condition check for the tabletop exercise; not sent.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','prepared',
 NOW()-INTERVAL '2 hours',NOW()+INTERVAL '1 hour',NULL,NULL
),
(
 'f6000000-0000-4000-8000-000000000003',
 '33333333-3333-4333-8333-333333333333',
 'Fictional information cell', 'communications_draft',
 'SIMULATION: Complete a sample public-information text review; no warning was sent.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','closed',
 NOW()-INTERVAL '6 hours',NOW()-INTERVAL '3 hours',
 NOW()-INTERVAL '5 hours',NOW()-INTERVAL '4 hours'
),
(
 'f6000000-0000-4000-8000-000000000004',
 '44444444-4444-4444-8444-444444444444',
 'Fictional infrastructure desk', 'infrastructure_check_draft',
 'SIMULATION: Prepare an unverified drainage obstruction desk check; no external action.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','prepared',
 NOW()-INTERVAL '5 hours',NOW()-INTERVAL '2 hours',NULL,NULL
),
(
 'f6000000-0000-4000-8000-000000000005',
 '55555555-5555-4555-8555-555555555555',
 'Fictional transport liaison', 'desk_review',
 'SIMULATION: Acknowledge a tabletop road-inundation case note; no responder dispatched.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','acknowledged',
 NOW()-INTERVAL '3 hours',NOW()+INTERVAL '1 hour',
 NOW()-INTERVAL '2 hours',NULL
),
(
 'f6000000-0000-4000-8000-000000000006',
 '66666666-6666-4666-8666-666666666666',
 'Fictional exercise verifier', 'field_verification_draft',
 'SIMULATION: Close a mock observation verification task; no field survey occurred.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','closed',
 NOW()-INTERVAL '8 hours',NOW()-INTERVAL '5 hours',
 NOW()-INTERVAL '7 hours',NOW()-INTERVAL '6 hours'
),
(
 'f6000000-0000-4000-8000-000000000007',
 '22222222-2222-4222-8222-222222222222',
 'Fictional public guidance desk', 'communications_draft',
 'SIMULATION: Prepare an advisory draft for review only; no notification was transmitted.',
 'AEGIS-URBAN-FLOOD-EXERCISE-v0.1','prepared',
 NOW()-INTERVAL '1 hour',NOW()+INTERVAL '2 hours',NULL,NULL
)
ON CONFLICT (id) DO NOTHING;

-- Event times derive from persisted task rows, including on reused volumes.
INSERT INTO exercise_agency_task_events (
    id, task_id, kind, occurred_at, actor_label, summary
)
SELECT entries.event_id::uuid, entries.task_id::uuid, entries.kind,
       CASE entries.kind
         WHEN 'prepared' THEN tasks.prepared_at
         WHEN 'acknowledged' THEN tasks.acknowledged_at
         WHEN 'closed' THEN tasks.closed_at
       END,
       'Fictional exercise facilitation desk',
       CASE entries.kind
         WHEN 'prepared' THEN 'SIMULATION: A fictional department task was drafted locally, without transmission.'
         WHEN 'acknowledged' THEN 'SIMULATION: A scripted acknowledgement was added for tabletop demonstration only.'
         WHEN 'closed' THEN 'SIMULATION: A scripted closure was added; no real service action occurred.'
       END
FROM (VALUES
    ('f7000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','prepared'),
    ('f7000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000002','prepared'),
    ('f7000000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000003','prepared'),
    ('f7000000-0000-4000-8000-000000000004','f6000000-0000-4000-8000-000000000004','prepared'),
    ('f7000000-0000-4000-8000-000000000005','f6000000-0000-4000-8000-000000000005','prepared'),
    ('f7000000-0000-4000-8000-000000000006','f6000000-0000-4000-8000-000000000006','prepared'),
    ('f7000000-0000-4000-8000-000000000007','f6000000-0000-4000-8000-000000000007','prepared'),
    ('f7000000-0000-4000-8000-000000000008','f6000000-0000-4000-8000-000000000001','acknowledged'),
    ('f7000000-0000-4000-8000-000000000009','f6000000-0000-4000-8000-000000000003','acknowledged'),
    ('f7000000-0000-4000-8000-000000000010','f6000000-0000-4000-8000-000000000005','acknowledged'),
    ('f7000000-0000-4000-8000-000000000011','f6000000-0000-4000-8000-000000000006','acknowledged'),
    ('f7000000-0000-4000-8000-000000000012','f6000000-0000-4000-8000-000000000003','closed'),
    ('f7000000-0000-4000-8000-000000000013','f6000000-0000-4000-8000-000000000006','closed')
) AS entries(event_id, task_id, kind)
JOIN exercise_agency_tasks AS tasks
    ON tasks.id = entries.task_id::uuid AND tasks.synthetic IS TRUE
ON CONFLICT (id) DO NOTHING;
