"""A3 impact-based triggers: exposure counting, rule edges, refresh/run/CAP wiring, scheduler dedupe.

Offline MemoryStore double; exposure features carry a representative lat/lon. All thresholds and
exposure values are synthetic rehearsal inputs, not damage or casualty estimates or accuracy claims.
"""
import base64
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app import hazard_watch, impact, jev_client, proactive_cap, proactive_run, proactive_scheduler, proactive_store
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
NOW = datetime.now(timezone.utc)
DAY = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
CENTRE = next(p for p in hazard_watch.RAIN_POINTS if p['id'] == 'hyd_17.40_78.47')
EMPTY = next(p for p in hazard_watch.RAIN_POINTS if p['id'] == 'hyd_17.50_78.35')
CONFIG = impact.load_config()
RAIN = CONFIG['hazards']['heavy_rain']
HAZARD = hazard_watch.load_config()['hazards']['heavy_rain']
client = TestClient(app)


@pytest.fixture(autouse=True)
def store(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    memory = proactive_store.MemoryStore()
    proactive_store.set_store(memory)
    app.dependency_overrides[get_operator] = lambda: Operator('impact-operator', AGENCY, frozenset({'incident_operator'}))
    yield memory
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


def feature(kind, lat=CENTRE['lat'], lon=CENTRE['lon'], count=1, synthetic=True, licence='Synthetic AEGIS exercise fixture'):
    return {'id': str(uuid4()), 'kind': kind, 'lat': lat, 'lon': lon, 'count': count, 'weight': 1.0,
            'synthetic': synthetic, 'source': 'test', 'licence': licence}


def seeded(memory, people=35000, facilities=('hospital', 'school', 'school', 'shelter')):
    memory.add_exposure([feature(kind) for kind in facilities] + [feature('road_segment')]
                        + ([feature('population_cell', count=people)] if people else []))


def rain(value, point=CENTRE):
    rows = [{'id': str(uuid4()), 'connector_id': 'open_meteo', 'hazard': 'heavy_rain', 'observed_at': DAY, 'lat': point['lat'],
             'lon': point['lon'], 'value': value, 'unit': 'mm', 'payload': {'point_id': point['id']}, 'retrieved_at': NOW}]
    for row in rows:
        row['sha256'] = hazard_watch.digest(row)
    return rows


def triggers_for(memory, value, point=CENTRE):
    triggers = [{**t, 'id': str(uuid4()), 'fired_at': NOW} for t in hazard_watch.evaluate_all(rain(value, point))]
    return impact.apply(triggers, memory)


# --- pure rules -----------------------------------------------------------------------------------

def counts(people=0, facilities=0, roads=0):
    return {'people_exposed': people, 'critical_facilities': facilities, 'road_segments': roads}


@pytest.mark.parametrize('hazard_state,exposure,expected', [
    ('candidate', counts(people=RAIN['candidate']['any_of']['people_exposed']), 'candidate'),       # inclusive edge
    ('candidate', counts(people=RAIN['candidate']['any_of']['people_exposed'] - 1), 'watch'),       # just below -> watch rule
    ('candidate', counts(facilities=RAIN['candidate']['any_of']['critical_facilities']), 'candidate'),
    ('candidate', counts(), 'clear'),                                                               # no exposure in footprint
    ('watch', counts(people=10**7, facilities=99), 'watch'),                                        # exposure cannot exceed hazard
    ('watch', counts(people=RAIN['watch']['any_of']['people_exposed']), 'watch'),
    ('watch', counts(people=RAIN['watch']['any_of']['people_exposed'] - 1), 'clear'),
    ('clear', counts(people=10**7, facilities=99), 'clear'),
])
def test_classify_edges(hazard_state, exposure, expected):
    assert impact.classify(hazard_state, exposure, RAIN)[0] == expected


def test_summarize_counts_and_labels_synthetic_licensed_and_mixed():
    synthetic = [feature('hospital'), feature('population_cell', count=1200), feature('road_segment')]
    summary = impact.summarize(synthetic, 5)
    assert summary['people_exposed'] == 1200 and summary['critical_facilities'] == 1 and summary['road_segments'] == 1
    assert summary['data_basis'] == 'synthetic'
    assert impact.LABELS[summary['data_basis']] == 'impact-based (synthetic exposure)'
    assert sorted(summary['exposure_feature_ids']) == sorted(f['id'] for f in synthetic)
    licensed = [feature('school', synthetic=False, licence='ODbL-1.0')]
    assert impact.summarize(licensed, 5)['data_basis'] == 'licensed'
    assert impact.summarize(licensed, 5)['licences'] == ['ODbL-1.0']
    assert impact.summarize(synthetic + licensed, 5)['data_basis'] == 'mixed'
    assert impact.summarize([], 5)['data_basis'] == 'none'
    weird = [{'id': 'x', 'kind': 'stadium', 'synthetic': True}, feature('population_cell', count=float('nan'))]
    assert impact.summarize(weird, 5)['people_exposed'] == 0 and impact.summarize(weird, 5)['feature_count'] == 1


# --- apply / refresh ------------------------------------------------------------------------------

def test_empty_layer_keeps_hazard_state_labelled_hazard_only(store):
    [trigger] = [t for t in triggers_for(store, HAZARD['candidate'] + 1) if t['hazard'] == 'heavy_rain']
    assert trigger['state'] == 'candidate'
    assert trigger['rationale']['impact']['status'] == 'exposure_layer_empty'
    assert trigger['rationale']['impact']['label'] == impact.HAZARD_ONLY_LABEL


def test_unreadable_layer_keeps_hazard_state(store, monkeypatch):
    monkeypatch.setattr(store, 'exposure_layer_count', lambda: (_ for _ in ()).throw(RuntimeError('relation missing')))
    [trigger] = triggers_for(store, HAZARD['candidate'] + 1)
    assert trigger['state'] == 'candidate' and trigger['rationale']['impact']['status'] == 'exposure_unavailable'
    assert 'relation missing' not in str(trigger)


def test_footprint_with_exposure_is_candidate_and_cites_features(store):
    seeded(store)
    [trigger] = triggers_for(store, HAZARD['candidate'] + 1)
    block = trigger['rationale']['impact']
    assert trigger['state'] == 'candidate' and block['hazard_state'] == 'candidate'
    assert block['people_exposed'] == 35000 and block['critical_facilities'] == 4 and block['road_segments'] == 1
    assert block['label'] == 'impact-based (synthetic exposure)' and block['config_version'] == CONFIG['version']
    assert len(block['exposure_feature_ids']) == 6 and block['footprint_radius_km'] == RAIN['footprint_radius_km']


def test_footprint_without_exposure_downgrades_to_clear(store):
    seeded(store)  # exposure exists only around the centre point
    [trigger] = triggers_for(store, HAZARD['candidate'] + 1, point=EMPTY)
    assert trigger['state'] == 'clear' and trigger['rationale']['impact']['hazard_state'] == 'candidate'
    assert trigger['rationale']['impact']['label'] == 'impact-based (no exposure in footprint)'
    assert trigger['rationale']['impact']['exposure_feature_ids'] == []


def test_feature_just_outside_footprint_is_not_counted(store):
    radius = RAIN['footprint_radius_km']
    offset = (radius + 0.3) / 111.0
    store.add_exposure([feature('hospital', lat=CENTRE['lat'] + offset), feature('hospital', lat=CENTRE['lat'] + (radius - 0.3) / 111.0)])
    [trigger] = triggers_for(store, HAZARD['candidate'] + 1)
    assert trigger['rationale']['impact']['critical_facilities'] == 1


def test_refresh_watch_view_and_impact_config_route(store, monkeypatch):
    seeded(store)
    store.save_connector('open_meteo', 0, True, {}, {}, 'admin', [])
    monkeypatch.setitem(hazard_watch.ADAPTERS, 'open_meteo', lambda settings: [
        {k: v for k, v in r.items() if k not in {'id', 'sha256', 'retrieved_at'}} for r in rain(HAZARD['candidate'] + 5)])
    response = client.post('/v1/proactive/watch/refresh')
    assert response.status_code == 200, response.text
    watch = client.get('/v1/proactive/watch').json()
    assert watch['impact_config_version'] == CONFIG['version']
    [item] = [t for t in watch['triggers'] if t['hazard'] == 'heavy_rain']
    assert item['state'] == 'candidate' and item['impact']['people_exposed'] == 35000
    assert 'impact' not in item['rationale']
    config = client.get('/v1/proactive/triggers/impact-config').json()
    assert config['impact']['version'] == 'aegis.impact-triggers.v2' and config['feeds']['version'] == 'aegis.feed-triggers.v1'
    assert client.get('/v1/proactive/triggers/config').json()['version'] == 'aegis.hazard-triggers.v1'  # v1 unchanged


# --- run evidence bundle, variants and CAP --------------------------------------------------------

def run_to_cap(store, trigger):
    store.insert_trigger(trigger)
    run_id = client.post('/v1/proactive/runs', json={'trigger_event_id': trigger['id']}).json()['id']
    for step in ('gather_evidence', 'simulate_variants', 'judge', 'draft_cap'):
        response = client.post(f'/v1/proactive/runs/{run_id}/advance', json={'expected_step': step})
        assert response.status_code == 200, response.text
    return run_id, response.json()


def test_run_bundle_variants_and_cap_carry_exposure(store, monkeypatch):
    choice = sorted(jev_client.PLAYBOOK_OPTIONS)[0]
    monkeypatch.setattr(jev_client, 'judge', lambda state, actor, transport=None: {
        'provider': 'test_double', 'model': 'fixed', 'playbook_option': {'choice': choice, 'confidence': 0.95},
        'citation_clean': {'noul': 0.99}, 'severity_band': {'score': 2}, 'staleness_risk': {'noul': 0.1}})
    seeded(store)
    rows = rain(HAZARD['candidate'] + 1)
    store.insert_evidence(rows)
    [trigger] = [{**t, 'id': str(uuid4()), 'fired_at': NOW} for t in hazard_watch.evaluate_all(rows)]
    impact.apply([trigger], store)
    run_id, state = run_to_cap(store, trigger)
    assert state['impact']['people_exposed'] == 35000 and state['impact']['data_basis'] == 'synthetic'
    assert len(state['impact']['exposure_feature_ids']) == 6
    audit = client.get(f'/v1/proactive/runs/{run_id}').json()['audit']
    gather = next(a for a in audit if a['step'] == 'gather_evidence')
    assert gather['detail']['impact']['critical_facilities'] == 4
    baseline = next(v for v in state['variants'] if v['id'] == 'threshold_baseline')
    assert baseline['resulting_state'] == 'candidate'
    assert state['cap'] and state['judgment']['decision_band'] == 'recommended'
    xml = client.get(f'/v1/proactive/runs/{run_id}/cap.xml').content
    ns = '{urn:oasis:names:tc:emergency:cap:1.2}'
    info = ET.fromstring(xml).find(ns + 'info')
    area = info.find(ns + 'area').findtext(ns + 'areaDesc')
    assert '35000 people' in area and '4 critical facilities' in area and 'synthetic exposure' in area
    assert 'not a damage, casualty or inundation estimate' in info.findtext(ns + 'instruction')
    assert ET.fromstring(xml).findtext(ns + 'status') == 'Exercise'
    params = {p.findtext(ns + 'valueName'): p.findtext(ns + 'value') for p in info.findall(ns + 'parameter')}
    assert params['aegis.impact_config_version'] == CONFIG['version'] and params['aegis.people_exposed'] == '35000'


def test_simulation_reapplies_stored_exposure(store):
    seeded(store, people=0, facilities=())  # only a road segment: heavy_rain rules need people or facilities
    rows = rain(HAZARD['candidate'] + 1)
    [trigger] = impact.apply([{**t, 'id': str(uuid4()), 'fired_at': NOW} for t in hazard_watch.evaluate_all(rows)], store)
    assert trigger['state'] == 'clear'
    for variant in proactive_run.simulate(trigger, [{**r, 'stale': False} for r in rows]):
        assert variant['resulting_state'] == 'clear'


def cap_for(impact_block):
    sample = '00000000-0000-4000-8000-000000000001'
    run = {'id': sample, 'evidence_ids': [sample], 'operational_actions_enabled': False, 'needs_accountable_human_review': True}
    trigger = {'id': sample, 'hazard': 'heavy_rain', 'state': 'candidate', 'trigger_id': 'heavy_rain:x', 'lat': 17.4, 'lon': 78.47,
               'rationale': {'impact': impact_block} if impact_block is not None else {}}
    return proactive_cap.exercise_cap_xml(run, trigger).decode()


def test_cap_templates_hazard_only_unchanged_and_bad_blocks_refused():
    assert 'Exercise grid point; no validated hazard footprint' in cap_for(None)
    assert 'Exercise grid point; no validated hazard footprint' in cap_for({'status': 'exposure_layer_empty'})
    good = {'status': 'evaluated', 'config_version': CONFIG['version'], 'state': 'candidate', 'data_basis': 'licensed',
            'footprint_radius_km': 5, 'people_exposed': 10, 'critical_facilities': 2, 'road_segments': 0,
            'exposure_feature_ids': ['00000000-0000-4000-8000-000000000002']}
    text = cap_for(good)
    assert 'licensed exposure inside: 10 people, 2 critical facilities' in text and '17.4000,78.4700 5' in text
    assert '00000000-0000-4000-8000-000000000002' in text
    for bad in ({**good, 'people_exposed': '10 <script>'}, {**good, 'data_basis': 'unknown'},
                {**good, 'exposure_feature_ids': ['not-a-uuid']}, {**good, 'footprint_radius_km': 1000}):
        with pytest.raises(proactive_cap.CapRefused):
            cap_for(bad)


# --- scheduler dedupe includes the impact config version -------------------------------------------

def test_dedupe_key_includes_impact_version_and_cited_features():
    base = {'trigger_id': 'heavy_rain:hyd', 'config_version': 'aegis.hazard-triggers.v1',
            'rationale': {'impact': {'config_version': 'aegis.impact-triggers.v2', 'status': 'evaluated', 'exposure_feature_ids': ['a', 'b']}}}
    key = proactive_scheduler.dedupe_key(AGENCY, base, ['d1'])
    assert key == proactive_scheduler.dedupe_key(AGENCY, base, ['d1'])
    reordered = {**base, 'rationale': {'impact': {**base['rationale']['impact'], 'exposure_feature_ids': ['b', 'a']}}}
    assert proactive_scheduler.dedupe_key(AGENCY, reordered, ['d1']) == key
    v3 = {**base, 'rationale': {'impact': {**base['rationale']['impact'], 'config_version': 'aegis.impact-triggers.v3'}}}
    assert proactive_scheduler.dedupe_key(AGENCY, v3, ['d1']) != key
    more = {**base, 'rationale': {'impact': {**base['rationale']['impact'], 'exposure_feature_ids': ['a', 'b', 'c']}}}
    assert proactive_scheduler.dedupe_key(AGENCY, more, ['d1']) != key
    hazard_only = {**base, 'rationale': {'impact': {'config_version': 'aegis.impact-triggers.v2', 'status': 'exposure_layer_empty'}}}
    assert proactive_scheduler.dedupe_key(AGENCY, hazard_only, ['d1']) != key
    assert proactive_scheduler.dedupe_key(AGENCY, {**base, 'rationale': {}}, ['d1']) != key


def test_scheduler_tick_prepares_one_run_per_impact_evaluation(store):
    seeded(store)

    def refresh():
        rows = rain(HAZARD['candidate'] + 1)
        store.insert_evidence(rows)
        ids = store.evidence_by_sha([r['sha256'] for r in rows])
        for row in rows:
            row['id'] = ids[row['sha256']]
        triggers = impact.apply([{**t, 'id': str(uuid4()), 'fired_at': datetime.now(timezone.utc)} for t in hazard_watch.evaluate_all(rows)], store)
        for trigger in triggers:
            store.insert_trigger(trigger)
        return {}, triggers

    first = proactive_scheduler.tick(store, AGENCY, refresh)
    assert first['runs_started'] == 1
    for state in store.list_runs(AGENCY):  # close the open run so the duplicate guard is the dedupe key
        store.update_run(state['id'], lambda s: proactive_run.cancel(s, 'closing for the dedupe test', 'op'), 'op', AGENCY)
    assert proactive_scheduler.tick(store, AGENCY, refresh)['runs_started'] == 0  # same impact evaluation
    store.add_exposure([feature('school')])  # new exposure data -> a different evaluation
    assert proactive_scheduler.tick(store, AGENCY, refresh)['runs_started'] == 1
