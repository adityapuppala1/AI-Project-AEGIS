"""A8 post-event learning: statistics, maker-checker threshold proposals and the explicit apply step.

Offline (MemoryStore doubles). Test identities are injected through dependency overrides only; they are
not production auth overrides and do not establish real two-human approval.
"""
import base64
import json
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app import hazard_watch, learning, learning_store, proactive_replay, proactive_scheduler, proactive_store
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
OTHER = UUID('22222222-2222-4222-8222-222222222222')
FIXTURE = hazard_watch.load_config()
client = TestClient(app)


def as_(subject, *roles, agency=AGENCY):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, agency, frozenset(roles))


@pytest.fixture(autouse=True)
def stores(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(32)).decode())
    proactive = proactive_store.MemoryStore()
    learn = learning_store.MemoryStore()
    proactive_store.set_store(proactive)
    learning_store.set_store(learn)
    as_('maker-1', 'incident_operator')
    yield proactive, learn
    app.dependency_overrides.clear()
    proactive_store.set_store(None)
    learning_store.set_store(None)


# --- statistics ---------------------------------------------------------------------------------

def test_wilson_edge_cases():
    assert learning.wilson(0, 0) is None and learning.wilson(3, 4) is None  # n below the minimum
    lo, hi = learning.wilson(0, 10)
    assert lo == 0.0 and 0.27 < hi < 0.28
    lo, hi = learning.wilson(10, 10)
    assert hi == 1.0 and 0.72 < lo < 0.73
    lo, hi = learning.wilson(5, 10)
    assert (lo, hi) == (0.2366, 0.7634)
    assert learning.wilson(5, 5) == (0.5655, 1.0)
    for bad in ((-1, 5), (6, 5), (1.0, 5), (1, -1)):
        with pytest.raises(ValueError):
            learning.wilson(*bad)


def test_rate_reports_why_no_interval():
    assert learning.rate(0, 0) == {'k': 0, 'n': 0, 'estimate': None, 'ci95': None, 'ci_method': None, 'ci_reason': 'no_cases'}
    assert learning.rate(2, 4)['ci_reason'] == 'n_below_minimum' and learning.rate(2, 4)['estimate'] == 0.5
    full = learning.rate(4, 8)
    assert full['ci_method'] == 'wilson' and full['ci_reason'] is None and len(full['ci95']) == 2


def test_rule_stats_hits_misses_false_alarms_and_lead():
    d = lambda day: date(2026, 7, day)
    fired = {d(2): ['a'], d(3): ['b'], d(10): ['c'], d(11): ['d'], d(20): ['e']}
    stats = learning.rule_stats('heavy_rain:watch', fired, [d(5), d(12), d(28)])
    assert stats['hits'] == 2 and stats['misses'] == 1 and stats['miss_days'] == ['2026-07-28']
    assert stats['lead_time_days'] == {'n': 2, 'min': 2, 'median': 2.5, 'max': 3}
    assert stats['false_alarm_episodes'] == 1 and stats['false_alarm_days'] == ['2026-07-20']
    assert stats['probability_of_detection']['k'] == 2 and stats['probability_of_detection']['n'] == 3
    assert stats['false_alarm_ratio'] == learning.rate(1, 3)
    assert stats['cited_ids'] == ['a', 'b', 'c', 'd', 'e']
    # A late firing (one day after) still counts, with negative lead; consecutive false days form one episode.
    late = learning.rule_stats('r', {d(6): ['x'], d(14): ['y'], d(15): ['z']}, [d(5)])
    assert late['hits'] == 1 and late['lead_time_days']['min'] == -1 and late['false_alarm_episodes'] == 1
    empty = learning.rule_stats('r', {}, [])
    assert empty['probability_of_detection']['ci_reason'] == 'no_cases' and empty['lead_time_days']['n'] == 0


def test_replayed_stats_are_labelled_and_never_claim_accuracy():
    response = client.post('/v1/proactive/learning/windows/replay', json={'source': 'synthetic', 'scenario_id': 'known_2000_08_24_heavy_rain'})
    assert response.status_code == 201, response.text
    window = response.json()
    stats = window['stats']
    assert window['basis'] == 'synthetic_rehearsal' and stats['accuracy_claim'] is False
    assert 'not forecasting accuracy' in stats['basis_note']
    watch = next(r for r in stats['rules'] if r['rule_id'] == 'heavy_rain:watch')
    assert (watch['hits'], watch['misses'], watch['false_alarm_episodes']) == (1, 0, 1)
    assert watch['lead_time_days']['min'] == 2 and watch['probability_of_detection']['ci_reason'] == 'n_below_minimum'
    text = json.dumps({k: v for k, v in stats.items() if k not in {'basis_note', 'accuracy_claim'}}).lower()
    assert not any(word in text for word in ('accuracy', 'predicts', 'prediction'))


def test_known_events_replay_uses_training_years_and_unreviewed_label(monkeypatch):
    monkeypatch.setattr(proactive_replay, 'daily_max_rain', lambda raw, years: {'2000-08-22': 40.0, '2000-08-24': 120.0, '2000-08-28': 2.0})
    window = client.post('/v1/proactive/learning/windows/replay',
                         json={'source': 'known_events', 'window_start': '2000-08-01', 'window_end': '2000-08-31'})
    assert window.status_code == 201, window.text
    data = window.json()
    assert data['source'] == 'replay_known_events' and data['basis'] == 'known_events_unreviewed'
    assert data['stats']['event_refs'] == ['known_events:2000-08-24']
    assert data['stats']['rules'][1]['hits'] == 1
    assert client.post('/v1/proactive/learning/windows/replay',
                       json={'source': 'known_events', 'window_start': '2020-10-01', 'window_end': '2020-10-31'}).status_code == 422


def test_catalogue_basis_needs_protocol_label_rules():
    good = {'label': 'event', 'reviewer_1': 'A', 'reviewer_2': 'B', 'evidence_url': 'https://example.org/x'}
    assert learning.catalogue_basis([good]) == 'registered_protocol_labels'
    for bad in ({**good, 'reviewer_2': 'a'}, {**good, 'label': 'flood_event'}, {**good, 'evidence_url': ''}):
        assert learning.catalogue_basis([good, bad]) == 'known_events_unreviewed'
    assert learning.catalogue_basis([]) == 'known_events_unreviewed'


def test_operator_close_window_uses_stored_triggers_and_is_agency_scoped(stores):
    _, learn = stores
    fired = datetime(2026, 7, 3, 6, tzinfo=timezone.utc)
    learn.trigger_rows = [{'id': str(uuid4()), 'hazard': 'heavy_rain', 'trigger_id': 'heavy_rain:p', 'state': 'watch',
                           'config_version': FIXTURE['version'], 'fired_at': fired}]
    body = {'hazard': 'heavy_rain', 'window_start': '2026-07-01', 'window_end': '2026-07-31',
            'observed_event_days': ['2026-07-04', '2026-07-20']}
    response = client.post('/v1/proactive/learning/windows/close', json=body)
    assert response.status_code == 201, response.text
    window = response.json()
    watch, candidate = window['stats']['rules']
    assert (watch['hits'], watch['misses']) == (1, 1) and candidate['misses'] == 2
    assert watch['cited_ids'] == [learn.trigger_rows[0]['id']]
    assert [a['action'] for a in learn.audit] == ['close']
    as_('other-agency', 'incident_operator', agency=OTHER)
    assert client.get(f"/v1/proactive/learning/windows/{window['id']}").status_code == 404
    assert client.get('/v1/proactive/learning/windows').json()['windows'] == []
    as_('maker-1', 'incident_auditor')
    assert client.post('/v1/proactive/learning/windows/close', json=body).status_code == 403
    as_('maker-1', 'incident_operator')
    assert client.post('/v1/proactive/learning/windows/close', json={**body, 'observed_event_days': ['2026-09-01']}).status_code == 422
    assert client.post('/v1/proactive/learning/windows/close', json={**body, 'agency_id': str(OTHER)}).status_code == 422


# --- proposals ----------------------------------------------------------------------------------

def false_alarm_window():
    response = client.post('/v1/proactive/learning/windows/replay', json={'source': 'synthetic', 'scenario_id': 'synthetic_false_alarm_heavy_rain'})
    assert response.status_code == 201, response.text
    return response.json()


def draft(window=None):
    window = window or false_alarm_window()
    response = client.post('/v1/proactive/learning/proposals', json={'window_id': window['id']})
    assert response.status_code == 201, response.text
    return response.json()


def submitted():
    proposal = draft()
    assert client.post(f"/v1/proactive/learning/proposals/{proposal['id']}/submit").status_code == 200
    return proposal


def review(pid, approve=True, rationale='Reviewed the window statistics and the diff.'):
    return client.post(f'/v1/proactive/learning/proposals/{pid}/review', json={'approve': approve, 'rationale': rationale})


def apply(pid, rationale='Explicit platform apply after independent approval.'):
    return client.post(f'/v1/proactive/learning/proposals/{pid}/apply', json={'rationale': rationale})


def test_proposal_is_a_stats_only_versioned_diff():
    proposal = draft()
    assert proposal['status'] == 'draft' and proposal['base_version'] == FIXTURE['version']
    assert proposal['new_version'].startswith(FIXTURE['version'] + '-l')
    changes = {c['path']: (c['old'], c['new']) for c in proposal['diff']['changes']}
    watch, cand = FIXTURE['hazards']['heavy_rain']['watch'], FIXTURE['hazards']['heavy_rain']['candidate']
    assert changes == {'hazards.heavy_rain.watch': (watch, round(watch * 1.1, 4)),
                       'hazards.heavy_rain.candidate': (cand, round(cand * 1.1, 4))}
    rationale = proposal['rationale']
    assert rationale['generated_from'] == 'window_statistics_only' and rationale['accuracy_claim'] is False
    assert {r['decision'] for r in rationale['rules']} == {'raise_10pct_on_false_alarms'}


def test_proposal_abstains_when_stats_do_not_support_change():
    window = client.post('/v1/proactive/learning/windows/replay', json={'source': 'synthetic', 'scenario_id': 'known_2000_08_24_heavy_rain'}).json()
    response = client.post('/v1/proactive/learning/proposals', json={'window_id': window['id']})
    assert response.status_code == 409 and response.json()['detail'] == 'stats_do_not_support_change'


def test_maker_checker_rules_for_threshold_proposals(stores):
    _, learn = stores
    proposal = draft()
    pid = proposal['id']
    as_('checker-1', 'incident_checker')
    assert review(pid).status_code == 409  # not submitted yet
    as_('maker-2', 'incident_operator')
    assert client.post(f'/v1/proactive/learning/proposals/{pid}/submit').status_code == 409  # only the maker submits
    as_('maker-1', 'incident_operator')
    assert client.post(f'/v1/proactive/learning/proposals/{pid}/submit').json()['status'] == 'submitted'
    assert client.post(f'/v1/proactive/learning/proposals/{pid}/submit').json()['status'] == 'submitted'  # idempotent retry
    assert [a['action'] for a in learn.audit if a['subject_id'] == pid] == ['create', 'submit']
    # Self-approval: the maker holding a checker role is still refused.
    as_('maker-1', 'incident_operator', 'incident_checker')
    assert review(pid).json()['detail'] == 'independent_checker_required'
    # In-process automation is never a checker.
    as_('system:scheduler', 'incident_checker')
    assert review(pid).status_code == 409
    # Wrong role.
    as_('checker-1', 'incident_operator', 'incident_auditor')
    assert review(pid).status_code == 403
    # Cross-agency checker cannot even see it.
    as_('checker-b', 'incident_checker', agency=OTHER)
    assert review(pid).status_code == 404
    assert client.get(f'/v1/proactive/learning/proposals/{pid}').status_code == 404
    # Rationale is required.
    as_('checker-1', 'incident_checker')
    assert review(pid, rationale='short').status_code == 422
    approved = review(pid)
    assert approved.status_code == 200 and approved.json()['status'] == 'approved'
    assert approved.json()['checker_subject'] == 'checker-1'
    assert review(pid).status_code == 409  # already decided
    detail = client.get(f'/v1/proactive/learning/proposals/{pid}').json()
    assert [a['action'] for a in detail['audit']] == ['create', 'submit', 'approve']
    assert detail['audit'][-1]['detail']['applies_to_engine'] is False


def test_platform_admin_can_check_and_rejection_blocks_apply():
    pid = submitted()['id']
    as_('admin-1', 'platform_admin')
    assert review(pid, approve=False).json()['status'] == 'rejected'
    assert apply(pid).json()['detail'] == 'proposal_not_applicable'


def test_approval_never_changes_the_engine_until_explicit_apply(stores):
    proactive, learn = stores
    pid = submitted()['id']
    as_('checker-1', 'incident_checker')
    assert review(pid).status_code == 200
    watch = FIXTURE['hazards']['heavy_rain']['watch']
    row = {'id': str(uuid4()), 'connector_id': 'open_meteo', 'hazard': 'heavy_rain', 'observed_at': datetime.now(timezone.utc),
           'lat': 17.4, 'lon': 78.47, 'value': watch + 1, 'unit': 'mm', 'payload': {'point_id': 'p'}}
    before = [t for t in hazard_watch.evaluate_all([row]) if t['hazard'] == 'heavy_rain'][0]
    assert before['state'] == 'watch' and before['config_version'] == FIXTURE['version']
    assert hazard_watch.effective_config()['config_source'] == 'fixture' and learn.versions == []
    # Apply needs platform_admin, the same agency and the kill switch off.
    as_('checker-1', 'incident_checker')
    assert apply(pid).status_code == 403
    as_('admin-b', 'platform_admin', agency=OTHER)
    assert apply(pid).status_code == 404
    as_('admin-1', 'platform_admin')
    proactive.set_pause(True, 'Exercise pause for the apply test', 'admin-1')
    assert apply(pid).json()['detail'] == 'proactive_paused'
    proactive.set_pause(False, 'Resume after the apply pause check', 'admin-1')
    assert apply(pid, rationale='short').status_code == 422
    applied = apply(pid)
    assert applied.status_code == 200, applied.text
    new_version = applied.json()['applied_version']
    assert applied.json()['applied_by'] == 'admin-1' and applied.json()['status'] == 'approved'
    effective = hazard_watch.effective_config()
    assert effective['version'] == new_version and effective['config_source'] == 'applied_overlay'
    assert effective['hazards']['heavy_rain']['watch'] == round(watch * 1.1, 4)
    after = [t for t in hazard_watch.evaluate_all([row]) if t['hazard'] == 'heavy_rain'][0]
    assert after['state'] == 'clear' and after['config_version'] == new_version
    # The scheduler dedupe key includes config_version, so the new version is a new evaluation.
    assert proactive_scheduler.dedupe_key(AGENCY, before, ['x']) != proactive_scheduler.dedupe_key(AGENCY, after, ['x'])
    assert [a['action'] for a in learn.audit if a['subject_kind'] == 'config'] == ['apply']
    assert learn.audit[-1]['detail']['previous_version'] == FIXTURE['version']
    assert apply(pid).json()['detail'] == 'proposal_not_applicable'  # never twice
    config = client.get('/v1/proactive/learning/config').json()
    assert config['effective_version'] == new_version and config['versions'][0]['proposal_id'] == pid
    assert client.get('/v1/proactive/triggers/config').json()['version'] == new_version
    detail = client.get(f'/v1/proactive/learning/proposals/{pid}').json()
    assert [a['action'] for a in detail['audit']] == ['create', 'submit', 'approve', 'apply']


def test_apply_refuses_a_stale_base_version():
    first, second = submitted()['id'], submitted()['id']
    as_('checker-1', 'incident_checker')
    assert review(first).status_code == 200 and review(second).status_code == 200
    as_('admin-1', 'platform_admin')
    assert apply(first).status_code == 200
    assert apply(second).json()['detail'] == 'base_version_stale'
    as_('maker-1', 'incident_operator')
    window = false_alarm_window()  # a window closed under the new version can produce a new proposal
    assert window['config_version'] == hazard_watch.effective_config()['version']


def test_overlay_validation_falls_back_to_fixture():
    base = hazard_watch.load_config()
    good = {'version_id': 'v-x', 'base_version': base['version'], 'overrides': {'heavy_rain': {'watch': 40}}}
    assert hazard_watch.overlay_config(base, good)['hazards']['heavy_rain']['watch'] == 40
    for overrides in ({'unknown': {'watch': 1}}, {'heavy_rain': {'watch': 70}}, {'heavy_rain': {'unit': 'x'}},
                      {'heavy_rain': {'watch': float('nan')}}, {'heavy_rain': {'watch': -1}}, []):
        result = hazard_watch.overlay_config(base, {**good, 'overrides': overrides})
        assert result['config_source'] == 'overlay_invalid' and result['version'] == base['version']
    assert hazard_watch.overlay_config(base, {**good, 'base_version': 'other'})['config_source'] == 'overlay_invalid'
    assert hazard_watch.load_config()['hazards']['heavy_rain']['watch'] == FIXTURE['hazards']['heavy_rain']['watch']


def test_learning_routes_are_hidden_without_proactive(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '0')
    assert client.get('/v1/proactive/learning/windows').status_code == 404
