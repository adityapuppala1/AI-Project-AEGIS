"""Team response loop (docs/RESPONSE_LOOP.md): rules, authority, scope binding, claims and the close-task guard."""
import ast
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import response_loop as rules
from app import response_routes, response_store, workflow_store
from app.governance import DecisionError
from app.main import app
from app.proposal_simulation import PLAYBOOK, advance_task, prepare_task_receipt
from app.security import TEAM_IDS, Operator, decode_operator_token, get_operator
from test_security import signed_jwt  # noqa: F401 - pytest fixture

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
PROPOSAL = '77777777-7777-4777-8777-777777777777'
REQUEST = '88888888-8888-4888-8888-888888888888'
URL = '/v1/exercise/response'
NOTE = 'SIMULATION: rehearsal note for the team'
NOON = datetime(2026, 11, 12, 12, 0, tzinfo=timezone.utc)
client = TestClient(app)


def as_(roles, department=None, team=None, subject='user-1'):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, AGENCY, frozenset(roles), department, team)


@pytest.fixture(autouse=True)
def reset():
    yield
    app.dependency_overrides.clear()


def req(state='requested', version=0, attention=False):
    return {'state': state, 'version': version, 'needs_attention': attention}


def apply(state, kind, code=None, caller='team', version=0, attention=False, last=None, expected=None, note=NOTE, actor='a'):
    return rules.apply_report(req(state, version, attention), last, kind=kind, code=code, note=note, actor=actor,
                              caller=caller, expected_version=version if expected is None else expected)


CODE_FOR = {'declined': 'off_shift', 'on_site': 'as_expected', 'completed': 'nothing_found',
            'situation_report': 'access_blocked', 'needs_support': 'equipment'}


# ---- lifecycle --------------------------------------------------------------------------------------------
@pytest.mark.parametrize('kind', rules.REPORT_KINDS)
@pytest.mark.parametrize('state', rules.STATES)
def test_every_transition_allowed_or_refused(kind, state):
    target, sources, team_ok, _codes = rules.KINDS[kind]
    caller = 'team' if team_ok else 'department'
    attention = kind == 'desk_handled'
    allowed = state in sources
    if not allowed:
        with pytest.raises(rules.ResponseError) as err:
            apply(state, kind, CODE_FOR.get(kind), caller, attention=attention)
        assert err.value.status == 409
        return
    change = apply(state, kind, CODE_FOR.get(kind), caller, attention=attention)
    assert change['state'] == (target or state) and change['version'] == 1
    assert change['state_changed'] is (target is not None)


def test_terminal_states_accept_only_desk_handled_when_flagged():
    for state in rules.TERMINAL:
        for kind in rules.REPORT_KINDS:
            if kind == 'desk_handled':
                assert apply(state, kind, caller='department', attention=True)['needs_attention'] is False
                continue
            with pytest.raises(rules.ResponseError):
                apply(state, kind, CODE_FOR.get(kind), 'department')


def test_attention_flag_rules():
    assert apply('requested', 'declined', 'other')['needs_attention'] is True
    assert apply('on_site', 'needs_support', 'medical')['needs_attention'] is True
    assert apply('on_site', 'stood_down', caller='department', attention=True)['needs_attention'] is False
    assert apply('accepted', 'en_route', attention=True)['needs_attention'] is True
    with pytest.raises(rules.ResponseError, match='not flagged'):
        apply('accepted', 'desk_handled', caller='department')


# ---- codes and notes --------------------------------------------------------------------------------------
@pytest.mark.parametrize('kind', rules.REPORT_KINDS)
def test_code_rules_per_kind(kind):
    allowed = rules.KINDS[kind][3]
    if allowed is None:
        assert rules.check_code(kind, None) is None
        with pytest.raises(rules.ResponseError):
            rules.check_code(kind, 'other')
    else:
        for code in allowed:
            assert rules.check_code(kind, code) == code
        for bad in (None, '', 'unknown', 1, ['other']):
            with pytest.raises(rules.ResponseError):
                rules.check_code(kind, bad)
        wrong = next(c for c in rules.ALL_CODES if c not in allowed)
        with pytest.raises(rules.ResponseError):
            rules.check_code(kind, wrong)


@pytest.mark.parametrize('note', ['', 'short', 'x' * 1001, 'ten chars\nnewline', 'tab\there is bad', 'zero​width text',
                                  'line separator', None, 12345678901])
def test_note_bounds_and_control_characters(note):
    with pytest.raises(rules.ResponseError):
        rules.clean_note(note)


def test_note_is_trimmed_and_bounded():
    assert rules.clean_note('  ' + 'x' * 10 + '  ') == 'x' * 10
    assert rules.clean_note('x' * 1000) == 'x' * 1000


# ---- retry and version ------------------------------------------------------------------------------------
def test_exact_retry_is_noop_and_other_mismatch_conflicts():
    last = {'kind': 'accepted', 'code': None, 'note': NOTE, 'actor_subject': 'a'}
    assert apply('accepted', 'accepted', version=1, expected=0, last=last) is None
    for changed in ({'actor': 'b'}, {'note': NOTE + ' changed'}):
        with pytest.raises(rules.ResponseError, match='refresh') as err:
            apply('accepted', 'accepted', version=1, expected=0, last=last, **changed)
        assert err.value.status == 409
    with pytest.raises(rules.ResponseError, match='refresh'):
        apply('accepted', 'en_route', version=1, expected=0, last=last)
    with pytest.raises(rules.ResponseError, match='refresh'):
        apply('accepted', 'accepted', version=3, expected=1, last=last)
    with pytest.raises(rules.ResponseError, match='refresh'):
        apply('requested', 'accepted', version=0, expected=1)
    with pytest.raises(rules.ResponseError, match='Invalid expected version'):
        rules.apply_report(req(), None, kind='accepted', code=None, note=NOTE, actor='a', caller='team', expected_version=True)


# ---- authority --------------------------------------------------------------------------------------------
def test_authority_team_relay_and_desk_only():
    for kind in rules.REPORT_KINDS:
        team_ok = rules.KINDS[kind][2]
        assert rules.authority_for(kind, 'department') == ('department_relay' if team_ok else 'department')
        if team_ok:
            assert rules.authority_for(kind, 'team') == 'team'
        else:
            with pytest.raises(rules.ResponseError) as err:
                rules.authority_for(kind, 'team')
            assert err.value.status == 403
    with pytest.raises(rules.ResponseError):
        rules.authority_for('accepted', 'reader')
    with pytest.raises(rules.ResponseError):
        rules.authority_for('requested', 'department')


# ---- timeline ---------------------------------------------------------------------------------------------
def test_timeline_templates_are_fixed_and_never_contain_the_note():
    secret = 'PRIVATE NOTE CONTENT 12345'
    for kind in ('requested',) + rules.REPORT_KINDS:
        line = rules.timeline_summary(kind, 'Synthetic rescue team 01', CODE_FOR.get(kind))
        if kind == 'desk_handled':
            assert line is None
            continue
        assert line.startswith('SIMULATION: ') and secret not in line and 'Synthetic rescue team 01' in line
    for template in rules.TIMELINE.values():
        assert set(part.split('}')[0] for part in template.split('{')[1:]) <= {'team', 'code'}


# ---- suggestion -------------------------------------------------------------------------------------------
POINT = {'lat': 17.4065, 'lon': 78.4483}


def test_suggestion_order_and_flags():
    out = rules.suggest_teams('Urban waterlogging', POINT, {'syn-team-rescue-01': 2}, NOON)
    assert out['capability_basis'] == 'assessed' and out['hazard_key'] == 'flood_gauge'
    ids = [t['id'] for t in out['teams']]
    # Two matches first (rescue-02 has free capacity, rescue-01 is full), then one match, then none.
    assert ids[:2] == ['syn-team-rescue-02', 'syn-team-rescue-01']
    assert ids[-1] == 'syn-team-fire-01'
    by_id = {t['id']: t for t in out['teams']}
    assert by_id['syn-team-rescue-01']['free_capacity'] == 0 and not by_id['syn-team-rescue-01']['suggested']
    assert by_id['syn-team-rescue-02']['suggested'] and not by_id['syn-team-fire-01']['suggested']
    assert all(isinstance(t['estimated_travel_minutes'], float) for t in out['teams'])
    keys = [(-len(t['matched_capabilities']), -t['free_capacity'], not t['available_now'], t['estimated_travel_minutes'], t['id'])
            for t in out['teams']]
    assert keys == sorted(keys)


def test_suggestion_window_and_unknown_hazard():
    early = datetime(2026, 11, 12, 1, 0, tzinfo=timezone.utc)
    out = rules.suggest_teams('Heavy rainfall', None, {}, early)
    municipal = next(t for t in out['teams'] if t['id'] == 'syn-team-municipal-01')
    assert municipal['available_now'] is False and municipal['estimated_travel_minutes'] is None
    unknown = rules.suggest_teams('Volcanic ash', POINT, {}, NOON)
    assert unknown['capability_basis'] == 'not_assessed' and unknown['hazard_key'] is None
    assert not any(t['suggested'] or t['matched_capabilities'] for t in unknown['teams'])
    rules.check_request_allowed(unknown, 'syn-team-fire-01')  # not assessed: capability is not a refusal


def test_request_refusals():
    full = rules.suggest_teams('Urban waterlogging', POINT, {'syn-team-rescue-01': 2}, NOON)
    with pytest.raises(rules.ResponseError, match='capacity'):
        rules.check_request_allowed(full, 'syn-team-rescue-01')
    with pytest.raises(rules.ResponseError, match='capability'):
        rules.check_request_allowed(full, 'syn-team-fire-01')
    early = rules.suggest_teams('Urban waterlogging', POINT, {}, datetime(2026, 11, 12, 20, 0, tzinfo=timezone.utc))
    with pytest.raises(rules.ResponseError, match='window'):
        rules.check_request_allowed(early, 'syn-team-municipal-01')
    with pytest.raises(rules.ResponseError):
        rules.check_request_allowed(full, 'syn-team-unknown')


# ---- routes: scope binding and roles ----------------------------------------------------------------------
def body(**extra):
    return {'proposal_id': PROPOSAL, 'task_id': 'infrastructure', 'team_id': 'syn-team-rescue-01',
            'expected_assignment_version': 0, 'note': NOTE, **extra}


def test_create_binds_signed_department_agency_and_actor(monkeypatch):
    calls = []
    monkeypatch.setattr(response_store, 'create_request', lambda *a, **k: calls.append(a) or ({'id': REQUEST}, True))
    as_({'department_operator'}, 'infrastructure', subject='desk-1')
    response = client.post(URL + '/requests', json=body())
    assert response.status_code == 201
    assert calls[0][:6] == (AGENCY, 'infrastructure', 'desk-1', PROPOSAL, 'infrastructure', 'syn-team-rescue-01')
    assert response.json()['outbound_messages_sent'] is False and response.json()['exercise_only'] is True


@pytest.mark.parametrize('extra', [{'department_id': 'communications'}, {'agency_id': str(AGENCY)}, {'actor': 'x'},
                                   {'requested_by': 'x'}, {'expected_assignment_version': True},
                                   {'team_id': 'real-unit-7'}, {'note': 'short'}, {'note': 'x' * 1001}])
def test_create_forged_or_invalid_fields_rejected(monkeypatch, extra):
    monkeypatch.setattr(response_store, 'create_request', lambda *a, **k: pytest.fail('Unauthorized write'))
    as_({'department_operator'}, 'infrastructure')
    assert client.post(URL + '/requests', json=body(**extra)).status_code == 422


@pytest.mark.parametrize('extra', [{'team_id': 'syn-team-rescue-02'}, {'authority': 'team'}, {'actor': 'x'},
                                   {'state': 'completed'}, {'kind': 'requested'}, {'expected_version': '1'},
                                   {'code': 'invented'}])
def test_report_forged_fields_rejected(monkeypatch, extra):
    monkeypatch.setattr(response_store, 'record_report', lambda *a, **k: pytest.fail('Unauthorized write'))
    as_({'response_team'}, team='syn-team-rescue-01')
    payload = {'kind': 'accepted', 'expected_version': 0, 'note': NOTE, **extra}
    assert client.post(f'{URL}/requests/{REQUEST}/reports', json=payload).status_code == 422


def test_report_binds_signed_team(monkeypatch):
    calls = []
    monkeypatch.setattr(response_store, 'record_report', lambda *a, **k: calls.append((a, k)) or {'id': REQUEST})
    as_({'response_team'}, team='syn-team-health-01', subject='team-9')
    assert client.post(f'{URL}/requests/{REQUEST}/reports', json={'kind': 'accepted', 'expected_version': 0, 'note': NOTE}).status_code == 200
    args, kwargs = calls[0]
    assert args == (AGENCY, 'team-9', REQUEST)
    assert kwargs['caller'] == 'team' and kwargs['scope_value'] == 'syn-team-health-01'
    as_({'department_operator'}, 'communications', subject='desk-2')
    client.post(f'{URL}/requests/{REQUEST}/reports', json={'kind': 'stood_down', 'expected_version': 0, 'note': NOTE})
    assert calls[1][1]['caller'] == 'department' and calls[1][1]['scope_value'] == 'communications'


def test_readers_read_agency_but_cannot_write(monkeypatch):
    calls = []
    monkeypatch.setattr(response_store, 'list_requests', lambda *a, **k: calls.append(k) or [])
    monkeypatch.setattr(response_store, 'create_request', lambda *a, **k: pytest.fail('write'))
    monkeypatch.setattr(response_store, 'record_report', lambda *a, **k: pytest.fail('write'))
    for role in ('incident_operator', 'incident_checker', 'incident_auditor'):
        as_({role})
        assert client.get(URL + '/requests').status_code == 200
        assert calls[-1]['view'] == 'reader' and calls[-1]['scope_value'] is None
        assert client.post(URL + '/requests', json=body()).status_code == 403
        assert client.post(f'{URL}/requests/{REQUEST}/reports', json={'kind': 'accepted', 'expected_version': 0, 'note': NOTE}).status_code == 403
        assert client.get(f'{URL}/teams?proposal_id={PROPOSAL}&task_id=infrastructure').status_code == 403
        assert client.get(URL + '/alerts').json()['count'] == 0


def test_team_and_desk_list_views_are_scoped(monkeypatch):
    calls = []
    monkeypatch.setattr(response_store, 'list_requests', lambda *a, **k: calls.append(k) or [])
    as_({'response_team'}, team='syn-team-rescue-02')
    client.get(URL + '/requests?team_id=syn-team-rescue-01&department_id=control_room')
    assert calls[-1]['view'] == 'team' and calls[-1]['scope_value'] == 'syn-team-rescue-02'
    as_({'department_operator'}, 'control_room')
    client.get(URL + f'/requests?incident_id={PROPOSAL}')
    assert calls[-1] == {'view': 'department', 'scope_value': 'control_room', 'incident_id': PROPOSAL}
    assert client.get(URL + '/requests?incident_id=not-a-uuid').status_code == 422


def test_team_cannot_request_or_see_suggestions(monkeypatch):
    monkeypatch.setattr(response_store, 'create_request', lambda *a, **k: pytest.fail('write'))
    as_({'response_team'}, team='syn-team-rescue-01')
    assert client.post(URL + '/requests', json=body()).status_code == 403
    assert client.get(f'{URL}/teams?proposal_id={PROPOSAL}&task_id=infrastructure').status_code == 403


@pytest.mark.parametrize('roles,department,team', [
    ({'platform_admin'}, None, None), ({'platform_admin', 'incident_auditor'}, None, None),
    ({'response_team'}, None, None), ({'response_team'}, None, 'syn-team-other'),
    ({'department_operator'}, None, None), ({'response_team', 'department_operator'}, 'control_room', 'syn-team-rescue-01')])
def test_admin_ambiguous_or_unscoped_tokens_refused(monkeypatch, roles, department, team):
    monkeypatch.setattr(response_store, 'list_requests', lambda *a, **k: pytest.fail('read'))
    as_(roles, department, team)
    assert client.get(URL + '/requests').status_code == 403


def test_alerts_by_view(monkeypatch):
    seen = []
    monkeypatch.setattr(response_store, 'alert_count', lambda agency, **k: seen.append(k) or 3)
    as_({'response_team'}, team='syn-team-rescue-01')
    assert client.get(URL + '/alerts').json() == {'count': 3, 'exercise_only': True}
    as_({'platform_admin'})
    assert client.get(URL + '/alerts').json()['count'] == 0
    assert seen == [{'view': 'team', 'scope_value': 'syn-team-rescue-01'}]


def test_errors_are_fixed_strings(monkeypatch):
    import psycopg

    def boom(*a, **k):
        raise psycopg.OperationalError('connection to server at "db" (10.0.0.5) failed: password secret')
    monkeypatch.setattr(response_store, 'record_report', boom)
    as_({'response_team'}, team='syn-team-rescue-01')
    response = client.post(f'{URL}/requests/{REQUEST}/reports', json={'kind': 'accepted', 'expected_version': 0, 'note': NOTE})
    assert response.status_code == 503 and response.json() == {'detail': 'Response loop storage unavailable'}
    monkeypatch.setattr(response_store, 'record_report', lambda *a, **k: (_ for _ in ()).throw(LookupError('raw id 123')))
    response = client.post(f'{URL}/requests/{REQUEST}/reports', json={'kind': 'accepted', 'expected_version': 0, 'note': NOTE})
    assert response.status_code == 404 and 'raw' not in response.text
    monkeypatch.setattr(response_store, 'record_report',
                        lambda *a, **k: (_ for _ in ()).throw(rules.ResponseError('This request changed; refresh before retrying')))
    assert client.post(f'{URL}/requests/{REQUEST}/reports', json={'kind': 'accepted', 'expected_version': 0, 'note': NOTE}).status_code == 409


def test_store_refuses_unknown_caller_before_database():
    with pytest.raises(rules.ResponseError):
        response_store.record_report(AGENCY, 'a', REQUEST, caller='reader', scope_value='x', kind='accepted',
                                     expected_version=0, note=NOTE, code=None)
    with pytest.raises(rules.ResponseError):
        response_store.list_requests(AGENCY, 'a', view='admin')


# ---- close-task guard -------------------------------------------------------------------------------------
class FakeCursor:
    def __init__(self, row):
        self.row, self.sql = row, []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.sql.append(sql)

    def fetchone(self):
        return self.row


class FakeConn(FakeCursor):
    def cursor(self, **_kw):
        return self.cur


def acknowledged_row():
    receipt = prepare_task_receipt(PROPOSAL, 'approved', {'playbook': {'version': PLAYBOOK}, 'operational_actions_enabled': False})
    receipt, _ = advance_task(receipt, 'infrastructure', 'acknowledge_task', 'desk', 'SIMULATION: reviewed evidence')
    return {'id': PROPOSAL, 'incident_id': PROPOSAL, 'maker_subject': 'maker', 'action_type': 'review_evidence',
            'status': 'approved', 'proposal': {'simulation': receipt}}


@pytest.mark.parametrize('active', [True, False])
def test_close_task_guard(monkeypatch, active):
    from app.governance import Action
    row = acknowledged_row()
    row['action_type'] = list(Action)[0].value
    conn = FakeConn(row)
    conn.cur = FakeCursor(row)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://unit.invalid/test')
    monkeypatch.setattr(workflow_store.psycopg, 'connect', lambda *a, **k: conn)
    monkeypatch.setattr(response_store, 'task_has_active_requests', lambda cur, p, t: active)
    call = lambda: workflow_store.transition(PROPOSAL, AGENCY, 'desk', 'close_task', 'SIMULATION: closing the task',
                                             task_id='infrastructure', department_id='infrastructure',
                                             expected_assignment_version=0)
    if active:
        with pytest.raises(DecisionError, match='team requests'):
            call()
        assert not any(s.startswith('UPDATE action_proposals') for s in conn.cur.sql)
    else:
        assert call() == 'approved'
        assert any(s.startswith('UPDATE action_proposals') for s in conn.cur.sql)


# ---- claims -----------------------------------------------------------------------------------------------
def test_signed_team_scope(signed_jwt):  # noqa: F811
    operator = decode_operator_token(signed_jwt(aegis_roles=['response_team'], aegis_team_id='syn-team-rescue-01'))
    assert operator.team_id == 'syn-team-rescue-01' and operator.department_id is None


@pytest.mark.parametrize('team', [None, '', 'syn-team-other', ['syn-team-rescue-01'], 1, 'SYN-TEAM-RESCUE-01'])
def test_team_role_requires_valid_signed_team(signed_jwt, team):  # noqa: F811
    with pytest.raises(HTTPException) as err:
        decode_operator_token(signed_jwt(aegis_roles=['response_team'], aegis_team_id=team))
    assert err.value.status_code == 403


def test_team_claim_without_role_must_still_be_valid(signed_jwt):  # noqa: F811
    with pytest.raises(HTTPException):
        decode_operator_token(signed_jwt(aegis_team_id='bogus'))
    assert decode_operator_token(signed_jwt()).team_id is None


def test_team_ids_match_fixture_and_migration():
    fixture = json.loads((Path(rules.__file__).parent / 'fixtures' / 'synthetic_teams.v1.json').read_text(encoding='utf-8'))
    ids = {t['id'] for t in fixture['teams']}
    assert TEAM_IDS == ids
    migration = (Path(__file__).resolve().parents[3] / 'db' / 'migrations' / '017_response_loop.sql').read_text(encoding='utf-8')
    assert all(f"'{i}'" in migration for i in ids)
    assert set(response_routes.TeamId.__args__) == ids


# ---- no transport -----------------------------------------------------------------------------------------
FORBIDDEN = {'requests', 'httpx', 'urllib', 'urllib3', 'aiohttp', 'smtplib', 'socket', 'twilio', 'boto3', 'botocore',
             'http', 'email', 'ftplib', 'telnetlib', 'websocket', 'websockets', 'firebase_admin', 'sendgrid', 'pywebpush'}


@pytest.mark.parametrize('module', ['response_loop.py', 'response_store.py', 'response_routes.py'])
def test_new_modules_import_no_network_or_messaging_library(module):
    tree = ast.parse((Path(rules.__file__).parent / module).read_text(encoding='utf-8'))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {alias.name.split('.')[0] for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split('.')[0])
    assert not names & FORBIDDEN
