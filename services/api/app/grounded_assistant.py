"""Bounded evidence guide for the public synthetic exercise context.

The caller may ask free-form questions, but answers are assembled only from the
validated readiness contract. No user text is treated as an instruction and no
model output can introduce facts, citations, tools, or workflow mutations.
"""
import re


def _kind(question: str) -> str:
    words = set(re.findall(r"[a-z]+", question.lower()))
    if words & {"predict", "prediction", "probability", "risk", "depth", "impact", "safe", "severity"}:
        return "unknowns"
    if words & {"source", "sources", "evidence", "citation", "citations", "fresh", "quality"}:
        return "evidence"
    if words & {"draft", "recommend", "response", "option", "playbook", "next", "action"}:
        return "review_options"
    if words & {"summary", "summarize", "situation", "case", "know", "known"}:
        return "summary"
    return "abstain"


def answer_question(context: dict, question: str) -> dict:
    question = question.strip()
    kind = _kind(question)
    brief = context["review_brief"]
    findings = brief["findings"]
    claims = []
    options = []
    if kind in {"summary", "evidence"}:
        claims = [{"text": item["text"], "evidence_ids": item["evidence_ids"],
                   "source_ids": item["source_ids"]} for item in findings]
    elif kind == "review_options":
        # These are labelled review options, not recommendations or actions.
        options = [{"playbook_step": item["playbook_step"], "text": item["text"]}
                   for item in brief["review_options"]]
        claims = [{"text": item["text"], "evidence_ids": item["evidence_ids"],
                   "source_ids": item["source_ids"]} for item in findings]
    elif kind == "unknowns":
        claims = []

    return {
        "version": "aegis.exercise.grounded-guide.v1",
        "incident_id": context["incident_id"],
        "source": "synthetic_exercise",
        "answer_kind": kind,
        "status": "abstained" if kind == "abstain" else "answered",
        "claims": claims,
        "review_options": options,
        "unknowns": context["unknowns"],
        "limitations": brief["limitations"],
        "next_review_step": context["next_review_step"],
        "playbook_version": brief["playbook_version"],
        "context_fingerprint": context["context_fingerprint"],
        "generated_by": "deterministic_grounded_template_no_model",
        "operational_actions_enabled": False,
        "needs_accountable_human_review": True,
        "note": ("Question not covered by the bounded evidence guide. Review the cited case evidence."
                 if kind == "abstain" else
                 "Answer contains only validated exercise findings and playbook review options; it is not a forecast or approval."),
    }
