"""Opt-in scheduled watch loop (roadmap A1, autonomy L3: prepare and route, never act).

Default off. Enabled only when AEGIS_PROACTIVE=1 and AEGIS_PROACTIVE_SCHEDULER=1 (overlay
compose.proactive-scheduler.yaml) and AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID is a UUID set by the
operator in the trusted environment. Otherwise the loop refuses to start and logs a fixed reason.

The loop is one daemon thread inside the API process. Each tick:
  1. takes a PostgreSQL session advisory lock (pg_try_advisory_lock); a worker or replica that
     cannot take it records `skipped_locked` and does nothing;
  2. if the kill switch is engaged (or unreadable) records `skipped_paused` / `failed` and stops;
  3. refreshes evidence, runs the A2 sentinel for open runs, and for each newly fired candidate
     starts a draft-only bounded run as `system:scheduler`, advancing only gather_evidence,
     simulate_variants, judge and draft_cap. It always stops with next_step = hand_to_human.

A run is keyed by sha256(agency, trigger id, config version, cited evidence digests, impact config
version/status, cited exposure feature ids) and the 014
partial unique index makes a second run for the same evaluation impossible, even across workers.
Nothing here submits, approves, sends or notifies; `system:` subjects are rejected as makers,
checkers and token subjects everywhere (security.py, governance.py, proactive_run.advance).
Every tick writes one compact row with fixed error codes, never raw exceptions.
"""
import hashlib
import json
import logging
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from app import connectors, hazard_watch, impact, proactive_run, proactive_sentinel, proactive_store
from app.security import Operator, get_operator, require_role

SUBJECT = "system:scheduler"
DEFAULT_INTERVAL = 1800
MIN_INTERVAL = 300
FIRST_TICK_DELAY = 60
MAX_RUNS_PER_TICK = 5
AUTO_STEPS = ("gather_evidence", "simulate_variants", "judge", "draft_cap")  # never hand_to_human
ERROR_CODES = frozenset({"lock_unavailable", "pause_unreadable", "paused_mid_tick", "refresh_failed", "sentinel_failed",
                         "run_start_failed", "run_advance_failed", "run_cap_reached", "tick_failed"})
log = logging.getLogger("aegis.proactive.scheduler")


def requested() -> bool:
    return os.getenv("AEGIS_PROACTIVE_SCHEDULER", "").strip() == "1"


def interval_seconds() -> int:
    raw = os.getenv("AEGIS_PROACTIVE_SCHEDULER_INTERVAL", "").strip()
    try:
        value = int(raw) if raw else DEFAULT_INTERVAL
    except ValueError:
        value = DEFAULT_INTERVAL
    return max(MIN_INTERVAL, value)


def configured_agency() -> UUID | None:
    raw = os.getenv("AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID", "").strip()
    try:
        return UUID(raw) if raw else None
    except ValueError:
        return None


def refusal_reason() -> str | None:
    """Fixed code explaining why the loop must not run, or None when it may."""
    if not requested():
        return "scheduler_disabled"
    if not connectors.proactive_enabled():
        return "scheduler_requires_proactive"
    raw = os.getenv("AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID", "").strip()
    if not raw:
        return "scheduler_agency_missing"
    if configured_agency() is None:
        return "scheduler_agency_invalid"
    return None


def dedupe_key(agency_id, trigger: dict, evidence_digests: list[str]) -> str:
    # A3: the impact config version/status and the cited exposure features are part of the evaluation,
    # so a new impact config (or new exposure data) is a new evaluation and may prepare a new run.
    material = json.dumps([str(agency_id), trigger["trigger_id"], trigger["config_version"], sorted(evidence_digests),
                           impact.version_tag(trigger), impact.cited_features(trigger)], separators=(",", ":"))
    return hashlib.sha256(material.encode()).hexdigest()


def _paused(store) -> bool:
    return store.get_pause().get("paused") is not False


def _prepare(store, agency_id, trigger: dict, row: dict) -> None:
    """Start one draft-only run for `trigger` and advance it through AUTO_STEPS only."""
    rows = store.list_evidence(500, ids=trigger.get("evidence_ids") or [])
    key = dedupe_key(agency_id, trigger, [r["sha256"] for r in rows])
    run_id = str(uuid4())
    state = {**proactive_run.new_state(run_id, trigger, SUBJECT), "origin": "scheduler"}
    try:
        created = store.create_run(run_id, trigger["id"], state, SUBJECT,
                                   {"trigger_event_id": trigger["id"], "origin": "scheduler"}, agency_id, dedupe_key=key)
    except Exception:
        row["errors"].add("run_start_failed")
        return
    if not created:
        return  # identical evaluation already prepared (possibly by another worker)
    row["runs_started"] += 1
    for step in AUTO_STEPS:
        try:
            if _paused(store):
                row["errors"].add("paused_mid_tick")
                return
            store.update_run(run_id, lambda s, st=step: proactive_run.advance(s, st, SUBJECT, store), SUBJECT, agency_id)
        except Exception:
            row["errors"].add("run_advance_failed")
            return


def _work(store, agency_id, row: dict, refresh) -> None:
    try:
        _, triggers = refresh()
    except Exception:
        row["errors"].add("refresh_failed")
        row["outcome"] = "failed"
        return
    try:
        row["flags_recorded"] = proactive_sentinel.apply(store, agency_id, triggers)
    except Exception:
        row["errors"].add("sentinel_failed")
    try:
        open_ids = set()
        for state in store.list_runs(agency_id, 200):
            if state.get("status") == "running":
                trigger = store.get_trigger(state["trigger_event_id"])
                if trigger:
                    open_ids.add(trigger["trigger_id"])
    except Exception:
        row["errors"].add("run_start_failed")
        return
    # An open run already tracks this area/hazard; the sentinel flags it instead of a duplicate run.
    candidates = [t for t in triggers if t["state"] == "candidate" and t["trigger_id"] not in open_ids]
    for trigger in candidates:
        if row["runs_started"] >= MAX_RUNS_PER_TICK:
            row["errors"].add("run_cap_reached")
            break
        try:
            if _paused(store):
                row["errors"].add("paused_mid_tick")
                break
        except Exception:
            row["errors"].add("pause_unreadable")
            break
        _prepare(store, agency_id, trigger, row)


def tick(store=None, agency_id=None, refresh=None) -> dict:
    """One scheduler tick. Never raises; always attempts to record one tick row."""
    store = store or proactive_store.get_store()
    agency_id = agency_id or configured_agency()
    refresh = refresh or hazard_watch.refresh_detailed
    row = {"id": str(uuid4()), "agency_id": str(agency_id), "started_at": datetime.now(timezone.utc),
           "outcome": "completed", "runs_started": 0, "flags_recorded": 0, "errors": set(), "actor": SUBJECT}
    try:
        with store.tick_lock() as acquired:
            if not acquired:
                row["outcome"] = "skipped_locked"
            else:
                try:
                    paused = _paused(store)
                except Exception:
                    row["errors"].add("pause_unreadable")
                    row["outcome"] = "failed"  # fail closed: an unreadable switch is treated as engaged
                    paused = None
                if paused:
                    row["outcome"] = "skipped_paused"
                elif paused is False:
                    _work(store, agency_id, row, refresh)
    except Exception:
        row["errors"].add("lock_unavailable")
        row["outcome"] = "failed"
    row["errors"] = sorted(code for code in row["errors"] if code in ERROR_CODES)
    row["finished_at"] = datetime.now(timezone.utc)
    try:
        store.insert_tick(row)
    except Exception:
        log.warning("scheduler_tick_record_failed")
    return row


# --- background loop ------------------------------------------------------------------------------

class _Loop:
    def __init__(self):
        self.thread: threading.Thread | None = None
        self.stop = threading.Event()
        self.next_tick_at: datetime | None = None
        self.reason: str | None = "scheduler_disabled"

    def run(self, interval: int) -> None:
        delay = FIRST_TICK_DELAY
        while True:
            self.next_tick_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
            if self.stop.wait(delay):
                return
            try:
                tick()
            except Exception:  # tick() never raises; this is a last-resort guard for the thread
                log.warning("scheduler_tick_failed")
            delay = interval


_loop = _Loop()


def start_background() -> str | None:
    """Start the loop in this process if allowed. Returns the fixed refusal code, or None when started."""
    reason = refusal_reason()
    _loop.reason = reason
    if reason is not None:
        if reason != "scheduler_disabled":
            log.warning(reason)
        return reason
    if _loop.thread is not None and _loop.thread.is_alive():
        return None
    _loop.stop.clear()
    _loop.thread = threading.Thread(target=_loop.run, args=(interval_seconds(),), name="aegis-proactive-scheduler", daemon=True)
    _loop.thread.start()
    log.info("scheduler_started")
    return None


def stop_background(timeout: float = 5.0) -> None:
    _loop.stop.set()
    if _loop.thread is not None:
        _loop.thread.join(timeout)
    _loop.thread = None
    _loop.next_tick_at = None


def install(app) -> None:
    """Wrap the app lifespan so the loop starts after startup and stops on shutdown."""
    previous = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        start_background()
        try:
            async with previous(application) as state:
                yield state
        finally:
            stop_background()

    app.router.lifespan_context = lifespan


# --- routes ---------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/proactive", tags=["proactive"], dependencies=[Depends(connectors.require_proactive)])
READ_ROLES = {"incident_operator", "incident_checker", "incident_auditor", "platform_admin"}


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def tick_view(row: dict) -> dict:
    # agency_id is deliberately omitted: scope is applied by the query, never echoed.
    return {"id": row["id"], "started_at": _iso(row["started_at"]), "finished_at": _iso(row["finished_at"]),
            "outcome": row["outcome"], "runs_started": int(row["runs_started"]), "flags_recorded": int(row["flags_recorded"]),
            "errors": [code for code in (row.get("errors") or []) if code in ERROR_CODES]}


@router.get("/scheduler")
def get_scheduler(limit: int = Query(default=10, ge=1, le=50), operator: Operator = Depends(get_operator)):
    require_role(operator, READ_ROLES)
    # Operators see ticks for their own verified agency only; platform_admin sees every agency.
    scope = None if "platform_admin" in operator.roles else operator.agency_id
    try:
        ticks = [tick_view(r) for r in proactive_store.get_store().list_ticks(scope, limit)]
    except Exception:
        raise HTTPException(status_code=503, detail="proactive_store_unavailable") from None
    running = _loop.thread is not None and _loop.thread.is_alive()
    return {"enabled": requested(), "running": running, "reason": None if running else refusal_reason() or "scheduler_not_started",
            "interval_seconds": interval_seconds(), "next_tick_at": _iso(_loop.next_tick_at) if running else None,
            "last_tick": ticks[0] if ticks else None, "ticks": ticks,
            "note": "Prepares draft runs only and stops before hand_to_human. Nothing is submitted, approved or sent."}
