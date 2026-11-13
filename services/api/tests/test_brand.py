"""Brand settings (docs/BRANDING.md): validation, roles, version check, audit and logo response headers.

Test doubles stand in for verified tokens and the database; they never establish real sign-in.
"""
import base64
import struct
import zlib
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import brand, brand_store
from app.main import app
from app.security import FIXTURE_AGENCY_DETAIL, Operator, get_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")
OTHER_AGENCY = UUID("22222222-2222-4222-8222-222222222222")
client = TestClient(app, raise_server_exceptions=False)


def png(width=4, height=4, trailer=b""):
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    raw = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"") + trailer)


def jpeg(width=8, height=8):
    sof = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sos = b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00"
    return b"\xff\xd8" + app0 + sof + sos + b"\x00" * 40 + b"\xff\xd9"


def webp_vp8x(width=16, height=16):
    body = b"WEBP" + b"VP8X" + struct.pack("<I", 10) + b"\x00\x00\x00\x00" + (width - 1).to_bytes(3, "little") \
        + (height - 1).to_bytes(3, "little")
    return b"RIFF" + struct.pack("<I", len(body)) + body


def webp_lossless(width=16, height=16):
    bits = (width - 1) | ((height - 1) << 14)
    payload = b"\x2f" + bits.to_bytes(4, "little") + b"\x00" * 8
    body = b"WEBP" + b"VP8L" + struct.pack("<I", len(payload)) + payload
    return b"RIFF" + struct.pack("<I", len(body)) + body


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("OIDC_ISSUER", "https://identity.example.test/realm/aegis")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-resource-server")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://identity.example.test/realm/aegis/certs")
    store = brand_store.MemoryStore()
    brand_store.set_store(store)
    brand.clear_cache()
    yield store
    app.dependency_overrides.pop(get_operator, None)
    brand_store.set_store(None)
    brand.clear_cache()


def as_role(*roles, agency=EXERCISE_AGENCY, subject="brand-admin"):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, agency, frozenset(roles))


def signed_out():
    app.dependency_overrides.pop(get_operator, None)


def put_logo(data, version=0, content_type="image/png"):
    return client.put(f"/v1/brand/logo?expected_version={version}", content=data, headers={"Content-Type": content_type})


# --- validation ---------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("name", ["IndTrana", "AB", "Acme & Sons", "O'Neil Ops", "Ops-Desk 2.0", "  Padded Name  "])
def test_valid_names_are_trimmed_and_accepted(name):
    assert brand.validate_name(name) == name.strip()


@pytest.mark.parametrize("name,code", [
    ("A", "brand_name_length"), ("x" * 41, "brand_name_length"), ("   ", "brand_name_length"),
    ("<script>", "brand_name_characters"), ("Name/Path", "brand_name_characters"), ("Brand™", "brand_name_characters"),
    ("తెలుగు", "brand_name_characters"), ("a\"b", "brand_name_characters"), ("...", "brand_name_characters"),
    ("Two  spaces", "brand_name_characters"),
    ("Bad\x00Name", "brand_name_control_character"), ("Line\nBreak", "brand_name_control_character"),
    ("Tab\tName", "brand_name_control_character"), ("Zero\u200bWidth", "brand_name_control_character"),
    ("Bidi\u202eName", "brand_name_control_character"),
])
def test_invalid_names_are_refused_with_fixed_codes(name, code):
    with pytest.raises(brand.BrandError) as error:
        brand.validate_name(name)
    assert error.value.code == code


def test_non_string_name_is_refused():
    with pytest.raises(brand.BrandError):
        brand.validate_name(42)


@pytest.mark.parametrize("data,media", [(png(), "image/png"), (jpeg(), "image/jpeg"), (webp_vp8x(), "image/webp"),
                                        (webp_lossless(), "image/webp")], ids=["png", "jpeg", "webp-vp8x", "webp-vp8l"])
def test_supported_images_are_decided_by_magic_bytes(data, media):
    assert brand.sniff_logo(data) == media


SVG = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>'
GIF = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
ICO = b"\x00\x00\x01\x00\x01\x00\x10\x10\x00\x00\x01\x00\x20\x00" + b"\x00" * 60
HTML = b"<!doctype html><html><script>alert(1)</script></html>"


@pytest.mark.parametrize("data,code", [
    (b"", "brand_logo_empty"),
    (SVG, "brand_logo_unsupported_type"),
    (b"<?xml version='1.0'?>" + SVG, "brand_logo_unsupported_type"),
    (GIF, "brand_logo_unsupported_type"),
    (ICO, "brand_logo_unsupported_type"),
    (HTML, "brand_logo_unsupported_type"),
    (b"BM" + b"\x00" * 60, "brand_logo_unsupported_type"),
    (png()[:40], "brand_logo_malformed"),
    (png(trailer=HTML), "brand_logo_malformed"),
    (b"\x89PNG\r\n\x1a\n" + b"\x00" * 60, "brand_logo_malformed"),
    (jpeg()[:-2], "brand_logo_malformed"),
    (b"\xff\xd8\xff\xda" + b"\x00" * 80 + b"\xff\xd9", "brand_logo_malformed"),
    (b"RIFF" + struct.pack("<I", 999) + b"WEBP" + b"VP8X" + b"\x00" * 20, "brand_logo_malformed"),
    (png(width=5000, height=10), "brand_logo_dimensions"),
    (jpeg(width=10, height=60000), "brand_logo_dimensions"),
    (webp_vp8x(width=9000, height=9000), "brand_logo_dimensions"),
    (png() + b"\x00" * (brand.MAX_LOGO_BYTES + 1), "brand_logo_too_large"),
], ids=lambda value: value if isinstance(value, str) else "file")
def test_rejected_logos_have_fixed_codes(data, code):
    with pytest.raises(brand.BrandError) as error:
        brand.sniff_logo(data)
    assert error.value.code == code


# --- public read ---------------------------------------------------------------------------------------------------

def test_public_read_works_signed_out_and_returns_only_name_and_logo_version():
    signed_out()
    response = client.get("/v1/brand")
    assert response.status_code == 200
    assert response.json() == {"name": "IndTrana", "logo_version": None, "version": 0}


def test_public_read_falls_back_to_defaults_when_the_store_fails(configured):
    configured.fail = True
    signed_out()
    assert client.get("/v1/brand").json() == {"name": "IndTrana", "logo_version": None, "version": 0}


def test_logo_absent_is_404_with_fixed_code():
    signed_out()
    response = client.get("/v1/brand/logo")
    assert response.status_code == 404 and response.json() == {"detail": "brand_logo_not_set"}


def test_logo_is_served_with_stored_type_and_safe_headers():
    as_role("platform_admin")
    data = png()
    assert put_logo(data, content_type="text/html").status_code == 200  # declared type is ignored
    signed_out()
    public = client.get("/v1/brand").json()
    assert public == {"name": "IndTrana", "logo_version": 1, "version": 1}
    response = client.get("/v1/brand/logo")
    assert response.status_code == 200 and response.content == data
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert response.headers["content-disposition"] == 'inline; filename="brand-logo.png"'
    assert response.headers["cache-control"] == "public, max-age=300"
    assert response.headers["etag"] == '"brand-logo-1"'


# --- roles ---------------------------------------------------------------------------------------------------------

WRITES = [
    ("PUT", "/v1/brand/name", {"json": {"name": "Acme", "expected_version": 0}}),
    ("PUT", "/v1/brand/logo?expected_version=0", {"content": png(), "headers": {"Content-Type": "image/png"}}),
    ("POST", "/v1/brand/reset", {"json": {"expected_version": 0}}),
    ("GET", "/v1/brand/audit", {}),
    ("GET", "/v1/brand/settings", {}),
]


@pytest.mark.parametrize("method,path,kwargs", WRITES)
def test_admin_routes_refuse_signed_out_callers(method, path, kwargs):
    signed_out()
    assert client.request(method, path, **kwargs).status_code == 401


@pytest.mark.parametrize("role", ["incident_operator", "incident_checker", "incident_auditor", "department_operator",
                                  "response_team"])
@pytest.mark.parametrize("method,path,kwargs", WRITES)
def test_admin_routes_refuse_every_other_role(role, method, path, kwargs, configured):
    as_role(role)
    response = client.request(method, path, **kwargs)
    assert response.status_code == 403 and response.json() == {"detail": "Insufficient agency role"}
    assert configured.row["version"] == 0 and configured.audit == []


def test_admin_from_another_agency_is_refused():
    as_role("platform_admin", agency=OTHER_AGENCY)
    response = client.put("/v1/brand/name", json={"name": "Acme", "expected_version": 0})
    assert response.status_code == 403 and response.json() == {"detail": FIXTURE_AGENCY_DETAIL}


# --- writes, version check, audit, reset -------------------------------------------------------------------------------

def test_admin_sets_name_and_public_read_follows(configured):
    as_role("platform_admin")
    response = client.put("/v1/brand/name", json={"name": "  Acme Ops  ", "expected_version": 0})
    assert response.status_code == 200
    assert response.json()["name"] == "Acme Ops" and response.json()["version"] == 1
    signed_out()
    assert client.get("/v1/brand").json()["name"] == "Acme Ops"


@pytest.mark.parametrize("name,code", [("<b>x</b>", "brand_name_characters"), ("Bad\x07", "brand_name_control_character"),
                                       ("A", "brand_name_length")])
def test_name_route_refuses_bad_names(name, code, configured):
    as_role("platform_admin")
    response = client.put("/v1/brand/name", json={"name": name, "expected_version": 0})
    assert response.status_code == 422 and response.json() == {"detail": code}
    assert configured.audit == []


def test_name_route_refuses_extra_fields():
    as_role("platform_admin")
    assert client.put("/v1/brand/name", json={"name": "Acme", "expected_version": 0, "logo": "x"}).status_code == 422


@pytest.mark.parametrize("data,status,code", [
    (SVG, 415, "brand_logo_unsupported_type"), (HTML, 415, "brand_logo_unsupported_type"),
    (GIF, 415, "brand_logo_unsupported_type"), (ICO, 415, "brand_logo_unsupported_type"),
    (b"", 422, "brand_logo_empty"), (png(width=5000), 422, "brand_logo_dimensions"),
    (png() + b"\x00" * (brand.MAX_LOGO_BYTES + 1), 413, "brand_logo_too_large"),
], ids=lambda value: value if isinstance(value, str) else str(value) if isinstance(value, int) else "file")
def test_logo_route_refuses_bad_files(data, status, code, configured):
    as_role("platform_admin")
    response = put_logo(data)
    assert response.status_code == status and response.json() == {"detail": code}
    assert configured.row["logo"] is None and configured.audit == []


def test_html_named_as_png_is_refused():
    as_role("platform_admin")
    response = client.put("/v1/brand/logo?expected_version=0", files=None, content=HTML,
                          headers={"Content-Type": "image/png", "Content-Disposition": 'attachment; filename="logo.png"'})
    assert response.status_code == 415 and response.json() == {"detail": "brand_logo_unsupported_type"}


def test_version_conflict_refuses_stale_writes(configured):
    as_role("platform_admin")
    assert client.put("/v1/brand/name", json={"name": "First", "expected_version": 0}).status_code == 200
    stale = client.put("/v1/brand/name", json={"name": "Second", "expected_version": 0})
    assert stale.status_code == 409 and stale.json() == {"detail": "brand_version_conflict"}
    assert put_logo(png(), version=0).status_code == 409
    assert client.post("/v1/brand/reset", json={"expected_version": 0}).status_code == 409
    assert configured.row["name"] == "First" and len(configured.audit) == 1


def test_audit_records_actor_and_never_logo_bytes(configured):
    as_role("platform_admin", subject="admin-subject")
    data = jpeg()
    assert put_logo(data, version=0).status_code == 200
    assert client.put("/v1/brand/name", json={"name": "Acme", "expected_version": 1}).status_code == 200
    rows = client.get("/v1/brand/audit").json()["rows"]
    assert [r["action"] for r in rows] == ["name_set", "logo_set"]
    assert all(r["actor"] == "admin-subject" for r in rows)
    logo_row = rows[1]
    assert logo_row["logo_media_type"] == "image/jpeg" and logo_row["logo_size"] == len(data)
    assert len(logo_row["logo_sha256"]) == 64
    text = repr(configured.audit) + repr(rows)
    assert base64.b64encode(data).decode() not in text and repr(data) not in text
    assert not any(isinstance(v, (bytes, bytearray)) for r in configured.audit for v in r.values())


def test_reset_restores_defaults_and_is_audited(configured):
    as_role("platform_admin")
    client.put("/v1/brand/name", json={"name": "Acme", "expected_version": 0})
    put_logo(webp_vp8x(), version=1)
    response = client.post("/v1/brand/reset", json={"expected_version": 2})
    assert response.status_code == 200 and response.json()["name"] == "IndTrana"
    assert response.json()["logo_version"] is None
    signed_out()
    assert client.get("/v1/brand/logo").status_code == 404
    assert client.get("/v1/brand").json() == {"name": "IndTrana", "logo_version": None, "version": 3}
    assert [r["action"] for r in configured.audit] == ["name_set", "logo_set", "reset"]


def test_store_failure_on_write_is_a_fixed_503(configured):
    as_role("platform_admin")
    configured.fail = True
    response = client.put("/v1/brand/name", json={"name": "Acme", "expected_version": 0})
    assert response.status_code == 503 and response.json() == {"detail": "brand_unavailable"}


# --- cache and conditional logo reads -------------------------------------------------------------------------------

def test_public_read_is_cached_and_every_write_clears_the_cache(configured):
    signed_out()
    assert client.get("/v1/brand").json()["name"] == "IndTrana"
    configured.row["name"] = "Changed Behind"  # a change the cache cannot see (e.g. another process)
    assert client.get("/v1/brand").json()["name"] == "IndTrana"
    as_role("platform_admin")
    assert client.put("/v1/brand/name", json={"name": "Acme", "expected_version": 0}).status_code == 200
    signed_out()
    assert client.get("/v1/brand").json()["name"] == "Acme"
    as_role("platform_admin")
    assert put_logo(png(), version=1).status_code == 200
    signed_out()
    assert client.get("/v1/brand/logo").headers["etag"] == '"brand-logo-2"'
    as_role("platform_admin")
    assert client.post("/v1/brand/reset", json={"expected_version": 2}).status_code == 200
    signed_out()
    assert client.get("/v1/brand/logo").status_code == 404


def test_cache_expires_after_a_few_seconds(configured, monkeypatch):
    signed_out()
    client.get("/v1/brand")
    configured.row["name"] = "Later"
    real = brand.time.monotonic
    monkeypatch.setattr(brand.time, "monotonic", lambda: real() + brand.CACHE_SECONDS + 1)
    assert client.get("/v1/brand").json()["name"] == "Later"


def test_logo_answers_304_for_a_matching_etag():
    as_role("platform_admin")
    put_logo(png(), version=0)
    signed_out()
    response = client.get("/v1/brand/logo", headers={"If-None-Match": '"brand-logo-1"'})
    assert response.status_code == 304 and response.content == b""
    assert response.headers["etag"] == '"brand-logo-1"' and response.headers["x-content-type-options"] == "nosniff"
    assert client.get("/v1/brand/logo", headers={"If-None-Match": '"brand-logo-0"'}).status_code == 200
    assert client.get("/v1/brand/logo", headers={"If-None-Match": 'W/"x", "brand-logo-1"'}).status_code == 304


def test_cap_sender_text_keeps_the_reviewed_template_wording():
    root = Path(__file__).resolve().parents[1] / "app"
    assert '"senderName", "Fictional AEGIS exercise desk"' in (root / "cap_draft.py").read_text(encoding="utf-8")
    assert '"senderName", "AEGIS proactive exercise desk"' in (root / "proactive_cap.py").read_text(encoding="utf-8")


# --- the configured name never reaches outbound text ----------------------------------------------------------------

def test_outbound_modules_do_not_read_the_brand_setting():
    root = Path(__file__).resolve().parents[1] / "app"
    for module in ("staff_messages.py", "cap_draft.py", "proactive_cap.py", "cap_templates.py", "audit360.py"):
        source = (root / module).read_text(encoding="utf-8")
        assert "brand_store" not in source and "from app.brand" not in source and "import brand" not in source


def test_migration_is_additive_and_wired_after_staff_messages():
    root = Path(__file__).resolve().parents[3]
    sql = (root / "db/migrations/019_brand_settings.sql").read_text(encoding="utf-8")
    assert "DROP" not in sql.upper() and "TRUNCATE TABLE" not in sql.upper() and "DELETE FROM" not in sql.upper()
    assert "CREATE TRIGGER brand_audit_no_truncate BEFORE TRUNCATE ON brand_audit" in sql
    assert "FOR EACH STATEMENT EXECUTE FUNCTION brand_audit_append_only()" in sql
    assert "tgname = 'brand_audit_no_truncate'" in sql  # idempotent: added on re-run where 019 already ran
    assert sql.count("CREATE TABLE IF NOT EXISTS") == 2 and "append-only" in sql
    assert "ON CONFLICT (id) DO NOTHING" in sql
    base = (root / "compose.yaml").read_text(encoding="utf-8")
    assert "019_brand_settings.sql:/docker-entrypoint-initdb.d/024-brand-settings.sql" in base
    assert "019_brand_settings.sql:/brand-settings.sql" in base
    assert "-f /staff-messages.sql && psql -h db -U aegis -d aegis -v ON_ERROR_STOP=1 -f /brand-settings.sql" in base
