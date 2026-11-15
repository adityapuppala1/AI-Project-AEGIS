"""User administration (docs/USER_MANAGEMENT.md): roles, guards, one-time passwords, audit and the not-configured path.

FakeDirectory and MemoryStore stand in for the identity provider and the database; the operator is a test double.
None of this establishes a real sign-in.
"""
import logging
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import user_admin, user_admin_store, user_directory
from app.main import app
from app.security import FIXTURE_AGENCY_DETAIL, Operator, get_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")
OTHER_AGENCY = UUID("22222222-2222-4222-8222-222222222222")
client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def env():
    directory, store = user_directory.FakeDirectory(), user_admin_store.MemoryStore()
    admin_id = directory.add("demo-admin", "platform_admin")
    other_admin = directory.add("demo-admin2", "platform_admin")
    maker = directory.add("demo-maker", "incident_operator")
    owner = directory.add("exercise-admin", "platform_admin")
    service = directory.add("service-account-indtrana-user-admin", None)
    user_directory.set_directory(directory)
    user_admin_store.set_store(store)
    state = {"directory": directory, "store": store, "admin": admin_id, "admin2": other_admin, "maker": maker,
             "owner": owner, "service": service}
    as_role(admin_id, "platform_admin")
    yield state
    app.dependency_overrides.clear()
    user_directory.set_directory(None)
    user_admin_store.set_store(None)


def as_role(subject, *roles, agency=EXERCISE_AGENCY):
    app.dependency_overrides[get_operator] = lambda: Operator(subject=subject, agency_id=agency, roles=frozenset(roles))


NEW = {"username": "umtest-ops", "first_name": "Uma", "last_name": "Test", "email": "umtest-ops@example.invalid",
       "role": "incident_operator"}


def create(**changes):
    return client.post("/v1/user-admin/accounts", json={**NEW, **changes})


def test_every_route_is_platform_admin_and_exercise_agency(env):
    routes = [("get", "/v1/user-admin/status"), ("get", "/v1/user-admin/accounts"), ("post", "/v1/user-admin/accounts"),
              ("get", "/v1/user-admin/audit"), ("patch", f"/v1/user-admin/accounts/{env['maker']}"),
              ("post", f"/v1/user-admin/accounts/{env['maker']}/enable"),
              ("post", f"/v1/user-admin/accounts/{env['maker']}/disable"),
              ("post", f"/v1/user-admin/accounts/{env['maker']}/reset-password"),
              ("post", f"/v1/user-admin/accounts/{env['maker']}/sign-out")]
    for role in ("incident_operator", "incident_checker", "incident_auditor", "department_operator", "response_team"):
        as_role(env["maker"], role)
        for method, url in routes:
            response = client.get(url) if method == "get" else getattr(client, method)(url, json=NEW)
            assert response.status_code == 403, (role, url)
    as_role(env["admin"], "platform_admin", agency=OTHER_AGENCY)
    response = client.get("/v1/user-admin/accounts")
    assert response.status_code == 403 and response.json()["detail"] == FIXTURE_AGENCY_DETAIL
    app.dependency_overrides.clear()
    assert client.get("/v1/user-admin/accounts").status_code in (401, 503)
    assert env["store"].rows == []


def test_not_configured_answers_a_fixed_code(env, monkeypatch):
    user_directory.set_directory(None)
    for name in ("AEGIS_USER_ADMIN_BASE_URL", "AEGIS_USER_ADMIN_CLIENT_SECRET"):
        monkeypatch.delenv(name, raising=False)
    assert client.get("/v1/user-admin/status").json()["configured"] is False
    for response in (client.get("/v1/user-admin/accounts"), create(),
                     client.post(f"/v1/user-admin/accounts/{env['maker']}/disable")):
        assert response.status_code == 503 and response.json()["detail"] == "user_admin_not_configured"
    monkeypatch.setenv("AEGIS_USER_ADMIN_BASE_URL", "http://indtrana-idp.localhost:8443")  # not HTTPS
    monkeypatch.setenv("AEGIS_USER_ADMIN_REALM", "indtrana-exercise")
    monkeypatch.setenv("AEGIS_USER_ADMIN_CLIENT_ID", "indtrana-user-admin")
    monkeypatch.setenv("AEGIS_USER_ADMIN_WEB_CLIENT_ID", "indtrana-local-web")
    monkeypatch.setenv("AEGIS_USER_ADMIN_CLIENT_SECRET", "s" * 32)
    with pytest.raises(user_directory.NotConfigured):
        user_directory.configured_directory()
    monkeypatch.setenv("AEGIS_USER_ADMIN_BASE_URL", "https://indtrana-idp.localhost:8443/x?y=1")
    with pytest.raises(user_directory.NotConfigured):
        user_directory.configured_directory()
    monkeypatch.setenv("AEGIS_USER_ADMIN_BASE_URL", "https://indtrana-idp.localhost:8443")
    assert isinstance(user_directory.configured_directory(), user_directory.KeycloakDirectory)
    monkeypatch.setenv("AEGIS_USER_ADMIN_CLIENT_SECRET", "short")
    with pytest.raises(user_directory.NotConfigured):
        user_directory.configured_directory()


def test_list_marks_protected_and_self_and_never_returns_passwords(env):
    response = client.get("/v1/user-admin/accounts")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    rows = {row["username"]: row for row in response.json()["accounts"]}
    assert rows["exercise-admin"]["protected"] and rows["exercise-admin"]["protected_reason"] == "owner_exercise_account"
    assert rows["service-account-indtrana-user-admin"]["protected_reason"] == "service_account"
    assert rows["demo-admin"]["is_you"] and not rows["demo-maker"]["is_you"]
    assert rows["demo-maker"]["role"] == "incident_operator"
    assert "password" not in response.text.lower().replace("password_change_pending", "")


def test_create_returns_the_temporary_password_once_and_audits_without_it(env, caplog):
    caplog.set_level(logging.DEBUG)
    response = create()
    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    password = body["temporary_password"]
    assert len(password) == 20 and password.isalnum()
    account = body["account"]
    assert account["enabled"] and account["role"] == "incident_operator" and account["password_change_pending"]
    directory = env["directory"]
    assert directory.passwords[account["id"]] == password
    rows = env["store"].rows
    assert len(rows) == 1 and rows[0]["action"] == "create" and rows[0]["outcome"] == "done"
    assert rows[0]["actor"] == env["admin"] and rows[0]["role_after"] == "incident_operator"
    assert password not in repr(rows) and "example.invalid" not in repr(rows)
    assert password not in caplog.text
    audit = client.get("/v1/user-admin/audit")
    assert audit.status_code == 200 and password not in audit.text
    listing = client.get("/v1/user-admin/accounts")
    assert password not in listing.text
    assert create().json()["detail"] == "user_admin_username_taken"
    assert len(env["store"].rows) == 1


def test_department_and_team_rules(env):
    assert create(role="department_operator").json()["detail"] == "user_admin_department_required"
    assert create(role="department_operator", department="kitchen").json()["detail"] == "user_admin_department_required"
    assert create(department="control_room").json()["detail"] == "user_admin_department_not_allowed"
    assert create(role="response_team").json()["detail"] == "user_admin_team_required"
    assert create(role="response_team", team="syn-team-nope").json()["detail"] == "user_admin_team_required"
    assert create(team="syn-team-rescue-01").json()["detail"] == "user_admin_team_not_allowed"
    assert create(role="root").json()["detail"] == "user_admin_invalid_role"
    desk = create(username="umtest-desk", role="department_operator", department="infrastructure")
    assert desk.status_code == 201 and desk.json()["account"]["department"] == "infrastructure"
    team = create(username="umtest-team", role="response_team", team="syn-team-rescue-01")
    assert team.status_code == 201 and team.json()["account"]["team"] == "syn-team-rescue-01"


@pytest.mark.parametrize("username,code", [
    ("ab", "user_admin_invalid_username"), ("Upper", "user_admin_invalid_username"),
    ("has space", "user_admin_invalid_username"), ("trailing-", "user_admin_invalid_username"),
    ("x" * 33, "user_admin_invalid_username"), ("exercise-new", "user_admin_reserved_username"),
    ("service-account-x", "user_admin_reserved_username"), ("indtrana-user-admin", "user_admin_reserved_username")])
def test_username_rules(env, username, code):
    assert create(username=username).json()["detail"] == code


def test_request_models_reject_unknown_fields_nul_and_bad_text(env):
    assert create(enabled=True).status_code == 422
    assert create(password="chosen").status_code == 422
    assert create(first_name="Uma\x00").status_code == 422
    assert create(first_name="<script>").json()["detail"] == "user_admin_invalid_name"
    assert create(email="not-an-email").json()["detail"] == "user_admin_invalid_email"
    assert client.patch(f"/v1/user-admin/accounts/{env['maker']}", json={"enabled": False}).status_code == 422
    assert client.patch(f"/v1/user-admin/accounts/{env['maker']}", json={}).json()["detail"] == "user_admin_nothing_to_change"
    assert client.post("/v1/user-admin/accounts/not-a-uuid/disable").status_code == 422
    assert env["store"].rows == []


def test_protected_accounts_refuse_every_change(env):
    for target in (env["owner"], env["service"]):
        for method, suffix, body in (("patch", "", {"first_name": "New"}), ("post", "/disable", None),
                                     ("post", "/enable", None), ("post", "/reset-password", None),
                                     ("post", "/sign-out", None)):
            response = getattr(client, method)(f"/v1/user-admin/accounts/{target}{suffix}", json=body)
            assert response.status_code == 403 and response.json()["detail"] == "user_admin_protected", suffix
    assert env["store"].rows == [] and env["directory"].passwords == {}


def test_self_cannot_disable_demote_reset_or_sign_out(env):
    me = env["admin"]
    for suffix in ("/disable", "/reset-password", "/sign-out"):
        assert client.post(f"/v1/user-admin/accounts/{me}{suffix}").json()["detail"] == "user_admin_self_change"
    assert client.patch(f"/v1/user-admin/accounts/{me}", json={"role": "incident_auditor"}).json()["detail"] == "user_admin_self_change"
    renamed = client.patch(f"/v1/user-admin/accounts/{me}", json={"first_name": "Asha"})
    assert renamed.status_code == 200 and renamed.json()["account"]["first_name"] == "Asha"
    assert [r["action"] for r in env["store"].rows] == ["update"]


def test_last_enabled_admin_cannot_be_disabled_or_demoted(env):
    directory = env["directory"]
    assert client.post(f"/v1/user-admin/accounts/{env['admin2']}/disable").status_code == 200
    # demo-admin2 is now disabled; demo-admin is the last enabled administrator (exercise-* is not counted).
    as_role(env["maker"], "platform_admin")  # a second administrator session acting on demo-admin
    directory.users[env["maker"]]["roles"] = ["platform_admin"]
    directory.users[env["maker"]]["enabled"] = False
    assert client.post(f"/v1/user-admin/accounts/{env['admin']}/disable").json()["detail"] == "user_admin_last_admin"
    assert client.patch(f"/v1/user-admin/accounts/{env['admin']}", json={"role": "incident_checker"}).json()["detail"] == "user_admin_last_admin"
    assert directory.users[env["admin"]]["enabled"] is True


def test_disable_ends_sessions_enable_and_reset(env):
    directory, maker = env["directory"], env["maker"]
    disabled = client.post(f"/v1/user-admin/accounts/{maker}/disable")
    assert disabled.status_code == 200 and disabled.json()["account"]["enabled"] is False
    assert disabled.json()["signed_out"] is True and maker in directory.sessions_ended
    assert client.post(f"/v1/user-admin/accounts/{maker}/enable").json()["account"]["enabled"] is True
    reset = client.post(f"/v1/user-admin/accounts/{maker}/reset-password")
    assert reset.status_code == 200 and reset.headers["cache-control"] == "no-store"
    password = reset.json()["temporary_password"]
    assert directory.passwords[maker] == password and directory.users[maker]["password_change_pending"]
    again = client.post(f"/v1/user-admin/accounts/{maker}/reset-password").json()["temporary_password"]
    assert again != password
    assert [r["action"] for r in env["store"].rows] == ["disable", "enable", "reset_password", "reset_password"]
    assert password not in repr(env["store"].rows) and again not in repr(env["store"].rows)
    signed = client.post(f"/v1/user-admin/accounts/{maker}/sign-out")
    assert signed.status_code == 200 and env["store"].rows[-1]["action"] == "sign_out"


def test_edit_role_moves_scope_and_records_closed_codes(env):
    maker = env["maker"]
    moved = client.patch(f"/v1/user-admin/accounts/{maker}", json={"role": "department_operator", "department": "communications"})
    assert moved.status_code == 200 and moved.json()["account"]["role"] == "department_operator"
    assert moved.json()["account"]["department"] == "communications"
    back = client.patch(f"/v1/user-admin/accounts/{maker}", json={"role": "incident_operator"})
    assert back.json()["account"]["department"] is None
    rows = env["store"].rows
    assert rows[0]["changed"] == ["department", "role"] and rows[0]["role_after"] == "department_operator"
    assert rows[1]["changed"] == ["department", "role"]
    email = client.patch(f"/v1/user-admin/accounts/{maker}", json={"email": "new.address@example.invalid"})
    assert email.status_code == 200 and rows[-1]["changed"] == ["email"]
    assert "new.address" not in repr(rows)
    same = client.patch(f"/v1/user-admin/accounts/{maker}", json={"email": "new.address@example.invalid"})
    assert same.json()["changed"] is False and len(rows) == 3


def test_failed_provider_call_leaves_no_audit_row(env):
    directory = env["directory"]
    directory.fail = "unavailable"
    response = client.post(f"/v1/user-admin/accounts/{env['maker']}/enable")
    assert response.status_code == 503 and response.json()["detail"] == "user_admin_unavailable"
    directory.fail = "refused"
    assert create().json()["detail"] == "user_admin_provider_refused"
    assert env["store"].rows == []
    env["store"].fail = True
    assert client.post(f"/v1/user-admin/accounts/{env['maker']}/enable").json()["detail"] == "user_admin_unavailable"
    assert client.get("/v1/user-admin/audit").json()["detail"] == "user_admin_unavailable"


def test_interrupted_create_stays_disabled_and_is_recorded_incomplete(env):
    env["directory"].fail_role = True
    response = create()
    assert response.status_code == 503 and response.json()["detail"] == "user_admin_create_incomplete"
    assert "temporary_password" not in response.text
    created = env["directory"].find("umtest-ops")
    assert created["enabled"] is False
    assert env["store"].rows[0]["outcome"] == "incomplete"


def test_generated_passwords_are_strong_and_distinct():
    seen = {user_admin.generate_password() for _ in range(200)}
    assert len(seen) == 200
    for value in seen:
        assert len(value) == 20 and any(c.isupper() for c in value) and any(c.islower() for c in value)
        assert any(c.isdigit() for c in value) and not set(value) & set("Il1O0o")


def test_source_never_logs_or_audits_password_and_has_no_transport():
    import inspect
    source = inspect.getsource(user_admin) + inspect.getsource(user_directory) + inspect.getsource(user_admin_store)
    assert "logging" not in source and "print(" not in source
    for forbidden in ("smtplib", "sendgrid", "twilio", "send_mail", "execute-actions-email", "send-verify-email"):
        assert forbidden not in source
    assert "temporary\": True" in source
