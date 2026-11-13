"""Staff email notices: the ONLY module in IndTrana that calls a message send endpoint (docs/COMMUNICATION_CHANNELS.md).

Owner decision, 12 November 2026: email notices to IndTrana's own signed-in staff who have opted in. Still forbidden:
SMS, WhatsApp, push, public warnings, messages to outside agencies, any transport in the team response loop, and any
free text or case content in a message.

Two switches, both default off: the host switch AEGIS_STAFF_EMAIL=1 (compose.staff-email.yaml; without it every route
here answers 404 and nothing sends) and the `comms_email` connector, which a platform_admin enables and which is the
kill switch read before every send. Messages come only from the fixed TEMPLATES below (English, integer or closed-code
placeholders only, a fixed IndTrana path at most). One recipient per provider call. Every attempt past the host switch
writes one append-only log row with a fixed reason code; addresses, provider bodies, exception text and the key never
reach a response, a log row or a log line.
"""
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.error import URLError
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool

from app import connector_secrets, connectors, staff_message_store
from app.security import EXERCISE_RECORD_ROLES, Operator, scoped_operator

logger = logging.getLogger(__name__)

HOST_SWITCH = "AEGIS_STAFF_EMAIL"
CONNECTOR_ID = "comms_email"
SEND_URL = "https://api.sendgrid.com/v3/mail/send"
SEND_HOSTS = ("api.sendgrid.com",)
RECIPIENT_HOURLY_CAP = 5
AGENCY_DAILY_CAP = 200
MAX_EVENT_RECIPIENTS = 50
CONTACT_FRESH_HOURS = 24  # a register row not refreshed from a verified token within this window never receives
MAKER_HOURLY_EVENT_CAP = 10  # approval_waiting events one maker can trigger per hour (per API process)
EVENT_ACTOR = "system:staff-email"
CHECKER_ROLE = "incident_checker"
_ORIGIN = re.compile(r"https?://[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?")
# Reserved top-level names (RFC 2606 / 6761) can never receive mail; the local demo accounts use example.invalid.
RESERVED_TLDS = frozenset({"invalid", "test", "localhost", "local", "example"})

# Closed set of messages. "params" maps each allowed placeholder to a validator (integers or closed codes only).
# Both current templates take no placeholders. No template may carry incident, proposal, rationale or personal content.
_PREAMBLE = ("This is a rehearsal notice from IndTrana, a local exercise system. It is not a real warning and asks for no "
             "action outside IndTrana.")
_FOOTER = ("This message carries no incident, proposal, rationale or personal details. You receive it because you "
           "turned on Email notices in IndTrana. You can turn them off there at any time.")
TEMPLATES = {
    "test_notice": {
        "subject": "[IndTrana exercise] Test notice",
        "line": "You asked IndTrana to send a test notice to check that email notices reach you. No action is needed.",
        "path": "/help", "params": {},
    },
    "approval_waiting": {
        "subject": "[IndTrana exercise] A proposal is waiting for review",
        "line": "A proposal in your agency was submitted for review. Sign in to IndTrana to see it.",
        "path": "/approvals", "params": {},
    },
}
REASONS = ("host_switch_off", "channel_unavailable", "channel_disabled", "no_consent", "agency_mismatch", "recipient_cap",
           "agency_cap", "stale_contact", "send_lock_unavailable", "test_in_flight", "secret_missing", "setting_missing", "connector_key_missing", "connector_secret_unreadable",
           "provider_rejected", "provider_status", "timeout", "invalid_response", "network_error", "send_failed",
           "store_unavailable")


def _reserved(address: str) -> bool:
    return address.rsplit(".", 1)[-1].lower() in RESERVED_TLDS


def host_enabled() -> bool:
    return os.environ.get(HOST_SWITCH) == "1"


def require_host_switch() -> None:
    if not host_enabled():
        raise HTTPException(status_code=404, detail="Not Found")


def _origin() -> str | None:
    value = os.environ.get("APP_ORIGIN", "").strip().rstrip("/")
    return value if _ORIGIN.fullmatch(value) else None


def render(template_id: str, params: dict) -> tuple[str, str]:
    """Subject and plain-text body from a fixed template. Unknown templates or placeholders raise ValueError."""
    spec = TEMPLATES[template_id]
    if set(params) - set(spec["params"]):
        raise ValueError("unknown_placeholder")
    values = {name: check(params[name]) for name, check in spec["params"].items()}
    origin = _origin()
    link = f"Open IndTrana: {origin}{spec['path']}\n\n" if origin else ""
    body = f"{_PREAMBLE}\n\n{spec['line'].format(**values)}\n\n{link}{_FOOTER}\n"
    return spec["subject"], body


def mask(address: str | None) -> str | None:
    if not address or "@" not in address:
        return None
    local, domain = address.rsplit("@", 1)
    return f"{local[:1]}***@{domain}"


def _result(state: str, reason: str | None = None, provider_status: int | None = None) -> dict:
    return {"state": state, "reason": reason, "provider_status": provider_status}


def _provider_call(address: str, subject: str, body: str) -> dict:
    """One recipient per call. Key, address and provider body never leave this function."""
    try:
        key = connectors.read_secret(CONNECTOR_ID, "api_key")
    except connector_secrets.ConnectorKeyMissing:
        return _result("failed", "connector_key_missing")
    except connector_secrets.SecretUnreadable:
        return _result("failed", "connector_secret_unreadable")
    if not key:
        return _result("failed", "secret_missing")
    sender = str(connectors.effective(CONNECTOR_ID)["settings"].get("from_address") or "")
    if not re.fullmatch(connectors.EMAIL_ADDRESS, sender):
        return _result("failed", "setting_missing")
    payload = json.dumps({
        "personalizations": [{"to": [{"email": address}]}],
        "from": {"email": sender},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
        "tracking_settings": {"click_tracking": {"enable": False}, "open_tracking": {"enable": False}},
    }).encode()
    try:
        status, response_body = connectors.bounded_request(
            SEND_URL, SEND_HOSTS, method="POST", data=payload, max_bytes=4096, truncate=True,
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        del response_body  # never stored, logged or returned
    except TimeoutError:
        return _result("failed", "timeout")
    except ValueError:
        return _result("failed", "invalid_response")
    except (URLError, OSError):
        return _result("failed", "network_error")
    except Exception:
        return _result("failed", "send_failed")
    if status == 202 or status == 200:
        return _result("sent", None, status)
    if status in (401, 403):
        return _result("failed", "provider_rejected", status)
    return _result("failed", "provider_status", status if isinstance(status, int) else None)


def _gate(store, recipient_subject: str, event_agency_id: UUID) -> tuple[str | None, dict | None]:
    """Gates before any reservation, in order: connector enabled, consent, freshness, event agency."""
    try:
        if not connectors.effective(CONNECTOR_ID)["enabled"]:
            return "channel_disabled", None
    except Exception:
        return "channel_unavailable", None
    contact = store.get_contact(recipient_subject)
    if not contact or contact.get("consent_at") is None or contact.get("opted_out_at") is not None or not contact.get("email"):
        return "no_consent", None
    updated = contact.get("updated_at")
    if not isinstance(updated, datetime) or updated < datetime.now(timezone.utc) - timedelta(hours=CONTACT_FRESH_HOURS):
        return "stale_contact", None
    if contact["agency_id"] != event_agency_id:
        return "agency_mismatch", None
    return None, contact


def deliver(recipient_subject: str, event_agency_id: UUID, template_id: str, params: dict, actor: str) -> dict:
    """Send one fixed template to one opted-in staff member. Never raises; returns state, reason and provider status.

    `event_agency_id` is the agency of the event (or of the person asking for a test), supplied by the caller and
    compared with the contact's register row. Flow: gates; a short locked transaction that counts `queued` rows
    against both caps and commits a `queued` row; the provider call with no lock or transaction open; then a second,
    separate row with the outcome. If that last write fails, the committed `queued` row still counts toward the caps.
    """
    subject, body = render(template_id, params)  # programming errors (unknown template) raise before any I/O
    if not host_enabled():
        return _result("suppressed", "host_switch_off")  # the feature is off: nothing is read, sent or logged
    store = staff_message_store.get_store()
    row = {"attempt_id": str(uuid4()), "agency_id": event_agency_id, "recipient_subject": recipient_subject,
           "template_id": template_id, "params": params, "actor": actor}
    try:
        reason, contact = _gate(store, recipient_subject, event_agency_id)
        if reason is None:
            now = datetime.now(timezone.utc)
            reason = store.reserve(row, hour_since=now - timedelta(hours=1), day_since=now - timedelta(days=1),
                                   recipient_cap=RECIPIENT_HOURLY_CAP, agency_cap=AGENCY_DAILY_CAP)
        if reason is not None:
            store.add_log({**row, "state": "suppressed", "reason": reason})
            return _result("suppressed", reason)
    except Exception:
        logger.warning("staff email: message store unavailable; nothing sent")
        return _result("failed", "store_unavailable")
    outcome = _provider_call(contact["email"], subject, body)
    try:
        store.add_log({**row, "state": outcome["state"], "reason": outcome["reason"],
                       "provider_status": outcome["provider_status"]})
    except Exception:
        logger.warning("staff email: outcome row not written; the queued row still counts toward the limits")
    return outcome


_maker_events: dict[str, list[float]] = {}
_maker_lock = threading.Lock()


def _maker_allowed(maker_subject: str) -> bool:
    now = time.monotonic()
    with _maker_lock:
        recent = [t for t in _maker_events.get(maker_subject, []) if now - t < 3600]
        allowed = len(recent) < MAKER_HOURLY_EVENT_CAP
        _maker_events[maker_subject] = [*recent, now] if allowed else recent
        return allowed


def notify_approval_waiting(agency_id: UUID, maker_subject: str) -> None:
    """After a proposal is submitted (and its transaction committed): tell opted-in checkers in the same agency.

    Best effort: runs as a background task after the response, never raises, and never touches the workflow. The maker
    is never a recipient, even if they also hold the checker role. One maker triggers at most MAKER_HOURLY_EVENT_CAP
    events an hour (counted per API process); further submissions send nothing.
    """
    try:
        if not host_enabled():
            return
        if not _maker_allowed(maker_subject):
            logger.info("staff email: approval notice skipped (maker_cap)")
            return
        for contact in staff_message_store.get_store().checker_contacts(agency_id, MAX_EVENT_RECIPIENTS):
            if contact["subject"] == maker_subject or CHECKER_ROLE not in contact["roles"]:
                continue
            deliver(contact["subject"], agency_id, "approval_waiting", {}, EVENT_ACTOR)
    except Exception:
        logger.warning("staff email: approval notice skipped")


def refresh_contact(operator: Operator) -> None:
    """Best-effort register refresh from a verified token (approvals list, proposal changes). Never raises."""
    try:
        if host_enabled():
            _refresh(operator, None)
    except Exception:
        logger.warning("staff email: register refresh skipped")


# --- routes ---------------------------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/staff-messages", tags=["staff email notices"], dependencies=[Depends(require_host_switch)])
_staff = scoped_operator(EXERCISE_RECORD_ROLES)
_admin = scoped_operator(frozenset({"platform_admin"}))


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="staff_messages_unavailable")


def _refresh(operator: Operator, consent: bool | None) -> dict | None:
    """Write the register from the verified token: roles and agency always; the address only from a verified claim."""
    store = staff_message_store.get_store()
    roles = sorted(operator.roles)
    if consent is None:
        current = store.get_contact(operator.subject)
        if current and current.get("consent_at") is not None and (
                operator.email is None or _reserved(operator.email) or operator.email != current.get("email")
                or str(current.get("agency_id")) != str(operator.agency_id)):
            # No verified address any more, a reserved one, a different one, or a move to another agency: end the opt-in (fail closed).
            # The person must opt in again; an address is never silently replaced.
            consent = False
    return store.save_contact(operator.subject, operator.agency_id, roles,
                              operator.email if consent is not False else None, consent=consent)


def _channel_enabled() -> bool:
    try:
        return bool(connectors.effective(CONNECTOR_ID)["enabled"])
    except Exception:
        return False


def _preference_view(operator: Operator, contact: dict | None) -> dict:
    opted_in = bool(contact and contact.get("consent_at") is not None and contact.get("opted_out_at") is None)
    return {"opted_in": opted_in, "address": mask(contact.get("email")) if opted_in else None,
            "verified_address_available": operator.email is not None,
            "verified_address": mask(operator.email), "channel_enabled": _channel_enabled(),
            "recipient_hourly_cap": RECIPIENT_HOURLY_CAP, "templates": sorted(TEMPLATES)}


class PreferenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    opted_in: StrictBool


@router.get("/preference")
def read_preference(operator: Operator = Depends(_staff)):
    try:
        contact = _refresh(operator, None)
    except Exception:
        raise _unavailable() from None
    return _preference_view(operator, contact)


@router.put("/preference")
def update_preference(body: PreferenceUpdate, operator: Operator = Depends(_staff)):
    if body.opted_in and operator.email is None:
        raise HTTPException(status_code=409, detail="verified_email_required")
    if body.opted_in and _reserved(operator.email):
        raise HTTPException(status_code=409, detail="undeliverable_address")
    try:
        contact = _refresh(operator, body.opted_in)
    except Exception:
        raise _unavailable() from None
    return _preference_view(operator, contact)


_in_flight: set[str] = set()
_in_flight_lock = threading.Lock()


@router.post("/test")
def send_test(operator: Operator = Depends(_staff)):
    """The fixed test template, only to the caller's own registered address; the recipient cap applies and one test
    per person can be in flight at a time (per API process)."""
    with _in_flight_lock:
        if operator.subject in _in_flight:
            return {"template_id": "test_notice", **_result("suppressed", "test_in_flight")}
        _in_flight.add(operator.subject)
    try:
        try:
            _refresh(operator, None)
        except Exception:
            raise _unavailable() from None
        outcome = deliver(operator.subject, operator.agency_id, "test_notice", {}, operator.subject)
    finally:
        with _in_flight_lock:
            _in_flight.discard(operator.subject)
    return {"template_id": "test_notice", **outcome}


def _attempts(rows: list[dict]) -> list[dict]:
    """One line per attempt (rows arrive newest first). An outcome row wins over its `queued` row; a lone `queued` row
    means the outcome could not be recorded, so the email may have been sent."""
    chosen: dict[str, dict] = {}
    for row in rows:
        key = str(row.get("attempt_id") or row["id"])
        if key not in chosen or (chosen[key]["state"] == "queued" and row["state"] != "queued"):
            chosen[key] = row
    return list(chosen.values())


@router.get("/log")
def read_log(operator: Operator = Depends(_admin)):
    try:
        rows = _attempts(staff_message_store.get_store().list_log(operator.agency_id, 300))[:100]
    except Exception:
        raise _unavailable() from None
    return {"rows": [{"id": str(row["id"]), "attempt_id": str(row.get("attempt_id") or row["id"]),
                      "recipient_subject": row["recipient_subject"],
                      "recipient": mask(row.get("current_email")), "template_id": row["template_id"],
                      "state": row["state"], "reason": row.get("reason"), "provider_status": row.get("provider_status"),
                      "actor": row["actor"], "at": row["at"].isoformat() if hasattr(row["at"], "isoformat") else row["at"]}
                     for row in rows],
            "recipient_hourly_cap": RECIPIENT_HOURLY_CAP, "agency_daily_cap": AGENCY_DAILY_CAP}
