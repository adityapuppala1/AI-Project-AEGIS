"""Static guardrails for the opt-in IdP review package, not an IdP login test."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_local_idp_claims_and_independent_users_are_not_client_supplied():
    realm = json.loads((ROOT / 'ops/local-idp/realm.json').read_text())
    client = realm['clients'][0]
    assert client['redirectUris'] == ['http://localhost:3000/api/auth/callback']
    assert client['attributes']['pkce.code.challenge.method'] == 'S256'
    assert client['publicClient'] and not client['directAccessGrantsEnabled']
    assert not client['implicitFlowEnabled'] and not client['serviceAccountsEnabled']
    assert not realm['registrationAllowed'] and not client['fullScopeAllowed']
    users = {user['username']: user for user in realm['users']}
    assert users['exercise-maker']['clientRoles']['aegis-local-web'] == ['incident_operator']
    assert users['exercise-checker']['clientRoles']['aegis-local-web'] == ['incident_checker']
    for user in users.values():
        assert 'CONFIGURE_TOTP' in user['requiredActions']
        assert user['credentials'][0]['temporary']
        assert user['credentials'][0]['value'].startswith('${AEGIS_')
    mapper = next(item for item in client['protocolMappers'] if item['name'] == 'signed-app-roles')
    assert mapper['config']['multivalued'] == 'true'
    assert mapper['config']['usermodel.clientRoleMapping.clientId'] == client['clientId']


def test_local_idp_is_explicit_local_only_and_preserves_tls_checks():
    compose = (ROOT / 'compose.local-idp.yaml').read_text()
    assert "127.0.0.1:8443:8443" in compose
    assert 'profiles: [local-idp]' in compose
    assert compose.count('@sha256:') == 2
    assert 'SSL_CERT_FILE' in compose and 'NODE_EXTRA_CA_CERTS' in compose
    assert 'NODE_TLS_REJECT_UNAUTHORIZED' not in compose
    assert 'AEGIS_LOCAL_IDP_PRIVATE_DIR:?' in compose
    assert './.git/local-idp' not in compose
    assert './ops/local-idp/realm.json:/opt/keycloak' not in compose
    assert '/realm.json:/opt/keycloak/data/import/' in compose
    assert 'local-idp' not in (ROOT / 'compose.yaml').read_text()
