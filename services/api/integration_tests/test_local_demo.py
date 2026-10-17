"""Opt-in real PostGIS checks; appends labeled synthetic rows, never resets data.

AEGIS_TEST_DATABASE_URL must name a disposable local exercise database.
JWTs are signed by ephemeral TEST keys; this is NOT real IdP/human acceptance.
"""
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import security
from app.doctor import inspect_stack
from app.main import app
from app.migration_audit import inspect_security_schema
from app.intelligence_store import DEMO_AGENCY
from app.scenario_runner import replay_tabletop
from app.replay import load_bundled_fixture
from app.ingestion_store import replay_records

pytestmark = pytest.mark.skipif(not os.getenv("AEGIS_TEST_DATABASE_URL"), reason="Opt-in local PostGIS database required")
CASE = "22222222-2222-4222-8222-222222222222"


def test_postgis_demo_chain_and_negative_authorization(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    assert inspect_stack()["status"] == "ready"  # Exercises real psycopg placeholders.
    assert inspect_security_schema()["status"] == "ready"
    records = load_bundled_fixture()
    linked = replay_records(records, incident_id=UUID(CASE))
    assert linked["linked_evidence"] in {0, 3}
    first_counts = inspect_stack()["fixture_counts"]
    assert replay_records(records, incident_id=UUID(CASE))["linked_evidence"] == 0
    assert inspect_stack()["fixture_counts"] == first_counts
    run = uuid4()
    assert replay_tabletop(run)["accepted_samples"] == 3
    assert replay_tabletop(run)["duplicate_samples"] == 3

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("OIDC_ISSUER", "https://test-issuer.example.test")
    monkeypatch.setenv("OIDC_AUDIENCE", "aegis-test")
    monkeypatch.setenv("OIDC_JWKS_URL", "https://test-issuer.example.test/keys")
    class TestKeys:
        def get_signing_key_from_jwt(self, token):
            return SimpleNamespace(key=private_key.public_key())
    monkeypatch.setattr(security, "_jwk_client", lambda _: TestKeys())
    def headers(subject, agency=DEMO_AGENCY, roles=None):
        now = datetime.now(timezone.utc)
        token = jwt.encode({"sub": subject, "iss": "https://test-issuer.example.test", "aud": "aegis-test",
                            "iat": now, "exp": now + timedelta(minutes=5),
                            "aegis_agency_id": str(agency),
                            "aegis_roles": roles or ["incident_operator", "incident_checker"]}, private_key, algorithm="RS256")
        return {"Authorization": "Bearer " + token}
    maker = headers("integration-maker-" + str(run))
    checker = headers("integration-checker-" + str(run))
    other = headers("integration-other", uuid4())
    with TestClient(app) as client:
        assert client.get("/v1/exercise/proposals").status_code == 401
        ready = client.get(f"/v1/exercise/incidents/{CASE}/readiness").json()
        assert ready["context_state"] == "simulated_context_for_human_review"
        response = client.post("/v1/exercise/proposals", headers=maker, json={
            "incident_id": CASE, "action_type": "prepare_warning",
            "rationale": "SIMULATION: integration test evidence review; no real operations",
        })
        assert response.status_code == 201, response.text
        pid = response.json()["id"]
        path = f"/v1/exercise/proposals/{pid}"
        def change(actor, operation, task_id=None):
            return client.post(path + "/transition", headers=actor, json={"operation": operation, "rationale": "SIMULATION: independent test review", **({"task_id": task_id} if task_id else {})})
        assert client.get(path + "/cap-draft", headers=maker).status_code == 409
        assert change(maker, "prepare_tasks").status_code == 409
        assert change(maker, "submit").status_code == 200
        assert change(maker, "approve").status_code == 409
        assert change(other, "approve").status_code == 404
        assert client.get(path + "/cap-draft", headers=checker).status_code == 409
        assert change(checker, "approve").status_code == 200
        xml = client.get(path + "/cap-draft", headers=maker)
        assert xml.status_code == 200
        assert xml.content == client.get(path + "/cap-draft", headers=checker).content
        assert client.get(path + "/cap-draft", headers=other).status_code == 404
        assert client.get(path + "/cap-draft").status_code == 401
        import xml.etree.ElementTree as ET
        ns = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}
        root = ET.fromstring(xml.content)
        assert root.findtext("c:status", namespaces=ns) == "Draft"
        assert root.findtext("c:scope", namespaces=ns) == "Private"
        assert "EXERCISE DRAFT" in xml.text
        assert change(checker, "approve").status_code == 409
        assert change(other, "prepare_tasks").status_code == 404
        assert change(maker, "prepare_tasks").status_code == 200
        assert change(maker, "prepare_tasks").status_code == 200
        assert change(maker, "close_task", "control_room").status_code == 409
        checker_only = headers("checker-only", roles=["incident_checker"])
        assert change(checker_only, "acknowledge_task", "control_room").status_code == 403
        assert change(other, "acknowledge_task", "control_room").status_code == 404
        assert change(maker, "acknowledge_task", "control_room").status_code == 200
        assert change(maker, "acknowledge_task", "control_room").status_code == 200
        assert change(maker, "close_task", "control_room").status_code == 200
        assert change(maker, "close_task", "control_room").status_code == 200
        assert change(maker, "acknowledge_task", "control_room").status_code == 200
        assert change(maker, "simulate").status_code == 200  # Cannot bypass staged progress.
        assert client.get(path + "/audit", headers=other).status_code == 404
        assert client.get(path + "/audit").status_code == 401
        audit = client.get(path + "/audit", headers=checker).json()
        assert len(audit["decisions"]) == 1
        assert audit["decisions"][0]["checker_subject"] != audit["proposal"]["maker_subject"]
        payload = audit["proposal"]["proposal"]
        cited = payload["response_draft"]["playbook"]["synthetic_evidence_ids"]
        brief = payload["response_draft"]["review_brief"]
        assert brief["findings"][0]["evidence_ids"] == cited
        assert brief["generated_by"] == "deterministic_template_no_model"
        assert brief["operational_actions_enabled"] is False
        replay_ids = {str(uuid5(NAMESPACE_URL, f"aegis-case-replay-evidence:{CASE}:{item['event_id']}"))
                      for item in records[:3]}
        assert replay_ids.issubset(set(cited))
        evidence = client.get(f"/v1/exercise/incidents/{CASE}").json()["evidence"]
        linked_rows = [item for item in evidence if item["id"] in replay_ids]
        assert len(linked_rows) == 3
        assert any(item["quality_status"] == "synthetic_unverified" for item in linked_rows)
        assert all("accepted payload SHA256" in item["summary"] for item in linked_rows)
        assert len(payload["simulation"]["tasks"]) == 3
        assert payload["simulation"]["outbound_messages_sent"] is False
        actions = [e["action"] for e in audit["events"]]
        assert actions.count("prepare_tasks") == actions.count("acknowledge_task") == actions.count("close_task") == 1
        tasks = payload["simulation"]["tasks"]
        assert tasks[0]["state"] == "closed"
        assert [event["kind"] for event in tasks[0]["events"]] == ["prepared", "acknowledged", "closed"]
        assert all(task["state"] == "prepared" for task in tasks[1:])
        assert tasks[0]["events"][1]["actor_subject"] == "integration-maker-" + str(run)
        assert xml.content == client.get(path + "/cap-draft", headers=maker).content
        assert len(audit["events"]) == 6  # XML reads and retry writes add no mutations.
        assert client.post("/v1/live/public-warning", headers=checker).status_code == 403


def test_case_replay_rolls_back_partial_writes(monkeypatch):
    from app import ingestion_store
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    record = {**load_bundled_fixture()[0], "event_id": str(uuid4())}
    before = ingestion_store.ingestion_overview()
    before_samples = inspect_stack()["fixture_counts"]["source_samples"]
    def fail_attachment(*args):
        raise ValueError("Injected evidence write failure")
    monkeypatch.setattr(ingestion_store, "_attach_case_evidence", fail_attachment)
    with pytest.raises(ValueError, match="Injected"):
        ingestion_store.replay_records([{"invalid": str(uuid4())}, record], incident_id=UUID(CASE))
    after = ingestion_store.ingestion_overview()
    assert after["accepted_events"] == before["accepted_events"]
    assert after["quarantine_records"] == before["quarantine_records"]
    assert inspect_stack()["fixture_counts"]["source_samples"] == before_samples
    with pytest.raises(LookupError, match="Synthetic exercise incident"):
        ingestion_store.replay_records([record], incident_id=uuid4())
    assert ingestion_store.ingestion_overview()["accepted_events"] == before["accepted_events"]


def test_new_accepted_event_links_once_without_quality_promotion(monkeypatch):
    from app.intelligence_store import incident_workspace
    from app.ingestion_contract import payload_digest
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    event = {**load_bundled_fixture()[0], "event_id": str(uuid4()),
             "quality_status": "synthetic_unverified",
             "observed_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()}
    conflict = {**event, "metric_value": 123.456}
    wrong_unit = {**event, "event_id": str(uuid4()), "metric_unit": "cm"}
    result = replay_records([event, conflict, wrong_unit], incident_id=UUID(CASE))
    assert result["accepted"] == result["linked_evidence"] == 1
    assert result["quarantined"] == 2
    again = replay_records([event], incident_id=UUID(CASE))
    assert again["accepted"] == again["linked_evidence"] == 0
    evidence_id = str(uuid5(NAMESPACE_URL, f"aegis-case-replay-evidence:{CASE}:{event['event_id']}"))
    case = incident_workspace(UUID(CASE))
    evidence = [row for row in case["evidence"] if row["id"] == evidence_id]
    assert len(evidence) == 1
    assert evidence[0]["quality_status"] == "synthetic_unverified"
    assert datetime.fromisoformat(evidence[0]["observed_at"]) == datetime.fromisoformat(event["observed_at"])
    assert payload_digest(event) in evidence[0]["summary"]
    assert payload_digest(conflict) not in evidence[0]["summary"]
    assert sum(event["event_id"] in row["summary"] for row in case["timeline"]) == 1


def test_private_audit_keeps_one_snapshot_during_checker_commit(monkeypatch):
    """A real second connection commits after the audit reads its proposal row."""
    from app import workflow_store
    from app.governance import Action
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    run = str(uuid4())
    maker, checker = "snapshot-maker-" + run, "snapshot-checker-" + run
    pid = workflow_store.create_proposal(CASE, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                         "SIMULATION: audit snapshot race regression")
    workflow_store.transition(pid, DEMO_AGENCY, maker, "submit")
    real_connect = workflow_store.psycopg.connect
    committed = False

    class CursorProxy:
        def __init__(self, cursor):
            self.cursor = cursor
        def __enter__(self):
            self.cursor.__enter__()
            return self
        def __exit__(self, *args):
            return self.cursor.__exit__(*args)
        def __getattr__(self, name):
            return getattr(self.cursor, name)
        def fetchone(self):
            nonlocal committed
            row = self.cursor.fetchone()
            if not committed and row and row.get("id") == pid:
                committed = True
                with monkeypatch.context() as temporary:
                    temporary.setattr(workflow_store.psycopg, "connect", real_connect)
                    workflow_store.transition(pid, DEMO_AGENCY, checker, "approve",
                                              "SIMULATION: independent checker during audit read")
            return row

    class ConnectionProxy:
        def __init__(self, connection):
            self.connection = connection
        def __enter__(self):
            self.connection.__enter__()
            return self
        def __exit__(self, *args):
            return self.connection.__exit__(*args)
        def cursor(self, *args, **kwargs):
            return CursorProxy(self.connection.cursor(*args, **kwargs))

    with monkeypatch.context() as scope:
        scope.setattr(workflow_store.psycopg, "connect",
                      lambda *args, **kwargs: ConnectionProxy(real_connect(*args, **kwargs)))
        before = workflow_store.proposal_audit(pid, DEMO_AGENCY)
    assert committed
    assert before["proposal"]["status"] == "submitted"
    assert before["decisions"] == []
    assert [event["action"] for event in before["events"]] == ["created", "submit"]
    after = workflow_store.proposal_audit(pid, DEMO_AGENCY)
    assert after["proposal"]["status"] == "approved"
    assert len(after["decisions"]) == 1
    assert [event["action"] for event in after["events"]] == ["created", "submit", "approve"]


def test_legacy_completed_receipt_is_retained(monkeypatch):
    from app import workflow_store
    from app.governance import Action, DecisionError
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    actor = "legacy-maker-" + str(uuid4())
    pid = workflow_store.create_proposal(CASE, DEMO_AGENCY, actor, Action.INTERNAL_TRIAGE,
                                         "SIMULATION: preserve legacy completed receipts")
    workflow_store.transition(pid, DEMO_AGENCY, actor, "submit")
    workflow_store.transition(pid, DEMO_AGENCY, "separate-checker", "approve", "SIMULATION: independent review")
    workflow_store.transition(pid, DEMO_AGENCY, actor, "simulate")
    before = workflow_store.proposal_audit(pid, DEMO_AGENCY)
    workflow_store.transition(pid, DEMO_AGENCY, actor, "prepare_tasks")
    with pytest.raises(DecisionError):
        workflow_store.transition(pid, DEMO_AGENCY, actor, "acknowledge_task", "SIMULATION: no legacy rewrite", task_id="control_room")
    after = workflow_store.proposal_audit(pid, DEMO_AGENCY)
    assert before == after
    assert all(t["state"] == "closed" for t in after["proposal"]["proposal"]["simulation"]["tasks"])


def test_concurrent_task_retries_commit_one_acknowledgement(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from app import workflow_store
    from app.governance import Action
    monkeypatch.setenv("DATABASE_URL", os.environ["AEGIS_TEST_DATABASE_URL"])
    maker = "task-race-maker-" + str(uuid4())
    pid = workflow_store.create_proposal(CASE, DEMO_AGENCY, maker, Action.INTERNAL_TRIAGE,
                                         "SIMULATION: concurrent scripted task retries")
    workflow_store.transition(pid, DEMO_AGENCY, maker, "submit")
    workflow_store.transition(pid, DEMO_AGENCY, "independent-task-checker", "approve", "SIMULATION: approved for local rehearsal")
    workflow_store.transition(pid, DEMO_AGENCY, maker, "prepare_tasks")
    def acknowledge(actor):
        return workflow_store.transition(pid, DEMO_AGENCY, actor, "acknowledge_task",
                                          "SIMULATION: concurrent retry", task_id="control_room")
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(acknowledge, [maker, "second-scoped-test-operator"])) == ["approved", "approved"]
    audit = workflow_store.proposal_audit(pid, DEMO_AGENCY)
    events = audit["proposal"]["proposal"]["simulation"]["tasks"][0]["events"]
    assert len(events) == 2
    assert events[-1]["actor_subject"] in {maker, "second-scoped-test-operator"}
    assert [e["action"] for e in audit["events"]].count("acknowledge_task") == 1
