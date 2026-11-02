"""Real-database checks for the opt-in proactive watch (separate verification DB only)."""
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

from app import proactive_store

pytestmark = pytest.mark.skipif(not os.getenv('AEGIS_TEST_DATABASE_URL'), reason='Opt-in local PostGIS required')
MIGRATION = '012_proactive.sql'


def migration_sql() -> str:
    candidates = [Path('/db/migrations') / MIGRATION, *(parent / 'db/migrations' / MIGRATION for parent in Path(__file__).resolve().parents)]
    for path in candidates:
        if path.is_file():
            return path.read_text()
    raise FileNotFoundError(MIGRATION)


@pytest.fixture()
def database(monkeypatch):
    url = os.environ['AEGIS_TEST_DATABASE_URL']
    monkeypatch.setenv('DATABASE_URL', url)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(migration_sql())
        conn.execute(migration_sql())  # idempotent
        marker = 'it_' + uuid4().hex[:8]
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
    store.create_run(run_id, trigger['id'], {'id': run_id, 'status': 'running'}, 'op', {})
    state, changed = store.update_run(run_id, lambda s: ({**s, 'status': 'cancelled'}, True, 'cancel', {'r': 'x'}), 'op')
    assert changed and store.get_run(run_id)['status'] == 'cancelled'
    assert [a['step'] for a in store.run_audit(run_id)] == ['start', 'cancel']
