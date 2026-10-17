from uuid import UUID
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import department_tasks, workflow_store
from app.security import Operator, get_operator
from app.governance import DecisionError

AGENCY = UUID('11111111-1111-4111-8111-111111111111')
ID = '77777777-7777-4777-8777-777777777777'
URL = '/v1/exercise/department-tasks'
client = TestClient(app)

@pytest.fixture(autouse=True)
def identity():
    app.dependency_overrides[get_operator] = lambda: Operator('department-user', AGENCY, frozenset({'department_operator'}), 'infrastructure')
    yield
    app.dependency_overrides.clear()


def test_inbox_uses_signed_scope(monkeypatch):
    calls = []
    monkeypatch.setattr(department_tasks, 'list_department_tasks', lambda *args: calls.append(args) or [])
    response = client.get(URL + '?department_id=communications')
    assert response.status_code == 200
    assert calls == [(AGENCY, 'infrastructure')]
    assert response.json()['department_id'] == 'infrastructure'


def test_transition_binds_department_and_actor(monkeypatch):
    calls = []
    monkeypatch.setattr(department_tasks, 'transition', lambda *args, **kwargs: calls.append((args, kwargs)) or 'approved')
    assert client.post(f'{URL}/{ID}/transition', json={'operation': 'acknowledge_task', 'task_id': 'infrastructure', 'expected_assignment_version': 0, 'rationale': 'Reviewed rehearsal evidence'}).status_code == 200
    assert calls[0][0][1:3] == (AGENCY, 'department-user')
    assert calls[0][1] == {'task_id': 'infrastructure', 'department_id': 'infrastructure', 'expected_assignment_version': 0}


@pytest.mark.parametrize('extra', [{'department_id': 'communications'}, {'expected_assignment_version': True}, {'actor': 'checker'}, {'operation': 'approve'}])
def test_forged_authority_rejected(monkeypatch, extra):
    monkeypatch.setattr(department_tasks, 'transition', lambda *a, **kw: pytest.fail('Unauthorized write'))
    assert client.post(f'{URL}/{ID}/transition', json={'operation': 'close_task', 'task_id': 'infrastructure', 'expected_assignment_version': 0, 'rationale': 'Reviewed rehearsal evidence', **extra}).status_code == 422


def test_department_cannot_read_or_approve_proposals():
    assert client.get('/v1/exercise/proposals').status_code == 403
    assert client.post(f'/v1/exercise/proposals/{ID}/transition', json={'operation': 'approve', 'rationale': 'Reviewed rehearsal evidence'}).status_code == 403


@pytest.mark.parametrize('role,department', [('incident_operator', 'infrastructure'), ('department_operator', None)])
def test_inbox_requires_department_authority(role, department):
    app.dependency_overrides[get_operator] = lambda: Operator('user', AGENCY, frozenset({role}), department)
    assert client.get(URL).status_code == 403


def test_store_requires_department_assignment_version_before_database():
    with pytest.raises(DecisionError, match='outside verified'):
        workflow_store.transition(ID, AGENCY, 'user', 'close_task', 'Reviewed rehearsal evidence', task_id='communications', department_id='infrastructure')


def test_department_cannot_reassign():
    assert client.post(f'/v1/exercise/proposals/{ID}/transition', json={
        'operation': 'reassign_task', 'task_id': 'infrastructure',
        'target_department': 'communications', 'expected_assignment_version': 0,
        'rationale': 'SIMULATION: attempted privilege escalation'}).status_code == 403
