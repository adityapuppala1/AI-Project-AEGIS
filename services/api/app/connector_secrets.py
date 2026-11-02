"""Write-only connector secrets: AES-256-GCM with the AEGIS_CONNECTOR_KEY master key.

Fails closed when the key is missing or malformed. Plaintext is never logged, persisted
or returned; callers only ever see `set` and an 8-hex SHA-256 fingerprint.
"""
import base64
import binascii
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_VERSION = 1


class ConnectorKeyMissing(RuntimeError):
    pass


class SecretUnreadable(RuntimeError):
    pass


def _key() -> bytes:
    raw = os.environ.get("AEGIS_CONNECTOR_KEY", "").strip()
    if not raw:
        raise ConnectorKeyMissing("connector_key_missing")
    try:
        key = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise ConnectorKeyMissing("connector_key_malformed") from None
    if len(key) != 32:
        raise ConnectorKeyMissing("connector_key_malformed")
    return key


def master_key_configured() -> bool:
    try:
        _key()
        return True
    except ConnectorKeyMissing:
        return False


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:8]


def _aad(connector_id: str, key_name: str) -> bytes:
    return f"aegis.connector.v{KEY_VERSION}:{connector_id}:{key_name}".encode()


def encrypt(value: str, connector_id: str, key_name: str) -> tuple[bytes, bytes]:
    """Return (ciphertext, nonce); the secret is bound to its connector and field name."""
    key = _key()
    nonce = os.urandom(12)
    return AESGCM(key).encrypt(nonce, value.encode(), _aad(connector_id, key_name)), nonce


def decrypt(ciphertext: bytes, nonce: bytes, connector_id: str, key_name: str) -> str:
    key = _key()
    try:
        return AESGCM(key).decrypt(bytes(nonce), bytes(ciphertext), _aad(connector_id, key_name)).decode()
    except (InvalidTag, ValueError, UnicodeDecodeError):
        raise SecretUnreadable("connector_secret_unreadable") from None
