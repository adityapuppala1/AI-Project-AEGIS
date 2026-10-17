"""Optional local-model selection of existing synthetic review items only."""
import json
import os
import threading
import time
from urllib.error import URLError
from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener

from pydantic import BaseModel, ConfigDict, ValidationError
from typing import Literal


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    finding_index: Literal[0, 1]
    playbook_step: Literal["URB-01", "URB-03", "URB-04"]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


_slot = threading.Lock()
TARGETS = {"loopback": "http://127.0.0.1:11434/api/generate",
           "docker_host": "http://host.docker.internal:11434/api/generate"}
MODELS = {"tinyllama:1.1b", "phi3:mini"}


def generate_selection(brief: dict, model: str, target: str) -> Selection:
    # Only prebuilt template facts/options are sent. No raw source text,
    # credentials, user instructions, tools or operational endpoints.
    payload = {
        "model": model, "stream": False, "keep_alive": 0,
        "format": Selection.model_json_schema(),
        "system": "Select one useful review finding and playbook step from the supplied synthetic exercise. Return only the JSON selection. You cannot approve, dispatch or add facts.",
        "prompt": json.dumps({"findings": [{"index": index, "text": item["text"]} for index, item in enumerate(brief["findings"])], "review_options": brief["review_options"], "limitations": brief["limitations"]}),
        "options": {"temperature": 0, "num_ctx": 2048, "num_predict": 96, "num_gpu": 0, "num_thread": 4},
    }
    request = Request(TARGETS[target], data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=20) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("Oversized model response")
    document = json.loads(raw)
    if not isinstance(document, dict):
        raise ValueError("Invalid model envelope")
    if document.get("done") is not True or document.get("model") != model:
        raise ValueError("Incomplete or unexpected model")
    answer = document.get("response")
    if not isinstance(answer, str) or len(answer) > 4096:
        raise ValueError("Invalid model selection")
    raw_selection = json.loads(answer)
    # Check before normalization: bool/float can compare equal to integer literals.
    if not isinstance(raw_selection, dict) or type(raw_selection.get("finding_index")) is not int:
        raise ValueError("Invalid finding index")
    return Selection.model_validate(raw_selection)


def review_focus(context: dict) -> dict:
    brief = context["review_brief"]
    selection = Selection(finding_index=0, playbook_step="URB-01")
    status, reason, model_used = "template_fallback", "disabled", None
    started = time.monotonic()
    model = os.getenv("AEGIS_LOCAL_COPILOT_MODEL", "tinyllama:1.1b")
    target = os.getenv("AEGIS_LOCAL_COPILOT_TARGET", "loopback")
    if os.getenv("AEGIS_LOCAL_COPILOT_ENABLED") == "1":
        if model not in MODELS or target not in TARGETS:
            reason = "unsupported_configuration"
        elif not context["playbook"]["synthetic_evidence_ids"]:
            reason = "missing_evidence"
        elif not _slot.acquire(blocking=False):
            reason = "busy"
        else:
            try:
                selection = generate_selection(brief, model, target)
                status, reason, model_used = "model_assisted_selection", "valid_selection", model
            except (ValidationError, ValueError, KeyError, TypeError):
                reason = "invalid_output"
            except (URLError, TimeoutError, OSError):
                reason = "unavailable"
            finally:
                _slot.release()
    option = next(item for item in brief["review_options"] if item["playbook_step"] == selection.playbook_step)
    return {
        "version": "aegis.exercise.review-focus.v1", "incident_id": context["incident_id"],
        "source": "synthetic_exercise", "operational_actions_enabled": False,
        "needs_accountable_human_review": True, "status": status, "reason": reason,
        "model": model_used, "selection": selection.model_dump(),
        "finding": brief["findings"][selection.finding_index], "review_option": option,
        "limitations": brief["limitations"], "playbook_version": brief["playbook_version"],
        "reference_time": context["reference_time"],
        "elapsed_ms": round((time.monotonic() - started) * 1000),
        "note": "A model may select existing review items only. No new factual claims, forecast, proposal write or approval is produced.",
    }
