"""Optional TimesFM statistical forecast: off by default, display-only, bounded input, honest labels."""
import ast
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import statistical_forecast as sf
from app.main import app
from app.security import Operator, get_operator

AGENCY = UUID("11111111-1111-4111-8111-111111111111")
client = TestClient(app)
SERIES = [100 + (i % 30) for i in range(200)]


def fake(history, horizon):
    last = float(history[-1])
    return [last] * horizon, [last - 5] * horizon, [last + 5] * horizon


@pytest.fixture(autouse=True)
def signed_in(monkeypatch):
    app.dependency_overrides[get_operator] = lambda: Operator("operator-a", AGENCY, frozenset({"incident_operator"}))
    monkeypatch.delenv("AEGIS_TIMESFM", raising=False)
    sf.set_forecaster_for_tests(None)
    yield
    app.dependency_overrides.clear()
    sf.set_forecaster_for_tests(None)


def body(**changes):
    return {"kind": "river_discharge", "series": SERIES, "horizon": 14, **changes}


def test_off_by_default_and_never_loads_the_model(monkeypatch):
    monkeypatch.setattr(sf, "_build", lambda: pytest.fail("model must not load while switched off"))
    assert client.get("/v1/statistical-forecast/status").json() == {"enabled": False, "reason_code": "switched_off", "model": "timesfm-2.5-200m", "display_only": True}
    response = client.post("/v1/statistical-forecast", json=body())
    assert response.status_code == 503 and response.json()["detail"] == "switched_off"


def test_requires_a_signed_in_operator_with_a_read_role():
    app.dependency_overrides.clear()
    assert client.post("/v1/statistical-forecast", json=body()).status_code in (401, 403, 503)
    app.dependency_overrides[get_operator] = lambda: Operator("dept", AGENCY, frozenset({"department_operator"}), "control_room")
    assert client.post("/v1/statistical-forecast", json=body()).status_code == 403


def test_missing_package_or_weights_is_reported_not_raised(monkeypatch):
    monkeypatch.setenv("AEGIS_TIMESFM", "1")
    calls = []

    def broken():
        calls.append(1)
        raise ImportError("no timesfm here")
    monkeypatch.setattr(sf, "_build", broken)
    assert client.get("/v1/statistical-forecast/status").json()["reason_code"] == "model_unavailable"
    response = client.post("/v1/statistical-forecast", json=body())
    assert response.status_code == 503 and response.json()["detail"] == "model_unavailable"
    assert "timesfm here" not in response.text and len(calls) == 1, "one load attempt, no raw error text"


def test_forecast_is_labelled_bounded_and_checked_against_a_holdout(monkeypatch):
    monkeypatch.setenv("AEGIS_TIMESFM", "1")
    sf.set_forecaster_for_tests(fake)
    data = client.post("/v1/statistical-forecast", json=body()).json()
    assert data["status"] == "ok" and data["classification"] == "statistical_estimate"
    assert data["display_only"] is True and data["is_accuracy"] is False
    assert len(data["point"]) == len(data["q10"]) == len(data["q90"]) == 14
    assert all(low <= mid <= high for low, mid, high in zip(data["q10"], data["point"], data["q90"]))
    check = data["holdout"]
    assert check["points"] == 14 and check["is_accuracy"] is False and check["basis"] == "one_holdout_of_supplied_history"
    assert check["model_mean_abs_error"] == check["repeat_last_value_mean_abs_error"], "the fake repeats the last value"
    assert 0 <= check["inside_10_90_range"] <= 14
    assert "extremes_may_be_underestimated" in data["limits"]


def test_negative_and_non_finite_model_output_is_clamped(monkeypatch):
    monkeypatch.setenv("AEGIS_TIMESFM", "1")
    sf.set_forecaster_for_tests(lambda history, horizon: ([-3.0, float("nan")] + [1.0] * (horizon - 2), [float("-inf")] * horizon, [float("inf")] * horizon))
    data = client.post("/v1/statistical-forecast", json=body(horizon=4)).json()
    assert data["point"][:2] == [0.0, 0.0] and data["q10"] == [0.0] * 4 and data["q90"] == [0.0] * 4


@pytest.mark.parametrize("bad", [
    {"series": SERIES[:20]}, {"series": [1.0] * 3000}, {"horizon": 0}, {"horizon": 65}, {"kind": "earthquake"},
    {"series": [5.0] * 200}, {"series": [-1.0] + SERIES[1:]}, {"series": [2e6] + SERIES[1:]}, {"extra": 1},
])
def test_rejects_out_of_bounds_input(monkeypatch, bad):
    monkeypatch.setenv("AEGIS_TIMESFM", "1")
    sf.set_forecaster_for_tests(fake)
    assert client.post("/v1/statistical-forecast", json=body(**bad)).status_code == 422


def test_wrong_shaped_model_output_is_refused(monkeypatch):
    monkeypatch.setenv("AEGIS_TIMESFM", "1")
    sf.set_forecaster_for_tests(lambda history, horizon: ([1.0], [1.0], [1.0]))
    assert client.post("/v1/statistical-forecast", json=body()).status_code == 503


def test_module_has_no_write_path():
    """Display-only: no database, workflow, proposal, alert or network module may be imported here."""
    tree = ast.parse(Path(sf.__file__).read_text(encoding="utf-8"))
    imported = {alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
    imported |= {node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}
    banned = ("psycopg", "app.db", "store", "workflow", "proposal", "cap", "requests", "httpx", "urllib", "proactive")
    assert not [name for name in imported if any(word in name for word in banned)], imported
