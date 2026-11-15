"""Identity provider directory for user administration (docs/USER_MANAGEMENT.md).

The identity provider stays the account store; IndTrana never stores or verifies a password. This module talks to the
Keycloak Admin REST API with the dedicated least-privilege service client `indtrana-user-admin` (realm-management
view-users, query-users and manage-users only), never with the bootstrap administrator.

Network rules: one fixed HTTPS base URL from configuration, no redirects followed, no proxy, short timeouts, a response
size cap, and no upstream body or exception text ever leaves this module (DirectoryError carries a fixed code only).
Passwords are sent to the provider in a request body and are never logged or kept.

`Directory` is the contract the routes use; KeycloakDirectory is the real one and FakeDirectory (tests only, never
selected by configuration) keeps the same contract in memory.
"""
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4

TIMEOUT_SECONDS = 6
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_ACCOUNTS = 200
_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_NAME = re.compile(r"[a-z][a-z0-9-]{0,63}")
_SECRET = re.compile(r"[A-Za-z0-9_-]{16,128}")
DEPARTMENT_ATTRIBUTE = "aegis_department_id"
TEAM_ATTRIBUTE = "aegis_team_id"


class DirectoryError(Exception):
    """A fixed code only: unavailable, refused, not_found, conflict, rejected."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class NotConfigured(Exception):
    pass


def _iso_ms(value) -> str | None:
    if isinstance(value, (int, float)) and value > 0:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return None


def _first(attributes: dict, key: str) -> str | None:
    values = (attributes or {}).get(key)
    if isinstance(values, list) and values and isinstance(values[0], str):
        return values[0]
    return None


def normalise(rep: dict, roles: list[str]) -> dict:
    """The provider's user record reduced to the fields IndTrana shows. Nothing else is passed on."""
    attributes = rep.get("attributes") or {}
    return {"id": rep.get("id"), "username": rep.get("username") or "",
            "first_name": rep.get("firstName") or "", "last_name": rep.get("lastName") or "",
            "email": rep.get("email") or "", "enabled": rep.get("enabled") is True,
            "roles": sorted(roles), "department": _first(attributes, DEPARTMENT_ATTRIBUTE),
            "team": _first(attributes, TEAM_ATTRIBUTE), "created_at": _iso_ms(rep.get("createdTimestamp")),
            "password_change_pending": "UPDATE_PASSWORD" in (rep.get("requiredActions") or [])}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class KeycloakDirectory:
    def __init__(self, base_url: str, realm: str, client_id: str, secret: str, web_client_id: str):
        self.base = base_url.rstrip("/")
        self.realm, self.client_id, self._secret, self.web_client_id = realm, client_id, secret, web_client_id
        self._token: tuple[str, float] | None = None
        self._web_client_uuid: str | None = None
        self._lock = threading.Lock()

    # --- transport -------------------------------------------------------------------------------------------
    def _send(self, method: str, path: str, *, body=None, form: dict | None = None, auth=True):
        headers = {"Accept": "application/json", "User-Agent": "IndTrana-user-admin/1"}
        data = None
        if form is not None:
            data = urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if auth:
            headers["Authorization"] = "Bearer " + self._access_token()
        request = Request(self.base + path, data=data, method=method, headers=headers)
        try:
            response = build_opener(ProxyHandler({}), _NoRedirect()).open(request, timeout=TIMEOUT_SECONDS)
        except HTTPError as error:
            status = error.code
            error.close()
            if status in (401, 403):
                if auth:
                    with self._lock:
                        self._token = None
                raise DirectoryError("refused") from None
            if status == 404:
                raise DirectoryError("not_found") from None
            if status == 409:
                raise DirectoryError("conflict") from None
            if 300 <= status < 400 or status >= 500:
                raise DirectoryError("unavailable") from None
            raise DirectoryError("rejected") from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise DirectoryError("unavailable") from None
        with response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            location = response.headers.get("Location")
        if len(raw) > MAX_RESPONSE_BYTES:
            raise DirectoryError("unavailable")
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            raise DirectoryError("unavailable") from None
        return payload, location

    def _access_token(self) -> str:
        with self._lock:
            if self._token and self._token[1] > time.monotonic():
                return self._token[0]
        payload, _ = self._send("POST", f"/realms/{self.realm}/protocol/openid-connect/token", auth=False,
                                form={"grant_type": "client_credentials", "client_id": self.client_id,
                                      "client_secret": self._secret})
        token = payload.get("access_token") if isinstance(payload, dict) else None
        lifetime = payload.get("expires_in") if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token:
            raise DirectoryError("refused")
        ttl = max(10, min(int(lifetime) if isinstance(lifetime, int) else 60, 300) - 30)
        with self._lock:
            self._token = (token, time.monotonic() + ttl)
        return token

    def _admin(self, method: str, path: str, **kwargs):
        return self._send(method, f"/admin/realms/{self.realm}{path}", **kwargs)

    # --- roles -----------------------------------------------------------------------------------------------
    def _mappings(self, user_id: str) -> tuple[str | None, list[str]]:
        payload, _ = self._admin("GET", f"/users/{user_id}/role-mappings")
        web = ((payload or {}).get("clientMappings") or {}).get(self.web_client_id) or {}
        uuid = web.get("id") if isinstance(web.get("id"), str) and _ID.fullmatch(web.get("id")) else None
        names = [m.get("name") for m in web.get("mappings") or [] if isinstance(m.get("name"), str)]
        return uuid, names

    def _web_client(self, hint_user: str) -> str:
        """The web client's internal id, learned from an administrator's own role mapping (no client read rights)."""
        if self._web_client_uuid:
            return self._web_client_uuid
        uuid, _ = self._mappings(hint_user)
        if not uuid:
            raise DirectoryError("unavailable")
        self._web_client_uuid = uuid
        return uuid

    def roles_of(self, user_id: str) -> list[str]:
        uuid, names = self._mappings(user_id)
        if uuid and not self._web_client_uuid:
            self._web_client_uuid = uuid
        return names

    def set_role(self, user_id: str, role: str, hint_user: str) -> None:
        """Exactly one web-client role afterwards: `role`. Other web-client roles are removed."""
        cid = self._web_client(hint_user)
        current, _ = self._admin("GET", f"/users/{user_id}/role-mappings/clients/{cid}")
        current = [r for r in current or [] if isinstance(r, dict)]
        remove = [{"id": r["id"], "name": r["name"]} for r in current if r.get("name") != role]
        if not any(r.get("name") == role for r in current):
            available, _ = self._admin("GET", f"/users/{user_id}/role-mappings/clients/{cid}/available")
            match = [{"id": r["id"], "name": r["name"]} for r in available or [] if r.get("name") == role]
            if not match:
                raise DirectoryError("rejected")
            self._admin("POST", f"/users/{user_id}/role-mappings/clients/{cid}", body=match)
        if remove:
            self._admin("DELETE", f"/users/{user_id}/role-mappings/clients/{cid}", body=remove)

    # --- accounts --------------------------------------------------------------------------------------------
    def _rep(self, user_id: str) -> dict:
        payload, _ = self._admin("GET", f"/users/{user_id}")
        if not isinstance(payload, dict) or payload.get("id") != user_id:
            raise DirectoryError("not_found")
        return payload

    def get(self, user_id: str) -> dict:
        return normalise(self._rep(user_id), self.roles_of(user_id))

    def list(self) -> tuple[list[dict], bool]:
        payload, _ = self._admin("GET", "/users?" + urlencode({"briefRepresentation": "false", "first": 0,
                                                               "max": MAX_ACCOUNTS + 1}))
        reps = [r for r in payload or [] if isinstance(r, dict) and isinstance(r.get("id"), str)
                and _ID.fullmatch(r["id"])]
        truncated = len(reps) > MAX_ACCOUNTS
        reps = reps[:MAX_ACCOUNTS]
        with ThreadPoolExecutor(max_workers=6) as pool:
            roles = list(pool.map(lambda r: self.roles_of(r["id"]), reps))
        return [normalise(rep, names) for rep, names in zip(reps, roles)], truncated

    def find(self, username: str) -> dict | None:
        payload, _ = self._admin("GET", "/users?" + urlencode({"username": username, "exact": "true",
                                                               "briefRepresentation": "true"}))
        for rep in payload or []:
            if isinstance(rep, dict) and rep.get("username") == username:
                return rep
        return None

    def create(self, fields: dict, password: str) -> str:
        attributes = {}
        if fields.get("department"):
            attributes[DEPARTMENT_ATTRIBUTE] = [fields["department"]]
        if fields.get("team"):
            attributes[TEAM_ATTRIBUTE] = [fields["team"]]
        # Created disabled; enabled only after its role is in place (an interrupted create stays disabled).
        body = {"username": fields["username"], "enabled": False, "emailVerified": True,
                "firstName": fields["first_name"], "lastName": fields["last_name"], "email": fields["email"],
                "attributes": attributes, "requiredActions": ["UPDATE_PASSWORD"],
                "credentials": [{"type": "password", "value": password, "temporary": True}]}
        _, location = self._admin("POST", "/users", body=body)
        user_id = (location or "").rstrip("/").rsplit("/", 1)[-1]
        if not _ID.fullmatch(user_id):
            found = self.find(fields["username"])
            user_id = found.get("id") if found else ""
        if not _ID.fullmatch(user_id or ""):
            raise DirectoryError("unavailable")
        return user_id

    def update(self, user_id: str, changes: dict) -> None:
        rep = self._rep(user_id)
        attributes = dict(rep.get("attributes") or {})
        mapping = {"first_name": "firstName", "last_name": "lastName", "email": "email"}
        for key, value in changes.items():
            if key in mapping:
                rep[mapping[key]] = value
            elif key in ("department", "team"):
                attr = DEPARTMENT_ATTRIBUTE if key == "department" else TEAM_ATTRIBUTE
                if value:
                    attributes[attr] = [value]
                else:
                    attributes.pop(attr, None)
            elif key == "enabled":
                rep["enabled"] = bool(value)
        if "email" in changes:
            rep["emailVerified"] = True
        rep["attributes"] = attributes
        for drop in ("access", "credentials", "federatedIdentities", "clientRoles", "realmRoles", "groups",
                     "userProfileMetadata", "disableableCredentialTypes", "notBefore"):
            rep.pop(drop, None)
        self._admin("PUT", f"/users/{user_id}", body=rep)

    def set_password(self, user_id: str, password: str) -> None:
        self._admin("PUT", f"/users/{user_id}/reset-password",
                    body={"type": "password", "value": password, "temporary": True})

    def sign_out(self, user_id: str) -> None:
        self._admin("POST", f"/users/{user_id}/logout")


class FakeDirectory:
    """Offline double for tests. Same contract as KeycloakDirectory; never selected by configuration."""

    def __init__(self):
        self.users: dict[str, dict] = {}
        self.passwords: dict[str, str] = {}
        self.sessions_ended: list[str] = []
        self.fail: str | None = None  # a DirectoryError code to raise on the next write
        self.fail_role = False

    def add(self, username, role, *, enabled=True, department=None, team=None, user_id=None) -> str:
        user_id = user_id or str(uuid4())
        self.users[user_id] = {"id": user_id, "username": username, "first_name": "Test", "last_name": username,
                               "email": f"{username}@example.invalid", "enabled": enabled,
                               "roles": [role] if role else [], "department": department, "team": team,
                               "created_at": datetime.now(timezone.utc).isoformat(), "password_change_pending": False}
        return user_id

    def _write(self):
        if self.fail:
            code, self.fail = self.fail, None
            raise DirectoryError(code)

    def get(self, user_id):
        if user_id not in self.users:
            raise DirectoryError("not_found")
        return dict(self.users[user_id], roles=list(self.users[user_id]["roles"]))

    def list(self):
        if self.fail == "unavailable":
            raise DirectoryError("unavailable")
        return [self.get(u) for u in self.users], False

    def find(self, username):
        return next((u for u in self.users.values() if u["username"] == username), None)

    def create(self, fields, password):
        self._write()
        if self.find(fields["username"]):
            raise DirectoryError("conflict")
        user_id = self.add(fields["username"], None, enabled=False, department=fields.get("department"),
                           team=fields.get("team"))
        self.users[user_id].update(first_name=fields["first_name"], last_name=fields["last_name"],
                                   email=fields["email"], password_change_pending=True)
        self.passwords[user_id] = password
        return user_id

    def update(self, user_id, changes):
        self._write()
        self.get(user_id)
        for key, value in changes.items():
            self.users[user_id][key] = value

    def set_role(self, user_id, role, hint_user):
        if self.fail_role:
            raise DirectoryError("unavailable")
        self._write()
        self.users[user_id]["roles"] = [role]

    def set_password(self, user_id, password):
        self._write()
        self.passwords[user_id] = password
        self.users[user_id]["password_change_pending"] = True

    def sign_out(self, user_id):
        self._write()
        self.sessions_ended.append(user_id)


_directory = None
_override = None


def configured_directory():
    """The real directory from configuration, or NotConfigured. Values are checked, never echoed."""
    if _override is not None:
        return _override
    base = os.getenv("AEGIS_USER_ADMIN_BASE_URL", "").strip()
    realm = os.getenv("AEGIS_USER_ADMIN_REALM", "").strip()
    client = os.getenv("AEGIS_USER_ADMIN_CLIENT_ID", "").strip()
    web = os.getenv("AEGIS_USER_ADMIN_WEB_CLIENT_ID", "").strip()
    secret = os.getenv("AEGIS_USER_ADMIN_CLIENT_SECRET", "").strip()
    parsed = urlparse(base)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/") or parsed.query
            or parsed.username or parsed.password or parsed.fragment):
        raise NotConfigured()
    if not (_NAME.fullmatch(realm) and _NAME.fullmatch(client) and _NAME.fullmatch(web) and _SECRET.fullmatch(secret)):
        raise NotConfigured()
    global _directory
    if _directory is None or (_directory.base, _directory.realm, _directory.client_id) != (base.rstrip("/"), realm, client):
        _directory = KeycloakDirectory(base, quote(realm), client, secret, web)
    return _directory


def set_directory(directory) -> None:
    """Tests only: use a double (or None to go back to configuration)."""
    global _override
    _override = directory
