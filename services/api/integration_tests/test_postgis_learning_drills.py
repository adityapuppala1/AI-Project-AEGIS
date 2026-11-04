"""Real-database checks for migration 016 (A8 learning, A9 drills). Opt-in: separate verification DB only.

Not run by the default suite. Set AEGIS_TEST_DATABASE_URL to a disposable PostGIS database; never point it at
the canonical ai-project-aegis volume.
"""
import os
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
import pytest

from app import learning_store

pytestmark = pytest.mark.skipif(not os.getenv('AEGIS_TEST_DATABASE_URL'), reason='Opt-in local PostGIS required')
MIGRATIONS = ('012_proactive.sql', '013_proactive_run_agency.sql', '014_proactive_scheduler.sql', '015_exposure.sql',
              '016_learning_drills.sql')
AGENCY = UUID('11111111-1111-4111-8111-111111111111')


def migration_sql(name: str) -> str:
    for path in [Path('/db/migrations') / name, *(p / 'db/migrations' / name for p in Path(__file__).resolve().parents)]:
        if path.is_file():
            return path.read_text()
    raise FileNotFoundError(name)


@pytest.fixture()
def store(monkeypatch):
    url = os.environ['AEGIS_TEST_DATABASE_URL']
    monkeypatch.setenv('DATABASE_URL', url)
    with psycopg.connect(url, autocommit=True) as conn:
        for _ in range(2):  # idempotent
            for name in MIGRATIONS:
                conn.execute(migration_sql(name))
    yield learning_store.PgStore(), url


def window(store, agency=AGENCY):
    return store.create_window({'id': str(uuid4()), 'agency_id': agency, 'hazard': 'heavy_rain', 'window_start': date(2026, 7, 1),
                                'window_end': date(2026, 7, 10), 'source': 'replay_synthetic', 'basis': 'synthetic_rehearsal',
                                'config_version': 'aegis.hazard-triggers.v1', 'observed_events': [], 'stats': {'rules': []},
                                'closed_by': 'maker-1'}, 'replay')


def proposal(store, w, version=None):
    return store.create_proposal({'id': str(uuid4()), 'agency_id': AGENCY, 'window_id': w['id'], 'base_version': 'aegis.hazard-triggers.v1',
                                  'new_version': version or 'aegis.hazard-triggers.v1-l' + uuid4().hex[:12],
                                  'diff': {'changes': []}, 'rationale': {}, 'maker_subject': 'maker-1'})


def test_maker_checker_constraints_and_agency_scope(store):
    pg, url = store
    p = proposal(pg, window(pg))
    assert pg.get_proposal(p['id'], uuid4()) is None
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE threshold_proposals SET status='approved', checker_subject=maker_subject, "
                     "decision_rationale='same person approving' WHERE id=%s", (p['id'],))
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE threshold_proposals SET status='approved', checker_subject='system:scheduler', "
                     "decision_rationale='automation approving' WHERE id=%s", (p['id'],))
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE threshold_proposals SET applied_version='x' WHERE id=%s", (p['id'],))


def test_apply_writes_one_append_only_version(store):
    pg, url = store
    p = proposal(pg, window(pg))
    pg.update_proposal(p['id'], AGENCY, lambda r: ({'status': 'submitted'}, 'submit', {}), 'maker-1')
    pg.update_proposal(p['id'], AGENCY, lambda r: ({'status': 'approved', 'checker_subject': 'checker-1',
                                                    'decision_rationale': 'Independent review ok'}, 'approve', {}), 'checker-1')
    latest = pg.latest_config_version()
    row = {'version_id': p['new_version'], 'base_version': 'aegis.hazard-triggers.v1', 'overrides': {'heavy_rain': {'watch': 38.5}},
           'expected_current': latest['version_id'] if latest else None}
    applied = pg.apply_proposal(p['id'], AGENCY, row, 'admin-1', {'rationale': 'apply'})
    assert applied['applied_version'] == p['new_version'] and pg.latest_config_version()['version_id'] == p['new_version']
    with pytest.raises(ValueError):
        pg.apply_proposal(p['id'], AGENCY, row, 'admin-1', {})
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE trigger_config_versions SET overrides='{}' WHERE version_id=%s", (p['new_version'],))
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("DELETE FROM learning_audit WHERE subject_id=%s", (p['id'],))


def test_drills_are_exercise_only(store):
    pg, url = store
    drill_id = str(uuid4())
    pg.create_drill(drill_id, AGENCY, 'synthetic_false_alarm_heavy_rain', {'id': drill_id, 'exercise': True, 'sim_minute': 0},
                    'operator-1', {})
    assert pg.get_drill(drill_id, AGENCY)['exercise'] is True and pg.get_drill(drill_id, uuid4()) is None
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE exercise_drills SET exercise=false WHERE id=%s", (drill_id,))
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("INSERT INTO exercise_drills (id, agency_id, scenario_id, state, created_by) VALUES (%s,%s,'s','{}','system:x')",
                     (str(uuid4()), str(AGENCY)))
