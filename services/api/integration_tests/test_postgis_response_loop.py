"""Opt-in PostGIS: team response loop transactions (unique active request, capacity lock, atomic timeline + audit).

Every request this test creates is stood down at the end so the retained demo volume keeps its team capacity.
"""
import os
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest

from app import response_loop as rules
from app import response_store, workflow_store
from app.governance import DecisionError
from app.intelligence_store import DEMO_AGENCY
from test_postgis_assistance_run import create_case_and_draft

pytestmark = pytest.mark.skipif(not os.getenv('AEGIS_TEST_DATABASE_URL'), reason='Opt-in local PostGIS required')
NOTE = 'SIMULATION: response loop regression'
TASKS = ('control_room', 'infrastructure', 'communications')


def approved_and_acknowledged(monkeypatch):
    case, draft, maker = create_case_and_draft(monkeypatch)
    workflow_store.transition(draft, DEMO_AGENCY, maker, 'submit')
    workflow_store.transition(draft, DEMO_AGENCY, maker + '-checker', 'approve', 'SIMULATION: independently reviewed')
    workflow_store.transition(draft, DEMO_AGENCY, maker, 'prepare_tasks')
    for task in TASKS:
        workflow_store.transition(draft, DEMO_AGENCY, 'desk-' + task, 'acknowledge_task', 'SIMULATION: reviewed evidence',
                                  task_id=task, department_id=task, expected_assignment_version=0)
    return case, draft


def stand_down_all(draft):
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        rows = conn.execute("""SELECT id::text, department_id, version FROM exercise_team_requests
                               WHERE proposal_id=%s AND state IN ('requested','accepted','en_route','on_site')""",
                            (draft,)).fetchall()
    for request_id, department, version in rows:
        response_store.record_report(DEMO_AGENCY, 'desk-' + department, request_id, caller='department',
                                     scope_value=department, kind='stood_down', expected_version=version, note=NOTE, code=None)


def counts(case, draft):
    with psycopg.connect(os.environ['DATABASE_URL']) as conn:
        timeline = conn.execute("SELECT COUNT(*) FROM exercise_incident_events WHERE incident_id=%s", (case,)).fetchone()[0]
        audit = conn.execute("""SELECT COUNT(*) FROM audit_events WHERE resource_type='exercise_proposal' AND resource_id=%s
                                AND action IN ('team_requested','team_report_recorded')""", (draft,)).fetchone()[0]
        reports = conn.execute("""SELECT COUNT(*) FROM exercise_team_reports rep JOIN exercise_team_requests r
                                  ON r.id=rep.request_id WHERE r.proposal_id=%s""", (draft,)).fetchone()[0]
    return timeline, audit, reports


def test_lifecycle_unique_active_and_atomic_records(monkeypatch):
    case, draft = approved_and_acknowledged(monkeypatch)
    try:
        options = response_store.team_options(DEMO_AGENCY, 'infrastructure', draft, 'infrastructure')
        free = next(t for t in options['teams'] if t['id'] == 'syn-team-health-01')['free_capacity']
        if free < 1:
            pytest.skip('Retained volume has no free synthetic medical capacity')
        with pytest.raises(LookupError):  # another desk's task
            response_store.team_options(DEMO_AGENCY, 'control_room', draft, 'infrastructure')

        def create(_):
            try:
                return response_store.create_request(DEMO_AGENCY, 'infrastructure', 'desk-infrastructure', draft,
                                                     'infrastructure', 'syn-team-health-01', 0, NOTE)
            except rules.ResponseError as err:
                return err.message
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(create, range(2)))
        created = [r for r in results if isinstance(r, tuple)]
        assert len(created) == 2 and sorted(c[1] for c in created) == [False, True]  # exact repeat returns existing
        request = created[0][0]
        assert request['state'] == 'requested' and request['outbound_messages_sent'] is False
        with pytest.raises(rules.ResponseError, match='already has an active request'):
            response_store.create_request(DEMO_AGENCY, 'infrastructure', 'desk-other', draft, 'infrastructure',
                                          'syn-team-health-01', 0, NOTE + ' again')
        before = counts(case, draft)
        with pytest.raises(LookupError):  # another team cannot touch it
            response_store.record_report(DEMO_AGENCY, 'team-x', request['id'], caller='team', scope_value='syn-team-rescue-01',
                                         kind='accepted', expected_version=0, note=NOTE, code=None)
        with pytest.raises(rules.ResponseError):  # refused write leaves nothing behind
            response_store.record_report(DEMO_AGENCY, 'team-h', request['id'], caller='team', scope_value='syn-team-health-01',
                                         kind='en_route', expected_version=0, note=NOTE, code=None)
        assert counts(case, draft) == before

        def accept(_):
            return response_store.record_report(DEMO_AGENCY, 'team-h', request['id'], caller='team',
                                                scope_value='syn-team-health-01', kind='accepted', expected_version=0,
                                                note=NOTE, code=None)
        with ThreadPoolExecutor(max_workers=2) as pool:
            accepted = list(pool.map(accept, range(2)))
        assert {a['version'] for a in accepted} == {1} and counts(case, draft) == tuple(n + 1 for n in before)
        assert 'proposal_id' not in accepted[0] and accepted[0]['reports'][-1]['mine'] is True
        with pytest.raises(DecisionError, match='team requests'):
            workflow_store.transition(draft, DEMO_AGENCY, 'desk-infrastructure', 'close_task', 'SIMULATION: close attempt',
                                      task_id='infrastructure', department_id='infrastructure', expected_assignment_version=0)
        step = accepted[0]
        for kind, code in (('en_route', None), ('on_site', 'as_expected'), ('completed', 'nothing_found')):
            step = response_store.record_report(DEMO_AGENCY, 'team-h', request['id'], caller='team',
                                                scope_value='syn-team-health-01', kind=kind, expected_version=step['version'],
                                                note=NOTE, code=code)
        assert step['state'] == 'completed'
        with psycopg.connect(os.environ['DATABASE_URL']) as conn:
            lines = conn.execute("""SELECT event_type, summary FROM exercise_incident_events WHERE incident_id=%s
                                    ORDER BY recorded_at, id""", (case,)).fetchall()
        team_lines = [line for line in lines if 'Synthetic medical team 01' in line[1]]
        assert all(line[1].startswith('SIMULATION: ') and NOTE not in line[1] for line in team_lines)
        assert team_lines[-1][0] == 'resolution'
        workflow_store.transition(draft, DEMO_AGENCY, 'desk-infrastructure', 'close_task', 'SIMULATION: work completed',
                                  task_id='infrastructure', department_id='infrastructure', expected_assignment_version=0)
    finally:
        stand_down_all(draft)


def test_capacity_is_serialised_by_the_team_lock(monkeypatch):
    _case, draft = approved_and_acknowledged(monkeypatch)
    try:
        options = response_store.team_options(DEMO_AGENCY, 'control_room', draft, 'control_room')
        free = next(t for t in options['teams'] if t['id'] == 'syn-team-rescue-01')['free_capacity']

        def create(task):
            try:
                response_store.create_request(DEMO_AGENCY, task, 'desk-' + task, draft, task, 'syn-team-rescue-01', 0, NOTE)
                return 'created'
            except rules.ResponseError as err:
                return err.message
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(create, TASKS))
        assert results.count('created') == min(free, 3)
        assert all(r in {'created', 'This team has no free capacity'} for r in results)
    finally:
        stand_down_all(draft)
