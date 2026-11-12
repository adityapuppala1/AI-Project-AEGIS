"""Every API data route needs a verified operator, an explicit role list and (for records) the exercise agency.

Only /health, the readiness diagnostic used by the start/verify scripts, the live-warning 403 stub and the
opt-in public intake submission are reachable without a token. See docs/SECURITY_ASSESSMENT.md.
Test doubles here stand in for verified tokens; they never establish real sign-in.
"""
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app import security
from app.main import app
from app.security import EXERCISE_RECORD_ROLES, FIXTURE_AGENCY_DETAIL, Operator, get_operator, scoped_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")
OTHER_AGENCY = UUID("22222222-2222-4222-8222-222222222222")
CASE = "33333333-3333-4333-8333-333333333333"

OPEN_ALLOWLIST = {
    ("GET", "/health"),
    ("GET", "/v1/exercise/system/readiness"),
    ("POST", "/v1/live/public-warning"),
    ("POST", "/v1/public-intake/reports"),  # opt-in public submission; its own trust model (PUBLIC_INTAKE_SECURITY.md)
}

# Every route that answered without a token before this change: (method, path, json body, needs agency check).
FORMERLY_OPEN = [
    ("POST", "/v1/exercise/risk", {"source_id": "s", "rainfall_mm_hour": 10, "water_index": 10,
                                    "drainage_condition": "good", "observed_at": "2026-01-01T00:00:00+00:00"}, True),
    ("GET", "/v1/exercise/incidents", None, True),
    ("GET", "/v1/exercise/telemetry", None, True),
    ("GET", "/v1/exercise/incidents/query", None, True),
    ("GET", f"/v1/exercise/incidents/{CASE}", None, True),
    ("GET", "/v1/exercise/sources", None, True),
    ("GET", f"/v1/exercise/sources/{CASE}/history", None, True),
    ("GET", "/v1/exercise/ingestion/status", None, True),
    ("GET", f"/v1/exercise/incidents/{CASE}/correlation", None, True),
    ("GET", "/v1/exercise/model-lab/report", None, True),
    ("GET", f"/v1/exercise/incidents/{CASE}/readiness", None, True),
    ("GET", "/v1/exercise/agency-tasks", None, True),
    ("GET", f"/v1/exercise/agency-tasks/{CASE}", None, True),
    ("GET", f"/v1/exercise/incidents/{CASE}/audit", None, True),
    ("GET", "/v1/exercise/policy", None, True),
    ("POST", f"/v1/exercise/incidents/{CASE}/review-focus", {}, True),
    ("POST", f"/v1/exercise/incidents/{CASE}/grounded-guide", {"question": "What is missing?"}, True),
    ("GET", "/v1/public-reference/earth-watch/status", None, False),
    ("GET", "/v1/public-reference/earth-watch/earthquakes", None, False),
    ("GET", "/v1/public-intake/status", None, False),
    ("GET", "/v1/public-intake/reports", None, True),
    ("GET", "/v1/proactive/watch", None, True),
    ("GET", "/v1/proactive/watch/history", None, True),
    ("GET", "/v1/proactive/triggers/config", None, True),
    ("GET", "/v1/proactive/triggers/impact-config", None, True),
]

client = TestClient(app, raise_server_exceptions=False)


def _routes(routes):
    for route in routes:
        if hasattr(route, "original_router"):  # FastAPI >= 0.140 wraps included routers
            yield from _routes(route.original_router.routes)
        elif hasattr(route, "dependant"):
            yield route


def _calls(dependant, found):
    for sub in dependant.dependencies:
        found.add(sub.call)
        _calls(sub, found)
    return found


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("OIDC_ISSUER", "https://identity.example.test/realm/aegis")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-resource-server")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://identity.example.test/realm/aegis/certs")
    monkeypatch.setenv("AEGIS_PROACTIVE", "1")
    yield
    app.dependency_overrides.pop(get_operator, None)


def _as(agency, roles):
    app.dependency_overrides[get_operator] = lambda: Operator("route-test", agency, frozenset(roles))


def _send(method, path, body):
    return client.request(method, path, json=body) if body is not None else client.request(method, path)


def test_inventory_every_route_outside_the_allowlist_needs_a_verified_operator():
    seen, missing = set(), []
    for route in _routes(app.routes):
        for method in route.methods - {"HEAD", "OPTIONS"}:
            key = (method, route.path)
            seen.add(key)
            if key not in OPEN_ALLOWLIST and get_operator not in _calls(route.dependant, set()):
                missing.append(key)
    assert missing == [], f"routes without get_operator: {missing}"
    assert OPEN_ALLOWLIST <= seen, "allowlist names a route that no longer exists"


def test_formerly_open_routes_declare_an_explicit_role_list():
    for route in _routes(app.routes):
        for method in route.methods:
            if (method, route.path) in {(m, p) for m, p, _b, _a in FORMERLY_OPEN}:
                scoped = [call for call in _calls(route.dependant, set()) if hasattr(call, "allowed_roles")]
                assert scoped, f"{method} {route.path} has no explicit role list"
                assert scoped[0].allowed_roles == EXERCISE_RECORD_ROLES


@pytest.mark.parametrize("method,path,body,_agency", FORMERLY_OPEN)
def test_formerly_open_route_needs_a_token(method, path, body, _agency):
    response = _send(method, path, body)
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


@pytest.mark.parametrize("method,path,body,agency_checked", FORMERLY_OPEN)
def test_formerly_open_route_refuses_another_agency(method, path, body, agency_checked):
    _as(OTHER_AGENCY, {"incident_operator"})
    response = _send(method, path, body)
    if agency_checked:
        assert response.status_code == 403
        assert response.json() == {"detail": FIXTURE_AGENCY_DETAIL}
    else:
        assert response.status_code not in (401, 403)


@pytest.mark.parametrize("method,path,body,_agency", FORMERLY_OPEN)
def test_formerly_open_route_refuses_a_token_without_a_listed_role(method, path, body, _agency):
    _as(EXERCISE_AGENCY, set())
    response = _send(method, path, body)
    assert response.status_code == 403
    assert response.json() == {"detail": "Insufficient agency role"}


@pytest.mark.parametrize("role", sorted(EXERCISE_RECORD_ROLES))
@pytest.mark.parametrize("method,path,body,_agency", FORMERLY_OPEN)
def test_formerly_open_route_passes_the_gate_for_each_listed_role(method, path, body, _agency, role):
    _as(EXERCISE_AGENCY, {role})
    # Past the gate the route may answer 200, 404 (unknown synthetic id), 422 or 503 (no local database in
    # unit tests); it must never be refused for authentication or authorization.
    assert _send(method, path, body).status_code not in (401, 403)


@pytest.mark.parametrize("path", ["/v1/exercise/telemetry", "/v1/exercise/policy", "/v1/exercise/model-lab/report",
                                  "/v1/public-reference/earth-watch/status", "/v1/public-intake/status"])
def test_allowed_exercise_role_reads_data(path):
    _as(EXERCISE_AGENCY, {"response_team"})
    assert client.get(path).status_code == 200


def test_open_allowlist_still_answers_without_a_token(monkeypatch):
    assert client.get("/health").status_code == 200
    assert client.post("/v1/live/public-warning").status_code == 403
    monkeypatch.delenv("AEGIS_PUBLIC_INTAKE", raising=False)
    assert client.post("/v1/public-intake/reports", json={}).status_code == 503  # off unless the overlay is used


def test_narrow_role_list_refuses_an_unlisted_role():
    probe = FastAPI()
    only_checker = scoped_operator(frozenset({"incident_checker"}))

    @probe.get("/probe")
    def _probe(_operator: Operator = Depends(only_checker)):
        return {"ok": True}

    probe.dependency_overrides[get_operator] = lambda: Operator("x", EXERCISE_AGENCY, frozenset({"response_team"}))
    assert TestClient(probe).get("/probe").status_code == 403
    probe.dependency_overrides[get_operator] = lambda: Operator("x", EXERCISE_AGENCY, frozenset({"incident_checker"}))
    assert TestClient(probe).get("/probe").json() == {"ok": True}


@pytest.mark.parametrize("roles", [frozenset(), frozenset({"unknown_role"})])
def test_scoped_operator_refuses_an_empty_or_unknown_role_list(roles):
    with pytest.raises(ValueError):
        security.scoped_operator(roles)
