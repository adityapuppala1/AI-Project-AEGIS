"""Scheduled watch loop (A1) and evidence-change sentinel (A2), offline MemoryStore double.

The fake refresh stands in for hazard_watch.refresh_detailed so no network is used.
Synthetic thresholds only; nothing here is forecasting accuracy.
"""
import base64
import threading
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import governance, hazard_watch, proactive_run, proactive_scheduler, proactive_sentinel, proactive_store, security
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
OTHER = UUID('22222222-2222-4222-8222-222222222222')
NOW = datetime.now(timezone.utc)
DAY = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
P0 = hazard_watch.RAIN_POINTS[0]
client = TestClient(app)


@pytest.fixture(autouse=True)
def store(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    monkeypatch.setenv('AEGIS_PROACTIVE_SCHEDULER', '1')
    monkeypatch.setenv('AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID', str(AGENCY))
    memory = proactive_store.MemoryStore()
    proactive_store.set_store(memory)
    app.dependency_overrides[get_operator] = lambda: Operator('operator-a', AGENCY, frozenset({'incident_operator'}))
    yield memory
    app.dependency_overrides.clear()
    proactive_store.set_store(None)
    proactive_scheduler.stop_background()


def rows(value, retrieved_hours=0, point=P0):
    out = [{'id': str(uuid4()), 'connector_id': 'open_meteo', 'hazard': 'heavy_rain', 'observed_at': DAY - timedelta(days=d),
            'lat': point['lat'], 'lon': point['lon'], 'value': v, 'unit': 'mm', 'payload': {'point_id': point['id']},
            'retrieved_at': NOW - timedelta(hours=retrieved_hours)} for d, v in ((0, value), (1, 1.0))]
    for row in out:
        row['sha256'] = hazard_watch.digest(row)
    return out


def fake_refresh(memory, value, retrieved_hours=0):
    """Mimics refresh_detailed: sha256 dedupe maps repeated evidence back to the stored ids."""
    def refresh():
        collected = rows(value, retrieved_hours)
        memory.insert_evidence(collected)
        ids = memory.evidence_by_sha([r['sha256'] for r in collected])
        for row in collected:
            row['id'] = ids[row['sha256']]
        triggers = [{**t, 'id': str(uuid4()), 'fired_at': datetime.now(timezone.utc)} for t in hazard_watch.evaluate(collected)]
        for trigger in triggers:
            memory.insert_trigger(trigger)
        return {'fetched': {}, 'evidence_added': 0, 'triggers': {}}, triggers
    return refresh


def pause(memory):
    memory.set_pause(True, 'Exercise pause for the review', 'admin-1')


# --- A1 scheduler ---------------------------------------------------------------------------------

def test_tick_prepares_one_draft_run_and_stops_before_hand_to_human(store):
    row = proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    assert row['outcome'] == 'completed' and row['runs_started'] == 1 and row['errors'] == []
    (run_id, state), = store.runs.items()
    assert store.run_agency[run_id] == str(AGENCY) and state['created_by'] == 'system:scheduler' and state['origin'] == 'scheduler'
    assert [c['step'] for c in state['completed_steps']] == list(proactive_scheduler.AUTO_STEPS)
    assert state['status'] == 'running' and state['next_step'] == 'hand_to_human'
    assert state['operational_actions_enabled'] is False and state['needs_accountable_human_review'] is True
    assert [a['step'] for a in store.run_audit(run_id)] == ['start', *proactive_scheduler.AUTO_STEPS]
    assert store.ticks[0]['outcome'] == 'completed' and store.ticks[0]['actor'] == 'system:scheduler'


def test_same_tick_twice_creates_one_run(store):
    refresh = fake_refresh(store, 120)
    first = proactive_scheduler.tick(store, AGENCY, refresh)
    store.runs[next(iter(store.runs))]['status'] = 'cancelled'  # no open run left: only the dedupe key prevents a repeat
    second = proactive_scheduler.tick(store, AGENCY, refresh)
    assert first['runs_started'] == 1 and second['runs_started'] == 0 and len(store.runs) == 1
    assert len(store.ticks) == 2


def test_dedupe_key_is_stable_and_store_rejects_a_duplicate(store):
    trigger = {'trigger_id': 'heavy_rain:p', 'config_version': 'v1'}
    key = proactive_scheduler.dedupe_key(AGENCY, trigger, ['b', 'a'])
    assert key == proactive_scheduler.dedupe_key(AGENCY, trigger, ['a', 'b'])
    assert key != proactive_scheduler.dedupe_key(OTHER, trigger, ['a', 'b'])
    assert key != proactive_scheduler.dedupe_key(AGENCY, {**trigger, 'config_version': 'v2'}, ['a', 'b'])
    assert store.create_run('r1', 't', {'id': 'r1'}, 'system:scheduler', {}, AGENCY, dedupe_key=key) is True
    assert store.create_run('r2', 't', {'id': 'r2'}, 'system:scheduler', {}, AGENCY, dedupe_key=key) is False
    assert list(store.runs) == ['r1'] and len(store.run_audits) == 1


def test_open_run_for_same_trigger_is_not_duplicated_on_new_evidence(store):
    proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    row = proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 150))
    assert row['runs_started'] == 0 and len(store.runs) == 1
    assert row['flags_recorded'] == 1 and store.runs[next(iter(store.runs))]['sentinel_flags'][0]['flag'] == 'strengthened'


def test_advisory_lock_held_elsewhere_skips_the_tick(store):
    called = []
    store.tick_mutex.acquire()
    try:
        row = proactive_scheduler.tick(store, AGENCY, lambda: called.append(1))
    finally:
        store.tick_mutex.release()
    assert row['outcome'] == 'skipped_locked' and called == [] and store.runs == {}
    assert store.ticks[-1]['outcome'] == 'skipped_locked'


def test_concurrent_ticks_only_one_executes(store):
    gate, results = threading.Event(), []

    def slow_refresh():
        gate.wait(2)
        return fake_refresh(store, 120)()
    worker = threading.Thread(target=lambda: results.append(proactive_scheduler.tick(store, AGENCY, slow_refresh)))
    worker.start()
    for _ in range(100):
        if store.tick_mutex.locked():
            break
        threading.Event().wait(0.01)
    results.append(proactive_scheduler.tick(store, AGENCY, slow_refresh))
    gate.set()
    worker.join(5)
    assert sorted(r['outcome'] for r in results) == ['completed', 'skipped_locked'] and len(store.runs) == 1


def test_paused_tick_records_skip_and_does_nothing(store):
    pause(store)
    called = []
    row = proactive_scheduler.tick(store, AGENCY, lambda: called.append(1))
    assert row['outcome'] == 'skipped_paused' and called == [] and store.runs == {} and store.ticks[-1]['outcome'] == 'skipped_paused'


def test_unreadable_pause_fails_closed(store, monkeypatch):
    def broken():
        raise RuntimeError('db down: secret dsn here')
    monkeypatch.setattr(store, 'get_pause', broken)
    row = proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    assert row['outcome'] == 'failed' and row['errors'] == ['pause_unreadable'] and store.runs == {}
    assert 'secret' not in repr(store.ticks)


def test_pause_mid_tick_stops_advancing(store, monkeypatch):
    calls = {'n': 0}
    real = store.get_pause

    def flips():
        calls['n'] += 1
        return {**real(), 'paused': calls['n'] > 3}
    monkeypatch.setattr(store, 'get_pause', flips)
    row = proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    state = next(iter(store.runs.values()))
    assert 'paused_mid_tick' in row['errors'] and len(state['completed_steps']) < len(proactive_scheduler.AUTO_STEPS)


def test_refresh_failure_is_a_fixed_code(store):
    def boom():
        raise OSError('connect to 10.0.0.5 failed with password=hunter2')
    row = proactive_scheduler.tick(store, AGENCY, boom)
    assert row['outcome'] == 'failed' and row['errors'] == ['refresh_failed']
    assert 'hunter2' not in repr(store.ticks) and set(row['errors']) <= proactive_scheduler.ERROR_CODES


@pytest.mark.parametrize('env,reason', [({'AEGIS_PROACTIVE_SCHEDULER': ''}, 'scheduler_disabled'),
                                        ({'AEGIS_PROACTIVE': ''}, 'scheduler_requires_proactive'),
                                        ({'AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID': ''}, 'scheduler_agency_missing'),
                                        ({'AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID': 'agency-one'}, 'scheduler_agency_invalid')])
def test_scheduler_refuses_to_start_without_valid_env(monkeypatch, caplog, env, reason):
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    assert proactive_scheduler.start_background() == reason
    assert proactive_scheduler._loop.thread is None
    if reason != 'scheduler_disabled':
        assert reason in caplog.text


def test_scheduler_starts_and_stops_with_valid_env():
    assert proactive_scheduler.start_background() is None
    assert proactive_scheduler._loop.thread.is_alive() and proactive_scheduler._loop.next_tick_at is not None
    proactive_scheduler.stop_background()
    assert proactive_scheduler._loop.thread is None


@pytest.mark.parametrize('raw,expected', [('', 1800), ('60', 300), ('abc', 1800), ('3600', 3600), ('-5', 300)])
def test_interval_has_a_safe_minimum(monkeypatch, raw, expected):
    monkeypatch.setenv('AEGIS_PROACTIVE_SCHEDULER_INTERVAL', raw)
    assert proactive_scheduler.interval_seconds() == expected


def test_scheduler_subject_cannot_hand_off_submit_or_approve(store):
    proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    run_id, state = next(iter(store.runs.items()))
    with pytest.raises(proactive_run.RunError) as error:
        proactive_run.advance(state, 'hand_to_human', proactive_scheduler.SUBJECT, store)
    assert error.value.code == 'system_actor_cannot_hand_off'
    draft = governance.Proposal(proposal_id=uuid4(), incident_id=uuid4(), maker_subject='system:scheduler',
                                action='exercise_review', status=governance.Status.DRAFT)
    with pytest.raises(governance.DecisionError):
        governance.submit(draft, 'system:scheduler')
    submitted = governance.Proposal(proposal_id=uuid4(), incident_id=uuid4(), maker_subject='human-maker',
                                    action='exercise_review', status=governance.Status.SUBMITTED)
    for checker in ('system:scheduler', 'SYSTEM:sentinel'):
        with pytest.raises(governance.DecisionError):
            governance.review(submitted, checker, True, 'looks fine')


def test_token_with_system_subject_is_rejected(monkeypatch):
    claims = {'sub': 'system:scheduler', 'aegis_roles': ['incident_checker'], 'aegis_agency_id': str(AGENCY)}

    class Key:
        key = 'k'
    monkeypatch.setattr(security, '_configuration', lambda: ('https://idp', 'aud', 'https://idp/jwks'))
    monkeypatch.setattr(security, '_jwk_client', lambda url: type('C', (), {'get_signing_key_from_jwt': lambda self, t: Key()})())
    monkeypatch.setattr(security.jwt, 'decode', lambda *a, **k: claims)
    with pytest.raises(HTTPException) as error:
        security.decode_operator_token('unit-only')
    assert error.value.status_code == 401
    claims['sub'] = 'human-checker'
    assert security.decode_operator_token('unit-only').subject == 'human-checker'


def test_human_takes_over_the_hand_off(store):
    proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    run_id = next(iter(store.runs))
    response = client.post(f'/v1/proactive/runs/{run_id}/advance', json={'expected_step': 'hand_to_human'})
    assert response.status_code == 200 and response.json()['status'] == 'review_ready'
    assert store.runs[run_id]['completed_steps'][-1]['completed_by'] == 'operator-a'


def test_no_submit_or_notify_path_in_scheduler_steps(store):
    assert 'hand_to_human' not in proactive_scheduler.AUTO_STEPS
    assert set(proactive_scheduler.AUTO_STEPS) < set(proactive_run.STEPS)
    proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    steps = {a['step'] for a in store.run_audits}
    assert steps.isdisjoint({'submit', 'approve', 'send', 'notify', 'dispatch', 'hand_to_human'})
    assert store.configs == {} and store.audit == []  # no connector (including authority_notification) touched


# --- status route ---------------------------------------------------------------------------------

def test_status_route_is_scoped_and_hides_agency(store):
    proactive_scheduler.tick(store, AGENCY, fake_refresh(store, 120))
    store.insert_tick({**store.ticks[0], 'id': str(uuid4()), 'agency_id': str(OTHER)})
    body = client.get('/v1/proactive/scheduler').json()
    assert body['enabled'] is True and body['interval_seconds'] == 1800 and len(body['ticks']) == 1
    assert body['last_tick']['runs_started'] == 1 and 'agency_id' not in body['last_tick'] and str(AGENCY) not in str(body)
    app.dependency_overrides[get_operator] = lambda: Operator('admin', AGENCY, frozenset({'platform_admin'}))
    assert len(client.get('/v1/proactive/scheduler').json()['ticks']) == 2
    # Another agency's platform_admin no longer sees every agency's ticks: fixed exercise-agency 403.
    app.dependency_overrides[get_operator] = lambda: Operator('admin', OTHER, frozenset({'platform_admin'}))
    refused = client.get('/v1/proactive/scheduler')
    assert refused.status_code == 403 and refused.json() == {'detail': 'Exercise records are limited to the exercise agency'}
    app.dependency_overrides[get_operator] = lambda: Operator('dept', AGENCY, frozenset({'department_operator'}), 'control_room')
    assert client.get('/v1/proactive/scheduler').status_code == 403


def test_status_route_404_when_proactive_off(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '')
    assert client.get('/v1/proactive/scheduler').status_code == 404


# --- A2 sentinel ----------------------------------------------------------------------------------

def start_human_run(store, value=120):
    _, triggers = fake_refresh(store, value)()
    trigger = next(t for t in triggers if t['trigger_id'] == f"heavy_rain:{P0['id']}")
    response = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']})
    assert response.status_code == 201
    return response.json()['id']


@pytest.mark.parametrize('value,flag', [(150, 'strengthened'), (60, 'weakened'), (1, 'contradicted')])
def test_sentinel_flags_open_runs(store, value, flag):
    run_id = start_human_run(store)
    before = {k: v for k, v in store.runs[run_id].items() if k != 'sentinel_flags'}
    _, triggers = fake_refresh(store, value)()
    assert proactive_sentinel.apply(store, AGENCY, triggers) == 1
    state = store.runs[run_id]
    (recorded,) = state['sentinel_flags']
    assert recorded['flag'] == flag and recorded['evidence_ids'] and recorded['at']
    assert {k: v for k, v in state.items() if k != 'sentinel_flags'} == before  # drafts and CAP untouched
    assert store.run_audits[-1]['step'] == 'sentinel_flag' and store.run_audits[-1]['actor'] == 'system:sentinel'


def test_sentinel_stale_when_no_new_evidence_and_old_evidence(store):
    _, triggers = fake_refresh(store, 120, retrieved_hours=30)()
    trigger = next(t for t in triggers if t['trigger_id'] == f"heavy_rain:{P0['id']}")
    run_id = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']}).json()['id']
    assert proactive_sentinel.apply(store, AGENCY, []) == 1
    assert store.runs[run_id]['sentinel_flags'][0]['flag'] == 'stale'


def test_sentinel_no_flag_when_unchanged_and_no_repeat(store):
    run_id = start_human_run(store)
    _, triggers = fake_refresh(store, 120)()
    assert proactive_sentinel.apply(store, AGENCY, triggers) == 0
    _, triggers = fake_refresh(store, 150)()
    assert proactive_sentinel.apply(store, AGENCY, triggers) == 1
    assert proactive_sentinel.apply(store, AGENCY, triggers) == 0  # identical consecutive flag is not repeated
    assert len(store.runs[run_id]['sentinel_flags']) == 1


def test_sentinel_skips_cancelled_finished_and_other_agency_runs(store):
    run_id = start_human_run(store)
    client.post(f'/v1/proactive/runs/{run_id}/cancel', json={'rationale': 'Not needed for this exercise'})
    _, triggers = fake_refresh(store, 1)()
    assert proactive_sentinel.apply(store, AGENCY, triggers) == 0
    assert proactive_sentinel.apply(store, OTHER, triggers) == 0
    assert 'sentinel_flags' not in store.runs[run_id]


def test_manual_refresh_runs_the_sentinel(store, monkeypatch):
    run_id = start_human_run(store)
    monkeypatch.setattr(hazard_watch, 'refresh_detailed', fake_refresh(store, 1))
    response = client.post('/v1/proactive/watch/refresh')
    assert response.status_code == 200 and response.json()['sentinel_flags'] == 1
    assert store.runs[run_id]['sentinel_flags'][0]['flag'] == 'contradicted'
    view = client.get(f'/v1/proactive/runs/{run_id}').json()
    assert view['sentinel_flags'][0]['flag'] == 'contradicted'


def test_sentinel_failure_never_fails_refresh(store, monkeypatch):
    monkeypatch.setattr(hazard_watch, 'refresh_detailed', fake_refresh(store, 120))
    monkeypatch.setattr(proactive_sentinel, 'apply', lambda *a: (_ for _ in ()).throw(RuntimeError('raw detail')))
    body = client.post('/v1/proactive/watch/refresh').json()
    assert body['sentinel_flags'] == 'sentinel_failed' and 'raw detail' not in str(body)
