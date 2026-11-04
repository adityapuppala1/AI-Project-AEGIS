import base64
import json
import os
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import connector_secrets, connectors, proactive_store
from app.main import app
from app.security import ALLOWED_ROLES, Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
KEY = base64.b64encode(bytes(range(32))).decode()
SECRET = 'firms-map-key-PLAINTEXT-123'
client = TestClient(app)


def as_role(*roles):
    app.dependency_overrides[get_operator] = lambda: Operator('admin-user', AGENCY, frozenset(roles))


@pytest.fixture(autouse=True)
def proactive(monkeypatch):
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', KEY)
    store = proactive_store.MemoryStore()
    proactive_store.set_store(store)
    as_role('platform_admin')
    yield store
    app.dependency_overrides.clear()
    proactive_store.set_store(None)


def test_secret_roundtrip_wrong_key_and_fingerprint(monkeypatch):
    ciphertext, nonce = connector_secrets.encrypt('value', 'nasa_firms', 'map_key')
    assert b'value' not in ciphertext and len(nonce) == 12
    assert connector_secrets.decrypt(ciphertext, nonce, 'nasa_firms', 'map_key') == 'value'
    with pytest.raises(connector_secrets.SecretUnreadable):
        connector_secrets.decrypt(ciphertext, nonce, 'typesafe_jev', 'api_key')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', base64.b64encode(b'x' * 32).decode())
    with pytest.raises(connector_secrets.SecretUnreadable):
        connector_secrets.decrypt(ciphertext, nonce, 'nasa_firms', 'map_key')
    assert connector_secrets.fingerprint('value') == 'cd42404d'


@pytest.mark.parametrize('value', ['', 'not-base64!!', base64.b64encode(b'short').decode()])
def test_missing_or_malformed_key_fails_closed(monkeypatch, value):
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', value)
    assert connector_secrets.master_key_configured() is False
    with pytest.raises(connector_secrets.ConnectorKeyMissing):
        connector_secrets.encrypt('v', 'a', 'b')
    response = client.put('/v1/proactive/connectors/nasa_firms', json={'expected_version': 0, 'enabled': False, 'secrets': {'map_key': SECRET}})
    assert response.status_code == 503 and response.json()['detail'] == 'connector_key_missing'


def test_registry_invariants():
    assert set(connectors.REGISTRY) == {'open_meteo', 'nasa_firms', 'nasa_lhasa', 'copernicus_cdse', 'imd_warnings',
                                        'typesafe_jev', 'cap_handover', 'authority_notification'}
    assert set(connectors.TESTS) == set(connectors.REGISTRY)
    assert 'platform_admin' in ALLOWED_ROLES
    for spec in connectors.REGISTRY.values():
        assert all('.' in host and '/' not in host for host in spec['hosts'])
        for default, check in spec['settings'].values():
            assert check(default) == default
    assert {f['name'] for f in connectors.REGISTRY['copernicus_cdse']['fields'] if f['secret']} == {'client_id', 'client_secret'}
    with pytest.raises(ValueError, match='allowlisted'):
        connectors.bounded_request('https://evil.example/x', ('api.open-meteo.com',))
    with pytest.raises(ValueError, match='allowlisted'):
        connectors.bounded_request('http://api.open-meteo.com/x', ('api.open-meteo.com',))


def test_save_secret_is_write_only_and_versioned(proactive):
    response = client.put('/v1/proactive/connectors/nasa_firms', json={'expected_version': 0, 'enabled': True, 'settings': {'days': 2}, 'secrets': {'map_key': SECRET}})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['version'] == 1 and body['settings']['days'] == 2 and body['enabled'] is True
    assert body['fields'][0] == {'name': 'map_key', 'label': 'FIRMS MAP_KEY', 'secret': True, 'required': True, 'set': True, 'fingerprint': connector_secrets.fingerprint(SECRET)}
    listing = client.get('/v1/proactive/connectors')
    audit = client.get('/v1/proactive/connectors/nasa_firms/audit')
    for text in (response.text, listing.text, audit.text, json.dumps(proactive.audit, default=str)):
        assert SECRET not in text
    assert listing.json()['master_key_configured'] is True
    assert [row['action'] for row in audit.json()['audit']] == ['enable', 'save']
    assert client.put('/v1/proactive/connectors/nasa_firms', json={'expected_version': 0, 'enabled': True}).status_code == 409
    cleared = client.put('/v1/proactive/connectors/nasa_firms', json={'expected_version': 1, 'enabled': False, 'secrets': {'map_key': None}})
    assert cleared.status_code == 200 and cleared.json()['fields'][0]['set'] is False
    assert 'clear_secret' in [row['action'] for row in client.get('/v1/proactive/connectors/nasa_firms/audit').json()['audit']]


@pytest.mark.parametrize('body', [{'expected_version': 0, 'enabled': False, 'settings': {'area': '0,0,1,1'}},
                                  {'expected_version': 0, 'enabled': False, 'settings': {'days': 9}},
                                  {'expected_version': 0, 'enabled': False, 'settings': {'unknown': 1}},
                                  {'expected_version': 0, 'enabled': False, 'secrets': {'other': 'x'}},
                                  {'expected_version': 0, 'enabled': True},
                                  {'expected_version': 0, 'enabled': False, 'extra': 1}])
def test_invalid_updates_rejected(body):
    assert client.put('/v1/proactive/connectors/nasa_firms', json=body).status_code == 422


def test_authority_notification_cannot_be_enabled():
    response = client.put('/v1/proactive/connectors/authority_notification', json={'expected_version': 0, 'enabled': True})
    assert response.status_code == 409
    test = client.post('/v1/proactive/connectors/authority_notification/test').json()
    assert test['ok'] is False and test['message'] == 'no_send_path'


def test_imd_refuses_until_terms_accepted(monkeypatch):
    monkeypatch.setattr(connectors, 'bounded_request', lambda *a, **k: pytest.fail('network used'))
    result = client.post('/v1/proactive/connectors/imd_warnings/test').json()
    assert result['ok'] is False and result['message'] == 'terms_not_accepted'


def test_copernicus_token_is_discarded(monkeypatch, proactive):
    client.put('/v1/proactive/connectors/copernicus_cdse', json={'expected_version': 0, 'enabled': True, 'secrets': {'client_id': 'cid', 'client_secret': 'csecret-PLAIN'}})
    calls = []
    monkeypatch.setattr(connectors, 'bounded_request', lambda url, hosts, **k: calls.append((url, k)) or (200, b'{"access_token":"TOKEN-XYZ"}'))
    response = client.post('/v1/proactive/connectors/copernicus_cdse/test')
    assert response.json()['ok'] is True and 'TOKEN-XYZ' not in response.text
    assert calls[0][0] == connectors.CDSE_TOKEN_URL and calls[0][1]['method'] == 'POST'
    assert b'grant_type=client_credentials' in calls[0][1]['data']
    assert 'TOKEN-XYZ' not in json.dumps(proactive.audit, default=str) and 'csecret-PLAIN' not in json.dumps(proactive.audit, default=str)
    last = client.get('/v1/proactive/connectors').json()['connectors']
    assert next(c for c in last if c['id'] == 'copernicus_cdse')['last_test']['ok'] is True


def test_typesafe_test_uses_bearer(monkeypatch):
    client.put('/v1/proactive/connectors/typesafe_jev', json={'expected_version': 0, 'enabled': True, 'secrets': {'api_key': 'ts-key'}})
    seen = {}
    monkeypatch.setattr(connectors, 'bounded_request', lambda url, hosts, **k: seen.update(url=url, headers=k['headers']) or (200, b'{}'))
    assert client.post('/v1/proactive/connectors/typesafe_jev/test').json()['ok'] is True
    assert seen == {'url': 'https://api.typesafe.ai/v1/models', 'headers': {'Authorization': 'Bearer ts-key'}}


def test_cap_handover_test_validates_exporter():
    assert client.post('/v1/proactive/connectors/cap_handover/test').json()['ok'] is True


def test_network_failures_become_codes(monkeypatch):
    def boom(*a, **k):
        raise OSError('connection refused to secret host')
    monkeypatch.setattr(connectors, 'bounded_request', boom)
    result = client.post('/v1/proactive/connectors/open_meteo/test')
    assert result.json()['message'] == 'network_error' and 'refused' not in result.text


ENDPOINTS = [('get', '/v1/proactive/connectors'), ('put', '/v1/proactive/connectors/open_meteo'),
             ('post', '/v1/proactive/connectors/open_meteo/test'), ('get', '/v1/proactive/connectors/open_meteo/audit'),
             ('post', '/v1/proactive/watch/refresh'), ('post', '/v1/proactive/runs'),
             ('post', '/v1/proactive/runs/22222222-2222-4222-8222-222222222222/advance'),
             ('post', '/v1/proactive/runs/22222222-2222-4222-8222-222222222222/cancel'),
             ('get', '/v1/proactive/runs/22222222-2222-4222-8222-222222222222'),
             ('get', '/v1/proactive/runs/22222222-2222-4222-8222-222222222222/cap.xml')]


@pytest.mark.parametrize('method,url', ENDPOINTS)
def test_every_protected_endpoint_requires_bearer(monkeypatch, method, url):
    app.dependency_overrides.clear()
    monkeypatch.setenv('OIDC_ISSUER', 'https://idp.example')
    monkeypatch.setenv('OIDC_AUDIENCE', 'aegis')
    monkeypatch.setenv('OIDC_JWKS_URL', 'https://idp.example/jwks')
    assert getattr(client, method)(url).status_code == 401


@pytest.mark.parametrize('method,url', ENDPOINTS)
def test_every_protected_endpoint_enforces_role(method, url):
    as_role('incident_checker', 'incident_auditor')
    assert getattr(client, method)(url).status_code == 403


@pytest.mark.parametrize('method,url', [*ENDPOINTS[:4]])
def test_operator_cannot_configure_connectors(method, url):
    as_role('incident_operator')
    assert getattr(client, method)(url).status_code == 403


@pytest.mark.parametrize('method,url', [*ENDPOINTS[5:]])
def test_admin_cannot_run(method, url):
    as_role('platform_admin')
    assert getattr(client, method)(url).status_code == 403


@pytest.mark.parametrize('method,url', [*ENDPOINTS, ('get', '/v1/proactive/watch'), ('get', '/v1/proactive/watch/history'),
                                        ('get', '/v1/proactive/triggers/config')])
def test_feature_flag_off_is_404(monkeypatch, method, url):
    monkeypatch.delenv('AEGIS_PROACTIVE')
    assert getattr(client, method)(url).status_code == 404


def test_compose_and_start_script_wiring():
    root = next(p for p in Path(__file__).resolve().parents if (p / 'compose.yaml').is_file())
    base = (root / 'compose.yaml').read_text()
    assert '012_proactive.sql:/docker-entrypoint-initdb.d/016-proactive.sql' in base
    assert '012_proactive.sql:/proactive.sql' in base and '-f /proactive.sql' in base
    assert '013_proactive_run_agency.sql:/docker-entrypoint-initdb.d/017-proactive-run-agency.sql' in base
    assert '013_proactive_run_agency.sql:/proactive-run-agency.sql' in base
    assert '-f /proactive.sql && psql -h db -U aegis -d aegis -v ON_ERROR_STOP=1 -f /proactive-run-agency.sql' in base
    assert '014_proactive_scheduler.sql:/docker-entrypoint-initdb.d/018-proactive-scheduler.sql' in base
    assert '014_proactive_scheduler.sql:/proactive-scheduler.sql' in base
    assert '-f /proactive-run-agency.sql && psql -h db -U aegis -d aegis -v ON_ERROR_STOP=1 -f /proactive-scheduler.sql' in base
    scheduler = (root / 'compose.proactive-scheduler.yaml').read_text()
    assert 'AEGIS_PROACTIVE_SCHEDULER: "1"' in scheduler and '${AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID:?' in scheduler
    assert 'AEGIS_PROACTIVE_SCHEDULER' not in base and 'AEGIS_PROACTIVE_SCHEDULER' not in (root / 'compose.proactive.yaml').read_text()
    assert 'compose.proactive-scheduler.yaml' in (root / 'scripts/start-windows.ps1').read_text()
    overlay = (root / 'compose.proactive.yaml').read_text()
    assert 'AEGIS_PROACTIVE: "1"' in overlay and 'AEGIS_CONNECTOR_KEY: "${AEGIS_CONNECTOR_KEY:?' in overlay
    assert 'compose.proactive.yaml' in (root / 'scripts/start-windows.ps1').read_text()
    assert 'AEGIS_PROACTIVE' not in base and os.path.isfile(root / 'scripts/new-connector-key.ps1')
