"""Retained PostGIS fixture: scope, approval gate, concurrent retry and audit."""
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from app import workflow_store
from app.governance import DecisionError
from app.intelligence_store import DEMO_AGENCY
from test_postgis_assistance_run import create_case_and_draft

pytestmark = pytest.mark.skipif(not os.getenv('AEGIS_TEST_DATABASE_URL'), reason='Opt-in local PostGIS required')


def test_department_inbox_and_atomic_task_audit(monkeypatch):
    _case, draft, maker = create_case_and_draft(monkeypatch)
    def inbox(agency=DEMO_AGENCY, department='infrastructure'):
        return [row for row in workflow_store.list_department_tasks(agency, department) if row['proposal_id'] == draft]
    assert inbox() == []
    with pytest.raises(DecisionError, match='Independent approval'):
        workflow_store.transition(draft, DEMO_AGENCY, 'department-actor', 'acknowledge_task',
            'SIMULATION: reviewed evidence', task_id='infrastructure', department_id='infrastructure')
    workflow_store.transition(draft, DEMO_AGENCY, maker, 'submit')
    workflow_store.transition(draft, DEMO_AGENCY, maker + '-checker', 'approve', 'SIMULATION: independently reviewed')
    workflow_store.transition(draft, DEMO_AGENCY, maker, 'prepare_tasks')
    rows = inbox()
    assert len(rows) == 1
    assert set(rows[0]) == {'proposal_id', 'incident_id', 'task'}
    assert rows[0]['task']['id'] == 'infrastructure'
    assert inbox(uuid4()) == []
    before = workflow_store.proposal_audit(draft, DEMO_AGENCY)
    with pytest.raises(LookupError):
        workflow_store.transition(draft, uuid4(), 'department-actor', 'acknowledge_task',
            'SIMULATION: wrong agency', task_id='infrastructure', department_id='infrastructure')
    with pytest.raises(DecisionError, match='Acknowledge'):
        workflow_store.transition(draft, DEMO_AGENCY, 'department-actor', 'close_task',
            'SIMULATION: premature closure', task_id='infrastructure', department_id='infrastructure')
    assert workflow_store.proposal_audit(draft, DEMO_AGENCY) == before
    def advance(operation):
        return workflow_store.transition(draft, DEMO_AGENCY, 'department-actor', operation,
            'SIMULATION: reviewed evidence', task_id='infrastructure', department_id='infrastructure')
    for operation in ['acknowledge_task', 'close_task']:
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert list(pool.map(advance, [operation, operation])) == ['approved', 'approved']
    assert inbox()[0]['task']['state'] == 'closed'
    assert inbox(department='communications')[0]['task']['state'] == 'prepared'
    audit = workflow_store.proposal_audit(draft, DEMO_AGENCY)
    events = [event for event in audit['events'] if event['action'] in {'acknowledge_task', 'close_task'}]
    assert len(events) == 2
    assert all(event['details']['department_id'] == 'infrastructure' and event['details']['authority'] == 'department' for event in events)
