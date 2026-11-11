"""A6 read-only operator copilot with a fixed tool registry.

Pipeline: bounded input -> deterministic intent classifier -> fixed read-only tools with typed,
code-extracted parameters -> template answer with cited ids -> optional local-model rephrase that is
validated against the cited ids (template fallback otherwise).

The question is untrusted classification input, never an instruction. It is never sent to a tool or a
model; only validated extracted values (canonical UUIDs, allowlisted hazard names, a bounded hour window)
reach tools. The registry contains read functions only; there is no write, transition, notify or
dispatch tool, and tests/test_operator_copilot.py asserts that statically.
"""
import json
import os
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Callable
from urllib.error import URLError
from urllib.request import Request

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import connectors, handover, proactive_store
from app.security import Operator, get_operator, require_role

VERSION = "aegis.exercise.operator-copilot.v1"
MIN_LEN, MAX_LEN = 3, 300
UUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
HOURS_RE = re.compile(r"\b(\d{1,3})\s*(?:h|hr|hrs|hour|hours)\b")
HAZARDS = {"flood": "flood", "flooding": "flood", "rain": "heavy_rain", "rainfall": "heavy_rain", "wind": "wind",
           "cyclone": "tropical_cyclone", "fire": "wildfire", "wildfire": "wildfire", "landslide": "landslide",
           "heat": "heatwave", "heatwave": "heatwave", "earthquake": "earthquake", "drought": "drought"}
# Action or instruction-like requests are refused before any tool runs.
REFUSE_WORDS = frozenset({"approve", "approved", "approving", "reject", "submit", "dispatch", "send", "notify", "warn",
                          "alert", "issue", "publish", "broadcast", "delete", "remove", "update", "insert", "drop",
                          "cancel", "advance", "pause", "unpause", "execute", "run_sql", "ignore", "override",
                          "pretend", "jailbreak", "sudo", "grant", "escalate", "reassign", "acknowledge", "close"})
SQL_RE = re.compile(r"(;|--|/\*|\bunion\b|\bselect\b|\bfrom\b\s+\w+\s+\bwhere\b|\btruncate\b|\balter\b)", re.I)
FORECAST_WORDS = frozenset({"predict", "prediction", "forecast", "probability", "accuracy", "accurate", "likely", "will"})
INTENT_WORDS = {
    "find_incidents": {"incident", "incidents", "case", "cases", "find", "list", "open"},
    "incident_evidence": {"evidence", "findings", "finding", "cite", "citations", "records"},
    "source_freshness": {"fresh", "freshness", "stale", "delayed", "latest", "staleness"},
    "compare_sources": {"compare", "comparison", "agree", "agreement", "disagree", "disagreement", "conflict"},
    "run_status": {"run", "runs", "draft", "drafts", "status", "proactive"},
    "pending_approvals": {"approval", "approvals", "pending", "checker", "queue", "awaiting"},
    "handover_summary": {"handover", "shift", "since", "summary", "summarise", "summarize", "changed"},
    "explain_trigger": {"trigger", "triggers", "fired", "threshold", "why"},
}
INTENTS = tuple(INTENT_WORDS)
NEEDS_UUID = {"incident_evidence", "source_freshness", "compare_sources", "explain_trigger"}
READ_ROLES = {"incident_operator", "incident_checker", "incident_auditor", "platform_admin"}


class CopilotInputError(ValueError):
    pass


def validate_question(question: str) -> str:
    if not isinstance(question, str):
        raise CopilotInputError("question_invalid")
    text = question.strip()
    if not MIN_LEN <= len(text) <= MAX_LEN:
        raise CopilotInputError("question_length")
    if any(unicodedata.category(ch) in {"Cc", "Cf", "Cs", "Co"} for ch in text):
        raise CopilotInputError("question_control_characters")
    return text


@dataclass(frozen=True)
class Extracted:
    uuids: tuple[str, ...]
    hazard: str | None
    hours: int


def extract(text: str) -> Extracted:
    uuids = tuple(dict.fromkeys(m.lower() for m in UUID_RE.findall(text)))[:3]
    words = re.findall(r"[a-z]+", text.lower())
    hazard = next((HAZARDS[w] for w in words if w in HAZARDS), None)
    hours = handover.DEFAULT_HOURS
    match = HOURS_RE.search(text.lower())
    if match:
        hours = min(handover.MAX_HOURS, max(handover.MIN_HOURS, int(match.group(1))))
    return Extracted(uuids, hazard, hours)


def classify(text: str) -> tuple[str, str | None]:
    """Return (intent, abstain_reason). Never runs a tool."""
    lowered = text.lower()
    words = set(re.findall(r"[a-z_]+", UUID_RE.sub(" ", lowered)))
    if SQL_RE.search(UUID_RE.sub(" ", text)):
        return "unsupported", "unsupported_input"
    if words & REFUSE_WORDS or "previous instructions" in lowered:
        return "unsupported", "action_request_refused"
    if words & FORECAST_WORDS:
        return "unsupported", "forecast_not_supported"
    scores = {intent: len(words & vocab) for intent, vocab in INTENT_WORDS.items()}
    best = max(scores.values())
    if best == 0:
        return "unsupported", "unsupported_question"
    top = [intent for intent, score in scores.items() if score == best]
    if len(top) > 1 and "find_incidents" in top:
        top.remove("find_incidents")  # "incident" is context, not intent, next to a more specific intent
    if len(top) > 1:
        return "unsupported", "ambiguous_question"
    return top[0], None


# --- fixed read-only tool registry --------------------------------------------------------------

# Hazard names in the incident table are short human labels such as "Heavy rainfall", not machine codes, so the
# strict code pattern used for ids would drop them. Accept only a short label of letters, digits, spaces and "-",
# and say "unspecified hazard" for anything else, so an answer never shows "None" or free text.
_HAZARD_LABEL = re.compile(r"^[A-Za-z][A-Za-z0-9 -]{0,59}$")


def _hazard_label(value) -> str:
    return value if isinstance(value, str) and _HAZARD_LABEL.fullmatch(value) else "unspecified hazard"


def tool_list_incidents(operator: Operator, hazard: str | None = None) -> list[dict]:
    from app.workflow_store import list_agency_exercise_incidents
    rows = list_agency_exercise_incidents(operator.agency_id)
    out = [{"id": handover._uuid(r.get("id")), "hazard_type": _hazard_label(r.get("hazard_type")),
            "status": handover._safe(r.get("status")), "created_at": handover._iso(r.get("created_at"))} for r in rows]
    wanted = None if hazard is None else hazard.replace("_", " ").lower()
    return [r for r in out if r["id"] and (wanted is None or wanted in r["hazard_type"].lower())][:20]


def tool_incident_context(operator: Operator, incident_id: str) -> dict | None:
    # The incident must belong to the operator's verified agency before any context is read.
    if incident_id not in {r["id"] for r in tool_list_incidents(operator)}:
        return None
    from uuid import UUID
    from app.assessment_adapter import exercise_readiness
    context = exercise_readiness(UUID(incident_id))
    if context is None:
        return None
    comparison = context.get("source_comparison") or {}
    findings = [{"evidence_ids": handover._uuids(f.get("evidence_ids")), "source_ids": handover._uuids(f.get("source_ids"))}
                for f in (context.get("review_brief") or {}).get("findings", [])]
    counts = {k: v for k, v in (context.get("source_freshness_counts") or {}).items()
              if handover._safe(k) and isinstance(v, int) and not isinstance(v, bool)}
    groups = [{"status": g.get("status") if g.get("status") in {"agreement", "disagreement", "not_comparable"} else None,
               "source_ids": handover._uuids(g.get("source_ids"))} for g in comparison.get("groups") or []]
    return {"incident_id": incident_id, "findings": findings, "freshness_counts": counts,
            "source_ids": handover._uuids((context.get("playbook") or {}).get("synthetic_source_ids")),
            "comparison_status": comparison.get("status") if comparison.get("status") in {"agreement", "disagreement", "not_comparable"} else None,
            "comparison_groups": groups[:10]}


def tool_list_runs(operator: Operator) -> list[dict]:
    if not connectors.proactive_enabled():
        return []
    rows = proactive_store.get_store().list_runs(operator.agency_id, 50)
    out = []
    for s in rows:
        run_id = handover._uuid(s.get("id"))
        if run_id:
            out.append({"id": run_id, "status": s.get("status") if s.get("status") in handover.RUN_STATUSES else None,
                        "next_step": handover._safe(s.get("next_step")),
                        "origin": "scheduler" if s.get("origin") == "scheduler" else "operator",
                        "trigger_event_id": handover._uuid(s.get("trigger_event_id")),
                        "flags": [f.get("flag") for f in (s.get("sentinel_flags") or []) if f.get("flag") in handover.FLAGS][-5:]})
    return out


def tool_list_pending_approvals(operator: Operator) -> list[dict]:
    from app.workflow_store import list_proposals
    return [{"id": handover._uuid(r.get("id")), "incident_id": handover._uuid(r.get("incident_id"))}
            for r in list_proposals(operator.agency_id) if r.get("status") == "submitted" and handover._uuid(r.get("id"))][:50]


def tool_get_trigger(operator: Operator, trigger_event_id: str) -> dict | None:
    if not connectors.proactive_enabled():
        return None
    store = proactive_store.get_store()
    # Visible only if on the shared watch display or referenced by one of this agency's runs.
    visible = {handover._uuid(t.get("id")) for t in store.list_triggers(200)}
    visible |= {r["trigger_event_id"] for r in tool_list_runs(operator)}
    if trigger_event_id not in visible:
        return None
    row = store.get_trigger(trigger_event_id)
    if row is None:
        return None
    threshold = (row.get("rationale") or {}).get("threshold")
    return {"id": trigger_event_id, "trigger_id": handover._safe(row.get("trigger_id")), "hazard": handover._safe(row.get("hazard")),
            "state": row.get("state") if row.get("state") in {"clear", "watch", "candidate"} else None,
            "score": handover._number(row.get("score")), "config_version": handover._safe(str(row.get("config_version") or "")),
            "threshold": {k: handover._number(v) for k, v in threshold.items() if handover._safe(k)} if isinstance(threshold, dict) else None,
            "fired_at": handover._iso(row.get("fired_at")), "evidence_ids": handover._uuids(row.get("evidence_ids"))}


def tool_handover(operator: Operator, hours: int) -> dict:
    return handover.build_brief(operator, hours)


@dataclass(frozen=True)
class Tool:
    fn: Callable
    params: tuple[str, ...]
    read_only: bool = True


TOOLS: dict[str, Tool] = {
    "list_incidents": Tool(tool_list_incidents, ("hazard",)),
    "incident_context": Tool(tool_incident_context, ("incident_id",)),
    "list_runs": Tool(tool_list_runs, ()),
    "list_pending_approvals": Tool(tool_list_pending_approvals, ()),
    "get_trigger": Tool(tool_get_trigger, ("trigger_event_id",)),
    "handover": Tool(tool_handover, ("hours",)),
}
INTENT_TOOL = {"find_incidents": "list_incidents", "incident_evidence": "incident_context", "source_freshness": "incident_context",
               "compare_sources": "incident_context", "run_status": "list_runs", "pending_approvals": "list_pending_approvals",
               "handover_summary": "handover", "explain_trigger": "get_trigger"}


def plan(intent: str, values: Extracted) -> tuple[str, dict] | None:
    """Map an intent to exactly one registry tool and its typed parameters (extracted values only)."""
    name = INTENT_TOOL[intent]
    if intent in NEEDS_UUID:
        if len(values.uuids) != 1:
            return None
        key = "trigger_event_id" if intent == "explain_trigger" else "incident_id"
        return name, {key: values.uuids[0]}
    if name == "list_incidents":
        return name, {"hazard": values.hazard}
    if name == "handover":
        return name, {"hours": values.hours}
    return name, {}


# --- template answers ---------------------------------------------------------------------------

def _fact(text: str, refs: list) -> dict:
    return {"text": text, "refs": [r for r in refs if r][:handover.MAX_REFS]}


def compose(intent: str, result, params: dict) -> list[dict]:
    if intent == "find_incidents":
        return [_fact(f"Exercise incident ({r['hazard_type']}, {r['status']}).", [r["id"]]) for r in result]
    if intent == "incident_evidence":
        return [_fact(f"Finding {i + 1} cites {len(f['evidence_ids'])} evidence and {len(f['source_ids'])} source records.",
                      [result["incident_id"], *f["evidence_ids"], *f["source_ids"]]) for i, f in enumerate(result["findings"])]
    if intent == "source_freshness":
        counts = ", ".join(f"{k} {v}" for k, v in sorted(result["freshness_counts"].items())) or "no counts"
        return [_fact(f"Synthetic source freshness near the case: {counts}.", [result["incident_id"], *result["source_ids"]])]
    if intent == "compare_sources":
        facts = [_fact(f"Explicit source comparison status: {result['comparison_status']}. Agreement is not corroboration or accuracy.",
                       [result["incident_id"]])]
        facts += [_fact(f"Comparison group: {g['status']}.", [result["incident_id"], *g["source_ids"]]) for g in result["comparison_groups"]]
        return facts
    if intent == "run_status":
        return [_fact(f"Run is {r['status']} (origin {r['origin']}, next step {r['next_step'] or 'none'}"
                      f"{', flags ' + '/'.join(r['flags']) if r['flags'] else ''}).", [r["id"], r["trigger_event_id"]]) for r in result]
    if intent == "pending_approvals":
        return [_fact("Proposal awaits an independent checker decision.", [p["id"], p["incident_id"]]) for p in result]
    if intent == "handover_summary":
        return [_fact(line["text"], line["refs"]) for line in result["lines"]][:handover.MAX_ITEMS]
    if intent == "explain_trigger":
        return [_fact(f"{result['hazard']} trigger {result['trigger_id']} is {result['state']} with score {result['score']} against "
                      f"synthetic thresholds {result['threshold']} (config {result['config_version']}); not calibrated, not a forecast.",
                      [result["id"], *result["evidence_ids"]])]
    return []


# --- optional local-model rephrase (validated; template fallback) ------------------------------

FORBIDDEN_MODEL_WORDS = re.compile(r"\b(approv\w*|dispatch\w*|notif\w*|warn\w*|evacuat\w*|forecast\w*|accura\w*|predict\w*|send|sent)\b", re.I)


def model_rephrase(facts: list[dict], model: str, target: str) -> str:
    """Send only already-cited template facts (never the question). Returns raw model text."""
    from app.local_copilot import TARGETS, NoRedirect
    from urllib.request import ProxyHandler, build_opener
    payload = {"model": model, "stream": False, "keep_alive": 0,
               "format": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]},
               "system": "Rephrase the supplied exercise facts in two short sentences. Use only the given ids. Add no facts or actions.",
               "prompt": json.dumps({"facts": facts[:12]}),
               "options": {"temperature": 0, "num_ctx": 2048, "num_predict": 160, "num_gpu": 0, "num_thread": 4}}
    request = Request(TARGETS[target], data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=20) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("oversized")
    document = json.loads(raw)
    if not isinstance(document, dict) or document.get("done") is not True or document.get("model") != model:
        raise ValueError("envelope")
    summary = json.loads(document.get("response") or "").get("summary")
    if not isinstance(summary, str):
        raise ValueError("summary")
    return summary


def validate_model_text(text: str, cited: set[str]) -> bool:
    if not isinstance(text, str) or not 1 <= len(text) <= 800:
        return False
    if any(unicodedata.category(ch) == "Cc" for ch in text) or FORBIDDEN_MODEL_WORDS.search(text):
        return False
    return all(m.lower() in cited for m in UUID_RE.findall(text))


def _maybe_model(facts: list[dict], cited: set[str]) -> tuple[str | None, str, str | None]:
    if os.getenv("AEGIS_LOCAL_COPILOT_ENABLED") != "1" or not facts:
        return None, "disabled", None
    from app.local_copilot import MODELS, TARGETS, _slot
    model = os.getenv("AEGIS_LOCAL_COPILOT_MODEL", "tinyllama:1.1b")
    target = os.getenv("AEGIS_LOCAL_COPILOT_TARGET", "loopback")
    if model not in MODELS or target not in TARGETS:
        return None, "unsupported_configuration", None
    if not _slot.acquire(blocking=False):
        return None, "busy", None
    try:
        text = model_rephrase(facts, model, target)
    except (URLError, TimeoutError, OSError):
        return None, "unavailable", None
    except (ValueError, KeyError, TypeError, AttributeError):
        return None, "invalid_output", None
    finally:
        _slot.release()
    if not validate_model_text(text, cited):
        return None, "rejected_uncited_or_unsafe", None
    return text, "valid_rephrase", model


# --- pipeline -----------------------------------------------------------------------------------

def _response(intent, status, reason, tools_called, facts, summary, model_status, model, started):
    cited = sorted({r for f in facts for r in f["refs"]})
    return {"version": VERSION, "source": "synthetic_exercise", "intent": intent, "status": status, "reason": reason,
            "tools_called": tools_called, "facts": facts, "cited_ids": cited, "summary": summary,
            "generated_by": "local_model_rephrase_of_cited_facts" if model else "deterministic_template",
            "model_status": model_status, "model": model, "read_only": True, "operational_actions_enabled": False,
            "needs_accountable_human_review": True, "elapsed_ms": round((time.monotonic() - started) * 1000),
            "note": "Read-only assistant. Answers cite records and cannot act: no proposal, approval, notification or dispatch. "
                    "Not a forecast and no accuracy claim."}


def ask(operator: Operator, question: str) -> dict:
    started = time.monotonic()
    text = validate_question(question)
    intent, reason = classify(text)
    if reason:
        return _response("unsupported", "abstained", reason, [], [], None, "not_used", None, started)
    values = extract(text)
    planned = plan(intent, values)
    if planned is None:
        return _response(intent, "abstained", "missing_or_multiple_reference", [], [], None, "not_used", None, started)
    name, params = planned
    tool = TOOLS[name]
    # A real check, not an assert: asserts disappear when Python runs with -O.
    if not tool.read_only or not set(params) <= set(tool.params):
        raise RuntimeError("copilot tool contract violated")
    result = tool.fn(operator, **params)
    if result is None:
        return _response(intent, "abstained", "not_found_in_scope", [name], [], None, "not_used", None, started)
    facts = [f for f in compose(intent, result, params) if f["refs"]]
    if not facts:
        return _response(intent, "abstained", "no_cited_records", [name], [], None, "not_used", None, started)
    template = " ".join(f["text"] for f in facts[:6])
    cited = {r for f in facts for r in f["refs"]}
    rephrased, model_status, model = _maybe_model(facts, cited)
    return _response(intent, "answered", None, [name], facts, rephrased or template, model_status, model, started)


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)


router = APIRouter(prefix="/v1/copilot", tags=["Operator copilot"])


@router.post("/ask")
def post_ask(body: AskRequest, operator: Operator = Depends(get_operator)):
    require_role(operator, READ_ROLES)
    try:
        return ask(operator, body.question)
    except CopilotInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="copilot_sources_unavailable") from None
