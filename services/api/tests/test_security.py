"""OIDC signature/issuer/audience tests with a fresh ephemeral RSA test key.

No network access or real credentials are involved in these tests.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID
import base64
import json

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app import security
from app.security import Operator, decode_operator_token, require_role

ISSUER = "https://identity.example.test/realm/aegis"
AUDIENCE = "aegis-resource-server"
AGENCY = "11111111-1111-4111-8111-111111111111"


@pytest.fixture()
def signed_jwt(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("OIDC_ISSUER", ISSUER)
    monkeypatch.setenv("OIDC_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("OIDC_JWKS_URL", ISSUER + "/protocol/openid-connect/certs")
    monkeypatch.setattr(
        security,
        "_jwk_client",
        lambda _url: SimpleNamespace(
            get_signing_key_from_jwt=lambda _jwt: SimpleNamespace(key=key.public_key())
        ),
    )

    def sign(**changes):
        now = datetime.now(timezone.utc)
        payload = {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": "operator-001",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
            "aegis_roles": ["incident_operator"],
            "aegis_agency_id": AGENCY,
        }
        payload.update(changes)
        return jwt.encode(payload, key, algorithm="RS256", headers={"kid": "test-rotation-key"})

    return sign


def test_valid_signed_operator_identity(signed_jwt):
    result = decode_operator_token(signed_jwt())
    assert result.subject == "operator-001"
    assert result.agency_id == UUID(AGENCY)
    assert result.roles == frozenset({"incident_operator"})


@pytest.mark.parametrize(
    "claim, value",
    [
        ("iss", "https://attacker.example.test"),
        ("aud", "other-api"),
        ("exp", 1),
        ("aegis_agency_id", "arbitrary-agency"),
        ("aegis_roles", ["superuser"]),
        ("aegis_roles", "incident_operator"),
        ("sub", ""),
    ],
)
def test_invalid_claims_fail_closed(signed_jwt, claim, value):
    with pytest.raises(HTTPException) as exc:
        decode_operator_token(signed_jwt(**{claim: value}))
    assert exc.value.status_code in (401, 403)


def test_payload_tampering_breaks_signature(signed_jwt):
    original = signed_jwt()
    header, payload, signature = original.split(".")
    parsed = jwt.decode(original, options={"verify_signature": False})
    parsed["aegis_roles"] = ["incident_checker"]
    tampered = base64.urlsafe_b64encode(
        json.dumps(parsed, separators=(",", ":")).encode()
    ).rstrip(b"=").decode()
    with pytest.raises(HTTPException) as exc:
        decode_operator_token(".".join((header, tampered, signature)))
    assert exc.value.status_code == 401


def test_unsigned_token_rejected(signed_jwt):
    claims = jwt.decode(signed_jwt(), options={"verify_signature": False})
    unsigned = jwt.encode(claims, key="", algorithm="none")
    with pytest.raises(HTTPException) as exc:
        decode_operator_token(unsigned)
    assert exc.value.status_code == 401


def test_role_policy_prevents_privilege_escalation():
    operator = Operator("operator-001", UUID(AGENCY), frozenset({"incident_operator"}))
    require_role(operator, {"incident_operator"})
    with pytest.raises(HTTPException) as exc:
        require_role(operator, {"incident_checker"})
    assert exc.value.status_code == 403


def test_oidc_configuration_missing_is_unavailable(monkeypatch):
    for name in ("OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(HTTPException) as exc:
        security.decode_operator_token("test-token")
    assert exc.value.status_code == 503
