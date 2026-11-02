"""Opt-in public report intake: quarantine only.

Reports are stored in an isolated table and shown read-only. They never create or
enrich cases, evidence, assessments, tasks, notifications or warnings, and they carry
no contact details. Disabled unless AEGIS_PUBLIC_INTAKE=1.
See docs/EARTH_WATCH_ENHANCEMENT_PLAN.md (E5) and docs/PUBLIC_INTAKE_SECURITY.md.
"""
import hashlib
import os
import re
import threading
import time
import unicodedata
from collections import deque
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

router = APIRouter(prefix="/v1/public-intake", tags=["public-intake"])

MAX_BODY_BYTES = 4096
PER_MINUTE = 5
PER_HOUR = 30
MAX_PER_DAY = 200
CLASSIFICATION = "public_unverified_intake"
CONTACT_MESSAGE = "Please remove personal contact details and links; reports are reviewed without identifying anyone."

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# Best-effort screens, not proof of anonymity: a human reviewer still reads every report.
_AT = r"(?:@|\[\s*at\s*\]|\(\s*at\s*\))"
_DOT = r"(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\))"
_EMAIL = re.compile(rf"[\w.+-]+\s*{_AT}\s*[\w-]+(?:\s*{_DOT}\s*[\w-]+)+", re.I)
_URL = re.compile(r"(?:https?://|hxxps?://|www\.|\b[a-z0-9-]+\.[a-z]{2,24}(?:/|\b))", re.I)
_DIGITS = re.compile(r"(?:\d[^A-Za-z0-9]{0,3}){8,}")
_DIGIT_WORDS = re.compile(r"(?:\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){7,}", re.I)
_recent: deque[float] = deque()
_lock = threading.Lock()


def enabled() -> bool:
    return os.environ.get("AEGIS_PUBLIC_INTAKE") == "1"


def normalise(value: str) -> str:
    """NFKC-fold, map CJK/fullwidth stops, and drop invisible format and control characters."""
    folded = unicodedata.normalize("NFKC", value).replace("。", ".").replace("｡", ".")
    kept = "".join(" " if _CONTROL.match(ch) else ch for ch in folded if unicodedata.category(ch) != "Cf")
    return re.sub(r"[ \t]+", " ", kept).strip()


class IntakeReport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=100)
    description: str = Field(min_length=10, max_length=1000)
    hazard_type: Literal["flood", "waterlogging", "wildfire", "landslide", "cyclone", "other"]
    lat: float = Field(ge=5, le=38, allow_inf_nan=False)
    lon: float = Field(ge=65, le=100, allow_inf_nan=False)

    @field_validator("title", "description")
    @classmethod
    def no_contact_details(cls, value: str) -> str:
        value = normalise(value)
        if _EMAIL.search(value) or _URL.search(value) or _DIGITS.search(value) or _DIGIT_WORDS.search(value):
            raise ValueError(CONTACT_MESSAGE)
        return value


def content_digest(report: IntakeReport) -> str:
    material = "\x1f".join([report.title.casefold(), report.description.casefold(), report.hazard_type,
                            f"{report.lat:.5f}", f"{report.lon:.5f}"])
    return hashlib.sha256(material.encode()).hexdigest()


def _within_rate_limit(now: float) -> bool:
    # Process-wide ceiling for this loopback demo; see docs/PUBLIC_INTAKE_SECURITY.md for the
    # per-client limiter required before any network exposure.
    with _lock:
        while _recent and now - _recent[0] > 3600:
            _recent.popleft()
        if sum(1 for stamp in _recent if now - stamp <= 60) >= PER_MINUTE or len(_recent) >= PER_HOUR:
            return False
        _recent.append(now)
        return True


def reset_rate_limit() -> None:
    with _lock:
        _recent.clear()


# --- storage -------------------------------------------------------------------------------

def _connect():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def recent_count() -> int:
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM public_intake_reports WHERE submitted_at > now() - interval '1 day'")
        return int(cur.fetchone()["n"])


def already_received(digest: str) -> bool:
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 AS found FROM public_intake_reports WHERE content_sha256=%s", (digest,))
        return cur.fetchone() is not None


def insert_report(report: IntakeReport, digest: str) -> dict:
    """Insert one quarantined report; a concurrent identical report is reported as a duplicate."""
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO public_intake_reports (id, title, description, hazard_type, lat, lon, content_sha256)
               VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (content_sha256) DO NOTHING
               RETURNING id::text, submitted_at""",
            (str(uuid4()), report.title, report.description, report.hazard_type, report.lat, report.lon, digest))
        row = cur.fetchone()
    if row is None:
        return {"duplicate": True}
    return {"id": row["id"], "submitted_at": row["submitted_at"].isoformat(), "duplicate": False}


def list_reports(limit: int) -> dict:
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM public_intake_reports")
        total = int(cur.fetchone()["n"])
        cur.execute(
            """SELECT id::text, submitted_at, title, description, hazard_type, lat, lon, status
               FROM public_intake_reports ORDER BY submitted_at DESC, id ASC LIMIT %s""", (limit,))
        rows = cur.fetchall()
    return {"total": total, "reports": [{**row, "submitted_at": row["submitted_at"].isoformat()} for row in rows]}


# --- routes --------------------------------------------------------------------------------

def _require_enabled() -> None:
    if not enabled():
        raise HTTPException(status_code=503, detail="Public report intake is disabled in this environment")


async def _read_capped_body(request: Request) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None:
        if not declared.isdigit():
            raise HTTPException(status_code=400, detail="Invalid request")
        if int(declared) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Report is too large")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Report is too large")
    return bytes(body)


@router.get("/status")
def intake_status():
    return {"classification": CLASSIFICATION, "enabled": enabled(), "quarantine_only": True,
            "accepts_contact_details": False, "creates_cases": False, "notifies_responders": False,
            "notice": "Reports are unverified, held for human review and never become cases automatically."}


@router.post("/reports", status_code=201)
async def submit_report(request: Request):
    _require_enabled()
    # Reject text/plain "simple" cross-site POSTs, which browsers send without a CORS preflight.
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(status_code=415, detail="Unsupported content type")
    raw = await _read_capped_body(request)
    try:
        report = IntakeReport.model_validate_json(raw)
    except ValidationError as error:
        messages = {str(item["msg"]).removeprefix("Value error, ") for item in error.errors()}
        detail = CONTACT_MESSAGE if CONTACT_MESSAGE in messages else "Please check the form fields."
        raise HTTPException(status_code=422, detail=detail) from None
    digest = content_digest(report)
    generic_duplicate = {"classification": CLASSIFICATION, "status": "quarantined", "duplicate": True,
                         "message": "This report was already received. It is unverified and creates no case."}
    try:
        # Duplicates neither use a rate-limit slot nor reveal the original id or time.
        if await run_in_threadpool(already_received, digest):
            return generic_duplicate
        if not _within_rate_limit(time.time()):
            raise HTTPException(status_code=429, detail="Too many reports right now. Please wait a moment and try again.",
                                headers={"Retry-After": "60"})
        if await run_in_threadpool(recent_count) >= MAX_PER_DAY:
            raise HTTPException(status_code=429, detail="The quarantine queue has reached its daily limit.",
                                headers={"Retry-After": "3600"})
        stored = await run_in_threadpool(insert_report, report, digest)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Report could not be stored; nothing was saved") from None
    if stored["duplicate"]:
        return generic_duplicate
    return {"classification": CLASSIFICATION, "status": "quarantined", "id": stored["id"],
            "submitted_at": stored["submitted_at"], "duplicate": False,
            "message": "Received for human review. It is unverified, creates no case and notifies no responder."}


@router.get("/reports")
async def read_reports(limit: int = Query(default=50, ge=1, le=100)):
    _require_enabled()
    try:
        data = await run_in_threadpool(list_reports, limit)
    except Exception:
        raise HTTPException(status_code=503, detail="Quarantine queue unavailable") from None
    return {"classification": CLASSIFICATION, "quarantine_only": True, "creates_cases": False, **data}
