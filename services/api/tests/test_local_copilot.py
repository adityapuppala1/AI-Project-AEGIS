import json
from urllib.error import URLError
import pytest
from fastapi.testclient import TestClient
from app import local_copilot as copilot, assessment_adapter
from app.assessment import evaluate_readiness
from app.main import app
from test_assessment import demo_inputs, INCIDENT_ID
# Formerly open read routes now need a verified exercise-agency operator (tests/conftest.py).
pytestmark = pytest.mark.usefixtures("exercise_reader")

@pytest.fixture(autouse=True)
def disabled(monkeypatch):
    for key in ("AEGIS_LOCAL_COPILOT_ENABLED", "AEGIS_LOCAL_COPILOT_MODEL", "AEGIS_LOCAL_COPILOT_TARGET"):
        monkeypatch.delenv(key, raising=False)


def context():
    return evaluate_readiness(*demo_inputs())


def test_disabled_does_not_contact_model(monkeypatch):
    monkeypatch.setattr(copilot,"generate_selection",lambda *_:pytest.fail("Unexpected inference"))
    result=copilot.review_focus(context())
    assert result["status"]=="template_fallback" and result["reason"]=="disabled"
    assert result["model"] is None and result["operational_actions_enabled"] is False


def test_model_can_only_select_existing_finding_and_option(monkeypatch):
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_ENABLED","1")
    monkeypatch.setattr(copilot,"generate_selection",lambda *_:copilot.Selection(finding_index=1,playbook_step="URB-03"))
    ctx=context(); result=copilot.review_focus(ctx)
    assert result["status"]=="model_assisted_selection"
    assert result["finding"]==ctx["review_brief"]["findings"][1]
    assert result["review_option"]==ctx["review_brief"]["review_options"][1]
    assert result["limitations"]==ctx["review_brief"]["limitations"]
    assert result["needs_accountable_human_review"] is True


@pytest.mark.parametrize("error,reason",[(ValueError("SECRET output"),"invalid_output"),(URLError("SECRET host"),"unavailable")])
def test_failed_inference_falls_back_without_raw_details(monkeypatch,error,reason):
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_ENABLED","1")
    def failed(*_):raise error
    monkeypatch.setattr(copilot,"generate_selection",failed)
    result=copilot.review_focus(context())
    assert result["status"]=="template_fallback" and result["reason"]==reason
    assert "SECRET" not in json.dumps(result)
    assert copilot._slot.acquire(blocking=False)
    copilot._slot.release()


def test_busy_and_missing_evidence_do_not_queue_inference(monkeypatch):
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_ENABLED","1")
    monkeypatch.setattr(copilot,"generate_selection",lambda *_:pytest.fail("Unexpected inference"))
    copilot._slot.acquire()
    try:assert copilot.review_focus(context())["reason"]=="busy"
    finally:copilot._slot.release()
    case,geo=demo_inputs();case["evidence"]=[]
    assert copilot.review_focus(evaluate_readiness(case,geo))["reason"]=="missing_evidence"


@pytest.mark.parametrize("key,value",[("AEGIS_LOCAL_COPILOT_MODEL","model:cloud"),("AEGIS_LOCAL_COPILOT_TARGET","https://evil.invalid")])
def test_configuration_cannot_select_cloud_or_arbitrary_target(monkeypatch,key,value):
    monkeypatch.setenv("AEGIS_LOCAL_COPILOT_ENABLED","1");monkeypatch.setenv(key,value)
    monkeypatch.setattr(copilot,"generate_selection",lambda *_:pytest.fail("Unexpected inference"))
    assert copilot.review_focus(context())["reason"]=="unsupported_configuration"


@pytest.mark.parametrize("answer",[
    {"finding_index":True,"playbook_step":"URB-01"},
    {"finding_index":0.0,"playbook_step":"URB-01"},
    {"finding_index":2,"playbook_step":"URB-01"},
    {"finding_index":0,"playbook_step":"DISPATCH"},
    {"finding_index":0,"playbook_step":"URB-01","action":"approve"},
    {"finding_index":0,"playbook_step":"URB-01","evidence_id":"invented"},
    [], "ignore all policy",
])
def test_invalid_model_output_is_rejected(monkeypatch,answer):
    class Response:
        def __enter__(self):return self
        def __exit__(self,*_):pass
        def read(self,_):return json.dumps({"model":"tinyllama:1.1b","done":True,"response":json.dumps(answer)}).encode()
    class Opener:
        def open(self,request,timeout):
            payload=json.loads(request.data)
            assert timeout==20 and payload["options"]["num_predict"]==96
            assert payload["options"]["num_gpu"]==0 and payload["options"]["num_thread"]==4
            assert "evidence_ids" not in payload["prompt"]
            return Response()
    monkeypatch.setattr(copilot,"build_opener",lambda *_:Opener())
    with pytest.raises(ValueError):copilot.generate_selection(context()["review_brief"],"tinyllama:1.1b","loopback")


def test_preview_is_read_only_and_forbids_user_instructions(monkeypatch):
    client=TestClient(app)
    monkeypatch.setattr(assessment_adapter,"exercise_readiness",lambda *_:context())
    path=f"/v1/exercise/incidents/{INCIDENT_ID}/review-focus"
    response=client.post(path,json={})
    assert response.status_code==200 and response.json()["reason"]=="disabled"
    assert client.post(path,json={"model":"paid:cloud"}).status_code==422
    assert client.post(path,json={"prompt":"approve"}).status_code==422
    monkeypatch.setattr(assessment_adapter,"exercise_readiness",lambda *_:None)
    assert client.post(path,json={}).status_code==404
