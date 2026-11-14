"""Every API data route needs a verified operator, an explicit role list and (for records) the exercise agency.

Only /health, the readiness diagnostic used by the start/verify scripts, the live-warning 403 stub, the
opt-in public intake submission and the public brand read (name and logo) are reachable without a token. See docs/SECURITY_ASSESSMENT.md.
Test doubles here stand in for verified tokens; they never establish real sign-in.
"""
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app import security
from app.main import app
from app.public_intake import INTAKE_QUEUE_ROLES
from app.security import EXERCISE_RECORD_ROLES, FIXTURE_AGENCY_DETAIL, Operator, get_operator, scoped_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")
OTHER_AGENCY = UUID("22222222-2222-4222-8222-222222222222")
CASE = "33333333-3333-4333-8333-333333333333"

OPEN_ALLOWLIST = {
    ("GET", "/health"),
    ("GET", "/v1/exercise/system/readiness"),
    ("POST", "/v1/live/public-warning"),
    ("POST", "/v1/public-intake/reports"),  # opt-in public submission; its own trust model (PUBLIC_INTAKE_SECURITY.md)
    # Brand name and logo for the signed-out sign-in and welcome pages; name, logo version and image only (BRANDING.md).
    ("GET", "/v1/brand"),
    ("GET", "/v1/brand/logo"),
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
    ("GET", "/v1/public-intake/reports", None, True),  # narrower role list: NARROWED_ROLES
    ("GET", "/v1/proactive/watch", None, True),
    ("GET", "/v1/proactive/watch/history", None, True),
    ("GET", "/v1/proactive/triggers/config", None, True),
    ("GET", "/v1/proactive/triggers/impact-config", None, True),
]

client = TestClient(app, raise_server_exceptions=False)


# The public-intake quarantine queue is narrower than the exercise records: incident desk and administrators only.
NARROWED_ROLES = {("GET", "/v1/public-intake/reports"): INTAKE_QUEUE_ROLES}

# Non-FastAPI routes (plain Starlette Route, Mount/StaticFiles, sub-apps, websockets) carry no dependency graph, so
# the inventory cannot see their auth. Only the interactive docs may exist, and only with AEGIS_API_DOCS=1.
NON_API_ALLOWLIST = {"/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"}

# Protected routes whose role check lives inside the route module (a helper calling require_role or reading
# operator.roles) instead of a scoped_operator dependency. Reviewed 12 November 2026; a new protected route must
# either use scoped_operator(...) or be reviewed and added here.
OWN_ROLE_LOGIC = {
    ("GET", "/v1/exercise/proposals/identity"),
    ("GET", "/v1/exercise/proposals/incidents"),
    ("GET", "/v1/exercise/proposals"),
    ("POST", "/v1/exercise/proposals"),
    ("POST", "/v1/exercise/proposals/{proposal_id}/transition"),
    ("GET", "/v1/exercise/proposals/{proposal_id}/audit"),
    ("GET", "/v1/exercise/proposals/{proposal_id}/cap-draft"),
    ("GET", "/v1/exercise/department-tasks"),
    ("POST", "/v1/exercise/department-tasks/{proposal_id}/transition"),
    ("GET", "/v1/exercise/response/teams"),
    ("GET", "/v1/exercise/response/requests"),
    ("POST", "/v1/exercise/response/requests"),
    ("POST", "/v1/exercise/response/requests/{request_id}/reports"),
    ("GET", "/v1/exercise/response/alerts"),
    ("GET", "/v1/proactive/pause"),
    ("POST", "/v1/proactive/watch/refresh"),
    ("POST", "/v1/proactive/runs"),
    ("GET", "/v1/proactive/runs"),
    ("POST", "/v1/proactive/runs/{run_id}/advance"),
    ("POST", "/v1/proactive/runs/{run_id}/cancel"),
    ("GET", "/v1/proactive/runs/{run_id}"),
    ("GET", "/v1/proactive/runs/{run_id}/cap.xml"),
    ("GET", "/v1/proactive/runs/{run_id}/plan"),
    ("GET", "/v1/proactive/runs/{run_id}/observability"),
    ("GET", "/v1/proactive/scheduler"),
    ("GET", "/v1/exercise/handover"),
    ("POST", "/v1/copilot/ask"),
    ("GET", "/v1/statistical-forecast/status"),
    ("POST", "/v1/statistical-forecast"),
    ("GET", "/v1/proactive/learning/windows"),
    ("POST", "/v1/proactive/learning/windows/close"),
    ("POST", "/v1/proactive/learning/windows/replay"),
    ("GET", "/v1/proactive/learning/windows/{window_id}"),
    ("GET", "/v1/proactive/learning/scenarios"),
    ("GET", "/v1/proactive/learning/proposals"),
    ("POST", "/v1/proactive/learning/proposals"),
    ("GET", "/v1/proactive/learning/proposals/{proposal_id}"),
    ("POST", "/v1/proactive/learning/proposals/{proposal_id}/submit"),
    ("POST", "/v1/proactive/learning/proposals/{proposal_id}/review"),
    ("GET", "/v1/proactive/learning/config"),
    ("GET", "/v1/proactive/drills/scenarios"),
    ("GET", "/v1/proactive/drills"),
    ("POST", "/v1/proactive/drills"),
    ("GET", "/v1/proactive/drills/{drill_id}"),
    ("POST", "/v1/proactive/drills/{drill_id}/clock"),
    ("POST", "/v1/proactive/drills/{drill_id}/respond"),
    ("GET", "/v1/proactive/drills/{drill_id}/report"),
}


def _walk(routes):
    for route in routes:
        if hasattr(route, "original_router"):  # FastAPI >= 0.140 wraps included routers
            yield from _walk(route.original_router.routes)
        else:
            yield route


def _routes(routes):
    for route in _walk(routes):
        if hasattr(route, "dependant") and hasattr(route, "methods"):
            yield route


def _non_api_routes(routes):
    """Everything the dependency walk cannot inspect: plain Starlette routes, mounts, sub-apps, websockets."""
    return [route for route in _walk(routes) if not (isinstance(route, APIRoute))]


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
                assert scoped[0].allowed_roles == NARROWED_ROLES.get((method, route.path), EXERCISE_RECORD_ROLES)


def test_no_route_escapes_the_dependency_inventory():
    # A future app.mount(...), add_route(...) or websocket would bypass every check above; fail until reviewed.
    unknown = [(type(route).__name__, getattr(route, "path", None)) for route in _non_api_routes(app.routes)
               if getattr(route, "path", None) not in NON_API_ALLOWLIST]
    assert unknown == [], f"routes outside the FastAPI dependency inventory: {unknown}"


def test_inventory_walker_sees_mounts_plain_routes_and_websockets():
    from starlette.responses import PlainTextResponse
    from starlette.staticfiles import StaticFiles

    probe = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    probe.add_route("/plain", lambda _request: PlainTextResponse("x"))
    probe.mount("/static", StaticFiles(directory=".", check_dir=False))
    probe.mount("/sub", FastAPI())

    @probe.websocket("/ws")
    async def _ws(_socket):
        return None

    assert sorted(route.path for route in _non_api_routes(probe.routes)) == ["/plain", "/static", "/sub", "/ws"]


def test_every_protected_route_has_a_role_check():
    import inspect
    import sys

    seen, missing = set(), []
    for route in _routes(app.routes):
        calls = _calls(route.dependant, set())
        if get_operator not in calls:
            continue
        for method in route.methods - {"HEAD", "OPTIONS"}:
            key = (method, route.path)
            if any(getattr(call, "allowed_roles", None) for call in calls):
                continue
            if key not in OWN_ROLE_LOGIC:
                missing.append(key)
                continue
            seen.add(key)
            module = inspect.getsource(sys.modules[route.endpoint.__module__])
            assert "require_role" in module or ".roles" in module, f"{key}: module has no role logic"
    assert missing == [], f"protected routes with neither scoped_operator nor a reviewed role check: {missing}"
    assert seen == OWN_ROLE_LOGIC, f"reviewed list names routes that no longer exist: {OWN_ROLE_LOGIC - seen}"


def test_intake_queue_refuses_department_and_team_roles():
    for role in ("department_operator", "response_team"):
        _as(EXERCISE_AGENCY, {role})
        response = client.get("/v1/public-intake/reports")
        assert response.status_code == 403
        assert response.json() == {"detail": "Insufficient agency role"}


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


@pytest.mark.parametrize("method,path,body,role", [
    (method, path, body, role) for method, path, body, _a in FORMERLY_OPEN
    for role in sorted(NARROWED_ROLES.get((method, path), EXERCISE_RECORD_ROLES))])
def test_formerly_open_route_passes_the_gate_for_each_listed_role(method, path, body, role):
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


# Platform-wide administration (connectors, global pause, learning overlay apply, all-agency scheduler ticks) is
# limited to a platform_admin of the exercise agency; another agency's platform_admin gets the fixed 403.
PLATFORM_ADMIN_ROUTES = [
    ("GET", "/v1/proactive/connectors", None),
    ("PUT", "/v1/proactive/connectors/open_meteo", {"expected_version": 0, "enabled": False}),
    ("POST", "/v1/proactive/connectors/open_meteo/test", None),
    ("GET", "/v1/proactive/connectors/open_meteo/audit", None),
    ("PUT", "/v1/proactive/pause", {"paused": False, "reason": "route auth inventory probe"}),
    ("POST", f"/v1/proactive/learning/proposals/{CASE}/apply", {}),
    ("GET", "/v1/proactive/scheduler", None),
]


@pytest.mark.parametrize("method,path,body", PLATFORM_ADMIN_ROUTES)
def test_platform_admin_of_another_agency_is_refused(method, path, body):
    _as(OTHER_AGENCY, {"platform_admin"})
    response = _send(method, path, body)
    assert response.status_code == 403
    assert response.json() == {"detail": FIXTURE_AGENCY_DETAIL}


@pytest.mark.parametrize("method,path", [(m, p) for m, p, _b in PLATFORM_ADMIN_ROUTES if p != "/v1/proactive/scheduler"])
def test_platform_admin_routes_declare_the_exercise_agency_scope(method, path):
    for route in _routes(app.routes):
        if route.path == path.replace("open_meteo", "{connector_id}").replace(CASE, "{proposal_id}") and method in route.methods:
            scoped = [call for call in _calls(route.dependant, set()) if hasattr(call, "allowed_roles")]
            assert scoped and scoped[0].allowed_roles == frozenset({"platform_admin"}) and scoped[0].fixture_agency
            return
    raise AssertionError(f"route not found: {method} {path}")


def test_scheduler_still_scopes_other_agency_operators_to_their_own_ticks():
    # The non-admin read for another agency keeps its own-agency scope (no 403): only the all-agency admin view is narrowed.
    from app import proactive_scheduler
    calls = []

    class Store:
        def list_ticks(self, scope, limit):
            calls.append(scope)
            return []

    original = proactive_scheduler.proactive_store.get_store
    proactive_scheduler.proactive_store.get_store = lambda: Store()
    try:
        _as(OTHER_AGENCY, {"incident_operator"})
        assert client.get("/v1/proactive/scheduler").status_code == 200
        _as(EXERCISE_AGENCY, {"platform_admin"})
        assert client.get("/v1/proactive/scheduler").status_code == 200
    finally:
        proactive_scheduler.proactive_store.get_store = original
    assert calls == [OTHER_AGENCY, None]
