"""Typesafe Jev judgments over cited evidence (POST https://api.typesafe.ai/v1/systemone).

Jev only selects among code-supplied options and scores; it never writes facts. State carries
evidence ids, values and trigger metadata only, never secrets. When the connector is disabled or
has no key a deterministic test double answers (provider "test_double").
"""
import hashlib
import json

from app import connectors, proactive_store

URL = "https://api.typesafe.ai/v1/systemone"
PLAYBOOK_OPTIONS = {
    "monitor_and_recheck": "Keep watching; re-run the refresh at the next forecast update and compare.",
    "request_field_verification": "Ask an accountable human to verify conditions on the ground before any action.",
    "prepare_exercise_cap_draft": "Prepare an exercise-only CAP file for accountable human review; nothing is sent.",
    "none_escalate": "None of the pre-agreed options fit; escalate to an accountable human.",
}
SEVERITY_LEVELS = [
    "Minimal: values near normal; no disruption expected.",
    "Minor: localised nuisance such as brief waterlogging, gusty wind or a few hotspots; routine services continue.",
    "Significant: disruption to roads or services in several localities; vulnerable people may need help.",
    "Severe: widespread disruption with risk to life or property; heavy rain at or above 64.5 mm/day or equivalent.",
]


class JevError(RuntimeError):
    """Fixed error code only."""


def questions() -> dict:
    return {
        "playbook_option": {"type": "choice", "instructions": "Which pre-agreed playbook option best fits the cited evidence? Choose none_escalate if none fits.",
                            "criteria": dict(PLAYBOOK_OPTIONS)},
        "citation_clean": {"type": "noul", "instructions": "Is every statement in the state supported by a cited evidence id, with no claims beyond the evidence?"},
        "severity_band": {"type": "score", "instructions": "How severe are the conditions described by the cited evidence?",
                          "criteria": list(SEVERITY_LEVELS)},
        "staleness_risk": {"type": "noul", "instructions": "Is the evidence likely too old or incomplete to rely on for this decision?"},
    }


def build_state(trigger: dict, evidence: list[dict], variants: list[dict]) -> dict:
    return {"classification": "synthetic_exercise", "note": "Synthetic rehearsal thresholds, not calibrated.",
            "trigger": {k: trigger.get(k) for k in ("trigger_id", "hazard", "state", "score", "config_version")},
            "threshold": (trigger.get("rationale") or {}).get("threshold"),
            "evidence": [{"id": e["id"], "hazard": e["hazard"], "value": e.get("value"), "unit": e.get("unit"),
                          "observed_at": str(e.get("observed_at")), "stale": bool(e.get("stale"))} for e in evidence[:50]],
            "variants": [{k: v.get(k) for k in ("id", "resulting_state", "score")} for v in variants]}


def request_body(model: str, state: dict) -> dict:
    return {"model": model, "state": state, "questions": questions()}


def _num(value, low=0.0, high=1.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= float(value) <= high:
        raise JevError("invalid_response")
    return float(value)


def parse_response(data) -> dict:
    try:
        answers = data["answers"]
        playbook, citation = answers["playbook_option"], answers["citation_clean"]
        severity, staleness = answers["severity_band"], answers["staleness_risk"]
        choice = playbook["choice"]
        if choice not in PLAYBOOK_OPTIONS:
            raise JevError("invalid_response")
        result = {
            "playbook_option": {"choice": choice, "confidence": _num(playbook["confidence"]),
                                "probabilities": {k: _num(v) for k, v in playbook["probabilities"].items() if k in PLAYBOOK_OPTIONS}},
            "citation_clean": {"noul": _num(citation["noul"])},
            "severity_band": {"score": _num(severity["score"], 0, len(SEVERITY_LEVELS) - 1),
                              "confidence": _num(severity["confidence"]),
                              "probabilities": {str(k): _num(v) for k, v in severity["probabilities"].items()}},
            "staleness_risk": {"noul": _num(staleness["noul"])},
        }
        usage = data.get("usage") or {}
        tokens = usage.get("input_tokens", 0)
        result["input_tokens"] = int(tokens) if isinstance(tokens, int) and not isinstance(tokens, bool) and tokens >= 0 else 0
        return result
    except (KeyError, TypeError, AttributeError):
        raise JevError("invalid_response") from None


def test_double(state: dict) -> dict:
    """Deterministic stand-in derived only from the state; never a real judgment."""
    trigger = state.get("trigger") or {}
    evidence = state.get("evidence") or []
    seed = int(hashlib.sha256(json.dumps(state, sort_keys=True, default=str).encode()).hexdigest()[:8], 16)
    jitter = (seed % 100) / 10000
    choice = {"candidate": "prepare_exercise_cap_draft", "watch": "monitor_and_recheck"}.get(trigger.get("state"), "none_escalate")
    if not evidence:
        choice = "none_escalate"
    confidence = round(0.92 + jitter if evidence else 0.4, 4)
    rest = round((1 - confidence) / (len(PLAYBOOK_OPTIONS) - 1), 4)
    stale = sum(1 for e in evidence if e.get("stale")) / len(evidence) if evidence else 1.0
    band = {"candidate": 3, "watch": 2}.get(trigger.get("state"), 0)
    return {
        "playbook_option": {"choice": choice, "confidence": confidence,
                            "probabilities": {k: confidence if k == choice else rest for k in PLAYBOOK_OPTIONS}},
        "citation_clean": {"noul": 0.97 if evidence else 0.2},
        "severity_band": {"score": float(band), "confidence": 0.8,
                          "probabilities": {str(i): 0.8 if i == band else round(0.2 / 3, 4) for i in range(4)}},
        "staleness_risk": {"noul": round(stale, 4)},
        "input_tokens": 0,
    }


def _post(url: str, body: bytes, key: str) -> tuple[int, bytes]:
    return connectors.bounded_request(url, connectors.REGISTRY["typesafe_jev"]["hosts"], method="POST", data=body,
                                      headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})


def judge(state: dict, actor: str, transport=None) -> dict:
    """Return the judgment with provider and model; raise JevError with a fixed code on failure."""
    config = connectors.effective("typesafe_jev")
    model = config["settings"]["model"]
    key = None
    if config["enabled"]:
        try:
            key = connectors.read_secret("typesafe_jev", "api_key")
        except (connectors.connector_secrets.ConnectorKeyMissing, connectors.connector_secrets.SecretUnreadable):
            key = None
    if not key:
        return {"provider": "test_double", "model": "deterministic-test-double", **test_double(state)}
    store = proactive_store.get_store()
    if store.monthly_input_tokens("typesafe_jev") >= config["settings"]["monthly_input_token_budget"]:
        raise JevError("budget_exhausted")
    body = json.dumps(request_body(model, state)).encode()
    try:
        status, payload = (transport or _post)(URL, body, key)
    except TimeoutError:
        raise JevError("timeout") from None
    except (OSError, ValueError):
        raise JevError("network_error") from None
    if status != 200:
        raise JevError(f"upstream_status_{status}")
    try:
        data = json.loads(payload)
    except ValueError:
        raise JevError("invalid_response") from None
    result = parse_response(data)
    store.add_audit("typesafe_jev", "test", True, {"kind": "judgment", "input_tokens": result["input_tokens"]}, actor)
    return {"provider": "typesafe_jev", "model": str(data.get("model") or model)[:60], **result}
