import base64
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import bhuvan, connectors, proactive_store
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
OTHER = UUID('22222222-2222-4222-8222-222222222222')
KEY = base64.b64encode(bytes(range(32))).decode()
TOKEN = 'bhuvan-token-PLAINTEXT-abc123'
client = TestClient(app)


def as_role(*roles, agency=AGENCY):
    app.dependency_overrides[get_operator] = lambda: Operator('user-1', agency, frozenset(roles))


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', KEY)
    store = proactive_store.MemoryStore()
    proactive_store.set_store(store)
    bhuvan.clear_cache()
    calls = []

    def fake(url, hosts, **kwargs):
        calls.append(url)
        assert url.startswith('https://bhuvan-app1.nrsc.gov.in/api/') and hosts == ('bhuvan-app1.nrsc.gov.in',)
        if 'curl_routing_state' in url:
            return 200, b'{"type":"FeatureCollection","features":[{"geometry":{"type":"LineString","coordinates":[[78.48,17.38],[78.49,17.39]]}}]}'
        if 'curl_reverse_village' in url:
            return 200, b'{"village_name":"Sekuru","district":"Guntur","<b>bad</b>":"x","token":"leak"}'
        return 200, b'false'

    monkeypatch.setattr(connectors, 'bounded_request', fake)
    store.calls = calls
    yield store
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


def save(enabled=True, **secrets):
    as_role('platform_admin')
    version = client.get('/v1/proactive/connectors').json()
    current = next(c for c in version['connectors'] if c['id'] == 'isro_bhuvan')['version']
    return client.put('/v1/proactive/connectors/isro_bhuvan',
                      json={'expected_version': current, 'enabled': enabled, 'secrets': secrets})


def test_registry_entry_is_fixed_host_with_one_token_per_theme():
    spec = connectors.REGISTRY['isro_bhuvan']
    assert spec['hosts'] == ('bhuvan-app1.nrsc.gov.in',) and spec['token_ttl_hours'] == 24
    assert {f['name'] for f in spec['fields']} == {t[0] for t in bhuvan.THEMES.values()}
    assert all(f['secret'] for f in spec['fields'])


def test_enable_needs_a_token_and_token_never_returned(setup):
    assert save(True).status_code == 422
    response = save(True, token_reverse_geocode=TOKEN)
    assert response.status_code == 200 and TOKEN not in response.text
    field = next(f for f in response.json()['fields'] if f['name'] == 'token_reverse_geocode')
    saved = datetime.fromisoformat(field['saved_at'])
    assert datetime.fromisoformat(field['expires_at']) - saved == timedelta(hours=24) and field['expired'] is False
    assert TOKEN not in client.get('/v1/proactive/connectors/isro_bhuvan/audit').text
    assert TOKEN not in client.get('/v1/proactive/bhuvan/tokens').text


def test_expired_token_is_refused_without_a_call(setup):
    save(True, token_reverse_geocode=TOKEN)
    entry = setup.secrets['isro_bhuvan']['token_reverse_geocode']
    setup.secrets['isro_bhuvan']['token_reverse_geocode'] = (*entry[:3], datetime.now(timezone.utc) - timedelta(hours=25))
    as_role('incident_operator')
    response = client.get('/v1/reference/bhuvan/place?lat=16.28&lon=80.59')
    assert response.status_code == 503 and response.json()['detail'] == 'token_expired' and setup.calls == []


def test_place_is_live_sanitised_cached_and_not_echoing_token(setup):
    save(True, token_reverse_geocode=TOKEN)
    as_role('incident_operator')
    first = client.get('/v1/reference/bhuvan/place?lat=16.27939&lon=80.58837')
    assert first.status_code == 200
    body = first.json()
    assert body['classification'] == 'live' and body['display_only'] is True and body['writes_to_database'] is False
    assert body['attribution'] == 'Data: Bhuvan, NRSC/ISRO' and body['cached'] is False
    keys = {row['key'] for row in body['fields']}
    assert keys == {'village_name', 'district'} and TOKEN not in first.text
    second = client.get('/v1/reference/bhuvan/place?lat=16.27939&lon=80.58837')
    assert second.json()['cached'] is True and len(setup.calls) == 1


@pytest.mark.parametrize('query', ['lat=51.5&lon=0.1', 'lat=nan&lon=80', 'lat=17&lon=200', 'lat=abc&lon=80'])
def test_coordinates_validated_inside_india(setup, query):
    save(True, token_reverse_geocode=TOKEN)
    as_role('incident_operator')
    assert client.get('/v1/reference/bhuvan/place?' + query).status_code == 422
    assert setup.calls == []


def test_hospitals_only_for_andhra_pradesh(setup):
    save(True, token_proximity=TOKEN)
    as_role('incident_operator')
    outside = client.get('/v1/reference/bhuvan/hospitals?lat=28.6&lon=77.2')
    assert outside.status_code == 422 and outside.json()['detail'] == 'outside_coverage_andhra_pradesh'
    inside = client.get('/v1/reference/bhuvan/hospitals?lat=16.28&lon=80.59')
    assert inside.status_code == 200 and inside.json()['no_data'] is True


def test_route_distance_is_computed_from_geometry(setup):
    save(True, token_routing=TOKEN)
    as_role('incident_operator')
    body = client.get('/v1/reference/bhuvan/route?lat1=17.38&lon1=78.48&lat2=17.39&lon2=78.49').json()
    assert 1.0 < body['distance_km'] < 2.0 and len(body['path']) == 2


def test_village_name_validated(setup):
    save(True, token_village_geocode=TOKEN)
    as_role('incident_operator')
    assert client.get('/v1/reference/bhuvan/village?name=<script>').status_code == 422
    assert client.get('/v1/reference/bhuvan/village?name=Sekuru').status_code == 200


def test_disabled_connector_and_roles_and_agency(setup):
    save(False, token_reverse_geocode=TOKEN)
    as_role('incident_operator')
    assert client.get('/v1/reference/bhuvan/place?lat=16.28&lon=80.59').json()['detail'] == 'bhuvan_disabled'
    as_role('incident_operator', agency=OTHER)
    assert client.get('/v1/reference/bhuvan/place?lat=16.28&lon=80.59').status_code == 403
    as_role('incident_operator')
    assert client.get('/v1/proactive/bhuvan/tokens').status_code == 403
    assert client.post('/v1/proactive/bhuvan/tokens/routing/test').status_code == 403


def test_upstream_token_rejection_is_a_fixed_code(setup, monkeypatch):
    save(True, token_reverse_geocode=TOKEN)
    monkeypatch.setattr(connectors, 'bounded_request', lambda *a, **k: (200, b'{"error":"invalid_token","error_description":"x"}'))
    as_role('incident_operator')
    response = client.get('/v1/reference/bhuvan/place?lat=16.28&lon=80.59')
    assert response.status_code == 503 and response.json()['detail'] == 'token_rejected'


def test_admin_token_test_records_audit_without_secret(setup):
    save(True, token_routing=TOKEN, token_geoid=TOKEN)
    result = client.post('/v1/proactive/bhuvan/tokens/routing/test').json()
    assert result['ok'] is True and result['message'] == 'reachable_data'
    geoid = client.post('/v1/proactive/bhuvan/tokens/geoid/test').json()
    assert geoid['message'] == 'download_only_not_called' and not any('geoid' in url for url in setup.calls)
    assert TOKEN not in client.get('/v1/proactive/connectors/isro_bhuvan/audit').text
    assert client.post('/v1/proactive/bhuvan/tokens/nope/test').status_code == 404


def test_reference_routes_off_without_proactive(setup, monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '0')
    as_role('incident_operator')
    assert client.get('/v1/reference/bhuvan/place?lat=16.28&lon=80.59').status_code == 503
    assert client.get('/v1/reference/bhuvan/status').json()['themes'] == {}


def test_sanitiser_drops_markup_and_long_text():
    rows = bhuvan.flatten({'name': '<i>Village</i>', 'x' * 80: 'drop', 'n': 3, 'nested': {'a': [1, {'b': 'ok'}]}})
    assert {'key': 'name', 'value': 'Village'} in rows and all(len(r['key']) <= 60 for r in rows)


def test_real_answer_shapes_checked_on_15_november_2026():
    # Land use: the API quotes its class codes; shares are shown, largest first, with legend names.
    rows = bhuvan._summarise("landuse", [{"State": "AP", "'l01'": 2.13, "'l23'": 2.8}])["fields"]
    assert [row["key"] for row in rows] == ["Water bodies - class 23", "Built-up (urban) - class 01"]
    assert rows[0]["value"] == "57% of the square"
    # Village rows: only the labelled Census columns are passed on.
    place = bhuvan._summarise("place", [{"name1": "HYDERABAD", "vid": "28", "tot_p": "3612427", "p_sc": "1", "dhq_name": "HYDERABAD"}])
    assert [row["key"] for row in place["records"][0]] == ["Village or town", "District headquarters", "Population (Census 2001)"]
    # Hospital rows carry staff names and email addresses upstream; they never leave the module.
    hospital = bhuvan._summarise("hospitals", [{"facilityname": "General Hospital", "inchargemedicalofficer": "A PERSON",
                                               "emailid": "x@example.invalid", "timing": "24 x 7", "district": "Krishna"}])
    text = str(hospital)
    assert "A PERSON" not in text and "example.invalid" not in text and "General Hospital" in text
