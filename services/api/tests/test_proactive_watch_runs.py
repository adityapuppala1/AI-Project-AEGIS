import base64
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app import connectors, hazard_watch, jev_client, proactive_cap, proactive_replay, proactive_run, proactive_store
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
NOW = datetime.now(timezone.utc)
DAY = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
client = TestClient(app)
P0 = hazard_watch.RAIN_POINTS[0]


@pytest.fixture(autouse=True)
def proactive(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    store = proactive_store.MemoryStore()
    proactive_store.set_store(store)
    app.dependency_overrides[get_operator] = lambda: Operator('operator-1', AGENCY, frozenset({'incident_operator'}))
    yield store
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


def ev(hazard, value, point=P0, connector='open_meteo', days=0, **payload):
    return {'id': str(uuid4()), 'connector_id': connector, 'hazard': hazard, 'observed_at': DAY - timedelta(days=days),
            'lat': point['lat'], 'lon': point['lon'], 'value': value, 'unit': 'u', 'payload': {'point_id': point['id'], **payload},
            'retrieved_at': NOW}


@pytest.mark.parametrize('hazard,clear,watch,candidate,extra', [
    ('heavy_rain', 10, 40, 70, {}), ('wind', 30, 61, 95, {}), ('heat', 35, 43, 46, {}),
    ('landslide', 0.1, 0.6, 0.85, {}), ('river_discharge', 10, 25, 60, {'median': 10})])
def test_trigger_states_for_value_hazards(hazard, clear, watch, candidate, extra):
    for value, state in ((clear, 'clear'), (watch, 'watch'), (candidate, 'candidate')):
        rows = [ev(hazard, value, **extra), ev(hazard, clear, days=1, **extra)]
        trigger = hazard_watch.evaluate(rows)[0]
        assert trigger['state'] == state and trigger['hazard'] == hazard
        assert set(trigger['evidence_ids']) == {r['id'] for r in rows}
        assert trigger['rationale']['threshold'] and 'not calibrated' in trigger['rationale']['note']


def test_fire_counts_high_confidence_within_10km():
    near = [ev('fire', 5.0, connector='nasa_firms', confidence='h') for _ in range(10)]
    low = [ev('fire', 5.0, connector='nasa_firms', confidence='l') for _ in range(5)]
    far = [{**ev('fire', 5.0, connector='nasa_firms', confidence='h'), 'lat': P0['lat'] + 1}]
    first = next(t for t in hazard_watch.evaluate(near + low + far) if t['trigger_id'] == 'fire:' + P0['id'])
    assert first['state'] == 'candidate' and first['score'] == 10 and len(first['evidence_ids']) == 10
    assert next(t for t in hazard_watch.evaluate(near[:3]) if t['trigger_id'] == 'fire:' + P0['id'])['state'] == 'watch'


def test_firms_csv_parse_keeps_only_nearby():
    text = ('latitude,longitude,acq_date,acq_time,confidence,frp,satellite\n'
            f"{P0['lat']},{P0['lon']},2026-11-01,0830,h,12.5,N\n10.0,70.0,2026-11-01,0830,h,3,N\nbad,row,x,y,h,1,N\n")
    rows = hazard_watch.parse_firms_csv(text)
    assert len(rows) == 1 and rows[0]['value'] == 12.5 and rows[0]['observed_at'].hour == 8
    with pytest.raises(hazard_watch.AdapterError):
        hazard_watch.parse_firms_csv('nope\n1\n')


def forecast_payload():
    days = [(DAY + timedelta(days=i)).date().isoformat() for i in range(3)]
    return [{'daily': {'time': days, 'precipitation_sum': [70, 1, 0], 'wind_gusts_10m_max': [20, 20, 20],
                       'temperature_2m_max': [30, 31, 32]}} for _ in hazard_watch.RAIN_POINTS]


def flood_payload():
    days = [(DAY + timedelta(days=i)).date().isoformat() for i in range(2)]
    return [{'daily': {'time': days, 'river_discharge': [5, 30], 'river_discharge_median': [5, 5]}} for _ in hazard_watch.DISCHARGE_POINTS]


def enable(store, connector_id, **settings):
    store.configs[connector_id] = {'enabled': True, 'settings': settings, 'version': 1}


def test_refresh_with_one_failing_connector(monkeypatch, proactive):
    enable(proactive, 'open_meteo')
    enable(proactive, 'nasa_lhasa')
    enable(proactive, 'copernicus_cdse')

    def fake(url, hosts, **kwargs):
        if 'maps.nccs.nasa.gov' in url:
            raise OSError('down')
        return 200, json.dumps(flood_payload() if 'flood-api' in url else forecast_payload()).encode()
    monkeypatch.setattr(connectors, 'bounded_request', fake)
    response = client.post('/v1/proactive/watch/refresh')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['fetched']['nasa_lhasa'] == 'network_error'
    assert body['fetched']['copernicus_cdse'] == 'not_implemented_in_demo'
    assert body['fetched']['nasa_firms'] == 'disabled' and body['fetched']['imd_warnings'] == 'disabled'
    assert body['fetched']['open_meteo'] == 9 * 9 + 5 * 2 and body['evidence_added'] == 91
    assert body['triggers']['candidate'] == 9 + 5
    again = client.post('/v1/proactive/watch/refresh').json()
    assert again['evidence_added'] == 0 and len(proactive.evidence) == 91
    watch = client.get('/v1/proactive/watch').json()
    assert len(watch['evidence']) <= 500 and not any(e['stale'] for e in watch['evidence'])
    known = {e['id'] for e in watch['evidence']}
    assert all(set(t['evidence_ids']) <= known for t in watch['triggers'])
    assert 'not calibrated' in watch['disclaimer']
    assert client.get('/v1/proactive/watch/history?days=7').json()['history']
    assert client.get('/v1/proactive/triggers/config').json()['hazards']['heavy_rain']['candidate'] == 64.5
    assert proactive.runs == {} and proactive.audit == []  # refresh creates no run, case, proposal or task


def test_watch_marks_stale_and_needs_a_verified_operator(proactive, monkeypatch):
    row = ev('heavy_rain', 1)
    row['retrieved_at'] = NOW - timedelta(hours=25)
    row['sha256'] = 'a' * 64
    proactive.evidence.append(row)
    assert client.get('/v1/proactive/watch').json()['evidence'][0]['stale'] is True
    app.dependency_overrides.clear()
    monkeypatch.setenv('OIDC_ISSUER', 'https://idp.example.test')
    monkeypatch.setenv('OIDC_AUDIENCE', 'aegis-api')
    monkeypatch.setenv('OIDC_JWKS_URL', 'https://idp.example.test/jwks')
    assert client.get('/v1/proactive/watch').status_code == 401


# --- Jev ---------------------------------------------------------------------------------------

def jev_answer(choice='prepare_exercise_cap_draft', conf=0.95, citation=0.95, stale=0.1, tokens=120):
    return {'model': 'jev-latest', 'answers': {
        'playbook_option': {'type': 'choice', 'choice': choice, 'confidence': conf, 'probabilities': {choice: conf, 'none_escalate': 1 - conf}},
        'citation_clean': {'type': 'noul', 'noul': citation},
        'severity_band': {'type': 'score', 'score': 2.4, 'confidence': 0.6, 'legend': {}, 'probabilities': {'0': 0.1, '1': 0.1, '2': 0.1, '3': 0.7}},
        'staleness_risk': {'type': 'noul', 'noul': stale}}, 'usage': {'input_tokens': tokens, 'output_tokens': 3}}


def enable_jev(store, budget=200_000):
    from app import connector_secrets
    ciphertext, nonce = connector_secrets.encrypt('ts-secret-key', 'typesafe_jev', 'api_key')
    store.secrets['typesafe_jev'] = {'api_key': (ciphertext, nonce, 'abcd1234')}
    store.configs['typesafe_jev'] = {'enabled': True, 'settings': {'model': 'jev-latest', 'monthly_input_token_budget': budget}, 'version': 1}


def test_jev_request_shape_and_parse(proactive):
    enable_jev(proactive)
    sent = {}

    def transport(url, body, key):
        sent.update(url=url, body=json.loads(body), key=key)
        return 200, json.dumps(jev_answer()).encode()
    state = jev_client.build_state({'trigger_id': 't', 'hazard': 'heavy_rain', 'state': 'candidate'}, [ev('heavy_rain', 70)], [])
    result = jev_client.judge(state, 'op', transport=transport)
    assert sent['url'] == 'https://api.typesafe.ai/v1/systemone' and sent['key'] == 'ts-secret-key'
    assert set(sent['body']) == {'model', 'state', 'questions'}
    q = sent['body']['questions']
    assert set(q) == {'playbook_option', 'citation_clean', 'severity_band', 'staleness_risk'}
    assert q['playbook_option']['type'] == 'choice' and 'none_escalate' in q['playbook_option']['criteria']
    assert q['citation_clean']['type'] == q['staleness_risk']['type'] == 'noul'
    assert q['severity_band']['type'] == 'score' and len(q['severity_band']['criteria']) == 4
    assert 'ts-secret-key' not in json.dumps(sent['body'])
    assert result['provider'] == 'typesafe_jev' and result['playbook_option']['choice'] == 'prepare_exercise_cap_draft'
    assert proactive.monthly_input_tokens('typesafe_jev') == 120


def test_jev_rejects_unknown_choice_and_budget(proactive):
    enable_jev(proactive, budget=1000)
    with pytest.raises(jev_client.JevError):
        jev_client.judge({}, 'op', transport=lambda *a: (200, json.dumps(jev_answer(choice='dispatch_now')).encode()))
    jev_client.judge({}, 'op', transport=lambda *a: (200, json.dumps(jev_answer(tokens=1000)).encode()))
    with pytest.raises(jev_client.JevError, match='budget_exhausted'):
        jev_client.judge({}, 'op', transport=lambda *a: pytest.fail('called over budget'))


def test_jev_test_double_is_deterministic():
    state = jev_client.build_state({'trigger_id': 't', 'state': 'candidate'}, [{'id': 'x', 'hazard': 'h', 'stale': False}], [])
    first, second = jev_client.judge(state, 'op'), jev_client.judge(state, 'op')
    assert first == second and first['provider'] == 'test_double'


# --- runs --------------------------------------------------------------------------------------

def seed_trigger(store, value=70, state='candidate'):
    rows = [ev('heavy_rain', value), ev('heavy_rain', 5, days=1)]
    for row in rows:
        row['sha256'] = uuid4().hex * 2
    store.insert_evidence(rows)
    trigger = {**hazard_watch.evaluate(rows)[0], 'id': str(uuid4()), 'fired_at': NOW}
    trigger['state'] = state
    store.insert_trigger(trigger)
    return trigger


def run_all(trigger_id):
    run = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger_id})
    assert run.status_code == 201, run.text
    run = run.json()
    for step in proactive_run.STEPS:
        response = client.post(f"/v1/proactive/runs/{run['id']}/advance", json={'expected_step': step})
        assert response.status_code == 200, response.text
        run = response.json()
    return run


def test_full_run_review_ready_with_exercise_cap(proactive):
    trigger = seed_trigger(proactive)
    run = run_all(trigger['id'])
    assert run['status'] == 'review_ready' and run['next_step'] is None
    assert run['needs_accountable_human_review'] is True and run['operational_actions_enabled'] is False
    assert run['judgment']['provider'] == 'test_double' and run['judgment']['decision_band'] == 'recommended'
    assert [v['id'] for v in run['variants']] == ['threshold_minus_20', 'threshold_baseline', 'threshold_plus_20', 'newest_evidence_only']
    assert [v['threshold_delta'] for v in run['variants']][:3] == [-0.2, 0.0, 0.2]
    assert set(run['evidence_ids']) == set(trigger['evidence_ids'])
    cap = client.get(f"/v1/proactive/runs/{run['id']}/cap.xml")
    assert cap.status_code == 200 and cap.headers['x-content-sha256'] == run['cap']['sha256']
    assert ET.fromstring(cap.content).findtext('{urn:oasis:names:tc:emergency:cap:1.2}status') == 'Exercise'
    detail = client.get(f"/v1/proactive/runs/{run['id']}").json()
    assert [a['step'] for a in detail['audit']] == ['start', *proactive_run.STEPS] and 'cap_xml' not in detail
    replay = client.post(f"/v1/proactive/runs/{run['id']}/advance", json={'expected_step': 'judge'})
    assert replay.status_code == 200 and len(proactive.run_audit(run['id'])) == len(proactive_run.STEPS) + 1


def test_expected_step_mismatch_and_cancel(proactive):
    trigger = seed_trigger(proactive)
    run = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']}).json()
    assert client.post(f"/v1/proactive/runs/{run['id']}/advance", json={'expected_step': 'judge'}).status_code == 409
    assert client.post(f"/v1/proactive/runs/{run['id']}/cancel", json={'rationale': 'short'}).status_code == 422
    cancelled = client.post(f"/v1/proactive/runs/{run['id']}/cancel", json={'rationale': 'Not needed for this exercise'})
    assert cancelled.json()['status'] == 'cancelled'
    assert client.post(f"/v1/proactive/runs/{run['id']}/advance", json={'expected_step': 'gather_evidence'}).status_code == 409
    assert client.get(f"/v1/proactive/runs/{run['id']}/cap.xml").status_code == 409


def test_run_rejects_clear_and_unknown_trigger(proactive):
    assert client.post('/v1/proactive/runs', json={'trigger_event_id': str(uuid4())}).status_code == 404
    clear = seed_trigger(proactive, value=1, state='clear')
    assert client.post('/v1/proactive/runs', json={'trigger_event_id': clear['id']}).status_code == 409


@pytest.mark.parametrize('playbook,citation,stale,band', [
    (0.95, 0.95, 0.1, 'recommended'), (0.95, 0.95, 0.6, 'needs_review'), (0.7, 0.95, 0.1, 'needs_review'),
    (0.4, 0.99, 0.0, 'blocked'), (0.95, 0.85, 0.0, 'blocked'), (0.9, 0.9, 0.49, 'recommended')])
def test_decision_bands(playbook, citation, stale, band):
    judgment = {'playbook_option': {'confidence': playbook}, 'citation_clean': {'noul': citation}, 'staleness_risk': {'noul': stale}}
    assert proactive_run.decision_band(judgment) == band


def test_blocked_run_skips_cap(monkeypatch, proactive):
    enable_jev(proactive)
    trigger = seed_trigger(proactive)
    original = jev_client.judge
    monkeypatch.setattr(jev_client, 'judge', lambda s, a, transport=None: original(s, a, transport=lambda *x: (200, json.dumps(jev_answer(citation=0.5)).encode())))
    run = run_all(trigger['id'])
    assert run['judgment']['decision_band'] == 'blocked' and run['cap'] is None and run['status'] == 'review_ready'


def test_jev_failure_blocks_without_raising(monkeypatch, proactive):
    enable_jev(proactive, budget=1000)
    proactive.add_audit('typesafe_jev', 'test', True, {'input_tokens': 5000}, 'x')
    run = run_all(seed_trigger(proactive)['id'])
    assert run['judgment']['error'] == 'budget_exhausted' and run['judgment']['decision_band'] == 'blocked'


def test_cap_refuses_actual():
    run = {'id': str(uuid4()), 'evidence_ids': [], 'operational_actions_enabled': False, 'needs_accountable_human_review': True}
    trigger = {'id': str(uuid4()), 'hazard': 'heavy_rain', 'state': 'candidate'}
    for status in ('Actual', 'System', 'Draft'):
        with pytest.raises(proactive_cap.CapRefused):
            proactive_cap.exercise_cap_xml(run, trigger, status=status)
    with pytest.raises(proactive_cap.CapRefused):
        proactive_cap.exercise_cap_xml({**run, 'operational_actions_enabled': True}, trigger)
    assert proactive_cap.self_check(proactive_cap.exercise_cap_xml)


# --- replay CLI --------------------------------------------------------------------------------

def test_replay_guards(tmp_path, capsys):
    assert proactive_replay.main(['--train', '--research-dir', str(tmp_path)]) == 2
    assert 'Raw pilot data not found' in capsys.readouterr().err
    assert proactive_replay.main(['--final-test', '--research-dir', str(tmp_path)]) == 2
    (tmp_path / 'raw' / 'openmeteo-archive').mkdir(parents=True)
    (tmp_path / 'catalogue').mkdir()
    (tmp_path / 'raw' / 'openmeteo-archive' / 'p.json').write_text(json.dumps({'daily': {
        'time': ['2010-07-01', '2010-07-02', '2019-07-01', '2020-10-13'], 'precipitation_sum': [80, 0, 40, 100]}}))
    (tmp_path / 'catalogue' / 'known_events.csv').write_text(
        'date,event,label\n2010-07-02,a,flood_event\n2020-10-13,b,flood_event\n2011-01-01,c,other\n')
    assert proactive_replay.main(['--train', '--research-dir', str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert '2000-2017' in out and 'not calibrated' in out
    assert not (tmp_path / 'results').exists()
    args = ['--final-test', '--i-understand-test-years-are-used-once', '--research-dir', str(tmp_path)]
    assert proactive_replay.main(args) == 0
    assert (tmp_path / 'results' / 'FINAL_TEST_USED').is_file() and list((tmp_path / 'results').glob('final_test_*.txt'))
    assert proactive_replay.main(args) == 3


def test_replay_scoring():
    from datetime import date
    rain = {'2010-07-01': 80.0, '2010-07-05': 70.0, '2010-07-06': 70.0, '2010-08-01': 40.0}
    result = proactive_replay.score(rain, [date(2010, 7, 2), date(2012, 1, 1)], 'candidate')
    assert result == {'level': 'candidate', 'threshold_mm': 64.5, 'fired_days': 3, 'hits': 1, 'misses': 1, 'false_alarm_episodes': 1}
