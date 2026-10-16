"""Fail-closed OIDC JWT resource-server authentication for exercise workflows.

Only a trusted identity provider may assert AEGIS roles and agency scope.
No developer override, hardcoded token, unsigned JWT, or browser-supplied
subject/role is supported by this module.
"""
import os
from dataclasses import dataclass
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


ALLOWED_ROLES = frozenset({"incident_operator", "incident_checker", "incident_auditor"})


def require_role(operator: Operator, allowed: set[str]) -> None:
    if operator.roles.isdisjoint(allowed):
        raise HTTPException(status_code=403, detail="Insufficient agency role")


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
    if not isinstance(raw_roles, list) or not raw_roles or any(not isinstance(role, str) for role in raw_roles):
        raise HTTPException(status_code=403, detail="No authorized agency role")
    roles = frozenset(raw_roles)
    if not roles.issubset(ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Unrecognized agency role")
    try:
        agency_id = UUID(str(raw_agency))
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=403, detail="Invalid agency scope") from exc
    return Operator(subject=subject, agency_id=agency_id, roles=roles)


def get_operator(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Operator:
    # Detect misconfiguration before even considering an untrusted token.
    _configuration()
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer access token required", headers={"WWW-Authenticate": "Bearer"})
    return decode_operator_token(credentials.credentials)
