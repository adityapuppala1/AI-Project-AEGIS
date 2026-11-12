"""Public intake quarantine tests; storage is mocked, no database or network is used."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import public_intake
from app.main import app
# Formerly open read routes now need a verified exercise-agency operator (tests/conftest.py).
pytestmark = pytest.mark.usefixtures("exercise_reader")

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[3]
VALID = {"title": "Water rising near the bridge", "description": "Knee-deep water on the main road since morning.",
         "hazard_type": "waterlogging", "lat": 17.4, "lon": 78.5}


@pytest.fixture(autouse=True)
def store(monkeypatch):
    public_intake.reset_rate_limit()
    monkeypatch.setenv("AEGIS_PUBLIC_INTAKE", "1")
    state = {"inserted": [], "recent": 0, "fail": False, "duplicate": False, "exists": False}

    def insert(report, digest):
        if state["fail"]:
            raise RuntimeError("password=secret host=db")
        if state["duplicate"]:
            return {"duplicate": True}
        state["inserted"].append((report, digest))
        return {"id": "11111111-1111-4111-8111-111111111111", "submitted_at": "2026-11-02T10:00:00+00:00",
                "duplicate": False}
    monkeypatch.setattr(public_intake, "insert_report", insert)
    monkeypatch.setattr(public_intake, "already_received", lambda digest: state["exists"])
    monkeypatch.setattr(public_intake, "recent_count", lambda: state["recent"])
    monkeypatch.setattr(public_intake, "list_reports", lambda limit: {"total": 1, "reports": [
        {"id": "x", "submitted_at": "2026-11-02T10:00:00+00:00", "title": "t", "description": "d", "hazard_type": "flood",
         "lat": 17.4, "lon": 78.5, "status": "quarantined"}][:limit]})
    yield state
    public_intake.reset_rate_limit()


def post(body=None, raw=None):
    data = raw if raw is not None else json.dumps(body if body is not None else VALID).encode()
    return client.post("/v1/public-intake/reports", content=data, headers={"content-type": "application/json"})


def test_disabled_by_default(monkeypatch, store):
    monkeypatch.delenv("AEGIS_PUBLIC_INTAKE")
    assert post().status_code == 503
    assert client.get("/v1/public-intake/reports").status_code == 503
    status = client.get("/v1/public-intake/status").json()
    assert status["enabled"] is False and status["creates_cases"] is False and status["notifies_responders"] is False
    assert store["inserted"] == []


def test_valid_report_is_quarantined_only(store):
    response = post()
    body = response.json()
    assert response.status_code == 201 and body["status"] == "quarantined" and body["classification"] == "public_unverified_intake"
    assert "no case" in body["message"] and body["duplicate"] is False
    report, digest = store["inserted"][0]
    assert report.hazard_type == "waterlogging" and len(digest) == 64


@pytest.mark.parametrize("override", [
    {"phone": "9876543210"}, {"email": "a@b.com"}, {"id": "x"}, {"status": "verified"}, {"incident_id": "x"},
])
def test_unknown_fields_are_rejected(store, override):
    assert post({**VALID, **override}).status_code == 422 and store["inserted"] == []


@pytest.mark.parametrize("text", [
    "Call me on 98765 43210 please", "contact: someone@example.com about it", "see https://example.org/photo now",
    "photos at www.example.in please", "reach me +91 (98765) 43210 anytime", "mail user @ host . com today for details",
])
def test_contact_details_and_links_are_rejected(store, text):
    response = post({**VALID, "description": text + " water is rising"})
    assert response.status_code == 422 and "personal contact details" in response.json()["detail"]
    assert store["inserted"] == []


@pytest.mark.parametrize("patch", [
    {"lat": 51}, {"lat": 4.9}, {"lon": 101}, {"lon": 64}, {"hazard_type": "alien"}, {"title": "ab"},
    {"description": "short"}, {"title": "x" * 101}, {"description": "y" * 1001}, {"lat": "north"},
])
def test_out_of_range_or_invalid_fields_are_rejected(store, patch):
    assert post({**VALID, **patch}).status_code == 422 and store["inserted"] == []


def test_contact_filters_stay_fast_on_worst_case_input(store):
    import time
    for text in ("a" * 990, "a." * 495, "1 " * 495, "a@" + "b." * 490, "1" + " " * 990, "@" * 990, ("1 (" * 330)):
        started = time.perf_counter()
        post({**VALID, "description": text})
        assert time.perf_counter() - started < 0.5, text[:20]


def test_nan_and_malformed_bodies_are_rejected(store):
    assert post(raw=b'{"title":"Water rising","description":"Water on the road here","hazard_type":"flood","lat":NaN,"lon":78}').status_code == 422
    assert post(raw=b"not json").status_code == 422
    assert post(raw=b"[]").status_code == 422
    assert store["inserted"] == []


def test_control_characters_are_removed(store):
    post({**VALID, "title": "Water\x00 rising\x07 here"})
    assert store["inserted"][0][0].title == "Water rising here"


def test_oversized_body_is_refused(store):
    assert post(raw=b"x" * 5000).status_code == 413 and store["inserted"] == []


def test_rate_limit_applies_per_minute(store):
    codes = [post({**VALID, "title": f"Report number {i}"}).status_code for i in range(7)]
    assert codes[:5] == [201] * 5 and codes[5:] == [429, 429]
    assert post().headers.get("retry-after") == "60"


def test_daily_cap_does_not_lock_out_permanently(store):
    store["recent"] = public_intake.MAX_PER_DAY
    response = post()
    assert response.status_code == 429 and response.headers["retry-after"] == "3600"
    store["recent"] = 0
    public_intake.reset_rate_limit()
    assert post().status_code == 201


def test_known_duplicates_are_generic_and_use_no_rate_limit_slot(store):
    store["exists"] = True
    for _ in range(8):
        body = post().json()
        assert body["duplicate"] is True and "id" not in body and "submitted_at" not in body
    store["exists"] = False
    assert post({**VALID, "title": "A different report"}).status_code == 201


def test_concurrent_duplicate_insert_is_also_generic(store):
    store["duplicate"] = True
    body = post().json()
    assert body["duplicate"] is True and "id" not in body and "submitted_at" not in body


@pytest.mark.parametrize("text", [
    "call 98765, 43210 now", "call 98765/43210 now", "call 9876​543210 now", "call ９８７６５ ４３２１０ now",
    "call nine eight seven six five four three two one zero now", "mail user＠gmail．com now",
    "mail user [at] gmail [dot] com now", "mail user (at) gmail (dot) com now", "join t.me/groupname now", "open bit.ly/abc123 now",
    "open example。com now", "open hxxps://evil now", "write me at someone@example.com", "open wa.me/919876543210 now",
])
def test_normalised_and_obfuscated_contact_details_are_rejected(store, text):
    response = post({**VALID, "description": text + " the water is rising"})
    assert response.status_code == 422 and "personal contact details" in response.json()["detail"], text
    assert store["inserted"] == []


def test_ordinary_reports_are_not_blocked(store):
    for text in ("Water is knee deep near the market and rising slowly since morning",
                 "Two cars are stuck under the flyover and the drain is blocked",
                 "About 3 feet of water on the road, around 40 people waiting"):
        assert post({**VALID, "description": text, "title": "Water on the road"}).status_code == 201, text


def test_content_is_normalised_before_storage(store):
    post({**VALID, "title": "Water​ rising here"})
    assert store["inserted"][0][0].title == "Water rising here"


@pytest.mark.parametrize("content_type", ["text/plain", "application/x-www-form-urlencoded", "", "multipart/form-data"])
def test_cross_site_simple_content_types_are_refused(store, content_type):
    response = client.post("/v1/public-intake/reports", content=json.dumps(VALID).encode(), headers={"content-type": content_type})
    assert response.status_code == 415 and store["inserted"] == []


def test_json_content_type_with_charset_is_accepted(store):
    response = client.post("/v1/public-intake/reports", content=json.dumps(VALID).encode(), headers={"content-type": "Application/JSON; charset=utf-8"})
    assert response.status_code == 201


def test_chunked_oversized_body_is_cut_off(store):
    def chunks():
        for _ in range(10):
            yield b"x" * 1024
    response = client.post("/v1/public-intake/reports", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413 and store["inserted"] == []


def test_storage_failure_is_generic(store):
    store["fail"] = True
    response = post()
    assert response.status_code == 503 and "secret" not in response.text and "password" not in response.text


def test_queue_is_read_only_and_bounded(store):
    body = client.get("/v1/public-intake/reports?limit=10").json()
    assert body["quarantine_only"] is True and body["creates_cases"] is False and body["reports"][0]["status"] == "quarantined"
    assert client.get("/v1/public-intake/reports?limit=0").status_code == 422
    assert client.get("/v1/public-intake/reports?limit=101").status_code == 422
    assert client.put("/v1/public-intake/reports").status_code == 405
    assert client.delete("/v1/public-intake/reports").status_code == 405


def test_migration_is_additive_quarantine_with_no_identity_columns():
    sql = (ROOT / "db/migrations/011_public_intake_quarantine.sql").read_text().lower()
    assert "create table if not exists public_intake_reports" in sql and "before update" in sql
    for forbidden in ("drop table", "alter table", "truncate", "email", "phone", "name text", "contact"):
        assert forbidden not in sql.replace("-- opt-in", "").split("create table", 1)[1], forbidden
    assert "status = 'quarantined'" in sql


def test_base_compose_keeps_public_features_off_and_overrides_enable_them():
    base = (ROOT / "compose.yaml").read_text()
    assert "AEGIS_PUBLIC_INTAKE" not in base and "AEGIS_PUBLIC_EARTH_FEEDS" not in base
    assert "-f /public-intake.sql" in base and "011_public_intake_quarantine.sql:/public-intake.sql" in base
    assert 'AEGIS_PUBLIC_INTAKE: "1"' in (ROOT / "compose.public-intake.yaml").read_text()
    assert 'AEGIS_PUBLIC_EARTH_FEEDS: "1"' in (ROOT / "compose.public-earth.yaml").read_text()
    script = (ROOT / "scripts/start-windows.ps1").read_text()
    assert "compose.public-intake.yaml" in script and "compose.public-earth.yaml" in script
    assert script.count("-f compose.") >= 3  # base + opt-in overlays only through explicit switches


def test_intake_module_never_touches_case_or_task_tables():
    source = (ROOT / "services/api/app/public_intake.py").read_text()
    for table in ("incidents", "exercise_agency_tasks", "exercise_data_sources", "proposals", "audit"):
        assert f"FROM {table}" not in source and f"INTO {table}" not in source and f"UPDATE {table}" not in source
