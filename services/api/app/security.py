"""Fail-closed OIDC JWT resource-server authentication for exercise workflows.

Only a trusted identity provider may assert AEGIS roles and agency scope.
No developer override, hardcoded token, unsigned JWT, or browser-supplied
subject/role is supported by this module.
"""
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Operator:
    subject: str
    agency_id: UUID
    roles: frozenset[str]
    department_id: str | None = None
    team_id: str | None = None  # Signed aegis_team_id; only set for response_team tokens (docs/RESPONSE_LOOP.md).
    # The token's `email` claim, set only when `email_verified` is exactly true. Used only by the staff email
    # register (docs/COMMUNICATION_CHANNELS.md); kept out of repr so it never reaches a log line.
    email: str | None = field(default=None, repr=False, compare=False)


SYSTEM_SUBJECT_PREFIX = "system:"
_VERIFIED_EMAIL = re.compile(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,4}")


def _verified_email(claims: dict) -> str | None:
    """The email claim only when the identity provider marks it verified; anything unusual yields None."""
    email = claims.get("email")
    if claims.get("email_verified") is not True or not isinstance(email, str) or len(email) > 254:
        return None
    return email if _VERIFIED_EMAIL.fullmatch(email) else None
ALLOWED_ROLES = frozenset({"incident_operator", "incident_checker", "incident_auditor", "department_operator",
                           "response_team", "platform_admin"})


def _fixture_team_ids() -> frozenset[str]:
    # Read the synthetic team fixture only; an unreadable fixture refuses every team token.
    import json
    from pathlib import Path
    try:
        data = json.loads((Path(__file__).parent / "fixtures" / "synthetic_teams.v1.json").read_text(encoding="utf-8"))
        return frozenset(str(team["id"]) for team in data["teams"])
    except (OSError, ValueError, KeyError, TypeError):
        return frozenset()


TEAM_IDS = _fixture_team_ids()


def require_role(operator: Operator, allowed: set[str]) -> None:
    if operator.roles.isdisjoint(allowed):
        raise HTTPException(status_code=403, detail="Insufficient agency role")


FIXTURE_AGENCY_DETAIL = "Exercise records are limited to the exercise agency"
# Explicit role lists for the formerly open read routes (docs/SECURITY_ASSESSMENT.md). They mirror the web
# matrix in apps/web/lib/roles.ts; a new role must be added here on purpose, never by default.
EXERCISE_RECORD_ROLES = frozenset({"incident_operator", "incident_checker", "incident_auditor",
                                   "department_operator", "response_team", "platform_admin"})


def scoped_operator(allowed: frozenset[str], *, fixture_agency: bool = True):
    """Dependency: a verified operator holding one of `allowed`; with `fixture_agency`, only the exercise agency.

    A valid token from another agency gets 403 with a fixed message (never an empty result), so a
    caller cannot mistake "not your agency" for "no records".
    """
    roles = frozenset(allowed)
    if not roles or not roles <= ALLOWED_ROLES:
        raise ValueError("scoped_operator needs an explicit, known role list")

    def dependency(operator: Operator = Depends(get_operator)) -> Operator:
        require_role(operator, set(roles))
        if fixture_agency:
            from app.intelligence_store import DEMO_AGENCY
            if operator.agency_id != DEMO_AGENCY:
                raise HTTPException(status_code=403, detail=FIXTURE_AGENCY_DETAIL)
        return operator

    dependency.allowed_roles = roles  # read by the route inventory test
    dependency.fixture_agency = fixture_agency
    return dependency


@lru_cache(maxsize=4)
def _jwk_client(url: str) -> jwt.PyJWKClient:
    # Cache the JWKS response for five minutes, but never cache individual
    # signing keys indefinitely: rotated/revoked keys must eventually expire.
    return jwt.PyJWKClient(url, cache_keys=False, cache_jwk_set=True, timeout=5, lifespan=300)


def _configuration() -> tuple[str, str, str]:
    issuer = os.getenv("OIDC_ISSUER", "").strip()
    audience = os.getenv("OIDC_AUDIENCE", "").strip()
    jwks_url = os.getenv("OIDC_JWKS_URL", "").strip()
    if not issuer or not audience or not jwks_url:
        raise HTTPException(status_code=503, detail="OIDC authentication is not configured")
    if not issuer.startswith("https://") or not jwks_url.startswith("https://"):
        raise HTTPException(status_code=503, detail="OIDC requires HTTPS issuer and key endpoint")
    return issuer, audience, jwks_url


def decode_operator_token(token: str) -> Operator:
    issuer, audience, jwks_url = _configuration()
    try:
        signing_key = _jwk_client(jwks_url).get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key=signing_key,
            algorithms=["RS256"],
            issuer=issuer,
            audience=audience,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(status_code=503, detail="Identity provider keys unavailable") from exc
    except (jwt.InvalidTokenError, jwt.PyJWKClientError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid identity token") from exc

    subject = claims.get("sub")
    raw_roles = claims.get("aegis_roles")
    raw_agency = claims.get("aegis_agency_id")
    if not isinstance(subject, str) or not (1 <= len(subject) <= 256):
        raise HTTPException(status_code=401, detail="Invalid identity subject")
    if subject.lower().startswith(SYSTEM_SUBJECT_PREFIX):
        # Reserved for in-process automation (system:scheduler, system:sentinel). A token carrying
        # such a subject can never act as maker, checker or any other operator.
        raise HTTPException(status_code=401, detail="Invalid identity subject")
    if not isinstance(raw_roles, list) or not raw_roles or any(not isinstance(role, str) for role in raw_roles):
        raise HTTPException(status_code=403, detail="No authorized agency role")
    roles = frozenset(raw_roles)
    if not roles.issubset(ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Unrecognized agency role")
    try:
        agency_id = UUID(str(raw_agency))
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=403, detail="Invalid agency scope") from exc
    department = claims.get("aegis_department_id")
    if department is not None or "department_operator" in roles:
        if not isinstance(department, str) or department not in {"control_room", "infrastructure", "communications"}:
            raise HTTPException(status_code=403, detail="Invalid department scope")
    team = claims.get("aegis_team_id")
    if team is not None or "response_team" in roles:
        if not isinstance(team, str) or team not in TEAM_IDS:
            raise HTTPException(status_code=403, detail="Invalid team scope")
    return Operator(subject=subject, agency_id=agency_id, roles=roles, department_id=department, team_id=team,
                    email=_verified_email(claims))


def get_operator(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Operator:
    # Detect misconfiguration before even considering an untrusted token.
    _configuration()
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer access token required", headers={"WWW-Authenticate": "Bearer"})
    return decode_operator_token(credentials.credentials)
