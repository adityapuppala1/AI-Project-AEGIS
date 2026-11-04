"""A4 feed adapters (GDACS, Google Flood Forecasting) against hand-authored offline fixtures.

No external host is contacted: connectors.bounded_request is replaced by a recorder that returns the
fixture bytes. Allowlist and no-redirect behaviour of the real bounded_request is checked directly.
"""
import base64
import json
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import connector_secrets, connectors, hazard_watch, proactive_store
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
FIXTURES = Path(__file__).parent / 'fixtures'
GDACS = (FIXTURES / 'gdacs_events.sample.json').read_bytes()
GOOGLE = (FIXTURES / 'google_flood_status.sample.json').read_bytes()
API_KEY = 'google-flood-KEY-plaintext-987'
client = TestClient(app)


@pytest.fixture(autouse=True)
def store(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(bytes(range(32))).decode())
    memory = proactive_store.MemoryStore()
    proactive_store.set_store(memory)
    app.dependency_overrides[get_operator] = lambda: Operator('admin-user', AGENCY, frozenset({'platform_admin', 'incident_operator'}))
    yield memory
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


class Recorder:
    def __init__(self, status=200, body=b''):
        self.status, self.body, self.calls = status, body, []

    def __call__(self, url, hosts, **kwargs):
        if not url.startswith('https://') or url.split('/')[2] not in hosts:
            raise ValueError('url_not_allowlisted')
        self.calls.append({'url': url, 'hosts': tuple(hosts), **kwargs})
        return self.status, self.body


# --- parsing ----------------------------------------------------------------------------------------

def test_parse_gdacs_fixture_keeps_valid_india_events_only():
    rows = hazard_watch.parse_gdacs(json.loads(GDACS))
    assert [r['payload']['point_id'] for r in rows] == ['gdacs_FL_1102001', 'gdacs_TC_1001002']
    flood, cyclone = rows
    assert flood['value'] == 2.0 and flood['hazard'] == 'gdacs_alert' and flood['payload']['event_type'] == 'flood'
    assert cyclone['value'] == 3.0 and cyclone['payload']['alert_level'] == 'red'
    assert flood['observed_at'].tzinfo is not None and flood['source_url'] == hazard_watch.GDACS_URL
    assert all('GDACS' in r['payload']['attribution'] for r in rows)


@pytest.mark.parametrize('data', [None, [], {'features': 'x'}, {'type': 'FeatureCollection'}, 'text'])
def test_parse_gdacs_malformed_collection_is_invalid_response(data):
    with pytest.raises(hazard_watch.AdapterError, match='invalid_response'):
        hazard_watch.parse_gdacs(data)


def test_parse_gdacs_sanitises_display_text():
    data = {'features': [{'geometry': {'type': 'Point', 'coordinates': [78.4, 17.4]},
                          'properties': {'eventtype': 'FL', 'eventid': 9, 'alertlevel': 'Red', 'fromdate': '2026-11-01T00:00:00',
                                         'name': 'A\x00B\nC' + 'x' * 500}}]}
    [row] = hazard_watch.parse_gdacs(data)
    assert row['payload']['name'].startswith('ABC') and len(row['payload']['name']) == 80


def test_parse_google_fixture_keeps_nearby_valid_gauges_only():
    rows = hazard_watch.parse_google_flood(json.loads(GOOGLE))
    assert [r['payload']['point_id'] for r in rows] == ['hybas_fixture_0001', 'hybas_fixture_0002']
    severe, above = rows
    assert severe['value'] == 2.0 and severe['payload']['trend'] == 'RISE' and severe['payload']['quality_verified'] is True
    assert above['value'] == 1.0 and above['payload']['quality_verified'] is False
    assert severe['hazard'] == 'flood_gauge' and 'CC BY 4.0' in severe['payload']['attribution']


@pytest.mark.parametrize('data', [None, [], {'floodStatuses': 'x'}, 'text'])
def test_parse_google_malformed_is_invalid_response(data):
    with pytest.raises(hazard_watch.AdapterError, match='invalid_response'):
        hazard_watch.parse_google_flood(data)


def test_parse_google_empty_response_is_empty():
    assert hazard_watch.parse_google_flood({}) == []


# --- fetch through the allowlisted framework ----------------------------------------------------------

def test_fetch_gdacs_uses_fixed_host_and_handles_204_redirect_and_bad_json(monkeypatch):
    recorder = Recorder(body=GDACS)
    monkeypatch.setattr(connectors, 'bounded_request', recorder)
    assert len(hazard_watch.fetch_gdacs(connectors.default_settings('gdacs'))) == 2
    call = recorder.calls[0]
    assert call['hosts'] == ('www.gdacs.org',) and call['url'].startswith(hazard_watch.GDACS_URL + '?')
    assert 'eventlist=FL%3BTC%3BEQ%3BWF%3BDR%3BVO' in call['url']
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(status=204))
    assert hazard_watch.fetch_gdacs({}) == []
    # _NoRedirect makes urllib surface a 3xx as an HTTP status; it is never followed.
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(status=302))
    with pytest.raises(hazard_watch.AdapterError, match='upstream_status_302'):
        hazard_watch.fetch_gdacs({})
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(body=b'<rss>not json</rss>'))
    with pytest.raises(hazard_watch.AdapterError, match='invalid_response'):
        hazard_watch.fetch_gdacs({})


def test_real_bounded_request_rejects_other_hosts_and_plain_http():
    with pytest.raises(ValueError, match='allowlisted'):
        connectors.bounded_request('https://gdacs.org.evil.example/x', connectors.REGISTRY['gdacs']['hosts'])
    with pytest.raises(ValueError, match='allowlisted'):
        connectors.bounded_request('http://www.gdacs.org/x', connectors.REGISTRY['gdacs']['hosts'])
    with pytest.raises(ValueError, match='allowlisted'):
        connectors.bounded_request('https://evil.googleapis.com/v1/x', connectors.REGISTRY['google_flood_forecasting']['hosts'])
    assert connectors._NoRedirect().redirect_request(None, None, 302, 'Found', {}, 'https://elsewhere.example/') is None


def test_settings_are_fixed_and_adapters_registered():
    assert connectors.REGISTRY['gdacs']['hosts'] == ('www.gdacs.org',)
    assert connectors.REGISTRY['google_flood_forecasting']['hosts'] == ('floodforecasting.googleapis.com',)
    assert 'to be confirmed by owner' in connectors.REGISTRY['gdacs']['licence']
    assert 'CC BY 4.0' in connectors.REGISTRY['google_flood_forecasting']['licence']
    response = client.put('/v1/proactive/connectors/gdacs', json={'expected_version': 0, 'enabled': False, 'settings': {'area': '0,0,1,1'}})
    assert response.status_code == 422 and response.json()['detail'] == 'invalid_setting:area'
    response = client.put('/v1/proactive/connectors/google_flood_forecasting', json={'expected_version': 0, 'enabled': False, 'settings': {'region_code': 'US'}})
    assert response.status_code == 422
    assert {'gdacs', 'google_flood_forecasting'} <= set(hazard_watch.ADAPTERS)


def test_google_disabled_until_key_saved_and_key_never_returned(store, monkeypatch):
    response = client.put('/v1/proactive/connectors/google_flood_forecasting', json={'expected_version': 0, 'enabled': True})
    assert response.status_code == 422 and response.json()['detail'] == 'required_secret_missing:api_key'
    with pytest.raises(hazard_watch.AdapterError, match='secret_missing'):
        hazard_watch.fetch_google_flood(connectors.default_settings('google_flood_forecasting'))
    assert client.post('/v1/proactive/connectors/google_flood_forecasting/test').json()['message'] == 'secret_missing'
    saved = client.put('/v1/proactive/connectors/google_flood_forecasting',
                       json={'expected_version': 0, 'enabled': True, 'secrets': {'api_key': API_KEY}})
    assert saved.status_code == 200, saved.text
    recorder = Recorder(body=GOOGLE)
    monkeypatch.setattr(connectors, 'bounded_request', recorder)
    rows = hazard_watch.fetch_google_flood(connectors.effective('google_flood_forecasting')['settings'])
    assert len(rows) == 2
    call = recorder.calls[0]
    assert call['method'] == 'POST' and call['headers']['X-Goog-Api-Key'] == API_KEY
    assert API_KEY not in call['url'] and json.loads(call['data']) == {'regionCode': 'IN'}
    result = client.post('/v1/proactive/connectors/google_flood_forecasting/test')
    assert result.status_code == 200 and result.json()['ok'] is True
    for text in (json.dumps(result.json()), client.get('/v1/proactive/connectors').text,
                 client.get('/v1/proactive/connectors/google_flood_forecasting/audit').text, json.dumps(rows, default=str)):
        assert API_KEY not in text
    assert connector_secrets.fingerprint(API_KEY) in client.get('/v1/proactive/connectors').text


def test_gdacs_connector_test_endpoint_with_fixture(monkeypatch):
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(body=GDACS))
    result = client.post('/v1/proactive/connectors/gdacs/test').json()
    assert result['ok'] is True and result['status_code'] == 200 and result['message'] == 'reachable'
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(status=301))
    assert client.post('/v1/proactive/connectors/gdacs/test').json() | {'latency_ms': 0, 'tested_at': ''} == {
        'ok': False, 'status_code': 301, 'message': 'upstream_status', 'latency_ms': 0, 'tested_at': ''}


def test_refresh_with_feeds_produces_feed_triggers_and_fixed_error_codes(store, monkeypatch):
    store.save_connector('gdacs', 0, True, connectors.default_settings('gdacs'), {}, 'admin', [])
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(body=GDACS))
    summary, triggers = hazard_watch.refresh_detailed()
    assert summary['fetched']['gdacs'] == 2 and summary['fetched']['google_flood_forecasting'] == 'disabled'
    by_id = {t['trigger_id']: t for t in triggers}
    assert by_id['gdacs_alert:gdacs_FL_1102001']['state'] == 'watch'
    assert by_id['gdacs_alert:gdacs_TC_1001002']['state'] == 'candidate'
    assert all(t['config_version'] == 'aegis.feed-triggers.v1' for t in triggers)
    assert all(t['rationale']['impact']['status'] == 'exposure_layer_empty' for t in triggers)  # no exposure seeded
    monkeypatch.setattr(connectors, 'bounded_request', Recorder(body=b'{"features": 5}'))
    assert hazard_watch.refresh_detailed()[0]['fetched']['gdacs'] == 'invalid_response'
