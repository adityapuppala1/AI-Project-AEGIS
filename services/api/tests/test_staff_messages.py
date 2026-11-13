"""Staff email notices (docs/COMMUNICATION_CHANNELS.md). Test doubles only: the provider call is replaced, never the
network, and operators are dependency overrides that never establish real sign-in."""
import base64
import json
import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import connectors, exercise_workflows, proactive_store, security, staff_message_store, staff_messages
from app.main import app
from app.security import FIXTURE_AGENCY_DETAIL, Operator, get_operator

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
OTHER = UUID('22222222-2222-4222-8222-222222222222')
PROPOSAL = '33333333-3333-4333-8333-333333333333'
KEY = base64.b64encode(bytes(range(32))).decode()
API_KEY = 'SG.PLAINTEXT-KEY-123'
ADDRESS = 'checker.one@agency.example.org'
client = TestClient(app)


def as_user(subject='checker-1', roles=('incident_checker',), agency=AGENCY, email=ADDRESS):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, agency, frozenset(roles), email=email)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv('AEGIS_STAFF_EMAIL', '1')
    monkeypatch.setenv('AEGIS_PROACTIVE', '1')
    monkeypatch.setenv('AEGIS_CONNECTOR_KEY', KEY)
    monkeypatch.setenv('APP_ORIGIN', 'http://localhost:3000')
    vault = proactive_store.MemoryStore()
    proactive_store.set_store(vault)
    store = staff_message_store.MemoryStore()
    staff_messages._maker_events.clear()
    staff_message_store.set_store(store)
    calls = []

    def provider(url, hosts, **kwargs):
        calls.append({'url': url, 'hosts': hosts, **kwargs})
        return 202, b'{"provider":"body ' + ADDRESS.encode() + b'"}'
    monkeypatch.setattr(connectors, 'bounded_request', provider)
    yield SimpleNamespace(store=store, vault=vault, calls=calls)
    app.dependency_overrides.clear()
    proactive_store.set_store(None)
    staff_message_store.set_store(None)


def enable_channel(enabled=True):
    as_user('admin-1', ('platform_admin',))
    body = {'expected_version': connectors.effective('comms_email')['version'], 'enabled': enabled,
            'settings': {'from_address': 'aegis@agency.example.org'}, 'secrets': {'api_key': API_KEY}}
    assert client.put('/v1/proactive/connectors/comms_email', json=body).status_code == 200


def opt_in(subject='checker-1', roles=('incident_checker',), email=ADDRESS):
    as_user(subject, roles, email=email)
    response = client.put('/v1/staff-messages/preference', json={'opted_in': True})
    assert response.status_code == 200, response.text
    return response.json()


def test_host_switch_off_hides_every_route_and_sends_nothing(env, monkeypatch):
    monkeypatch.delenv('AEGIS_STAFF_EMAIL')
    as_user('admin-1', ('platform_admin',))
    for method, url in [('get', '/v1/staff-messages/preference'), ('put', '/v1/staff-messages/preference'),
                        ('post', '/v1/staff-messages/test'), ('get', '/v1/staff-messages/log')]:
        assert getattr(client, method)(url, **({'json': {'opted_in': True}} if method == 'put' else {})).status_code == 404
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x') == {'state': 'suppressed', 'reason': 'host_switch_off', 'provider_status': None}
    staff_messages.notify_approval_waiting(AGENCY, 'maker-1')
    assert env.calls == [] and env.store.log == [] and env.store.contacts == {}


def test_opt_in_uses_only_the_verified_token_address(env):
    view = opt_in()
    assert view['opted_in'] is True and view['address'] == 'c***@agency.example.org' and ADDRESS not in json.dumps(view)
    assert env.store.contacts['checker-1']['email'] == ADDRESS and env.store.contacts['checker-1']['roles'] == ['incident_checker']
    as_user(email=None)
    refused = client.put('/v1/staff-messages/preference', json={'opted_in': True, 'email': 'attacker@evil.example'})
    assert refused.status_code == 422  # no browser-supplied address is accepted
    refused = client.put('/v1/staff-messages/preference', json={'opted_in': True})
    assert refused.status_code == 409 and refused.json()['detail'] == 'verified_email_required'
    as_user(email='demo-checker@example.invalid')  # the local demo accounts: reserved, never deliverable
    refused = client.put('/v1/staff-messages/preference', json={'opted_in': True})
    assert refused.status_code == 409 and refused.json()['detail'] == 'undeliverable_address'


def test_token_without_verified_address_stops_an_existing_opt_in(env):
    opt_in()
    as_user(email=None)
    assert client.get('/v1/staff-messages/preference').json()['opted_in'] is False
    assert env.store.contacts['checker-1']['email'] is None


def test_roles_and_agency_refresh_from_the_token(env):
    opt_in()
    as_user(roles=('incident_auditor',))
    client.get('/v1/staff-messages/preference')
    assert env.store.contacts['checker-1']['roles'] == ['incident_auditor']


def test_each_gate_suppresses_with_its_code(env):
    # connector disabled
    opt_in()
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['reason'] == 'channel_disabled'
    enable_channel()
    # no consent
    assert staff_messages.deliver('nobody', AGENCY, 'test_notice', {}, 'x')['reason'] == 'no_consent'
    # agency mismatch
    assert staff_messages.deliver('checker-1', OTHER, 'test_notice', {}, 'x')['reason'] == 'agency_mismatch'
    # recipient cap
    for _ in range(staff_messages.RECIPIENT_HOURLY_CAP):
        assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['state'] == 'sent'
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['reason'] == 'recipient_cap'
    assert [(row['state'], row['reason']) for row in env.store.log] == [
        ('suppressed', 'channel_disabled'), ('suppressed', 'no_consent'), ('suppressed', 'agency_mismatch'),
        *[('queued', None), ('sent', None)] * 5, ('suppressed', 'recipient_cap')]
    attempts = {row['attempt_id'] for row in env.store.log}
    assert len(attempts) == 9  # queued and outcome rows of one attempt share an attempt id
    assert len(env.calls) == staff_messages.RECIPIENT_HOURLY_CAP


def test_agency_daily_cap_holds(env, monkeypatch):
    monkeypatch.setattr(staff_messages, 'AGENCY_DAILY_CAP', 2)
    enable_channel()
    for subject in ('checker-1', 'checker-2', 'checker-3'):
        opt_in(subject)
    states = [staff_messages.deliver(s, AGENCY, 'test_notice', {}, 'x') for s in ('checker-1', 'checker-2', 'checker-3')]
    assert [s['state'] for s in states] == ['sent', 'sent', 'suppressed'] and states[2]['reason'] == 'agency_cap'


def test_opt_out_stops_sending_immediately(env):
    enable_channel()
    opt_in()
    assert client.put('/v1/staff-messages/preference', json={'opted_in': False}).json()['opted_in'] is False
    assert env.store.contacts['checker-1']['email'] is None
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['reason'] == 'no_consent'
    as_user(email=None)  # opting out never needs an address
    assert client.put('/v1/staff-messages/preference', json={'opted_in': False}).status_code == 200
    assert env.calls == []


def test_disabling_the_connector_is_the_kill_switch(env):
    enable_channel()
    opt_in()
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['state'] == 'sent'
    enable_channel(False)
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['reason'] == 'channel_disabled'
    assert len(env.calls) == 1


def test_one_recipient_per_call_fixed_template_and_no_leaks(env, caplog):
    caplog.set_level(logging.DEBUG)
    enable_channel()
    opt_in()
    response = client.post('/v1/staff-messages/test')
    assert response.status_code == 200 and response.json() == {'template_id': 'test_notice', 'state': 'sent', 'reason': None, 'provider_status': 202}
    call = env.calls[0]
    assert call['url'] == 'https://api.sendgrid.com/v3/mail/send' and call['method'] == 'POST' and call['hosts'] == ('api.sendgrid.com',)
    payload = json.loads(call['data'])
    assert payload['personalizations'] == [{'to': [{'email': ADDRESS}]}] and 'cc' not in json.dumps(payload)
    assert payload['subject'].startswith('[IndTrana exercise]')
    body = payload['content'][0]['value']
    assert 'rehearsal notice' in body and 'http://localhost:3000/help' in body
    as_user('admin-1', ('platform_admin',))
    log = client.get('/v1/staff-messages/log')
    assert log.status_code == 200 and log.json()['rows'][0]['recipient'] == 'c***@agency.example.org'
    for text in (response.text, log.text, json.dumps(env.store.log, default=str), caplog.text, repr(Operator('s', AGENCY, frozenset(), email=ADDRESS))):
        assert API_KEY not in text and ADDRESS not in text and 'provider' + '":"body' not in text


@pytest.mark.parametrize('status,exception,reason', [(401, None, 'provider_rejected'), (500, None, 'provider_status'),
                                                     (None, OSError('refused secret-host ' + API_KEY), 'network_error'),
                                                     (None, TimeoutError(), 'timeout'), (None, RuntimeError(API_KEY), 'send_failed')])
def test_provider_failures_become_fixed_codes(env, monkeypatch, status, exception, reason):
    enable_channel()
    opt_in()

    def provider(*_a, **_k):
        if exception:
            raise exception
        return status, b'secret provider body'
    monkeypatch.setattr(connectors, 'bounded_request', provider)
    response = client.post('/v1/staff-messages/test')
    assert response.json()['state'] == 'failed' and response.json()['reason'] == reason
    assert API_KEY not in response.text and 'refused' not in json.dumps(env.store.log, default=str)


def test_test_send_goes_only_to_my_own_address(env):
    enable_channel()
    opt_in('checker-2', email='second@agency.example.org')
    as_user('checker-1')  # not opted in: nothing goes to anyone else
    assert client.post('/v1/staff-messages/test').json()['reason'] == 'no_consent'
    assert env.calls == []


def test_unknown_template_or_placeholder_is_refused():
    with pytest.raises(KeyError):
        staff_messages.render('free_text', {})
    with pytest.raises(ValueError):
        staff_messages.render('approval_waiting', {'note': 'free text'})
    for template_id in staff_messages.TEMPLATES:
        subject, body = staff_messages.render(template_id, {})
        assert subject.startswith('[IndTrana exercise] ') and 'rehearsal notice' in body


def submit_with(monkeypatch, maker='maker-1', roles=('incident_operator',)):
    monkeypatch.setattr(exercise_workflows, 'transition', lambda *a, **k: 'submitted')
    as_user(maker, roles, email='maker@agency.example.org')
    return client.post(f'/v1/exercise/proposals/{PROPOSAL}/transition', json={'operation': 'submit'})


def test_submit_notifies_opted_in_checkers_in_the_agency_but_never_the_maker(env, monkeypatch):
    enable_channel()
    opt_in('checker-1')
    opt_in('maker-1', roles=('incident_operator', 'incident_checker'), email='maker@agency.example.org')
    opt_in('auditor-1', roles=('incident_auditor',), email='auditor@agency.example.org')
    opt_in('checker-other', email='other@other.example.org')
    env.store.contacts['checker-other']['agency_id'] = OTHER
    response = submit_with(monkeypatch, roles=('incident_operator', 'incident_checker'))
    assert response.status_code == 200 and response.json()['status'] == 'submitted'
    recipients = [json.loads(c['data'])['personalizations'][0]['to'][0]['email'] for c in env.calls]
    assert recipients == [ADDRESS]
    assert [(r['recipient_subject'], r['template_id'], r['actor'], r['state']) for r in env.store.log] == [
        ('checker-1', 'approval_waiting', 'system:staff-email', 'queued'), ('checker-1', 'approval_waiting', 'system:staff-email', 'sent')]


def test_approval_and_rejection_send_nothing(env, monkeypatch):
    enable_channel()
    opt_in('checker-1')
    monkeypatch.setattr(exercise_workflows, 'transition', lambda *a, **k: 'approved')
    as_user('checker-2', ('incident_checker',))
    client.post(f'/v1/exercise/proposals/{PROPOSAL}/transition', json={'operation': 'approve', 'rationale': 'Independent review complete'})
    assert env.calls == []


def test_provider_or_store_failure_never_breaks_submission(env, monkeypatch):
    enable_channel()
    opt_in('checker-1')
    monkeypatch.setattr(connectors, 'bounded_request', lambda *a, **k: (_ for _ in ()).throw(OSError('down')))
    assert submit_with(monkeypatch).status_code == 200
    assert env.store.log[-1]['reason'] == 'network_error'

    class Broken:
        def __getattr__(self, _name):
            raise RuntimeError('database down')
    staff_message_store.set_store(Broken())
    assert submit_with(monkeypatch).status_code == 200


def test_failed_transition_sends_nothing(env, monkeypatch):
    from app.governance import DecisionError
    enable_channel()
    opt_in('checker-1')

    def refuse(*_a, **_k):
        raise DecisionError('not a draft')
    monkeypatch.setattr(exercise_workflows, 'transition', refuse)
    as_user('maker-1', ('incident_operator',))
    assert client.post(f'/v1/exercise/proposals/{PROPOSAL}/transition', json={'operation': 'submit'}).status_code == 409
    assert env.calls == [] and env.store.log == []


def test_roles_and_agency_checks(env):
    as_user('team-1', ('incident_checker',), agency=OTHER)
    response = client.get('/v1/staff-messages/preference')
    assert response.status_code == 403 and response.json()['detail'] == FIXTURE_AGENCY_DETAIL
    for role in ('incident_operator', 'incident_checker', 'incident_auditor'):
        as_user('u', (role,))
        assert client.get('/v1/staff-messages/preference').status_code == 200
        assert client.get('/v1/staff-messages/log').status_code == 403
    as_user('u', ())
    assert client.get('/v1/staff-messages/preference').status_code == 403
    as_user('admin-1', ('platform_admin',), agency=OTHER)
    assert client.get('/v1/staff-messages/log').status_code == 403


def test_admin_log_is_agency_scoped(env):
    enable_channel()
    opt_in()
    staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')
    env.store.log.append({**env.store.log[0], 'agency_id': OTHER, 'recipient_subject': 'elsewhere'})
    as_user('admin-1', ('platform_admin',))
    rows = client.get('/v1/staff-messages/log').json()['rows']
    assert [r['recipient_subject'] for r in rows] == ['checker-1']


@pytest.fixture()
def signed_jwt(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    issuer = 'https://identity.example.test/realm/aegis'
    monkeypatch.setenv('OIDC_ISSUER', issuer)
    monkeypatch.setenv('OIDC_AUDIENCE', 'aegis')
    monkeypatch.setenv('OIDC_JWKS_URL', issuer + '/certs')
    monkeypatch.setattr(security, '_jwk_client', lambda _u: SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=key.public_key())))

    def sign(**claims):
        now = datetime.now(timezone.utc)
        payload = {'iss': issuer, 'aud': 'aegis', 'sub': 'op', 'iat': int(now.timestamp()),
                   'exp': int((now + timedelta(minutes=5)).timestamp()), 'aegis_roles': ['incident_checker'],
                   'aegis_agency_id': str(AGENCY), **claims}
        return jwt.encode(payload, key, algorithm='RS256')
    return sign


@pytest.mark.parametrize('claims,expected', [({'email': ADDRESS, 'email_verified': True}, ADDRESS),
                                             ({'email': ADDRESS, 'email_verified': False}, None),
                                             ({'email': ADDRESS, 'email_verified': 'true'}, None),
                                             ({'email': ADDRESS}, None),
                                             ({'email': 'a@b.c\nBcc: x@y.z', 'email_verified': True}, None),
                                             ({'email_verified': True}, None)])
def test_operator_email_only_from_a_verified_claim(signed_jwt, claims, expected):
    operator = security.decode_operator_token(signed_jwt(**claims))
    assert operator.email == expected and operator.roles == frozenset({'incident_checker'})
    assert ADDRESS not in repr(operator)


# --- review fixes: stale register, event agency, two-row log, lock, in-flight, address change, maker cap ----------

def test_stale_row_never_receives(env):
    enable_channel()
    opt_in()
    env.store.contacts['checker-1']['updated_at'] -= timedelta(hours=staff_messages.CONTACT_FRESH_HOURS + 1)
    assert staff_messages.deliver('checker-1', AGENCY, 'approval_waiting', {}, 'x')['reason'] == 'stale_contact'
    assert env.calls == [] and env.store.log[-1]['reason'] == 'stale_contact'


def test_role_removed_is_picked_up_from_the_approvals_list_read(env, monkeypatch):
    enable_channel()
    opt_in()
    monkeypatch.setattr(exercise_workflows, 'list_proposals', lambda _agency: [])
    as_user('checker-1', ('incident_auditor',))
    assert client.get('/v1/exercise/proposals').status_code == 200
    assert env.store.contacts['checker-1']['roles'] == ['incident_auditor']
    assert submit_with(monkeypatch).status_code == 200
    assert env.calls == []


def test_moved_agency_row_never_receives(env, monkeypatch):
    enable_channel()
    opt_in()
    staff_messages.refresh_contact(Operator('checker-1', OTHER, frozenset({'incident_checker'}), email=ADDRESS))
    assert env.store.contacts['checker-1']['agency_id'] == OTHER
    assert submit_with(monkeypatch).status_code == 200  # event in AGENCY: the moved person is not a candidate
    # The move also ended the opt-in, so the first gate to refuse is consent.
    assert staff_messages.deliver('checker-1', AGENCY, 'approval_waiting', {}, 'x')['reason'] in {'no_consent', 'agency_mismatch'}
    assert env.calls == []


def test_event_agency_mismatch_suppresses(env):
    enable_channel()
    opt_in()
    assert staff_messages.deliver('checker-1', OTHER, 'approval_waiting', {}, 'x')['reason'] == 'agency_mismatch'


def test_refresh_failure_never_affects_workflow_routes(env, monkeypatch):
    class Broken:
        def __getattr__(self, _name):
            raise RuntimeError('database down')
    staff_message_store.set_store(Broken())
    monkeypatch.setattr(exercise_workflows, 'list_proposals', lambda _agency: [{'id': 'p'}])
    as_user('checker-1', ('incident_checker',))
    response = client.get('/v1/exercise/proposals')
    assert response.status_code == 200 and response.json() == [{'id': 'p'}]


def test_queued_rows_count_toward_caps_even_without_an_outcome(env, monkeypatch):
    enable_channel()
    opt_in()
    real_add = env.store.add_log

    def add_log(row):
        if row['state'] != 'queued':
            raise RuntimeError('outcome write failed')
        real_add(row)
    monkeypatch.setattr(env.store, 'add_log', add_log)
    for _ in range(staff_messages.RECIPIENT_HOURLY_CAP):
        assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['state'] == 'sent'  # 202, outcome lost
    assert [r['state'] for r in env.store.log] == ['queued'] * staff_messages.RECIPIENT_HOURLY_CAP
    monkeypatch.setattr(env.store, 'add_log', real_add)
    assert staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')['reason'] == 'recipient_cap'
    assert len(env.calls) == staff_messages.RECIPIENT_HOURLY_CAP


def test_no_lock_is_held_during_the_provider_call(env, monkeypatch):
    enable_channel()
    opt_in()
    seen = []

    def provider(*_a, **_k):
        seen.append(env.store._lock.locked())
        return 202, b''
    monkeypatch.setattr(connectors, 'bounded_request', provider)
    staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')
    assert seen == [False]


def test_lock_unavailable_suppresses(env, monkeypatch):
    enable_channel()
    opt_in()
    monkeypatch.setattr(env.store, 'reserve', lambda *a, **k: 'send_lock_unavailable')
    result = staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')
    assert result['reason'] == 'send_lock_unavailable' and env.calls == []


def test_memory_reserve_gives_up_on_a_held_lock(env):
    env.store._lock.acquire()
    try:
        row = {'attempt_id': 'a', 'agency_id': AGENCY, 'recipient_subject': 'checker-1', 'template_id': 'test_notice',
               'params': {}, 'actor': 'x'}
        now = datetime.now(timezone.utc)
        assert env.store.reserve(row, hour_since=now, day_since=now, recipient_cap=5, agency_cap=5) == 'send_lock_unavailable'
    finally:
        env.store._lock.release()


def test_in_flight_guard_on_self_test(env):
    enable_channel()
    opt_in()
    staff_messages._in_flight.add('checker-1')
    try:
        response = client.post('/v1/staff-messages/test')
        assert response.json()['reason'] == 'test_in_flight' and env.calls == []
    finally:
        staff_messages._in_flight.discard('checker-1')
    assert client.post('/v1/staff-messages/test').json()['state'] == 'sent'
    assert 'checker-1' not in staff_messages._in_flight


def test_address_change_or_reserved_address_ends_the_opt_in(env):
    opt_in()
    as_user(email='new.address@agency.example.org')
    assert client.get('/v1/staff-messages/preference').json()['opted_in'] is False
    assert env.store.contacts['checker-1']['email'] is None
    opt_in(email=ADDRESS)
    as_user(email='checker@example.invalid')
    assert client.get('/v1/staff-messages/preference').json()['opted_in'] is False


def test_a_move_to_another_agency_ends_the_opt_in(env):
    opt_in()
    staff_messages.refresh_contact(Operator('checker-1', OTHER, frozenset({'incident_checker'}), email=ADDRESS))
    assert env.store.contacts['checker-1']['email'] is None
    as_user()
    assert client.get('/v1/staff-messages/preference').json()['opted_in'] is False


def test_admin_log_shows_one_line_per_attempt(env, monkeypatch):
    enable_channel()
    opt_in()
    staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')
    real_add = env.store.add_log

    def add_log(row):
        if row['state'] != 'queued':
            raise RuntimeError('outcome write failed')
        real_add(row)
    monkeypatch.setattr(env.store, 'add_log', add_log)
    staff_messages.deliver('checker-1', AGENCY, 'test_notice', {}, 'x')
    as_user('admin-1', ('platform_admin',))
    rows = client.get('/v1/staff-messages/log').json()['rows']
    assert [r['state'] for r in rows] == ['queued', 'sent']  # newest: outcome not recorded; older: sent


def test_maker_hourly_event_cap(env, monkeypatch):
    monkeypatch.setattr(staff_messages, 'MAKER_HOURLY_EVENT_CAP', 1)
    enable_channel()
    opt_in()
    assert submit_with(monkeypatch).status_code == 200
    assert submit_with(monkeypatch).status_code == 200
    assert len(env.calls) == 1


def test_staff_message_routes_are_in_the_auth_inventory():
    from test_route_auth_inventory import _calls, _routes
    routes = [r for r in _routes(app.routes) if r.path.startswith('/v1/staff-messages')]
    assert {(m, r.path) for r in routes for m in r.methods} == {
        ('GET', '/v1/staff-messages/preference'), ('PUT', '/v1/staff-messages/preference'),
        ('POST', '/v1/staff-messages/test'), ('GET', '/v1/staff-messages/log')}
    for route in routes:
        calls = _calls(route.dependant, set())
        assert get_operator in calls and any(getattr(c, 'allowed_roles', None) for c in calls)
