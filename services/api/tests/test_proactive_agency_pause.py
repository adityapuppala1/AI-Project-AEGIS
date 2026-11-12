"""Per-agency proactive run scope and the platform kill switch (offline MemoryStore double)."""
import base64
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app import hazard_watch, proactive_run, proactive_store
from app.main import app
from app.security import Operator, get_operator

AGENCY_A = UUID('11111111-1111-4111-8111-111111111111')
AGENCY_B = UUID('22222222-2222-4222-8222-222222222222')
NOW = datetime.now(timezone.utc)
P0 = hazard_watch.RAIN_POINTS[0]
REASON = 'Exercise pause for the tabletop review'
client = TestClient(app)


def as_operator(subject, agency, *roles):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, agency, frozenset(roles or {'incident_operator'}))


@pytest.fixture(autouse=True)
def store(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    memory = proactive_store.MemoryStore()
    proactive_store.set_store(memory)
    as_operator('operator-a', AGENCY_A)
    yield memory
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


def seed_trigger(memory):
    day = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = [{'id': str(uuid4()), 'connector_id': 'open_meteo', 'hazard': 'heavy_rain', 'observed_at': day - timedelta(days=d),
             'lat': P0['lat'], 'lon': P0['lon'], 'value': v, 'unit': 'mm', 'payload': {'point_id': P0['id']},
             'retrieved_at': NOW, 'sha256': uuid4().hex * 2} for d, v in ((0, 70), (1, 5))]
    memory.insert_evidence(rows)
    trigger = {**hazard_watch.evaluate(rows)[0], 'id': str(uuid4()), 'fired_at': NOW}
    memory.insert_trigger(trigger)
    return trigger


def start(trigger):
    response = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']})
    assert response.status_code == 201, response.text
    return response.json()


# --- agency scope ------------------------------------------------------------------------------

def test_run_stores_verified_agency_and_lists_only_own(store):
    run = start(seed_trigger(store))
    assert store.run_agency[run['id']] == str(AGENCY_A)
    assert 'agency_id' not in run  # scope lives in the column, not in the client-visible state
    assert [r['id'] for r in client.get('/v1/proactive/runs').json()['runs']] == [run['id']]
    as_operator('operator-b', AGENCY_B)
    assert client.get('/v1/proactive/runs').json()['runs'] == []


def test_cross_agency_routes_return_404_not_403(store):
    run = start(seed_trigger(store))
    as_operator('operator-b', AGENCY_B)
    base = f"/v1/proactive/runs/{run['id']}"
    responses = [client.get(base), client.get(base + '/cap.xml'),
                 client.post(base + '/advance', json={'expected_step': 'gather_evidence'}),
                 client.post(base + '/cancel', json={'rationale': 'Trying to cancel another agency run'})]
    for response in responses:
        assert response.status_code == 404 and response.json()['detail'] == 'run_not_found'
    assert store.runs[run['id']]['status'] == 'running' and len(store.run_audit(run['id'])) == 1


def test_legacy_null_agency_run_is_invisible_to_everyone(store):
    trigger = seed_trigger(store)
    legacy_id = str(uuid4())
    store.runs[legacy_id] = proactive_run.new_state(legacy_id, trigger, 'legacy-operator')  # pre-013 row: no agency
    for agency in (AGENCY_A, AGENCY_B):
        as_operator('operator', agency)
        assert client.get(f'/v1/proactive/runs/{legacy_id}').status_code == 404
        assert client.post(f'/v1/proactive/runs/{legacy_id}/advance', json={'expected_step': 'gather_evidence'}).status_code == 404
        assert client.get('/v1/proactive/runs').json()['runs'] == []


def test_agency_is_never_accepted_from_the_request_body(store):
    trigger = seed_trigger(store)
    response = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id'], 'agency_id': str(AGENCY_B)})
    assert response.status_code == 422 and store.runs == {}


# --- kill switch -------------------------------------------------------------------------------

def pause(paused=True, reason=REASON):
    as_operator('admin-1', AGENCY_A, 'platform_admin')
    response = client.put('/v1/proactive/pause', json={'paused': paused, 'reason': reason})
    as_operator('operator-a', AGENCY_A)
    return response


def test_pause_blocks_create_advance_and_refresh_but_not_reads_or_cancel(store):
    trigger = seed_trigger(store)
    run = start(trigger)
    assert pause().status_code == 200
    for response in (client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']}),
                     client.post(f"/v1/proactive/runs/{run['id']}/advance", json={'expected_step': 'gather_evidence'}),
                     client.post('/v1/proactive/watch/refresh')):
        assert response.status_code == 409 and response.json()['detail'] == 'proactive_paused'
    assert len(store.runs) == 1 and store.runs[run['id']]['completed_steps'] == []
    assert client.get(f"/v1/proactive/runs/{run['id']}").status_code == 200
    assert client.get('/v1/proactive/watch').json()['paused'] is True
    assert client.post(f"/v1/proactive/runs/{run['id']}/cancel", json={'rationale': 'Paused for the exercise review'}).json()['status'] == 'cancelled'
    assert pause(False, 'Review finished; resuming the exercise').json()['paused'] is False
    assert client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']}).status_code == 201


def test_pause_change_writes_audit_with_actor_and_reason(store):
    body = pause().json()
    assert body['paused'] is True and body['updated_by'] == 'admin-1' and body['reason'] == REASON
    assert store.pause_audits == [{'paused': True, 'reason': REASON, 'actor': 'admin-1', 'at': store.pause_audits[0]['at']}]
    pause(False, 'Resume after the tabletop review')
    assert [a['paused'] for a in store.pause_audits] == [True, False]
    view = client.get('/v1/proactive/pause').json()  # plain operator: state only, no audit trail
    assert view['paused'] is False and 'audit' not in view


@pytest.mark.parametrize('roles', [{'incident_operator'}, {'incident_checker'}, {'department_operator'}])
def test_non_admin_put_is_403_and_writes_nothing(store, roles):
    as_operator('someone', AGENCY_A, *roles)
    response = client.put('/v1/proactive/pause', json={'paused': True, 'reason': REASON})
    assert response.status_code == 403 and store.pause_audits == [] and store.pause['paused'] is False


@pytest.mark.parametrize('body', [{'paused': True, 'reason': 'short'}, {'paused': 'yes', 'reason': REASON},
                                  {'paused': True}, {'paused': True, 'reason': REASON, 'agency_id': str(AGENCY_B)},
                                  {'paused': True, 'reason': 'line one\nline two here'}])
def test_pause_payload_validation(store, body):
    as_operator('admin-1', AGENCY_A, 'platform_admin')
    assert client.put('/v1/proactive/pause', json=body).status_code == 422 and store.pause_audits == []


def test_unreadable_switch_fails_closed(store, monkeypatch):
    trigger = seed_trigger(store)

    def broken():
        raise RuntimeError('pause_row_missing')
    monkeypatch.setattr(store, 'get_pause', broken)
    response = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']})
    assert response.status_code == 503 and store.runs == {}
    assert client.get('/v1/proactive/watch').json()['paused'] is None


def test_response_team_cannot_read_the_pause_state(store):
    """A team token must not learn the pause reason or the administrator's subject."""
    app.dependency_overrides[get_operator] = lambda: Operator('team-lead', UUID('11111111-1111-4111-8111-111111111111'),
                                                              frozenset({'response_team'}), None, 'syn-team-rescue-01')
    try:
        assert client.get('/v1/proactive/pause').status_code == 403
    finally:
        app.dependency_overrides.clear()
