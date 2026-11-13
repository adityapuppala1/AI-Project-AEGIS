"""Code-defined connector registry for the opt-in proactive watch (platform_admin only).

Hosts are hard-coded per connector; fetches use no redirects, no proxy variables, a 10 s socket
timeout, a 25 s deadline and a 64 KB cap for tests. Test responses are never persisted and
secret values are never returned. `authority_notification` cannot be enabled: there is no send path.
The `comms_*` entries hold staff message provider credentials (email, SMS, WhatsApp). Their test only
asks the provider whether the credentials are valid; nothing in this module sends a message. SMS and
WhatsApp cannot be enabled. `comms_email` (delivery "send") may be enabled by a platform_admin: it is then
the kill switch read by app/staff_messages.py, the only module that sends (fixed rehearsal emails to
opted-in staff, owner decision 12 November 2026). See docs/PROACTIVE_IMPLEMENTATION_CONTRACT.md and
docs/COMMUNICATION_CHANNELS.md.
"""
import base64
import os
import re
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import connector_secrets, proactive_store
from app.security import Operator, get_operator, require_role

TIMEOUT_SECONDS = 10
DEADLINE_SECONDS = 25
TEST_MAX_BYTES = 65536
MAX_SECRET_LENGTH = 4096
USER_AGENT = "IndTrana-Proactive/1.0 (local exercise demo)"
HYDERABAD_GRID = "hyderabad_pilot_grid"
INDIA_BBOX = "68,6,98,38"
LHASA_URL = "https://maps.nccs.nasa.gov/server/rest/services/global_landslide_nowcast/nowcast_current/MapServer"
CDSE_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
IMD_URL = "https://mausam.imd.gov.in/"
GDACS_TERMS_URL = "https://www.gdacs.org/About/termofuse.aspx"
GDACS_EVENT_TYPES = "FL;TC;EQ;WF;DR;VO"


def proactive_enabled() -> bool:
    return os.environ.get("AEGIS_PROACTIVE") == "1"


def require_proactive() -> None:
    if not proactive_enabled():
        raise HTTPException(status_code=404, detail="Not Found")


def _fixed(value):
    def check(candidate):
        if candidate != value:
            raise ValueError("fixed setting cannot be changed")
        return candidate
    return check


def _choice(*values):
    def check(candidate):
        if candidate not in values:
            raise ValueError("unsupported value")
        return candidate
    return check


def _int_range(low, high):
    def check(candidate):
        if isinstance(candidate, bool) or not isinstance(candidate, int) or not low <= candidate <= high:
            raise ValueError(f"must be an integer from {low} to {high}")
        return candidate
    return check


def _bool(candidate):
    if not isinstance(candidate, bool):
        raise ValueError("must be true or false")
    return candidate


def _pattern(expression):
    """A text setting that is either empty (not set yet) or matches the whole expression."""
    compiled = re.compile(expression)

    def check(candidate):
        if not isinstance(candidate, str) or (candidate != "" and not compiled.fullmatch(candidate)):
            raise ValueError("unsupported value")
        return candidate
    return check


EMAIL_ADDRESS = r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,4}"
TWILIO_ACCOUNT_SID = r"AC[0-9a-fA-F]{32}"
SMS_SENDER = r"\+[1-9][0-9]{7,14}|[A-Za-z0-9]{3,11}"
WHATSAPP_NUMBER_ID = r"[0-9]{5,20}"
COMMS_LOCKED = "Credentials are checked only. No message is sent: this build has no send code and the channel cannot be enabled."
COMMS_EMAIL_SEND = ("When enabled and the host switch AEGIS_STAFF_EMAIL is on, IndTrana sends fixed rehearsal notices to its own "
                    "staff who opted in with a verified address. Disabling stops sending at the next attempt.")


def _field(name, label, secret=False, required=False):
    return {"name": name, "label": label, "secret": secret, "required": required}


# id -> definition. Settings validators raise ValueError for unsupported values.
REGISTRY = {
    "open_meteo": {
        "name": "Open-Meteo forecast and flood API", "category": "weather/flood",
        "licence": "Open-Meteo data CC BY 4.0; free API is non-commercial only (https://open-meteo.com/en/licence).",
        "hosts": ("api.open-meteo.com", "flood-api.open-meteo.com"), "fields": (),
        "settings": {"models": ("ecmwf_aifs025", _choice("ecmwf_aifs025", "ecmwf_ifs025")),
                     "points": (HYDERABAD_GRID, _fixed(HYDERABAD_GRID))},
    },
    "nasa_firms": {
        "name": "NASA FIRMS active fire detections", "category": "fire",
        "licence": "NASA FIRMS open data; acknowledge LANCE FIRMS (https://www.earthdata.nasa.gov/data/tools/firms). MAP_KEY transaction limits apply.",
        "hosts": ("firms.modaps.eosdis.nasa.gov",), "fields": (_field("map_key", "FIRMS MAP_KEY", True, True),),
        "settings": {"area": (INDIA_BBOX, _fixed(INDIA_BBOX)), "days": (1, _int_range(1, 3))},
    },
    "nasa_lhasa": {
        "name": "NASA LHASA landslide nowcast (best effort)", "category": "landslide",
        "licence": "NASA open data; LHASA nowcast is a model, not an observation. No NASA endorsement is implied.",
        "hosts": ("maps.nccs.nasa.gov",), "fields": (),
        "settings": {"base_url": (LHASA_URL, _fixed(LHASA_URL))},
    },
    "copernicus_cdse": {
        "name": "Copernicus Data Space Ecosystem (Sentinel-1)", "category": "satellite flood extent",
        "licence": "Copernicus Sentinel data, free and open under the Copernicus licence; account terms apply.",
        "hosts": ("identity.dataspace.copernicus.eu",),
        "fields": (_field("client_id", "OAuth client ID", True, True), _field("client_secret", "OAuth client secret", True, True)),
        "settings": {"collection": ("SENTINEL-1", _fixed("SENTINEL-1"))},
    },
    "imd_warnings": {
        "name": "India Meteorological Department warnings", "category": "official warnings",
        "licence": "IMD content terms must be reviewed and accepted by the owner before any request is made.",
        "hosts": ("mausam.imd.gov.in",), "fields": (),
        "settings": {"terms_accepted": (False, _bool), "base_url": (IMD_URL, _fixed(IMD_URL))},
    },
    "gdacs": {
        "name": "GDACS global disaster alerts (event feed)", "category": "multi-hazard events",
        "licence": ("GDACS public event feed (UN / European Commission JRC); attribution required. Terms of use to be "
                    "confirmed by owner: " + GDACS_TERMS_URL + ". A GDACS alert is a third-party reference, not an IndTrana assessment."),
        "hosts": ("www.gdacs.org",), "fields": (),
        "settings": {"area": (INDIA_BBOX, _fixed(INDIA_BBOX)), "event_types": (GDACS_EVENT_TYPES, _fixed(GDACS_EVENT_TYPES)),
                     "days": (3, _int_range(1, 7))},
    },
    "google_flood_forecasting": {
        "name": "Google Flood Forecasting API (waitlist)", "category": "river flood forecasts",
        "licence": ("Google Flood Forecasting data CC BY 4.0 (attribute Google Flood Forecasting). API access needs waitlist "
                    "approval and an API key; Google API terms apply (https://developers.google.com/flood-forecasting)."),
        "hosts": ("floodforecasting.googleapis.com",), "fields": (_field("api_key", "API key", True, True),),
        "settings": {"region_code": ("IN", _fixed("IN")), "radius_km": (150, _fixed(150))},
    },
    "typesafe_jev": {
        "name": "Typesafe Jev decision judgments", "category": "decision judgments",
        "licence": "Typesafe API terms (https://docs.typesafe.ai). Only code-supplied options and cited evidence ids are sent.",
        "hosts": ("api.typesafe.ai",), "fields": (_field("api_key", "API key", True, True),),
        "settings": {"model": ("jev-latest", _choice("jev-latest")),
                     "monthly_input_token_budget": (200_000, _int_range(1_000, 10_000_000))},
    },
    "cap_handover": {
        "name": "CAP 1.2 exercise file export", "category": "hand-over",
        "licence": "Local file export only; status is always Exercise.",
        "hosts": (), "fields": (), "settings": {"mode": ("file_export", _fixed("file_export"))},
    },
    "authority_notification": {
        "name": "Authority notification (not available)", "category": "hand-over",
        "licence": "No send path exists in this demonstration.",
        "hosts": (), "fields": (), "settings": {"enabled": (False, _fixed(False))},
    },
    # Staff message channels. "built_in" needs no provider and never leaves this server; "locked" stores and
    # checks credentials only and can never be enabled; "send" (email only) can be enabled as described above.
    "comms_in_app": {
        "name": "In-app alerts (signed-in users)", "category": "communications", "delivery": "built_in",
        "licence": "Built in. Requests, tasks and approvals appear only to people signed in to IndTrana; nothing leaves this server.",
        "hosts": (), "fields": (), "settings": {"mode": ("signed_in_users_only", _fixed("signed_in_users_only"))},
    },
    "comms_email": {
        "name": "Email provider (Twilio SendGrid)", "category": "communications", "delivery": "send",
        "licence": "Paid service; SendGrid terms and sender authentication apply (https://sendgrid.com). " + COMMS_EMAIL_SEND,
        "hosts": ("api.sendgrid.com",),
        "fields": (_field("api_key", "API key", True, True), _field("from_address", "Sender email address", False, True)),
        "settings": {"from_address": ("", _pattern(EMAIL_ADDRESS))},
    },
    "comms_sms": {
        "name": "SMS provider (Twilio)", "category": "communications", "delivery": "locked",
        "licence": ("Paid service; Twilio terms apply. SMS to Indian numbers also needs DLT registration of the sender "
                    "and each message template with a telecom operator. " + COMMS_LOCKED),
        "hosts": ("api.twilio.com",),
        "fields": (_field("account_sid", "Account SID", False, True), _field("auth_token", "Auth token", True, True),
                   _field("from_number", "Sender number or sender ID", False, True)),
        "settings": {"account_sid": ("", _pattern(TWILIO_ACCOUNT_SID)), "from_number": ("", _pattern(SMS_SENDER))},
    },
    "comms_whatsapp": {
        "name": "WhatsApp provider (Meta Cloud API)", "category": "communications", "delivery": "locked",
        "licence": ("Meta WhatsApp Business terms apply; conversations are charged by Meta and message templates need "
                    "Meta approval. " + COMMS_LOCKED),
        "hosts": ("graph.facebook.com",),
        "fields": (_field("access_token", "Access token", True, True), _field("phone_number_id", "Phone number ID", False, True)),
        "settings": {"phone_number_id": ("", _pattern(WHATSAPP_NUMBER_ID))},
    },
}


def never_enabled(connector_id: str) -> bool:
    """True for entries that can never be switched on: authority notification and the built-in/locked channels."""
    return connector_id == "authority_notification" or REGISTRY[connector_id].get("delivery") in ("built_in", "locked")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def bounded_request(url: str, allowed_hosts, *, method="GET", headers=None, data: bytes | None = None,
                    max_bytes=TEST_MAX_BYTES, truncate=False) -> tuple[int, bytes]:
    """One allowlisted HTTPS request: no redirects, no proxy, bounded size and total time."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in set(allowed_hosts):
        raise ValueError("url_not_allowlisted")
    request = Request(url, data=data, method=method, headers={"User-Agent": USER_AGENT, "Accept": "*/*", **(headers or {})})
    deadline = time.monotonic() + DEADLINE_SECONDS
    chunks, size = [], 0
    try:
        response = build_opener(ProxyHandler({}), _NoRedirect()).open(request, timeout=TIMEOUT_SECONDS)
    except HTTPError as error:
        error.close()
        return error.code, b""
    with response:
        while method != "HEAD":
            if time.monotonic() > deadline:
                raise TimeoutError("upstream_deadline")
            chunk = response.read1(16384)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                if truncate:
                    chunks.append(chunk[: max_bytes - (size - len(chunk))])
                    break
                raise ValueError("upstream_too_large")
            chunks.append(chunk)
        return response.status, b"".join(chunks)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_settings(connector_id: str) -> dict:
    return {name: default for name, (default, _) in REGISTRY[connector_id]["settings"].items()}


def effective(connector_id: str) -> dict:
    """Enabled flag and settings, defaults filled in; never contains secret values."""
    config = proactive_store.get_store().list_configs()["configs"].get(connector_id) or {}
    return {"enabled": bool(config.get("enabled")) and not never_enabled(connector_id),
            "settings": {**default_settings(connector_id), **(config.get("settings") or {})},
            "version": config.get("version", 0)}


def read_secret(connector_id: str, key_name: str) -> str | None:
    """Decrypt one secret for an outbound call; None when unset. Raises when the master key is missing."""
    stored = proactive_store.get_store().get_secret(connector_id, key_name)
    if stored is None:
        return None
    return connector_secrets.decrypt(stored[0], stored[1], connector_id, key_name)


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _view(connector_id: str, data: dict) -> dict:
    spec = REGISTRY[connector_id]
    config = data["configs"].get(connector_id) or {}
    secrets = data["secrets"].get(connector_id, {})
    test = data["tests"].get(connector_id)
    last_test = None
    saved_at, tested_at = config.get("updated_at"), (test or {}).get("at")
    # A channel's status is its credential check alone, so a check older than the last save no longer counts.
    stale = (bool(spec.get("delivery")) and hasattr(saved_at, "isoformat") and hasattr(tested_at, "isoformat")
             and tested_at < saved_at)
    if test and not stale:
        detail = test.get("detail") or {}
        last_test = {"at": _iso(test["at"]), "ok": bool(test["ok"]), "status_code": detail.get("status_code"),
                     "latency_ms": detail.get("latency_ms"), "message": detail.get("message")}
    return {"id": connector_id, "name": spec["name"], "category": spec["category"], "licence": spec["licence"],
            "hosts": list(spec["hosts"]), "delivery": spec.get("delivery"),
            "enabled": bool(config.get("enabled")) and not never_enabled(connector_id),
            "version": config.get("version", 0), "updated_at": _iso(config.get("updated_at")),
            "updated_by": config.get("updated_by"),
            "settings": {**default_settings(connector_id), **(config.get("settings") or {})},
            "fields": [{**field, "set": field["name"] in secrets, "fingerprint": secrets.get(field["name"])}
                       for field in spec["fields"]],
            "last_test": last_test}


def _store_call(fn, *args):
    try:
        return fn(*args)
    except (HTTPException, proactive_store.VersionConflict):
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="proactive_store_unavailable") from None


# --- test procedures (response bodies are discarded; only status and latency are kept) ----------

def _result(ok, status_code, message):
    return {"ok": ok, "status_code": status_code, "message": message}


def _test_open_meteo(settings):
    query = urlencode({"latitude": 17.4, "longitude": 78.47, "daily": "precipitation_sum", "forecast_days": 1,
                       "models": settings["models"], "timezone": "UTC"})
    status, _ = bounded_request("https://api.open-meteo.com/v1/forecast?" + query, REGISTRY["open_meteo"]["hosts"])
    return _result(status == 200, status, "reachable" if status == 200 else "upstream_status")


def _test_nasa_firms(settings):
    key = read_secret("nasa_firms", "map_key")
    if not key:
        return _result(False, None, "secret_missing")
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{INDIA_BBOX}/1"
    status, _ = bounded_request(url, REGISTRY["nasa_firms"]["hosts"], max_bytes=2048, truncate=True)
    return _result(status == 200, status, "reachable" if status == 200 else "upstream_status")


def _test_nasa_lhasa(settings):
    status, _ = bounded_request(LHASA_URL + "?f=json", REGISTRY["nasa_lhasa"]["hosts"], truncate=True)
    return _result(status == 200, status, "reachable" if status == 200 else "upstream_status")


def _test_copernicus(settings):
    client_id, client_secret = read_secret("copernicus_cdse", "client_id"), read_secret("copernicus_cdse", "client_secret")
    if not client_id or not client_secret:
        return _result(False, None, "secret_missing")
    body = urlencode({"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}).encode()
    status, payload = bounded_request(CDSE_TOKEN_URL, REGISTRY["copernicus_cdse"]["hosts"], method="POST", data=body,
                                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    ok = status == 200 and b"access_token" in payload
    del payload  # the token is discarded immediately and never stored or returned
    return _result(ok, status, "token_issued_and_discarded" if ok else "token_request_failed")


def _test_imd(settings):
    if settings.get("terms_accepted") is not True:
        return _result(False, None, "terms_not_accepted")
    status, _ = bounded_request(IMD_URL, REGISTRY["imd_warnings"]["hosts"], truncate=True)
    return _result(status == 200, status, "reachable" if status == 200 else "upstream_status")


def _test_gdacs(settings):
    from app.hazard_watch import gdacs_url
    status, _ = bounded_request(gdacs_url({**settings, "days": 1}), REGISTRY["gdacs"]["hosts"],
                                headers={"Accept": "application/json"}, truncate=True)
    ok = status in (200, 204)
    return _result(ok, status, "reachable" if ok else "upstream_status")


def _test_google_flood(settings):
    key = read_secret("google_flood_forecasting", "api_key")
    if not key:
        return _result(False, None, "secret_missing")
    from app.hazard_watch import GOOGLE_FLOOD_URL
    body = b'{"regionCode":"' + settings["region_code"].encode() + b'"}'
    status, _ = bounded_request(GOOGLE_FLOOD_URL, REGISTRY["google_flood_forecasting"]["hosts"], method="POST", data=body,
                                headers={"Content-Type": "application/json", "X-Goog-Api-Key": key}, truncate=True)
    return _result(status == 200, status, "reachable" if status == 200 else "upstream_status")


def _test_typesafe(settings):
    key = read_secret("typesafe_jev", "api_key")
    if not key:
        return _result(False, None, "secret_missing")
    status, _ = bounded_request("https://api.typesafe.ai/v1/models", REGISTRY["typesafe_jev"]["hosts"],
                                headers={"Authorization": "Bearer " + key}, truncate=True)
    return _result(status == 200, status, "reachable" if status == 200 else "upstream_status")


def _test_cap(settings):
    from app.proactive_cap import exercise_cap_xml, self_check
    return _result(self_check(exercise_cap_xml), None, "exporter_valid_exercise_only")


def _test_authority(settings):
    return _result(False, None, "no_send_path")


# Communications checks ask the provider about the credentials themselves. None of them calls a send endpoint.

def _credentials(status, rejected=(401, 403)):
    if status == 200:
        return _result(True, status, "credentials_accepted_nothing_sent")
    if status in rejected:
        return _result(False, status, "credentials_rejected")
    return _result(False, status, "upstream_status")


def _test_comms_in_app(settings):
    return _result(True, None, "built_in_no_transport")


def _test_comms_email(settings):
    key = read_secret("comms_email", "api_key")
    if not key:
        return _result(False, None, "secret_missing")
    if not re.fullmatch(EMAIL_ADDRESS, str(settings.get("from_address") or "")):
        return _result(False, None, "setting_missing")
    status, payload = bounded_request("https://api.sendgrid.com/v3/scopes", REGISTRY["comms_email"]["hosts"],
                                      headers={"Authorization": "Bearer " + key}, truncate=True)
    can_send = b'"mail.send"' in payload
    del payload  # the scope list is discarded; only whether Mail Send is present is kept
    if status == 200 and not can_send:
        return _result(False, status, "key_lacks_mail_send")
    return _credentials(status)


def _test_comms_sms(settings):
    token = read_secret("comms_sms", "auth_token")
    if not token:
        return _result(False, None, "secret_missing")
    sid = str(settings.get("account_sid") or "")
    if not re.fullmatch(TWILIO_ACCOUNT_SID, sid) or not re.fullmatch(SMS_SENDER, str(settings.get("from_number") or "")):
        return _result(False, None, "setting_missing")
    basic = base64.b64encode(f"{sid}:{token}".encode()).decode()
    status, _ = bounded_request(f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json", REGISTRY["comms_sms"]["hosts"],
                                headers={"Authorization": "Basic " + basic}, truncate=True)
    return _credentials(status)


def _test_comms_whatsapp(settings):
    token = read_secret("comms_whatsapp", "access_token")
    if not token:
        return _result(False, None, "secret_missing")
    number_id = str(settings.get("phone_number_id") or "")
    if not re.fullmatch(WHATSAPP_NUMBER_ID, number_id):
        return _result(False, None, "setting_missing")
    status, _ = bounded_request(f"https://graph.facebook.com/{number_id}?fields=id", REGISTRY["comms_whatsapp"]["hosts"],
                                headers={"Authorization": "Bearer " + token}, truncate=True)
    return _credentials(status, rejected=(400, 401, 403))  # Meta answers a bad token or unknown number ID with 400


TESTS = {"open_meteo": _test_open_meteo, "nasa_firms": _test_nasa_firms, "nasa_lhasa": _test_nasa_lhasa,
         "copernicus_cdse": _test_copernicus, "imd_warnings": _test_imd, "gdacs": _test_gdacs,
         "google_flood_forecasting": _test_google_flood, "typesafe_jev": _test_typesafe,
         "cap_handover": _test_cap, "authority_notification": _test_authority,
         "comms_in_app": _test_comms_in_app, "comms_email": _test_comms_email, "comms_sms": _test_comms_sms,
         "comms_whatsapp": _test_comms_whatsapp}


def run_test(connector_id: str) -> dict:
    settings = effective(connector_id)["settings"]
    started = time.monotonic()
    try:
        result = TESTS[connector_id](settings)
    except connector_secrets.ConnectorKeyMissing:
        result = _result(False, None, "connector_key_missing")
    except connector_secrets.SecretUnreadable:
        result = _result(False, None, "connector_secret_unreadable")
    except TimeoutError:
        result = _result(False, None, "timeout")
    except ValueError as error:
        result = _result(False, None, str(error) if str(error) in {"url_not_allowlisted", "upstream_too_large"} else "invalid_response")
    except (URLError, OSError):
        result = _result(False, None, "network_error")
    except Exception:
        result = _result(False, None, "test_failed")
    return {**result, "latency_ms": int((time.monotonic() - started) * 1000), "tested_at": _now()}


# --- routes -------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/proactive", tags=["proactive"], dependencies=[Depends(require_proactive)])


def _admin(operator: Operator = Depends(get_operator)) -> Operator:
    require_role(operator, {"platform_admin"})
    return operator


def _known(connector_id: str) -> None:
    if connector_id not in REGISTRY:
        raise HTTPException(status_code=404, detail="unknown_connector")


class ConnectorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=0, strict=True)
    enabled: bool = Field(strict=True)
    settings: dict = Field(default_factory=dict)
    secrets: dict[str, str | None] = Field(default_factory=dict)


@router.get("/connectors")
def list_connectors(operator: Operator = Depends(_admin)):
    data = _store_call(proactive_store.get_store().list_configs)
    return {"master_key_configured": connector_secrets.master_key_configured(),
            "connectors": [_view(cid, data) for cid in REGISTRY]}


@router.put("/connectors/{connector_id}")
def update_connector(connector_id: str, body: ConnectorUpdate, operator: Operator = Depends(_admin)):
    _known(connector_id)
    spec = REGISTRY[connector_id]
    if connector_id == "authority_notification" and body.enabled:
        raise HTTPException(status_code=409, detail="authority_notification_cannot_be_enabled")
    if never_enabled(connector_id) and body.enabled:
        raise HTTPException(status_code=409, detail="channel_cannot_be_enabled")
    settings = default_settings(connector_id)
    for name, value in body.settings.items():
        if name not in spec["settings"]:
            raise HTTPException(status_code=422, detail=f"unknown_setting:{name}")
        try:
            settings[name] = spec["settings"][name][1](value)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"invalid_setting:{name}") from None
    if connector_id == "authority_notification":
        settings["enabled"] = False
    secret_fields = {f["name"] for f in spec["fields"] if f["secret"]}
    ops, audits = {}, []
    for name, value in body.secrets.items():
        if name not in secret_fields:
            raise HTTPException(status_code=422, detail=f"unknown_secret:{name}")
        if value is None:
            ops[name] = None
            audits.append(("clear_secret", True, {"key_name": name}))
            continue
        if not value.strip() or len(value) > MAX_SECRET_LENGTH or any(ord(c) < 32 for c in value):
            raise HTTPException(status_code=422, detail=f"invalid_secret:{name}")
        try:
            ciphertext, nonce = connector_secrets.encrypt(value, connector_id, name)
        except connector_secrets.ConnectorKeyMissing:
            raise HTTPException(status_code=503, detail="connector_key_missing") from None
        ops[name] = (ciphertext, nonce, connector_secrets.fingerprint(value), connector_secrets.KEY_VERSION)
    data = _store_call(proactive_store.get_store().list_configs)
    current = data["configs"].get(connector_id) or {}
    if body.enabled:
        present = {n for n, op in ops.items() if op is not None} | (set(data["secrets"].get(connector_id, {})) - set(ops))
        missing = [f["name"] for f in spec["fields"] if f["required"] and f["secret"] and f["name"] not in present]
        if missing:
            raise HTTPException(status_code=422, detail="required_secret_missing:" + ",".join(missing))
        unset = [f["name"] for f in spec["fields"] if f["required"] and not f["secret"] and settings.get(f["name"]) == ""]
        if unset:
            raise HTTPException(status_code=422, detail="required_setting_missing:" + ",".join(unset))
    audits.insert(0, ("save", True, {"version": body.expected_version + 1, "settings": settings,
                                     "secrets_set": {n: op[2] for n, op in ops.items() if op is not None}}))
    if body.enabled != bool(current.get("enabled")):
        audits.append(("enable" if body.enabled else "disable", True, {}))
    try:
        _store_call(proactive_store.get_store().save_connector, connector_id, body.expected_version, body.enabled,
                    settings, ops, operator.subject, audits)
    except proactive_store.VersionConflict:
        raise HTTPException(status_code=409, detail="version_mismatch") from None
    return _view(connector_id, _store_call(proactive_store.get_store().list_configs))


@router.post("/connectors/{connector_id}/test")
def test_connector(connector_id: str, operator: Operator = Depends(_admin)):
    _known(connector_id)
    result = run_test(connector_id)
    _store_call(proactive_store.get_store().add_audit, connector_id, "test", result["ok"],
                {k: result[k] for k in ("status_code", "latency_ms", "message")}, operator.subject)
    return result


@router.get("/connectors/{connector_id}/audit")
def connector_audit(connector_id: str, operator: Operator = Depends(_admin)):
    _known(connector_id)
    return {"connector_id": connector_id, "audit": _store_call(proactive_store.get_store().list_audit, connector_id, 50)}



# --- kill switch --------------------------------------------------------------------------------
# One persisted row (013). Engaged, it stops new automation (run start, run advance, watch refresh)
# with 409 proactive_paused; reads, cancellation and existing drafts are untouched. An unreadable
# switch fails closed with 503 rather than assuming "not paused".

def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def pause_view(row: dict) -> dict:
    return {"paused": bool(row.get("paused")), "reason": row.get("reason"),
            "updated_at": _iso(row.get("updated_at")), "updated_by": row.get("updated_by")}


def require_not_paused() -> None:
    row = _store_call(proactive_store.get_store().get_pause)
    if row.get("paused") is not False:
        raise HTTPException(status_code=409, detail="proactive_paused")


class PauseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    paused: bool = Field(strict=True)
    reason: str = Field(min_length=10, max_length=500)


@router.get("/pause")
def get_pause(operator: Operator = Depends(get_operator)):
    # Explicit role list: a newly added role (for example response_team) must not gain this read by default.
    require_role(operator, {"incident_operator", "incident_checker", "incident_auditor", "department_operator", "platform_admin"})
    store = proactive_store.get_store()
    view = pause_view(_store_call(store.get_pause))
    if "platform_admin" in operator.roles:
        view["audit"] = _store_call(store.pause_audit, 20)
    return view


@router.put("/pause")
def put_pause(body: PauseUpdate, operator: Operator = Depends(_admin)):
    reason = body.reason.strip()
    if len(reason) < 10 or any(ord(c) < 32 for c in reason):
        raise HTTPException(status_code=422, detail="invalid_reason")
    store = proactive_store.get_store()
    row = _store_call(store.set_pause, body.paused, reason, operator.subject)
    return {**pause_view(row), "audit": _store_call(store.pause_audit, 20)}
