"""Request-model hardening and defensive response headers (security review, 14 November 2026).

Test doubles here stand in for verified tokens; they never establish real sign-in.
"""
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import brand, connectors, proactive_store
from app.main import app
from app.security import Operator, get_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")
RISK = {"source_id": "AEGIS-EXERCISE-ONLY", "rainfall_mm_hour": 10, "water_index": 10,
        "drainage_condition": "good", "observed_at": "2026-01-01T00:00:00+00:00"}
client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def operator(monkeypatch):
    monkeypatch.setenv("OIDC_ISSUER", "https://identity.example.test/realm/aegis")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-resource-server")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://identity.example.test/realm/aegis/certs")
    app.dependency_overrides[get_operator] = lambda: Operator(
        "hardening-test", EXERCISE_AGENCY, frozenset({"incident_operator", "platform_admin"}))
    yield
    app.dependency_overrides.pop(get_operator, None)


def _json(path, text):
    return client.post(path, content=text, headers={"content-type": "application/json"})


# (a) the exercise index input refuses undeclared fields
def test_observation_refuses_extra_fields():
    assert client.post("/v1/exercise/risk", json=RISK).status_code == 200
    response = client.post("/v1/exercise/risk", json={**RISK, "operator_override": True})
    assert response.status_code == 422


# (b) non-finite numbers in the forecast series are a 422, never a 500
@pytest.mark.parametrize("series", ["[NaN, 1]", "[" + ",".join(["1"] * 59) + ",NaN,2]",
                                    "[" + ",".join(["1"] * 59) + ",Infinity]", "[-Infinity]"])
def test_forecast_series_rejects_nan_and_infinity(monkeypatch, series):
    monkeypatch.setenv("AEGIS_TIMESFM", "1")
    response = _json("/v1/statistical-forecast", '{"kind":"rainfall","series":' + series + ',"horizon":4}')
    assert response.status_code == 422
    assert "NaN" not in response.text and "Infinity" not in response.text


def test_ordinary_validation_errors_keep_the_default_reply():
    response = client.post("/v1/exercise/risk", json={**RISK, "water_index": 1000})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


# (c) connector updates: bounded maps, and the unknown key is echoed only when it is a plain identifier
class _Store:
    def get_config(self, connector_id):
        return None

    def list_configs(self):
        return {}


@pytest.fixture
def proactive(monkeypatch):
    monkeypatch.setenv("AEGIS_PROACTIVE", "1")
    monkeypatch.setattr(proactive_store, "get_store", lambda: _Store())


def _put(body):
    return client.put("/v1/proactive/connectors/open_meteo", json={"expected_version": 0, "enabled": False, **body})


def test_connector_update_caps_settings_and_secrets(proactive):
    many = {f"k{i}": "x" for i in range(connectors.MAX_UPDATE_KEYS + 1)}
    assert max(len(spec["settings"]) for spec in connectors.REGISTRY.values()) < connectors.MAX_UPDATE_KEYS
    for field in ("settings", "secrets"):
        response = _put({field: many})
        assert response.status_code == 422


@pytest.mark.parametrize("field,kind", [("settings", "setting"), ("secrets", "secret")])
def test_unknown_key_is_echoed_only_when_plain(proactive, field, kind):
    assert _put({field: {"not_a_key": "1"}}).json() == {"detail": f"unknown_{kind}:not_a_key"}
    for hostile in ("<script>alert(1)</script>", "A" * 41, "Upper", "a-b", ""):
        response = _put({field: {hostile: "1"}})
        assert response.status_code == 422
        assert response.json() == {"detail": f"unknown_{kind}"}


# Fix 5: defensive headers on every response; routes with their own caching keep it
def test_health_and_json_routes_carry_nosniff_and_no_store():
    for response in (client.get("/health"), client.post("/v1/exercise/risk", json=RISK)):
        assert response.status_code == 200
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["cache-control"] == "no-store"


def test_error_replies_also_carry_the_headers():
    app.dependency_overrides.pop(get_operator, None)
    response = client.get("/v1/exercise/incidents")
    assert response.status_code == 401
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


def test_logo_route_keeps_its_own_headers(monkeypatch):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    monkeypatch.setattr(brand, "_cached", lambda _key, _load: (png, "image/png", 3))
    response = client.get("/v1/brand/logo")
    assert response.status_code == 200
    assert response.headers["cache-control"] == f"public, max-age={brand.LOGO_MAX_AGE}"
    assert response.headers["content-security-policy"] == "default-src 'none'; sandbox"
    assert response.headers.get_list("x-content-type-options") == ["nosniff"]
    assert response.headers.get_list("cache-control") == [f"public, max-age={brand.LOGO_MAX_AGE}"]
