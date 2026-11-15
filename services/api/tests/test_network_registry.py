"""Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md): roles, agency, validation, version check, soft
delete, audit, credentials never returned, lanes view and migration shape.

Test doubles stand in for verified tokens and the database; they never establish real sign-in.
"""
import base64
import logging
import os
import re
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import network_catalogue, network_registry_store as nstore
from app.main import app
from app.security import FIXTURE_AGENCY_DETAIL, Operator, get_operator

EXERCISE_AGENCY = UUID("11111111-1111-4111-8111-111111111111")
OTHER_AGENCY = UUID("22222222-2222-4222-8222-222222222222")
client = TestClient(app, raise_server_exceptions=False)
BASE = "/v1/admin/networks"
ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("OIDC_ISSUER", "https://identity.example.test/realm/aegis")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-resource-server")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://identity.example.test/realm/aegis/certs")
    monkeypatch.setenv("AEGIS_CONNECTOR_KEY", base64.b64encode(os.urandom(32)).decode())
    store = nstore.MemoryStore()
    nstore.set_store(store)
    as_role("platform_admin")
    yield store
    app.dependency_overrides.pop(get_operator, None)
    nstore.set_store(None)


def as_role(*roles, agency=EXERCISE_AGENCY, subject="net-admin"):
    app.dependency_overrides[get_operator] = lambda: Operator(subject, agency, frozenset(roles))


def provider(**over):
    body = {"code": "test_sat", "display_name": "Test Satellite", "kind": "satellite", "orbit_class": "leo",
            "constellation_group": "oneweb", "bands": ["Ku", "L"], "monogram": "TS", "colour_token": "c2"}
    body.update(over)
    return body


def create(**over):
    response = client.post(BASE + "/providers", json=provider(**over))
    assert response.status_code == 201, response.text
    return response.json()


# --- roles and agency ---------------------------------------------------------------------------------------------

WRITE_CALLS = [("post", BASE + "/providers", provider()), ("get", BASE, None), ("get", BASE + "/audit", None),
               ("post", BASE + "/assets", {"provider_id": "6e570000-0000-4000-8000-000000000001",
                                           "asset_type": "tower", "label": "Tower"})]


@pytest.mark.parametrize("role", ["incident_operator", "incident_checker", "incident_auditor", "department_operator",
                                  "response_team"])
@pytest.mark.parametrize("method,path,body", WRITE_CALLS)
def test_non_admin_roles_are_refused(role, method, path, body):
    as_role(role)
    response = getattr(client, method)(path, **({"json": body} if body else {}))
    assert response.status_code == 403


def test_other_agency_admin_gets_fixed_403():
    as_role("platform_admin", agency=OTHER_AGENCY)
    response = client.get(BASE)
    assert response.status_code == 403 and response.json()["detail"] == FIXTURE_AGENCY_DETAIL


def test_signed_out_is_refused():
    app.dependency_overrides.pop(get_operator, None)
    assert client.get(BASE).status_code in (401, 503)
    assert client.get("/v1/network-lanes").status_code in (401, 503)


# --- create / update / validation ---------------------------------------------------------------------------------

def test_create_lists_and_audits(configured):
    row = create(mcc_mnc=["404-10", "404-10"], asn=[9498])
    assert row["version"] == 1 and row["enabled"] is False and row["mcc_mnc"] == ["404-10"]
    assert row["bands"] == ["L", "Ku"]
    listed = client.get(BASE).json()
    assert [p["code"] for p in listed["providers"]] == ["test_sat"]
    assert "links" in listed["catalogue"] and listed["reference_adapter"]["available"] is False
    audit = client.get(BASE + "/audit").json()["rows"]
    assert audit[0]["action"] == "create" and audit[0]["actor"] == "net-admin" and audit[0]["to_version"] == 1


def test_terrestrial_provider_drops_orbit_fields():
    row = create(code="tel", kind="terrestrial_mobile")
    assert row["orbit_class"] is None and row["constellation_group"] is None


def test_duplicate_code_is_refused():
    create()
    response = client.post(BASE + "/providers", json=provider())
    assert response.status_code == 409 and response.json()["detail"] == "network_code_taken"


@pytest.mark.parametrize("over", [
    {"code": "Bad Code"}, {"code": "x"}, {"display_name": "A"}, {"display_name": "Bad\x00Name"},
    {"display_name": "Bidi‮Name"}, {"kind": "drone"}, {"orbit_class": "heo"}, {"constellation_group": "kuiper"},
    {"mcc_mnc": ["40410"]}, {"asn": [0]}, {"bands": ["X"]}, {"monogram": "abcd"}, {"colour_token": "red"},
    {"logo_key": "isro"}, {"doc_link_id": "https://evil.example"}, {"doc_link_id": "unknown_link"},
    {"notes": "x" * 501}, {"api_base": "https://evil.example"}, {"rehearsal_capacity_kbps": -1},
    {"enabled": True},
])
def test_invalid_fields_are_refused(over):
    response = client.post(BASE + "/providers", json=provider(**over))
    assert response.status_code == 422


def test_update_needs_current_version_and_records_changed_fields(configured):
    row = create()
    stale = client.put(f"{BASE}/providers/{row['id']}", json={**provider(display_name="Renamed"), "expected_version": 0})
    assert stale.status_code == 409 and stale.json()["detail"] == "network_version_conflict"
    ok = client.put(f"{BASE}/providers/{row['id']}", json={**provider(display_name="Renamed"), "expected_version": 1})
    assert ok.status_code == 200 and ok.json()["version"] == 2 and ok.json()["display_name"] == "Renamed"
    assert configured.audit[-1]["changed_fields"] == ["display_name"]


def test_unknown_or_malformed_id_is_404():
    assert client.post(f"{BASE}/providers/6e570000-0000-4000-8000-0000000000ff/enable",
                       json={"expected_version": 1}).status_code == 404
    assert client.post(f"{BASE}/providers/not-a-uuid/enable", json={"expected_version": 1}).status_code == 404


# --- enable / disable / delete / restore --------------------------------------------------------------------------

def test_enable_disable_delete_restore_cycle(configured):
    row = create()
    pid = row["id"]
    assert client.post(f"{BASE}/providers/{pid}/enable", json={"expected_version": 1}).json()["enabled"] is True
    assert client.post(f"{BASE}/providers/{pid}/disable", json={"expected_version": 2}).json()["enabled"] is False
    deleted = client.post(f"{BASE}/providers/{pid}/delete", json={"expected_version": 3})
    assert deleted.status_code == 200 and deleted.json()["deleted_at"]
    assert client.get(BASE).json()["providers"] == []
    assert len(client.get(BASE + "?include_deleted=true").json()["providers"]) == 1
    refused = client.post(f"{BASE}/providers/{pid}/enable", json={"expected_version": 4})
    assert refused.status_code == 409 and refused.json()["detail"] == "network_deleted"
    restored = client.post(f"{BASE}/providers/{pid}/restore", json={"expected_version": 4})
    assert restored.status_code == 200 and restored.json()["deleted_at"] is None and restored.json()["enabled"] is False
    again = client.post(f"{BASE}/providers/{pid}/restore", json={"expected_version": 5})
    assert again.json()["detail"] == "network_not_deleted"
    assert [a["action"] for a in configured.audit] == ["create", "enable", "disable", "delete", "restore"]


def test_no_hard_delete_route():
    row = create()
    assert client.delete(f"{BASE}/providers/{row['id']}").status_code == 405


def test_failed_write_leaves_no_audit(configured):
    row = create()
    configured.fail = True
    assert client.post(f"{BASE}/providers/{row['id']}/enable", json={"expected_version": 1}).status_code == 503
    configured.fail = False
    assert len(configured.audit) == 1


def test_rehearsal_state(configured):
    row = create()
    response = client.put(f"{BASE}/providers/{row['id']}/rehearsal",
                          json={"state": "degraded", "capacity_kbps": 120, "expected_version": 1})
    assert response.json()["rehearsal_state"] == "degraded" and response.json()["rehearsal_capacity_kbps"] == 120
    assert client.put(f"{BASE}/providers/{row['id']}/rehearsal",
                      json={"state": "offline", "capacity_kbps": 1, "expected_version": 2}).status_code == 422


# --- credentials --------------------------------------------------------------------------------------------------

def test_credential_is_never_returned_or_logged(configured, caplog):
    caplog.set_level(logging.DEBUG)
    row = create()
    secret = "sk-very-secret-value-123"
    response = client.put(f"{BASE}/providers/{row['id']}/credential", json={"value": secret, "expected_version": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["has_credential"] is True and re.fullmatch(r"[0-9a-f]{8}", body["credential_fingerprint"])
    for text in (response.text, client.get(BASE).text, client.get(BASE + "/audit").text, caplog.text):
        assert secret not in text and "credential_ciphertext" not in text and "credential_nonce" not in text
    stored = next(iter(configured.rows["provider"].values()))
    assert stored["credential_ciphertext"] and secret.encode() not in stored["credential_ciphertext"]
    assert configured.audit[-1]["changed_fields"] == ["credential_fingerprint"]
    cleared = client.post(f"{BASE}/providers/{row['id']}/credential/clear", json={"expected_version": 2})
    assert cleared.json()["has_credential"] is False


def test_credential_needs_master_key(monkeypatch):
    row = create()
    monkeypatch.delenv("AEGIS_CONNECTOR_KEY")
    response = client.put(f"{BASE}/providers/{row['id']}/credential", json={"value": "x", "expected_version": 1})
    assert response.status_code == 503 and response.json()["detail"] == "network_credential_store_not_ready"


# --- assets -------------------------------------------------------------------------------------------------------

def test_asset_crud_and_bounds(configured):
    pid = create()["id"]
    bad = client.post(BASE + "/assets", json={"provider_id": pid, "asset_type": "tower", "label": "T", "latitude": 51.5,
                                              "longitude": 0.1})
    assert bad.status_code == 422
    half = client.post(BASE + "/assets", json={"provider_id": pid, "asset_type": "tower", "label": "Tower", "latitude": 17.4})
    assert half.status_code == 422
    ok = client.post(BASE + "/assets", json={"provider_id": pid, "asset_type": "tower", "label": "Synthetic tower",
                                             "latitude": 17.4, "longitude": 78.5})
    assert ok.status_code == 201 and ok.json()["synthetic"] is True
    aid = ok.json()["id"]
    upd = client.put(f"{BASE}/assets/{aid}", json={"provider_id": pid, "asset_type": "tower", "label": "Renamed tower",
                                                   "latitude": 17.4, "longitude": 78.5, "expected_version": 1})
    assert upd.status_code == 200 and upd.json()["label"] == "Renamed tower"
    assert client.post(f"{BASE}/assets/{aid}/delete", json={"expected_version": 2}).status_code == 200
    assert client.get(BASE).json()["assets"] == []


def test_asset_needs_live_provider():
    missing = client.post(BASE + "/assets", json={"provider_id": "6e570000-0000-4000-8000-0000000000ff",
                                                  "asset_type": "tower", "label": "Tower"})
    assert missing.status_code == 404


# --- lanes view ---------------------------------------------------------------------------------------------------

def test_lanes_give_names_and_states_only_to_every_exercise_role():
    row = create(notes="internal note", mcc_mnc=["404-10"])
    client.put(f"{BASE}/providers/{row['id']}/credential", json={"value": "secret", "expected_version": 1})
    client.post(f"{BASE}/providers/{row['id']}/enable", json={"expected_version": 2})
    create(code="off_one")
    for role in ("incident_operator", "response_team", "department_operator", "platform_admin"):
        as_role(role)
        lanes = client.get("/v1/network-lanes").json()["lanes"]
        assert [lane["code"] for lane in lanes] == ["test_sat"]
        assert set(lanes[0]) == {"code", "display_name", "kind", "monogram", "colour_token", "logo_key",
                                 "rehearsal_state", "rehearsal_capacity_kbps"}
    as_role("incident_operator", agency=OTHER_AGENCY)
    assert client.get("/v1/network-lanes").status_code == 403


# --- catalogue and migration --------------------------------------------------------------------------------------

def test_catalogue_links_are_https_and_closed():
    for link in network_catalogue.DOC_LINKS.values():
        assert link["url"].startswith("https://") and link["kind"] in {"api_docs", "partner_portal", "spec_document"}
    assert network_catalogue.LOGO_KEYS == {"spacex", "airtel", "jio"}


def test_migration_is_additive_seeded_as_reference_and_mounted():
    sql = (ROOT / "db/migrations/021_network_registry.sql").read_text(encoding="utf-8")
    assert "DROP " not in sql.upper() and "TRUNCATE network" not in sql
    assert sql.count("ON CONFLICT DO NOTHING") == 2 and "append-only" in sql
    seeded = re.findall(r"\('6e570000[^\n]*", sql)
    assert len(seeded) == 21 and all(line.rstrip().rstrip(",").endswith("true)") for line in seeded)
    for link in re.findall(r"'([a-z_]+)', true\)", sql):
        assert link in network_catalogue.DOC_LINKS
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
    assert "021_network_registry.sql:/docker-entrypoint-initdb.d/026-network-registry.sql" in compose
    assert "-f /network-registry.sql" in compose
