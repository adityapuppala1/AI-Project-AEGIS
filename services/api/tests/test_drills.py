"""A9 exercise drills: simulated clock, synthetic SLA v3 scoring, exercise-only isolation and the kill switch.

Offline (MemoryStore doubles). Test identities come from dependency overrides only.
"""
import base64
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import drills, learning_store, proactive_store
from app.main import app
from app.proposal_simulation import TASK_SLA_MINUTES
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
OTHER = UUID('22222222-2222-4222-8222-222222222222')
SCENARIO = 'known_2000_08_24_heavy_rain'
client = TestClient(app)


def as_(subject, *roles, agency=AGENCY):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, agency, frozenset(roles))


@pytest.fixture(autouse=True)
def stores(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    proactive, learn = proactive_store.MemoryStore(), learning_store.MemoryStore()
    proactive_store.set_store(proactive)
    learning_store.set_store(learn)
    as_('operator-1', 'incident_operator')
    yield proactive, learn
    app.dependency_overrides.clear()
    proactive_store.set_store(None)
    learning_store.set_store(None)


def start(scenario=SCENARIO):
    response = client.post('/v1/proactive/drills', json={'scenario_id': scenario})
    assert response.status_code == 201, response.text
    return response.json()


def clock(drill, minutes):
    response = client.post(f"/v1/proactive/drills/{drill['id']}/clock", json={'expected_minute': drill['sim_minute'], 'minutes': minutes})
    assert response.status_code == 200, response.text
    return response.json()


def act(drill_id, action):
    return client.post(f'/v1/proactive/drills/{drill_id}/respond', json={'action': action})


def full_drill():
    drill = start()
    assert drill['exercise'] is True and drill['trigger_state'] == 'clear' and drill['sim_minute'] == 0
    drill = clock(drill, 60)                       # 41 mm -> watch at minute 60
    assert drill['trigger_state'] == 'watch' and drill['first_watch_minute'] == 60
    drill = clock(drill, 10)
    assert act(drill['id'], 'acknowledge_watch').json()['actions']['acknowledge_watch']['minute'] == 70
    drill = clock(drill, 50)                       # 72 mm -> candidate at minute 120
    assert drill['first_candidate_minute'] == 120
    drill = clock(drill, 40)
    act(drill['id'], 'take_handoff')               # 160: 40 min after candidate (target 30) -> elapsed
    drill = clock(drill, 20)
    act(drill['id'], 'submit')                     # 180: 20 min after hand-off (target 45) -> within
    return drill


def test_drill_scores_timeliness_against_synthetic_sla_v3():
    drill = full_drill()
    as_('operator-1', 'incident_checker')
    assert act(drill['id'], 'approve').json()['detail'] == 'independent_checker_required'  # the submitter cannot approve
    as_('checker-1', 'incident_operator')
    assert act(drill['id'], 'approve').status_code == 409  # needs the checker role
    as_('checker-1', 'incident_checker')
    approved = act(drill['id'], 'approve').json()
    assert approved['status'] == 'completed' and approved['actions']['approve']['minute'] == 180
    report = client.get(f"/v1/proactive/drills/{drill['id']}/report").json()
    rows = {r['action']: r for r in report['actions']}
    assert rows['acknowledge_watch']['target_minutes'] == TASK_SLA_MINUTES['control_room']
    assert (rows['acknowledge_watch']['elapsed_minutes'], rows['acknowledge_watch']['status']) == (10, 'within_synthetic_target')
    assert (rows['take_handoff']['elapsed_minutes'], rows['take_handoff']['status']) == (40, 'synthetic_target_elapsed')
    assert (rows['submit']['elapsed_minutes'], rows['submit']['status']) == (20, 'within_synthetic_target')
    assert (rows['approve']['elapsed_minutes'], rows['approve']['status']) == (0, 'within_synthetic_target')
    assert report['counts']['synthetic_target_elapsed'] == 1 and report['exercise'] is True
    assert report['cited_event_ids'][0] == 'known_events:2000-08-24' and len(report['cited_event_ids']) == 5
    assert 'not forecasting accuracy' in report['note'] and 'not contractual' in report['note']
    assert report['sla_policy'] == 'aegis.exercise.department-sla.v1'


def test_drill_order_retry_and_clock_protection():
    drill = start()
    assert act(drill['id'], 'acknowledge_watch').json()['detail'] == 'no_watch_yet'
    drill = clock(drill, 60)
    stale = client.post(f"/v1/proactive/drills/{drill['id']}/clock", json={'expected_minute': 0, 'minutes': 5})
    assert stale.status_code == 409 and stale.json()['detail'] == 'clock_stale'
    assert act(drill['id'], 'take_handoff').json()['detail'] == 'handoff_not_ready'
    assert act(drill['id'], 'acknowledge_watch').status_code == 200
    again = act(drill['id'], 'acknowledge_watch').json()
    assert again['actions']['acknowledge_watch']['minute'] == 60  # retry never re-stamps
    assert act(drill['id'], 'dispatch').status_code == 422
    for body in ({'expected_minute': 60, 'minutes': 0}, {'expected_minute': 60, 'minutes': 241}, {'expected_minute': '60', 'minutes': 5},
                 {'expected_minute': 60, 'minutes': 5, 'wall_clock': True}):
        assert client.post(f"/v1/proactive/drills/{drill['id']}/clock", json=body).status_code == 422
    end = clock(drill, 240)
    end = clock(end, 240) if end['status'] == 'running' else end
    assert end['status'] == 'completed' and end['sim_minute'] == end['end_minute']
    assert act(drill['id'], 'take_handoff').json()['detail'] == 'drill_completed'
    report = client.get(f"/v1/proactive/drills/{drill['id']}/report").json()
    assert {r['action']: r['status'] for r in report['actions']}['take_handoff'] == 'not_taken'


def test_drills_are_deterministic_on_the_simulated_clock():
    def play():
        state = drills.new_drill(SCENARIO, 'operator-1', drill_id='00000000-0000-4000-8000-0000000000aa', created_at='2026-01-01T00:00:00+00:00')
        state = drills.advance_clock(state, 0, 60)[0]
        state = drills.respond(state, 'acknowledge_watch', 'operator-1', frozenset({'incident_operator'}))[0]
        state = drills.advance_clock(state, 60, 90)[0]
        state = drills.respond(state, 'take_handoff', 'operator-1', frozenset({'incident_operator'}))[0]
        return state, drills.report(state)
    first, second = play(), play()
    assert first == second
    assert first[0]['injected'][-1]['evidence_id'] == second[0]['injected'][-1]['evidence_id']
    assert first[0]['sim_epoch'] == '2000-08-24T00:00:00+00:00'


def test_drills_cannot_write_non_exercise_data(stores):
    proactive, learn = stores
    drill = full_drill()
    as_('checker-1', 'incident_checker')
    act(drill['id'], 'approve')
    # Nothing reached the proactive watch, runs, triggers or learning tables.
    assert proactive.evidence == [] and proactive.triggers == [] and proactive.runs == {} and proactive.run_audits == []
    assert learn.windows == {} and learn.proposals == {} and learn.versions == []
    state = learn.drills[drill['id']]
    assert state['exercise'] is True and state['operational_actions_enabled'] is False and state['notifications_sent'] is False
    assert {i['evidence_id'] for i in state['injected']} and all(a['drill_id'] == drill['id'] for a in learn.drill_audits[1:])
    # A tampered, non-exercise state is refused before any change.
    with pytest.raises(drills.DrillError):
        drills.advance_clock({**state, 'exercise': False, 'status': 'running'}, state['sim_minute'], 5)
    with pytest.raises(drills.DrillError):
        drills.respond({**state, 'exercise': False}, 'submit', 'x', frozenset({'incident_operator'}))
    with pytest.raises(ValueError):
        learn.create_drill('d', AGENCY, 's', {'exercise': False}, 'operator-1', {})


def test_kill_switch_blocks_drill_writes_but_not_reads(stores):
    proactive, _ = stores
    drill = start()
    proactive.set_pause(True, 'Pause drills for the kill-switch test', 'admin-1')
    assert client.post('/v1/proactive/drills', json={'scenario_id': SCENARIO}).json()['detail'] == 'proactive_paused'
    assert client.post(f"/v1/proactive/drills/{drill['id']}/clock", json={'expected_minute': 0, 'minutes': 5}).status_code == 409
    assert act(drill['id'], 'acknowledge_watch').json()['detail'] == 'proactive_paused'
    assert client.get(f"/v1/proactive/drills/{drill['id']}").status_code == 200
    assert client.get(f"/v1/proactive/drills/{drill['id']}/report").status_code == 200


def test_drills_are_agency_scoped_and_role_checked():
    drill = start()
    as_('other', 'incident_operator', agency=OTHER)
    assert client.get(f"/v1/proactive/drills/{drill['id']}").status_code == 404
    assert client.get('/v1/proactive/drills').json()['drills'] == []
    assert act(drill['id'], 'acknowledge_watch').status_code == 404
    as_('auditor', 'incident_auditor')
    assert client.post('/v1/proactive/drills', json={'scenario_id': SCENARIO}).status_code == 403
    assert client.get('/v1/proactive/drills/scenarios').json()['targets']['take_handoff']['target_minutes'] == 30
    as_('operator-1', 'incident_operator')
    assert client.post('/v1/proactive/drills', json={'scenario_id': 'nope'}).status_code == 404
    assert client.post('/v1/proactive/drills', json={'scenario_id': SCENARIO, 'agency_id': str(OTHER)}).status_code == 422
    as_('system:scheduler', 'incident_operator')
    assert act(drill['id'], 'acknowledge_watch').status_code == 409
