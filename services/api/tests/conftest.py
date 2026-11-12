"""Shared test helpers. Nothing here is autouse: a module opts in explicitly.

`exercise_reader` stands in for a verified exercise-agency operator on the read routes that now require
`get_operator` (docs/SECURITY_ASSESSMENT.md). It is a test double only; it never establishes real sign-in.
"""
from uuid import UUID

import pytest

from app.main import app
from app.security import Operator, get_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")


@pytest.fixture
def exercise_reader():
    previous = app.dependency_overrides.get(get_operator)
    app.dependency_overrides[get_operator] = lambda: Operator("exercise-reader", EXERCISE_AGENCY, frozenset({"incident_auditor"}))
    yield
    if previous is None:
        app.dependency_overrides.pop(get_operator, None)
    else:
        app.dependency_overrides[get_operator] = previous
