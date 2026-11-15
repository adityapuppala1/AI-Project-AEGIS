"""User administration (docs/USER_MANAGEMENT.md): platform_admin only.

Accounts stay in the identity provider (app/user_directory.py); IndTrana never stores or verifies a password. An
administrator can list accounts, create one ("invite"), edit name, email, role, department and team, enable, disable
(which also ends the person's sessions), issue a new temporary password ("reset" and "resend" are the same action)
and sign a person out everywhere. There is no delete: disable instead.

Passwords are generated here with `secrets`, set as temporary so the provider forces a change at the next sign-in,
returned exactly once in the response (Cache-Control: no-store), and never logged, audited or stored. Nothing is sent
by email, SMS or any other channel: the administrator hands the password over in person.

Guards: exactly one allowlisted role; a department if and only if department_operator; a team from the fixture if and
only if response_team; a strict username pattern; exercise-* accounts and service accounts refuse every change; an
administrator cannot disable, demote, reset or sign out themselves here; the last enabled platform_admin cannot be
disabled or demoted. Every write runs inside one database transaction holding an advisory lock (user_admin_store),
and its audit row is inserted only after the provider call succeeded.

New accounts get the caller's agency because the web client signs one fixed agency into every token of this realm
(the `signed-demo-agency` mapper); the route is limited to that exercise agency by scoped_operator.

An access token already issued stays valid until it expires (at most 15 minutes) even after disable or sign-out.
"""
import re
import secrets
import string
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from pydantic import BaseModel, ConfigDict, StrictStr

from app import user_admin_store, user_directory
from app.security import ALLOWED_ROLES, TEAM_IDS, Operator, scoped_operator
from app.text_checks import NoNul
from app.user_directory import DirectoryError, NotConfigured

router = APIRouter(prefix="/v1/user-admin", tags=["user administration"])
_admin = scoped_operator(frozenset({"platform_admin"}))

DEPARTMENTS = ("control_room", "infrastructure", "communications")
ROLE_ORDER = ("incident_operator", "incident_checker", "incident_auditor", "department_operator", "response_team",
              "platform_admin")
USERNAME = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*")
USERNAME_MIN, USERNAME_MAX = 3, 32
PERSON_NAME = re.compile(r"[^\W\d_][\w .'\-]{0,63}", re.UNICODE)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,4}")
PASSWORD_LENGTH = 20
_PASSWORD_ALPHABET = "".join(ch for ch in string.ascii_letters + string.digits if ch not in "Il1O0o")
ACCOUNT_ID = Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
NO_STORE = {"Cache-Control": "no-store"}
SERVICE_PREFIX = "service-account-"


def _fail(status: int, code: str) -> HTTPException:
    return HTTPException(status_code=status, detail=code, headers=NO_STORE)


def generate_password() -> str:
    """20 characters from 56 unambiguous letters and digits (about 116 bits), with each character class present."""
    while True:
        value = "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))
        if any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value):
            return value


def protected_reason(account: dict) -> str | None:
    username = account.get("username") or ""
    if username.startswith("exercise"):
        return "owner_exercise_account"
    if username.startswith(SERVICE_PREFIX):
        return "service_account"
    return None


def _directory():
    try:
        return user_directory.configured_directory()
    except NotConfigured:
        raise _fail(503, "user_admin_not_configured") from None


def _provider_failure(error: DirectoryError) -> HTTPException:
    if error.code == "not_found":
        return _fail(404, "user_admin_not_found")
    if error.code == "conflict":
        return _fail(409, "user_admin_username_taken")
    if error.code == "rejected":
        return _fail(422, "user_admin_provider_rejected")
    if error.code == "refused":
        return _fail(503, "user_admin_provider_refused")
    return _fail(503, "user_admin_unavailable")


def _view(account: dict) -> dict:
    roles = [r for r in ROLE_ORDER if r in account.get("roles", [])]
    reason = protected_reason(account)
    return {"id": account["id"], "username": account["username"], "first_name": account.get("first_name") or "",
            "last_name": account.get("last_name") or "", "email": account.get("email") or "",
            "enabled": bool(account.get("enabled")), "role": roles[0] if len(roles) == 1 else None, "roles": roles,
            "department": account.get("department") if account.get("department") in DEPARTMENTS else None,
            "team": account.get("team") if account.get("team") in TEAM_IDS else None,
            "created_at": account.get("created_at"),
            "password_change_pending": bool(account.get("password_change_pending")),
            "protected": reason is not None, "protected_reason": reason}


# --- request models ---------------------------------------------------------------------------------------------
Text = Annotated[StrictStr, NoNul]


class CreateAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Text
    first_name: Text
    last_name: Text
    email: Text
    role: Text
    department: Text | None = None
    team: Text | None = None


class EditAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: Text | None = None
    last_name: Text | None = None
    email: Text | None = None
    role: Text | None = None
    department: Text | None = None
    team: Text | None = None


def _check_username(raw: str) -> str:
    name = raw.strip()
    if not (USERNAME_MIN <= len(name) <= USERNAME_MAX) or not USERNAME.fullmatch(name):
        raise _fail(422, "user_admin_invalid_username")
    if name.startswith("exercise") or name.startswith(SERVICE_PREFIX) or name.startswith("indtrana-"):
        raise _fail(422, "user_admin_reserved_username")
    return name


def _check_person(raw: str) -> str:
    value = " ".join(raw.split())
    if not PERSON_NAME.fullmatch(value):
        raise _fail(422, "user_admin_invalid_name")
    return value


def _check_email(raw: str) -> str:
    value = raw.strip()
    if len(value) > 254 or not EMAIL.fullmatch(value):
        raise _fail(422, "user_admin_invalid_email")
    return value.lower()


def _check_scope(role: str, department: str | None, team: str | None) -> tuple[str | None, str | None]:
    if role not in ALLOWED_ROLES:
        raise _fail(422, "user_admin_invalid_role")
    department = department or None
    team = team or None
    if role == "department_operator":
        if department not in DEPARTMENTS:
            raise _fail(422, "user_admin_department_required")
    elif department is not None:
        raise _fail(422, "user_admin_department_not_allowed")
    if role == "response_team":
        if team not in TEAM_IDS:
            raise _fail(422, "user_admin_team_required")
    elif team is not None:
        raise _fail(422, "user_admin_team_not_allowed")
    return department, team


def _enabled_admins(directory) -> int:
    accounts, _ = directory.list()
    return sum(1 for a in accounts if a.get("enabled") and "platform_admin" in a.get("roles", [])
               and protected_reason(a) is None)


def _load_target(directory, account_id: str, operator: Operator, *, self_allowed=False) -> dict:
    account = directory.get(account_id)
    if protected_reason(account):
        raise _fail(403, "user_admin_protected")
    if not self_allowed and account_id == operator.subject:
        raise _fail(403, "user_admin_self_change")
    return account


def _try_sign_out(directory, account_id: str) -> str:
    try:
        directory.sign_out(account_id)
        return "done"
    except DirectoryError:
        return "incomplete"


def _run(fn):
    """Run one write inside the audit bracket; provider and store failures become fixed codes."""
    try:
        with user_admin_store.get_store().bracket() as recorder:
            return fn(recorder)
    except HTTPException:
        raise
    except DirectoryError as error:
        raise _provider_failure(error) from None
    except Exception:
        raise _fail(503, "user_admin_unavailable") from None


# --- routes -----------------------------------------------------------------------------------------------------
@router.get("/status")
def read_status(response: Response, _operator: Operator = Depends(_admin)):
    response.headers.update(NO_STORE)
    try:
        user_directory.configured_directory()
        configured = True
    except NotConfigured:
        configured = False
    return {"configured": configured, "roles": list(ROLE_ORDER), "departments": list(DEPARTMENTS),
            "teams": sorted(TEAM_IDS), "max_accounts": user_directory.MAX_ACCOUNTS}


@router.get("/accounts")
def list_accounts(response: Response, operator: Operator = Depends(_admin)):
    directory = _directory()
    try:
        accounts, truncated = directory.list()
    except DirectoryError as error:
        raise _provider_failure(error) from None
    response.headers.update(NO_STORE)
    rows = sorted((_view(a) for a in accounts), key=lambda a: a["username"])
    for row in rows:
        row["is_you"] = row["id"] == operator.subject
    return {"accounts": rows, "truncated": truncated}


@router.post("/accounts", status_code=201)
def create_account(body: CreateAccount, response: Response, operator: Operator = Depends(_admin)):
    fields = {"username": _check_username(body.username), "first_name": _check_person(body.first_name),
              "last_name": _check_person(body.last_name), "email": _check_email(body.email)}
    fields["department"], fields["team"] = _check_scope(body.role, body.department, body.team)
    directory = _directory()
    password = generate_password()

    def work(recorder):
        if directory.find(fields["username"]):
            raise _fail(409, "user_admin_username_taken")
        account_id = directory.create(fields, password)
        changed = ["first_name", "last_name", "email", "role"] + [k for k in ("department", "team") if fields[k]]
        try:
            directory.set_role(account_id, body.role, operator.subject)
            directory.update(account_id, {"enabled": True})
            outcome = "done"
        except DirectoryError:
            outcome = "incomplete"  # the account stays disabled; the administrator can fix and enable it
        recorder.record(action="create", outcome=outcome, target_id=account_id, target_username=fields["username"],
                        changed=changed, role_after=body.role, actor=operator.subject)
        return account_id, outcome

    account_id, outcome = _run(work)
    response.headers.update(NO_STORE)
    if outcome != "done":
        raise _fail(503, "user_admin_create_incomplete")
    try:
        account = _view(directory.get(account_id))
    except DirectoryError:
        account = {"id": account_id, "username": fields["username"]}
    return {"account": account, "temporary_password": password}


@router.patch("/accounts/{account_id}")
def edit_account(account_id: ACCOUNT_ID, body: EditAccount, response: Response, operator: Operator = Depends(_admin)):
    sent = body.model_fields_set
    if not sent:
        raise _fail(422, "user_admin_nothing_to_change")
    directory = _directory()

    def work(recorder):
        account = _load_target(directory, account_id, operator, self_allowed=True)
        current = _view(account)
        changes: dict = {}
        if "first_name" in sent and body.first_name is not None:
            changes["first_name"] = _check_person(body.first_name)
        if "last_name" in sent and body.last_name is not None:
            changes["last_name"] = _check_person(body.last_name)
        if "email" in sent and body.email is not None:
            changes["email"] = _check_email(body.email)
        role = body.role if "role" in sent and body.role is not None else current["role"]
        department = body.department if "department" in sent else current["department"]
        team = body.team if "team" in sent else current["team"]
        if role is None:
            raise _fail(422, "user_admin_invalid_role")
        # Moving to a role without a department or team clears it rather than refusing.
        if role != "department_operator" and "department" not in sent:
            department = None
        if role != "response_team" and "team" not in sent:
            team = None
        department, team = _check_scope(role, department, team)
        role_changed = role != current["role"] or len(current["roles"]) != 1
        if role_changed and account_id == operator.subject:
            raise _fail(403, "user_admin_self_change")
        if (role_changed and "platform_admin" in current["roles"] and role != "platform_admin" and current["enabled"]
                and _enabled_admins(directory) <= 1):
            raise _fail(409, "user_admin_last_admin")
        if department != current["department"]:
            changes["department"] = department
        if team != current["team"]:
            changes["team"] = team
        for key in ("first_name", "last_name", "email"):
            if key in changes and changes[key] == current[key]:
                del changes[key]
        if not changes and not role_changed:
            return current
        if changes:
            directory.update(account_id, changes)
        if role_changed:
            directory.set_role(account_id, role, operator.subject)
        recorder.record(action="update", outcome="done", target_id=account_id, target_username=current["username"],
                        changed=list(changes) + (["role"] if role_changed else []),
                        role_after=role if role_changed else None, actor=operator.subject)
        return None

    unchanged = _run(work)
    response.headers.update(NO_STORE)
    if unchanged is not None:
        return {"account": unchanged, "changed": False}
    try:
        return {"account": _view(directory.get(account_id)), "changed": True}
    except DirectoryError as error:
        raise _provider_failure(error) from None


def _state_change(account_id: str, operator: Operator, action: str):
    directory = _directory()

    def work(recorder):
        account = _load_target(directory, account_id, operator)
        current = _view(account)
        outcome = "done"
        if action == "disable":
            if current["enabled"] and "platform_admin" in current["roles"] and _enabled_admins(directory) <= 1:
                raise _fail(409, "user_admin_last_admin")
            directory.update(account_id, {"enabled": False})
            # The account is already disabled; a failed sign-out is recorded as incomplete instead of undoing that.
            outcome = _try_sign_out(directory, account_id)
        elif action == "enable":
            directory.update(account_id, {"enabled": True})
        elif action == "sign_out":
            directory.sign_out(account_id)
        recorder.record(action=action, outcome=outcome, target_id=account_id, target_username=current["username"],
                        changed=[], role_after=None, actor=operator.subject)
        return outcome

    outcome = _run(work)
    try:
        return {"account": _view(directory.get(account_id)), "signed_out": outcome == "done"}
    except DirectoryError as error:
        raise _provider_failure(error) from None


@router.post("/accounts/{account_id}/enable")
def enable_account(account_id: ACCOUNT_ID, response: Response, operator: Operator = Depends(_admin)):
    response.headers.update(NO_STORE)
    return _state_change(account_id, operator, "enable")


@router.post("/accounts/{account_id}/disable")
def disable_account(account_id: ACCOUNT_ID, response: Response, operator: Operator = Depends(_admin)):
    response.headers.update(NO_STORE)
    return _state_change(account_id, operator, "disable")


@router.post("/accounts/{account_id}/sign-out")
def sign_out_account(account_id: ACCOUNT_ID, response: Response, operator: Operator = Depends(_admin)):
    response.headers.update(NO_STORE)
    return _state_change(account_id, operator, "sign_out")


@router.post("/accounts/{account_id}/reset-password")
def reset_password(account_id: ACCOUNT_ID, response: Response, operator: Operator = Depends(_admin)):
    """Issue a new temporary password. Used for both "reset" and "resend": nothing is ever sent anywhere."""
    directory = _directory()
    password = generate_password()

    def work(recorder):
        account = _load_target(directory, account_id, operator)
        directory.set_password(account_id, password)
        # The new password is in place; a failed sign-out is recorded as incomplete and the password is still shown.
        outcome = _try_sign_out(directory, account_id)
        recorder.record(action="reset_password", outcome=outcome, target_id=account_id,
                        target_username=account["username"], changed=[], role_after=None, actor=operator.subject)
        return account["username"], outcome

    username, outcome = _run(work)
    response.headers.update(NO_STORE)
    return {"account_id": account_id, "username": username, "temporary_password": password,
            "signed_out": outcome == "done"}


@router.get("/audit")
def read_audit(response: Response, _operator: Operator = Depends(_admin)):
    try:
        rows = user_admin_store.get_store().list_audit(200)
    except Exception:
        raise _fail(503, "user_admin_unavailable") from None
    response.headers.update(NO_STORE)
    return {"rows": [{"id": str(r["id"]), "action": r["action"], "outcome": r["outcome"], "target_id": r["target_id"],
                      "target_username": r["target_username"], "changed": list(r.get("changed") or []),
                      "role_after": r.get("role_after"), "actor": r["actor"],
                      "at": r["at"].isoformat() if hasattr(r.get("at"), "isoformat") else r.get("at")}
                     for r in rows]}
