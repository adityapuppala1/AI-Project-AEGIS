"""A5 pre-positioning planner and run observability (offline MemoryStore, synthetic teams and exposure).

Travel times are estimated and synthetic. Nothing here measures forecasting accuracy or real
response capability, and no test double establishes real two-human approval.
"""
import ast
import base64
import copy
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app import (department_tasks, hazard_watch, impact, jev_client, prepositioning as pp, proactive_run, proactive_scheduler,
                 proactive_store, run_observability, workflow_store)
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
OTHER = UUID('22222222-2222-4222-8222-222222222222')
FIXED = datetime(2026, 11, 4, 6, 0, tzinfo=timezone.utc)  # inside every synthetic availability window
NOW = datetime.now(timezone.utc)
DAY = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
CENTRE = next(p for p in hazard_watch.RAIN_POINTS if p['id'] == 'hyd_17.40_78.47')
HAZARD = hazard_watch.load_config()['hazards']['heavy_rain']
TEAMS = pp.load_teams()
client = TestClient(app)
WRITE_NAMES = {"transition", "create_proposal", "update_run", "create_run", "set_pause", "insert_evidence", "insert_trigger",
               "insert_tick", "save_connector", "add_audit", "advance", "cancel", "refresh", "refresh_detailed", "run_test",
               "tick", "append_flag", "apply", "reassign_task", "advance_task", "prepare_task_receipt", "add_exposure",
               "start_background", "stop_background", "execute", "send", "notify", "dispatch"}


@pytest.fixture(autouse=True)
def store(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    monkeypatch.setenv('AEGIS_PROACTIVE_SCHEDULER', '1')
    monkeypatch.setenv('AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID', str(AGENCY))
    choice = sorted(jev_client.PLAYBOOK_OPTIONS)[0]
    monkeypatch.setattr(jev_client, 'judge', lambda state, actor, transport=None: {
        'provider': 'test_double', 'model': 'fixed', 'playbook_option': {'choice': choice, 'confidence': 0.95},
        'citation_clean': {'noul': 0.99}, 'severity_band': {'score': 2}, 'staleness_risk': {'noul': 0.1}})
    memory = proactive_store.MemoryStore()
    proactive_store.set_store(memory)
    app.dependency_overrides[get_operator] = lambda: Operator('operator-a', AGENCY, frozenset({'incident_operator'}))
    yield memory
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


def feature(kind, dlat=0.0, dlon=0.0, fid=None):
    return {'id': fid or str(uuid4()), 'kind': kind, 'lat': CENTRE['lat'] + dlat, 'lon': CENTRE['lon'] + dlon, 'count': 1,
            'weight': 1.0, 'synthetic': True, 'source': 'test', 'licence': 'Synthetic AEGIS exercise fixture'}


def layout(memory):
    feats = [feature('hospital', 0.01, 0.0), feature('school', -0.01, 0.01), feature('school', 0.02, -0.02),
             feature('shelter', 0.0, 0.015), feature('shelter', -0.02, -0.01), feature('road_segment')]
    memory.add_exposure(feats)
    return feats


def state_for(feats, band='recommended'):
    return {'impact': {'status': 'evaluated', 'exposure_feature_ids': [f['id'] for f in feats]},
            'judgment': {'decision_band': band}}


def trig(hazard='heavy_rain', at=FIXED):
    return {'hazard': hazard, 'fired_at': at}


# --- planner ------------------------------------------------------------------------------------

def test_plan_is_deterministic_and_order_independent(store):
    feats = layout(store)
    first = pp.plan(state_for(feats), trig(), store)
    assert first['status'] == 'planned' and first['label'] == pp.LABEL and first['travel_model']['label'] == 'estimated, synthetic'
    shuffled = copy.deepcopy(feats)
    random.Random(7).shuffle(shuffled)
    other = proactive_store.MemoryStore()
    other.add_exposure(shuffled)
    again = pp.plan(state_for(shuffled), trig(), other)
    assert again == first
    assert 2 <= len(first['options']) <= 3 and [o['rank'] for o in first['options']] == list(range(1, len(first['options']) + 1))
    keys = [(-o['covered'], o['max_minutes'], o['total_minutes']) for o in first['options']]
    assert keys == sorted(keys)
    assert set(first['cited_team_ids']) <= {t['id'] for t in TEAMS['teams']}
    road = next(f['id'] for f in feats if f['kind'] == 'road_segment')
    assert road not in first['cited_feature_ids'] and road not in first['critical_feature_ids']


def test_capacity_respected_and_coverage_bounded(store):
    feats = layout(store)
    result = pp.plan(state_for(feats), trig(), store)
    capacities = {t['id']: t['capacity'] for t in TEAMS['teams']}
    for option in result['options']:
        covered = [c['feature_id'] for a in option['assignments'] for c in a['covers']]
        assert len(covered) == len(set(covered)) == option['covered']
        for a in option['assignments']:
            assert len(a['covers']) <= capacities[a['team_id']] and a['staging_feature_id'] in result['staging_feature_ids']
        assert option['covered'] == min(len(result['critical_feature_ids']), sum(a['capacity'] for a in option['assignments']))
        assert set(option['uncovered_feature_ids']) | set(covered) == set(result['critical_feature_ids'])


def test_capacity_shortfall_reports_uncovered(store, monkeypatch):
    feats = layout(store)
    config = {**TEAMS, 'teams': [{**TEAMS['teams'][0], 'capacity': 1}]}
    result = pp.plan(state_for(feats), trig(), store, config)
    best = result['options'][0]
    assert best['covered'] == 1 and len(best['uncovered_feature_ids']) == len(result['critical_feature_ids']) - 1


def test_exact_bound_and_greedy_fallback(store, monkeypatch):
    feats = layout(store)
    exact = pp.plan(state_for(feats), trig(), store)
    assert exact['search']['method'] == 'exact' and exact['search']['combinations'] <= pp.EXACT_BOUND
    monkeypatch.setattr(pp, 'EXACT_BOUND', 1)
    greedy = pp.plan(state_for(feats), trig(), store)
    assert greedy['search']['method'] == 'greedy' and 1 <= len(greedy['options']) <= 3
    assert greedy == pp.plan(state_for(feats), trig(), store)  # greedy is reproducible too
    placements = [tuple(a['staging_feature_id'] for a in o['assignments']) for o in greedy['options']]
    assert len(placements) == len(set(placements))
    e, g = exact['options'][0], greedy['options'][0]
    assert (-e['covered'], e['max_minutes']) <= (-g['covered'], g['max_minutes'])  # exact is never worse


def test_exact_finds_zero_bottleneck_when_teams_can_sit_on_facilities(store):
    a, b = feature('shelter', 0.05, 0.0), feature('shelter', -0.05, 0.0)
    store.add_exposure([a, b])
    config = {**TEAMS, 'teams': [{**TEAMS['teams'][0], 'capacity': 1}, {**TEAMS['teams'][1], 'capacity': 1}]}
    best = pp.plan(state_for([a, b]), trig(), store, config)['options'][0]
    assert best['covered'] == 2 and best['max_minutes'] == 0.0
    assert {x['staging_feature_id'] for x in best['assignments']} == {a['id'], b['id']}


@pytest.mark.parametrize('case,reason', [('no_exposure', 'no_exposure'), ('roads_only', 'no_critical_facilities'),
                                         ('no_teams', 'no_available_teams'), ('blocked', 'run_blocked'),
                                         ('store_down', 'exposure_unavailable'), ('night_municipal', 'no_available_teams')])
def test_abstentions(store, monkeypatch, case, reason):
    feats = layout(store)
    state, trigger, config = state_for(feats), trig(), None
    if case == 'no_exposure':
        state = {'impact': None, 'judgment': {'decision_band': 'recommended'}}
    elif case == 'roads_only':
        state = state_for([f for f in feats if f['kind'] == 'road_segment'])
    elif case == 'no_teams':
        trigger = trig(hazard='unknown_hazard')
    elif case == 'blocked':
        state = state_for(feats, band='blocked')
    elif case == 'store_down':
        monkeypatch.setattr(store, 'exposure_points', lambda ids: (_ for _ in ()).throw(RuntimeError('relation missing')))
    else:
        config = {**TEAMS, 'teams': [t for t in TEAMS['teams'] if t['id'] == 'syn-team-municipal-01']}
        trigger = trig(at=FIXED.replace(hour=22))
    result = pp.plan(state, trigger, store, config)
    assert result['status'] == 'abstained' and result['reason'] == reason and result['reason'] in pp.REASONS
    assert result['options'] == [] and result['tasks_created'] is False and result['notification_sent'] is False


def test_availability_window_wraps_midnight():
    team = {'available_utc': ['22:00', '04:00']}
    assert pp.available(team, FIXED.replace(hour=23)) and pp.available(team, FIXED.replace(hour=3))
    assert not pp.available(team, FIXED.replace(hour=12)) and not pp.available(team, None)


def test_travel_time_is_road_factor_over_speed():
    model = {'road_factor': 1.0, 'speed_kmh': 60}
    minutes = pp.travel_minutes({'lat': 0.0, 'lon': 0.0}, {'lat': 0.0, 'lon': 1.0}, model)
    assert minutes == pytest.approx(111.2, abs=0.2)
    assert pp.travel_minutes({'lat': 0.0, 'lon': 0.0}, {'lat': 0.0, 'lon': 1.0}, {'road_factor': 2.0, 'speed_kmh': 60}) == pytest.approx(2 * minutes, abs=0.2)


# --- never writes ---------------------------------------------------------------------------------

@pytest.mark.parametrize('module', ['prepositioning.py', 'run_observability.py'])
def test_module_code_never_calls_writes_tasks_or_notify(module):
    tree = ast.parse((Path(__file__).parents[1] / 'app' / module).read_text(encoding='utf-8'))
    called, imported = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            called.add(fn.attr if isinstance(fn, ast.Attribute) else getattr(fn, 'id', ''))
        if isinstance(node, ast.ImportFrom):
            imported |= {alias.name for alias in node.names}
    assert not (called & WRITE_NAMES), called & WRITE_NAMES
    assert not imported & {'department_tasks', 'workflow_store', 'governance', 'connectors'}


class Spy:
    def __init__(self, inner):
        self.inner, self.calls = inner, []

    def __getattr__(self, name):
        self.calls.append(name)
        return getattr(self.inner, name)


def test_runtime_spy_plan_only_reads_exposure(store, monkeypatch):
    feats = layout(store)
    for module in (department_tasks, workflow_store):
        for name in dir(module):
            if not name.startswith('_') and callable(getattr(module, name)) and getattr(getattr(module, name), '__module__', '') == module.__name__:
                monkeypatch.setattr(module, name, lambda *a, _n=name, **k: pytest.fail(f'planner reached {_n}'))
    spy = Spy(store)
    assert pp.plan(state_for(feats), trig(), spy)['status'] == 'planned'
    assert spy.calls == ['exposure_points']


# --- run integration -----------------------------------------------------------------------------

def rain(value):
    rows = [{'id': str(uuid4()), 'connector_id': 'open_meteo', 'hazard': 'heavy_rain', 'observed_at': DAY, 'lat': CENTRE['lat'],
             'lon': CENTRE['lon'], 'value': value, 'unit': 'mm', 'payload': {'point_id': CENTRE['id']}, 'retrieved_at': NOW}]
    for row in rows:
        row['sha256'] = hazard_watch.digest(row)
    return rows


def impact_trigger(store, fired_at=FIXED):
    layout(store)
    rows = rain(HAZARD['candidate'] + 1)
    store.insert_evidence(rows)
    [trigger] = [{**t, 'id': str(uuid4()), 'fired_at': fired_at} for t in hazard_watch.evaluate_all(rows) if t['trigger_id'].startswith('heavy_rain')][:1]
    impact.apply([trigger], store)
    store.insert_trigger(trigger)
    return trigger


def start(trigger):
    response = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']})
    assert response.status_code == 201, response.text
    return response.json()


def advance(run_id, step):
    return client.post(f'/v1/proactive/runs/{run_id}/advance', json={'expected_step': step})


def test_run_plan_step_route_retry_protection_and_handoff(store):
    trigger = impact_trigger(store)
    run = start(trigger)
    assert run['step_budget'] == len(proactive_run.STEPS) == 6
    assert client.get(f"/v1/proactive/runs/{run['id']}/plan").status_code == 409  # plan_not_ready
    for step in ('gather_evidence', 'simulate_variants', 'judge', 'draft_cap'):
        assert advance(run['id'], step).status_code == 200
    assert advance(run['id'], 'hand_to_human').status_code == 409  # cannot skip the plan step
    state = advance(run['id'], 'plan_prepositioning').json()
    assert state['next_step'] == 'hand_to_human' and state['plan']['status'] == 'planned'
    audits = len(store.run_audit(run['id']))
    replay = advance(run['id'], 'plan_prepositioning')  # expected-step retry is a no-op
    assert replay.status_code == 200 and len(store.run_audit(run['id'])) == audits
    plan_audit = [a for a in store.run_audit(run['id']) if a['step'] == 'plan_prepositioning']
    assert len(plan_audit) == 1 and plan_audit[0]['detail']['tasks_created'] is False and plan_audit[0]['detail']['plan_status'] == 'planned'
    body = client.get(f"/v1/proactive/runs/{run['id']}/plan").json()
    assert body['plan'] == state['plan'] and body['plan']['label'].startswith('Recommendation only')
    final = advance(run['id'], 'hand_to_human').json()
    assert final['status'] == 'review_ready' and final['plan'] == state['plan']


def test_cross_agency_plan_and_observability_are_404(store):
    trigger = impact_trigger(store)
    run = start(trigger)
    app.dependency_overrides[get_operator] = lambda: Operator('operator-b', OTHER, frozenset({'incident_operator'}))
    for path in ('plan', 'observability'):
        response = client.get(f"/v1/proactive/runs/{run['id']}/{path}")
        assert response.status_code == 404 and response.json()['detail'] == 'run_not_found'
    app.dependency_overrides[get_operator] = lambda: Operator('checker', AGENCY, frozenset({'incident_checker'}))
    assert client.get(f"/v1/proactive/runs/{run['id']}/plan").status_code == 403


def test_legacy_five_step_run_still_hands_off(store):
    trigger = impact_trigger(store)
    run_id = str(uuid4())
    legacy = proactive_run.new_state(run_id, trigger, 'operator-a')
    legacy.pop('steps'); legacy.pop('step_budget'); legacy['version'] = 'aegis.proactive.run.v1'
    store.create_run(run_id, trigger['id'], legacy, 'operator-a', {}, AGENCY)
    for step in proactive_run.LEGACY_STEPS:
        assert advance(run_id, step).status_code == 200, step
    state = store.runs[run_id]
    assert state['status'] == 'review_ready' and 'plan_prepositioning' not in [c['step'] for c in state['completed_steps']]
    obs = client.get(f'/v1/proactive/runs/{run_id}/observability').json()
    assert [n['step'] for n in obs['nodes']] == list(proactive_run.LEGACY_STEPS) and obs['budget_remaining'] == 0


def test_unknown_step_sequence_fails_closed(store):
    state = {**proactive_run.new_state(str(uuid4()), {'id': str(uuid4())}, 'op'), 'steps': ['gather_evidence', 'dispatch']}
    with pytest.raises(proactive_run.RunError) as error:
        proactive_run.advance(state, 'gather_evidence', 'op', store)
    assert error.value.code == 'run_state_invalid'


def test_scheduler_plans_then_stops_at_hand_to_human(store):
    def refresh():
        return {}, [impact_trigger(store, fired_at=NOW)]
    row = proactive_scheduler.tick(store, AGENCY, refresh)
    assert row['outcome'] == 'completed' and row['runs_started'] == 1, row
    (run_id, state), = store.runs.items()
    assert [c['step'] for c in state['completed_steps']][-1] == 'plan_prepositioning'
    assert state['status'] == 'running' and state['next_step'] == 'hand_to_human' and state['plan']['version'] == pp.VERSION
    assert state['plan']['tasks_created'] is False
    with pytest.raises(proactive_run.RunError):
        proactive_run.advance(state, 'hand_to_human', proactive_scheduler.SUBJECT, store)


# --- observability --------------------------------------------------------------------------------

def test_observability_graph_budget_actor_and_ticks(store):
    trigger = impact_trigger(store)
    run = start(trigger)
    for step in ('gather_evidence', 'simulate_variants'):
        advance(run['id'], step)
    store.insert_tick({'id': str(uuid4()), 'agency_id': AGENCY, 'started_at': NOW, 'finished_at': NOW + timedelta(milliseconds=1250),
                       'outcome': 'completed', 'runs_started': 1, 'flags_recorded': 0, 'errors': [], 'actor': 'system:scheduler'})
    store.insert_tick({'id': str(uuid4()), 'agency_id': OTHER, 'started_at': NOW, 'finished_at': NOW, 'outcome': 'failed',
                       'runs_started': 0, 'flags_recorded': 0, 'errors': [], 'actor': 'system:scheduler'})
    obs = client.get(f"/v1/proactive/runs/{run['id']}/observability").json()
    assert obs['step_budget'] == 6 and obs['budget_used'] == 2 and obs['budget_remaining'] == 4
    assert [e['step'] for e in obs['events']] == ['start', 'gather_evidence', 'simulate_variants']
    assert [e['budget_used'] for e in obs['events']] == [0, 1, 2] and obs['events'][-1]['budget_remaining'] == 4
    for event in obs['events'][1:]:
        assert isinstance(event['duration_ms'], int) and event['duration_ms'] >= 0 and event['actor_kind'] == 'human'
        assert event['outcome'] == 'completed'
    assert [n['status'] for n in obs['nodes']] == ['done', 'done', 'next', 'pending', 'pending', 'pending']
    assert obs['scheduler_ticks'] == [{**obs['scheduler_ticks'][0], 'duration_ms': 1250, 'outcome': 'completed', 'runs_started': 1}]
    client.post(f"/v1/proactive/runs/{run['id']}/cancel", json={'rationale': 'Exercise stopped for review'})
    obs = client.get(f"/v1/proactive/runs/{run['id']}/observability").json()
    assert obs['cancellation'] == {'by_kind': 'human', 'reason': 'Exercise stopped for review'}
    assert obs['events'][-1]['outcome'] == 'cancelled' and obs['nodes'][-1]['status'] == 'blocked'


def test_observability_outcomes_and_sentinel_counts():
    state = {'id': 'r', 'status': 'running', 'created_at': '2026-11-04T06:00:00+00:00', 'next_step': 'hand_to_human',
             'steps': list(proactive_run.STEPS), 'step_budget': 6, 'origin': 'scheduler',
             'completed_steps': [{'step': s, 'completed_by': 'system:scheduler', 'started_at': '2026-11-04T06:00:01+00:00',
                                  'duration_ms': 5} for s in proactive_run.STEPS[:5]],
             'sentinel_flags': [{'flag': 'stale'}, {'flag': 'stale'}, {'flag': 'bogus'}]}
    audit = [{'step': 'start', 'actor': 'system:scheduler', 'at': '2026-11-04T06:00:00+00:00', 'detail': {}}]
    details = {'judge': {'decision_band': 'needs_review'}, 'draft_cap': {'cap': 'skipped_blocked'}, 'plan_prepositioning': {'plan_status': 'abstained'}}
    for step in proactive_run.STEPS[:5]:
        audit.append({'step': step, 'actor': 'system:scheduler', 'at': '2026-11-04T06:00:02+00:00', 'detail': details.get(step, {})})
    audit.append({'step': 'sentinel_flag', 'actor': 'system:sentinel', 'at': '2026-11-04T07:00:00+00:00', 'detail': {'flag': 'stale'}})
    obs = run_observability.build(state, audit, None)
    outcomes = {e['step']: e['outcome'] for e in obs['events']}
    assert outcomes['judge'] == 'needs_review' and outcomes['draft_cap'] == 'skipped_blocked'
    assert outcomes['plan_prepositioning'] == 'abstained' and outcomes['sentinel_flag'] == 'flag_stale'
    assert obs['sentinel_flags'] == {'strengthened': 0, 'weakened': 0, 'contradicted': 0, 'stale': 2}
    assert obs['total_step_ms'] == 25 and obs['scheduler_ticks'] is None and obs['nodes'][-1]['status'] == 'next'
    assert all(e['actor_kind'] == 'system' for e in obs['events'])
