import pytest
from app.governance import DecisionError
from app.proposal_simulation import PLAYBOOK, prepare_task_receipt, reassign_task, task_assignment, advance_task


def receipt():
    return prepare_task_receipt('proposal', 'approved', {'playbook': {'version': PLAYBOOK}, 'operational_actions_enabled': False})


def test_reassignment_preserves_target_and_records_provenance():
    original = receipt()
    updated, changed = reassign_task(original, 'infrastructure', 'communications', 0, 'coordinator', 'SIMULATION: desk coverage changed')
    assert changed and task_assignment(updated, 'infrastructure') == ('communications', 1)
    assert task_assignment(original, 'infrastructure') == ('infrastructure', 0)
    assert updated['tasks'][1]['due_at'] == original['tasks'][1]['due_at']
    event = updated['tasks'][1]['events'][-1]
    assert event['from_department'] == 'infrastructure' and event['to_department'] == 'communications'
    assert not reassign_task(updated, 'infrastructure', 'communications', 0, 'coordinator', 'SIMULATION: desk coverage changed')[1]
    for actor, version in [('other-coordinator', 0), ('coordinator', 4)]:
        with pytest.raises(DecisionError, match='assignment changed'):
            reassign_task(updated, 'infrastructure', 'control_room', version, actor, 'SIMULATION: desk coverage changed')


def test_acknowledged_tasks_cannot_change_ownership():
    acknowledged, _ = advance_task(receipt(), 'infrastructure', 'acknowledge_task', 'desk-user', 'SIMULATION: reviewed evidence')
    with pytest.raises(DecisionError, match='unacknowledged'):
        reassign_task(acknowledged, 'infrastructure', 'communications', 0, 'coordinator', 'SIMULATION: desk coverage changed')


@pytest.mark.parametrize('department,version', [('unknown', 0), ('communications', True), ('communications', -1), ('infrastructure', 0)])
def test_invalid_assignments_fail_closed(department, version):
    with pytest.raises(DecisionError):
        reassign_task(receipt(), 'infrastructure', department, version, 'coordinator', 'SIMULATION: desk coverage changed')
