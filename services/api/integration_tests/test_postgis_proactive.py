"""Real-database checks for the opt-in proactive watch (separate verification DB only)."""
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

from app import proactive_store

pytestmark = pytest.mark.skipif(not os.getenv('AEGIS_TEST_DATABASE_URL'), reason='Opt-in local PostGIS required')
MIGRATIONS = ('012_proactive.sql', '013_proactive_run_agency.sql', '014_proactive_scheduler.sql', '015_exposure.sql')


def migration_sql(name: str) -> str:
    candidates = [Path('/db/migrations') / name, *(parent / 'db/migrations' / name for parent in Path(__file__).resolve().parents)]
    for path in candidates:
        if path.is_file():
            return path.read_text()
    raise FileNotFoundError(name)


@pytest.fixture()
def database(monkeypatch):
    url = os.environ['AEGIS_TEST_DATABASE_URL']
    monkeypatch.setenv('DATABASE_URL', url)
    with psycopg.connect(url, autocommit=True) as conn:
        for _ in range(2):  # idempotent
            for name in MIGRATIONS:
                conn.execute(migration_sql(name))
        # connector_id must match '^[a-z_]{3,40}$' (letters/underscore only); uuid4().hex contains
        # digits 0-9, so filter to its a-f letters only (always enough in a 32-char hex digest).
        marker = 'it_' + ''.join(c for c in uuid4().hex if c.isalpha())[:8]
        yield url, marker
        conn.execute('DELETE FROM connector_secrets WHERE connector_id = %s', (marker,))
        conn.execute('DELETE FROM connector_config WHERE connector_id = %s', (marker,))


def evidence(marker, value=70.0):
    row = {'id': str(uuid4()), 'connector_id': 'open_meteo', 'hazard': 'heavy_rain', 'observed_at': datetime.now(timezone.utc),
           'lat': 17.4, 'lon': 78.47, 'value': value, 'unit': 'mm', 'payload': {'point_id': marker}, 'source_url': None}
    from app.hazard_watch import digest
    return {**row, 'sha256': digest(row)}


def test_config_versioning_secrets_and_audit(database):
    url, marker = database
    store = proactive_store.PgStore()
    store.save_connector(marker, 0, True, {'days': 1}, {'map_key': (b'ct', b'n' * 12, 'abcd1234', 1)}, 'admin', [('save', True, {'version': 1})])
    with pytest.raises(proactive_store.VersionConflict):
        store.save_connector(marker, 0, False, {}, {}, 'admin', [])
    store.save_connector(marker, 1, False, {}, {'map_key': None}, 'admin', [('clear_secret', True, {})])
    data = store.list_configs()
    assert data['configs'][marker]['version'] == 2 and marker not in data['secrets']
    assert [row['action'] for row in store.list_audit(marker)] == ['clear_secret', 'save']
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE connector_audit SET ok = false WHERE connector_id = %s", (marker,))
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("INSERT INTO connector_config (connector_id, enabled) VALUES ('authority_notification', true)")


def test_evidence_dedupe_triggers_and_append_only(database):
    url, marker = database
    store = proactive_store.PgStore()
    row = evidence(marker)
    assert store.insert_evidence([row]) == 1 and store.insert_evidence([{**row, 'id': str(uuid4())}]) == 0
    stored_id = store.evidence_by_sha([row['sha256']])[row['sha256']]
    trigger = {'id': str(uuid4()), 'trigger_id': 'heavy_rain:' + marker, 'config_version': 'v1', 'hazard': 'heavy_rain',
               'state': 'candidate', 'fired_at': datetime.now(timezone.utc), 'lat': 17.4, 'lon': 78.47, 'score': 70.0,
               'evidence_ids': [stored_id], 'rationale': {'note': 'synthetic'}}
    store.insert_trigger(trigger)
    assert store.get_trigger(trigger['id'])['evidence_ids'] == [stored_id]
    for table in ('hazard_evidence', 'hazard_trigger_events'):
        with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.RaiseException):
            conn.execute(f"UPDATE {table} SET lat = lat WHERE id = %s", (stored_id if table == 'hazard_evidence' else trigger['id'],))
    run_id = str(uuid4())
    agency, other = uuid4(), uuid4()
    store.create_run(run_id, trigger['id'], {'id': run_id, 'status': 'running'}, 'op', {}, agency)
    state, changed = store.update_run(run_id, lambda s: ({**s, 'status': 'cancelled'}, True, 'cancel', {'r': 'x'}), 'op', agency)
    assert changed and store.get_run(run_id, agency)['status'] == 'cancelled'
    assert [a['step'] for a in store.run_audit(run_id)] == ['start', 'cancel']
    # Agency scope: another agency and legacy NULL rows are invisible (fail closed).
    assert store.get_run(run_id, other) is None and run_id not in [r['id'] for r in store.list_runs(other)]
    with pytest.raises(KeyError):
        store.update_run(run_id, lambda s: (s, True, 'cancel', {}), 'op', other)
    legacy = str(uuid4())
    with psycopg.connect(url) as conn:
        conn.execute("INSERT INTO proactive_runs (id, trigger_event_id, state, created_by) VALUES (%s,%s,'{}'::jsonb,'legacy')",
                     (legacy, trigger['id']))
    assert store.get_run(legacy, agency) is None and store.get_run(legacy, other) is None


def test_pause_switch_and_append_only_audit(database):
    url, marker = database
    store = proactive_store.PgStore()
    before = store.get_pause()
    try:
        row = store.set_pause(True, 'integration pause ' + marker, 'admin-' + marker)
        assert row['paused'] is True and row['updated_by'] == 'admin-' + marker
        assert store.get_pause()['paused'] is True
        assert store.pause_audit(5)[0]['actor'] == 'admin-' + marker
        with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.RaiseException):
            conn.execute("UPDATE proactive_pause_audit SET paused = false WHERE actor = %s", ('admin-' + marker,))
        with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
            conn.execute("INSERT INTO proactive_pause (id, paused) VALUES (false, true)")
    finally:
        store.set_pause(bool(before['paused']), 'integration restore ' + marker, 'admin-' + marker)

def test_scheduler_dedupe_ticks_and_advisory_lock(database):
    url, marker = database
    store = proactive_store.PgStore()
    trigger = {'id': str(uuid4()), 'trigger_id': 'heavy_rain:' + marker, 'config_version': 'v1', 'hazard': 'heavy_rain',
               'state': 'candidate', 'fired_at': datetime.now(timezone.utc), 'lat': 17.4, 'lon': 78.47, 'score': 70.0,
               'evidence_ids': [], 'rationale': {}}
    store.insert_trigger(trigger)
    agency, key = uuid4(), uuid4().hex * 2
    first, second = str(uuid4()), str(uuid4())
    assert store.create_run(first, trigger['id'], {'id': first}, 'system:scheduler', {}, agency, dedupe_key=key) is True
    assert store.create_run(second, trigger['id'], {'id': second}, 'system:scheduler', {}, agency, dedupe_key=key) is False
    assert store.get_run(second, agency) is None and [a['step'] for a in store.run_audit(first)] == ['start']
    # Operator runs keep NULL dedupe_key and are never constrained by it.
    assert store.create_run(str(uuid4()), trigger['id'], {}, 'op', {}, agency) is True
    with store.tick_lock() as held, store.tick_lock() as other:
        assert held is True and other is False
    with store.tick_lock() as again:
        assert again is True
    now = datetime.now(timezone.utc)
    tick = {'id': str(uuid4()), 'agency_id': agency, 'started_at': now, 'finished_at': now, 'outcome': 'completed',
            'runs_started': 1, 'flags_recorded': 0, 'errors': ['refresh_failed'], 'actor': 'system:scheduler'}
    store.insert_tick(tick)
    assert store.list_ticks(agency, 5)[0]['errors'] == ['refresh_failed'] and store.list_ticks(uuid4(), 5) == []
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE proactive_scheduler_ticks SET runs_started = 2 WHERE id = %s", (tick['id'],))
    with psycopg.connect(url) as conn, pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("""INSERT INTO proactive_scheduler_ticks (id, agency_id, started_at, outcome, errors)
                        VALUES (%s, %s, now(), 'completed', ARRAY['Traceback: boom'])""", (str(uuid4()), str(agency)))


def seed_sql(name: str) -> str:
    candidates = [Path('/db') / name, *(parent / 'db' / name for parent in Path(__file__).resolve().parents)]
    for path in candidates:
        if path.is_file():
            return path.read_text()
    raise FileNotFoundError(name)


def test_exposure_layer_seed_is_idempotent_and_spatially_queried(database):
    """015 + synthetic seed: idempotent, ST_DWithin footprint counts, licence/attribution constraints."""
    url, marker = database
    with psycopg.connect(url, autocommit=True) as conn:
        for _ in range(2):
            conn.execute(seed_sql('seed_exposure.sql'))
        count = conn.execute("SELECT COUNT(*) FROM exposure_features WHERE import_batch='synthetic-seed-v1'").fetchone()[0]
        assert count == 13
        assert conn.execute("SELECT bool_and(synthetic) FROM exposure_features WHERE import_batch='synthetic-seed-v1'").fetchone()[0]
        with pytest.raises(psycopg.errors.CheckViolation):  # real rows must carry attribution
            conn.execute("""INSERT INTO exposure_features (id, kind, geom, source, licence, synthetic, provenance_sha256, import_batch)
                            VALUES (%s,'school',ST_SetSRID(ST_MakePoint(78.4,17.4),4326),'osm','ODbL-1.0',false,%s,'it')""",
                         (str(uuid4()), 'a' * 64))
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute("""INSERT INTO exposure_features (id, kind, geom, source, licence, synthetic, provenance_sha256, import_batch)
                            VALUES (%s,'stadium',ST_SetSRID(ST_MakePoint(78.4,17.4),4326),'x','x',true,%s,'it')""",
                         (str(uuid4()), 'b' * 64))
    store = proactive_store.PgStore()
    assert store.exposure_layer_count() >= 13
    near = store.exposure_within(17.40, 78.47, 5)
    kinds = {row['kind'] for row in near}
    assert {'hospital', 'school', 'shelter', 'road_segment', 'population_cell'} <= kinds
    assert store.exposure_within(17.50, 78.35, 5) == []
    from app import impact
    summary = impact.summarize(near, 5)
    assert summary['data_basis'] == 'synthetic' and summary['people_exposed'] >= 35000
    with psycopg.connect(url) as conn:
        plan = '\n'.join(r[0] for r in conn.execute(
            "EXPLAIN SELECT id FROM exposure_features WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(78.47,17.40),4326)::geography, 5000)").fetchall())
    assert 'exposure_features' in plan
