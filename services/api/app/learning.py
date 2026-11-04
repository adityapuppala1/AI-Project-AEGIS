"""A8 post-event learning: per-rule rehearsal statistics and maker-checker threshold proposals.

A closed event window (an operator's explicit close action, or a replay of catalogue/synthetic events) is
scored per trigger rule (hazard x level): hits, misses, false-alarm episodes and lead time, with Wilson 95%
intervals only when n permits. The statistics describe synthetic rehearsal thresholds against operator or
catalogue labels. They are never forecasting accuracy; research/real-data/PHASE2_PROTOCOL.md forbids that
wording and this module never uses it.

A proposal is a versioned config diff generated from the statistics only (no free text from anyone). The
maker submits; a different, non-system incident_checker or platform_admin in the same agency approves or
rejects with a rationale. Approval only records an approved config candidate. The engine changes only when a
platform_admin explicitly applies it, which writes a new trigger_config_versions row that
hazard_watch.effective_config() then overlays on the fixture.
"""
import csv
import hashlib
import json
import math
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from statistics import median
from uuid import UUID, NAMESPACE_URL, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import connectors, governance, hazard_watch, learning_store, proactive_replay
from app.security import Operator, get_operator, require_role

STATS_VERSION = "aegis.learning.stats.v1"
PROPOSAL_VERSION = "aegis.learning.threshold-proposal.v1"
SCENARIOS_PATH = Path(__file__).parent / "fixtures" / "exercise_scenarios.v1.json"
Z95 = 1.959963984540054
MIN_CI_N = 5            # below this no interval is reported (matches PHASE2 MIN_TEST_EVENTS)
LEAD_MAX_DAYS = 3       # a firing up to 3 days before an event day counts towards that event
AFTER_DAYS = 1          # ... and up to 1 day after (late)
MAX_WINDOW_DAYS = 400
MAX_EVENTS = 100
MAX_CITED = 50
STEP = 0.10             # proposals move a threshold by 10%, never more
LEVELS = ("watch", "candidate")
RANK = {"clear": 0, "watch": 1, "candidate": 2}
BASIS_NOTE = {
    "synthetic_rehearsal": "Synthetic rehearsal statistics on uncalibrated thresholds; not forecasting accuracy.",
    "known_events_unreviewed": ("Retrospective agreement with unreviewed catalogue rows (secondary sources, no "
                                "second-person review); not forecasting accuracy."),
    "registered_protocol_labels": ("Catalogue labels meet the registered protocol's label rules, but this is not the "
                                   "registered Phase 2 analysis; retrospective agreement only, not forecasting accuracy."),
}
FORBIDDEN_WORDS = ("accuracy", "predicts", "prediction")


class LearningError(RuntimeError):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


# --- statistics ---------------------------------------------------------------------------------

def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float] | None:
    """Wilson score interval. None when n < MIN_CI_N (including n == 0)."""
    if not isinstance(k, int) or not isinstance(n, int) or n < 0 or not 0 <= k <= n:
        raise ValueError("invalid counts")
    if n < MIN_CI_N:
        return None
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4)


def rate(k: int, n: int) -> dict:
    ci = wilson(k, n)
    return {"k": k, "n": n, "estimate": round(k / n, 4) if n else None, "ci95": list(ci) if ci else None,
            "ci_method": "wilson" if ci else None,
            "ci_reason": None if ci else ("no_cases" if n == 0 else "n_below_minimum")}


def rule_stats(rule_id: str, fired: dict, events: list[date]) -> dict:
    """fired: day -> list of cited trigger/evidence ids for days on which this rule fired."""
    events = sorted(set(events))
    fired_days = sorted(fired)
    hits, misses, leads, matched = [], [], [], set()
    for event in events:
        near = [d for d in fired_days if event - timedelta(days=LEAD_MAX_DAYS) <= d <= event + timedelta(days=AFTER_DAYS)]
        if near:
            hits.append(event)
            leads.append((event - near[0]).days)
            matched.update(near)
        else:
            misses.append(event)
    false_days = [d for d in fired_days if d not in matched]
    episodes = []
    for day in false_days:
        if episodes and (day - episodes[-1][-1]).days <= 1:
            episodes[-1].append(day)
        else:
            episodes.append([day])
    cited = sorted({i for d in fired_days for i in fired[d]})[:MAX_CITED]
    return {
        "rule_id": rule_id, "events": len(events), "fired_days": len(fired_days),
        "hits": len(hits), "misses": len(misses), "false_alarm_episodes": len(episodes),
        "hit_days": [d.isoformat() for d in hits], "miss_days": [d.isoformat() for d in misses],
        "false_alarm_days": [d.isoformat() for d in false_days],
        "probability_of_detection": rate(len(hits), len(events)),
        "false_alarm_ratio": rate(len(episodes), len(hits) + len(episodes)),
        "lead_time_days": ({"n": len(leads), "min": min(leads), "median": median(leads), "max": max(leads)}
                           if leads else {"n": 0, "min": None, "median": None, "max": None}),
        "cited_ids": cited,
    }


def compute_stats(hazard: str, fired_by_level: dict, events: list[date], *, start: date, end: date, basis: str,
                  config_version: str) -> dict:
    return {"version": STATS_VERSION, "hazard": hazard, "window_start": start.isoformat(), "window_end": end.isoformat(),
            "config_version": config_version, "basis": basis, "basis_note": BASIS_NOTE[basis], "accuracy_claim": False,
            "match_window_days": {"before": LEAD_MAX_DAYS, "after": AFTER_DAYS}, "ci_min_n": MIN_CI_N,
            "rules": [rule_stats(f"{hazard}:{level}", fired_by_level.get(level, {}), events) for level in LEVELS]}


def fired_from_triggers(rows: list[dict]) -> dict:
    """Stored trigger events -> per-level fired days, citing trigger event ids."""
    out = {level: {} for level in LEVELS}
    for row in rows:
        fired_at = row["fired_at"]
        day = (fired_at if isinstance(fired_at, datetime) else datetime.fromisoformat(str(fired_at))).astimezone(timezone.utc).date()
        for level in LEVELS:
            if RANK.get(row.get("state"), 0) >= RANK[level]:
                out[level].setdefault(day, []).append(str(row["id"]))
    return out


def fired_from_series(hazard: str, series: dict, config: dict, point: dict, salt: str) -> dict:
    """Replay a daily series through the existing pure evaluation path (hazard_watch.evaluate), one day at a
    time. Rows are exercise-labelled and never stored as evidence."""
    out = {level: {} for level in LEVELS}
    for day, value in sorted(series.items()):
        row = {"id": str(uuid5(NAMESPACE_URL, f"aegis-learning:{salt}:{day.isoformat()}")), "connector_id": "exercise_replay",
               "hazard": hazard, "observed_at": datetime.combine(day, time(), timezone.utc), "lat": point["lat"],
               "lon": point["lon"], "value": float(value), "unit": "replay", "payload": {"point_id": point["id"], "exercise": True}}
        match = next((t for t in hazard_watch.evaluate([row], config) if t["hazard"] == hazard), None)
        if match is None:
            continue
        for level in LEVELS:
            if RANK[match["state"]] >= RANK[level]:
                out[level].setdefault(day, []).append(row["id"])
    return out


@lru_cache(maxsize=1)
def load_scenarios() -> dict:
    return json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))


def scenario(scenario_id: str) -> dict | None:
    return next((s for s in load_scenarios()["scenarios"] if s["id"] == scenario_id), None)


def catalogue_basis(rows: list[dict]) -> str:
    """PHASE2_PROTOCOL section 4 label rules. Anything less is 'known_events_unreviewed'."""
    def ok(row):
        r1, r2 = (row.get("reviewer_1") or "").strip().lower(), (row.get("reviewer_2") or "").strip().lower()
        url = (row.get("evidence_url") or row.get("source_url") or "").strip()
        return row.get("label") in {"event", "non_event"} and r1 and r2 and r1 != r2 and url.startswith(("http://", "https://"))
    return "registered_protocol_labels" if rows and all(ok(r) for r in rows) else "known_events_unreviewed"


def _catalogue_path() -> Path:
    return proactive_replay._research_root() / "catalogue" / "known_events.csv"


def _check_wording(stats: dict) -> None:
    """Generated statistics must never carry claim wording; only the fixed disclaimer may mention accuracy."""
    text = json.dumps({k: v for k, v in stats.items() if k not in {"accuracy_claim", "basis_note"}}).lower()
    if any(word in text for word in FORBIDDEN_WORDS):
        raise LearningError(500, "forbidden_wording")


# --- proposals ----------------------------------------------------------------------------------

def propose(window: dict, config: dict) -> dict:
    """Deterministic, stats-only threshold diff for the window's hazard. Raises LearningError(409) to abstain."""
    hazard = window["hazard"]
    spec = config["hazards"].get(hazard)
    if spec is None:
        raise LearningError(409, "hazard_not_configurable")
    current = {level: float(spec[level]) for level in LEVELS}
    new, decisions = dict(current), []
    for rule in window["stats"]["rules"]:
        level = rule["rule_id"].split(":")[1]
        if rule["misses"] > 0:
            decision, value = "lower_10pct_on_misses", round(current[level] * (1 - STEP), 4)
        elif rule["false_alarm_episodes"] > rule["hits"]:
            decision, value = "raise_10pct_on_false_alarms", round(current[level] * (1 + STEP), 4)
        else:
            decision, value = "no_change", current[level]
        new[level] = value
        decisions.append({"rule_id": rule["rule_id"], "decision": decision, "hits": rule["hits"], "misses": rule["misses"],
                          "false_alarm_episodes": rule["false_alarm_episodes"], "events": rule["events"],
                          "pod_estimate": rule["probability_of_detection"]["estimate"],
                          "pod_ci95": rule["probability_of_detection"]["ci95"],
                          "far_estimate": rule["false_alarm_ratio"]["estimate"],
                          "far_ci95": rule["false_alarm_ratio"]["ci95"]})
    if new["watch"] >= new["candidate"]:
        raise LearningError(409, "proposal_would_invert_levels")
    changes = [{"path": f"hazards.{hazard}.{level}", "hazard": hazard, "level": level, "old": current[level], "new": new[level]}
               for level in LEVELS if new[level] != current[level]]
    if not changes:
        raise LearningError(409, "stats_do_not_support_change")
    fixture_version = hazard_watch.load_config()["version"]
    digest = hashlib.sha256(json.dumps([config["version"], changes, window["id"]], sort_keys=True).encode()).hexdigest()
    return {"base_version": config["version"], "new_version": f"{fixture_version}-l{digest[:12]}",
            "diff": {"format": PROPOSAL_VERSION, "base_version": config["version"], "fixture_version": fixture_version,
                     "changes": changes},
            "rationale": {"generated_from": "window_statistics_only", "window_id": window["id"],
                          "basis": window["basis"], "basis_note": BASIS_NOTE[window["basis"]], "rules": decisions,
                          "step_fraction": STEP, "accuracy_claim": False,
                          "note": "Rehearsal threshold candidate. Approval does not change the engine; only an explicit apply does."}}


def overrides_after(proposal: dict, latest: dict | None) -> dict:
    """Cumulative overlay for the new version: the current overlay plus this proposal's changes."""
    overrides = json.loads(json.dumps((latest or {}).get("overrides") or {}))
    for change in proposal["diff"]["changes"]:
        overrides.setdefault(change["hazard"], {})[change["level"]] = change["new"]
    return overrides


def _as_proposal(row: dict) -> governance.Proposal:
    return governance.Proposal(proposal_id=row["id"], incident_id=row["window_id"], maker_subject=row["maker_subject"],
                               action=governance.Action.INTERNAL_TRIAGE, status=governance.Status(row["status"]),
                               checker_subject=row.get("checker_subject"), decision_reason=row.get("decision_rationale"))


# --- routes -------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/proactive/learning", tags=["learning"], dependencies=[Depends(connectors.require_proactive)])
READ_ROLES = {"incident_operator", "incident_checker", "incident_auditor", "platform_admin"}


class CloseWindow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hazard: str = Field(pattern=r"^[a-z][a-z_]{1,39}$")
    window_start: date
    window_end: date
    observed_event_days: list[date] = Field(default_factory=list, max_length=MAX_EVENTS)


class ReplayWindow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(pattern=r"^(known_events|synthetic)$")
    scenario_id: str | None = Field(default=None, pattern=r"^[a-z0-9_.-]{1,80}$")
    window_start: date | None = None
    window_end: date | None = None


class CreateProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    window_id: UUID


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approve: bool = Field(strict=True)
    rationale: str = Field(min_length=10, max_length=2000)


class Apply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rationale: str = Field(min_length=10, max_length=2000)


def _call(fn, *args):
    try:
        return fn(*args)
    except LearningError as error:
        raise HTTPException(status_code=error.status, detail=error.code) from None
    except governance.DecisionError:
        raise HTTPException(status_code=409, detail="independent_checker_required") from None
    except KeyError:
        raise HTTPException(status_code=404, detail="not_found") from None
    except HTTPException:
        raise
    except ValueError as error:
        code = str(error)
        raise HTTPException(status_code=409, detail=code if code in {"base_version_stale", "proposal_not_applicable"}
                            else "learning_conflict") from None
    except Exception:
        raise HTTPException(status_code=503, detail="learning_store_unavailable") from None


def _reader(operator: Operator = Depends(get_operator)) -> Operator:
    require_role(operator, READ_ROLES)
    return operator


def _maker(operator: Operator = Depends(get_operator)) -> Operator:
    require_role(operator, {"incident_operator"})
    return operator


def _validate_window(start: date, end: date) -> None:
    if end < start or (end - start).days > MAX_WINDOW_DAYS:
        raise LearningError(422, "invalid_window")


def _store_window(operator, hazard, start, end, source, basis, events, stats, action, config_version):
    _check_wording(stats)
    row = {"id": str(uuid4()), "agency_id": operator.agency_id, "hazard": hazard, "window_start": start, "window_end": end,
           "source": source, "basis": basis, "config_version": config_version,
           "observed_events": [d.isoformat() for d in sorted(set(events))], "stats": stats, "closed_by": operator.subject}
    return learning_store.get_store().create_window(row, action)


def close_window(body: CloseWindow, operator: Operator) -> dict:
    if operator.subject.lower().startswith("system:"):
        raise LearningError(409, "system_actor_cannot_close")
    config = hazard_watch.effective_config()
    if body.hazard not in config["hazards"]:
        raise LearningError(422, "unknown_hazard")
    _validate_window(body.window_start, body.window_end)
    events = [d for d in body.observed_event_days if body.window_start <= d <= body.window_end]
    if len(events) != len(body.observed_event_days):
        raise LearningError(422, "event_outside_window")
    rows = learning_store.get_store().triggers_between(body.hazard, body.window_start, body.window_end)
    stats = compute_stats(body.hazard, fired_from_triggers(rows), events, start=body.window_start, end=body.window_end,
                          basis="synthetic_rehearsal", config_version=config["version"])
    return _store_window(operator, body.hazard, body.window_start, body.window_end, "operator_close",
                         "synthetic_rehearsal", events, stats, "close", config["version"])


def replay_window(body: ReplayWindow, operator: Operator) -> dict:
    config = hazard_watch.effective_config()
    if body.source == "synthetic":
        found = scenario(body.scenario_id or "")
        if found is None:
            raise LearningError(404, "scenario_not_found")
        daily = found["daily"]
        start = date.fromisoformat(daily["start"])
        series = {start + timedelta(days=i): v for i, v in enumerate(daily["values"])}
        end = max(series)
        events = [date.fromisoformat(d) for d in daily["event_days"]]
        point = {"id": found["point_id"], "lat": found["lat"], "lon": found["lon"]}
        fired = fired_from_series(found["hazard"], series, config, point, found["id"])
        stats = compute_stats(found["hazard"], fired, events, start=start, end=end, basis="synthetic_rehearsal",
                              config_version=config["version"])
        stats["scenario_id"] = found["id"]
        return _store_window(operator, found["hazard"], start, end, "replay_synthetic", "synthetic_rehearsal", events,
                             stats, "replay", config["version"])
    # Known events: training years only, so the registered final-test years stay unused.
    if body.window_start is None or body.window_end is None:
        raise LearningError(422, "window_required")
    _validate_window(body.window_start, body.window_end)
    lo, hi = proactive_replay.TRAIN_YEARS
    if body.window_start.year < lo or body.window_end.year > hi:
        raise LearningError(422, "training_years_only")
    root = proactive_replay._research_root()
    try:
        rain = proactive_replay.daily_max_rain(root / "raw", proactive_replay.TRAIN_YEARS)
        with _catalogue_path().open(encoding="utf-8", newline="") as handle:
            catalogue = list(csv.DictReader(handle))
    except (FileNotFoundError, OSError, KeyError, ValueError):
        raise LearningError(409, "raw_archive_missing") from None
    rows = [r for r in catalogue if body.window_start <= date.fromisoformat(r["date"]) <= body.window_end]
    events = [date.fromisoformat(r["date"]) for r in rows if r.get("label") in {"flood_event", "event"}]
    series = {date.fromisoformat(d): v for d, v in rain.items() if body.window_start <= date.fromisoformat(d) <= body.window_end}
    point = {"id": "pilot_grid_max", "lat": hazard_watch.RAIN_POINTS[0]["lat"], "lon": hazard_watch.RAIN_POINTS[0]["lon"]}
    fired = fired_from_series("heavy_rain", series, config, point, "known_events")
    basis = catalogue_basis(rows)
    stats = compute_stats("heavy_rain", fired, events, start=body.window_start, end=body.window_end, basis=basis,
                          config_version=config["version"])
    stats["event_refs"] = [f"known_events:{d.isoformat()}" for d in events]
    return _store_window(operator, "heavy_rain", body.window_start, body.window_end, "replay_known_events", basis, events,
                         stats, "replay", config["version"])


def create_proposal(window_id: UUID, operator: Operator) -> dict:
    store = learning_store.get_store()
    window = store.get_window(window_id, operator.agency_id)
    if window is None:
        raise LearningError(404, "window_not_found")
    config = hazard_watch.effective_config()
    if window["config_version"] != config["version"]:
        raise LearningError(409, "window_config_outdated")
    drafted = propose(window, config)
    return store.create_proposal({"id": str(uuid4()), "agency_id": operator.agency_id, "window_id": str(window_id),
                                  **drafted, "maker_subject": operator.subject})


def submit_proposal(proposal_id: UUID, operator: Operator) -> dict:
    def mutate(row):
        if row["status"] == "submitted" and row["maker_subject"] == operator.subject:
            return None, "submit", {}
        governance.submit(_as_proposal(row), operator.subject)
        return {"status": "submitted"}, "submit", {"new_version": row["new_version"]}
    return learning_store.get_store().update_proposal(proposal_id, operator.agency_id, mutate, operator.subject)[0]


def review_proposal(proposal_id: UUID, body: Review, operator: Operator) -> dict:
    def mutate(row):
        reviewed = governance.review(_as_proposal(row), operator.subject, body.approve, body.rationale)
        return ({"status": reviewed.status.value, "checker_subject": reviewed.checker_subject,
                 "decision_rationale": reviewed.decision_reason},
                "approve" if body.approve else "reject",
                {"applies_to_engine": False, "new_version": row["new_version"]})
    return learning_store.get_store().update_proposal(proposal_id, operator.agency_id, mutate, operator.subject)[0]


def apply_proposal(proposal_id: UUID, body: Apply, operator: Operator) -> dict:
    if operator.subject.lower().startswith("system:"):
        raise LearningError(409, "system_actor_cannot_apply")
    store = learning_store.get_store()
    row = store.get_proposal(proposal_id, operator.agency_id)
    if row is None:
        raise LearningError(404, "proposal_not_found")
    if row["status"] != "approved" or row.get("applied_version"):
        raise LearningError(409, "proposal_not_applicable")
    latest = store.latest_config_version()
    current = hazard_watch.overlay_config(hazard_watch.load_config(), latest)
    if current["version"] != row["base_version"]:
        raise LearningError(409, "base_version_stale")
    overrides = overrides_after(row, latest)
    check = hazard_watch.overlay_config(hazard_watch.load_config(), {
        "version_id": row["new_version"], "base_version": hazard_watch.load_config()["version"], "overrides": overrides})
    if check["config_source"] != "applied_overlay":
        raise LearningError(409, "overlay_invalid")
    return store.apply_proposal(proposal_id, operator.agency_id, {
        "version_id": row["new_version"], "base_version": hazard_watch.load_config()["version"], "overrides": overrides,
        "expected_current": latest["version_id"] if latest else None},
        operator.subject, {"rationale": body.rationale.strip(), "previous_version": current["version"],
                           "changes": row["diff"]["changes"]})


@router.get("/windows")
def list_windows(operator: Operator = Depends(_reader)):
    return {"windows": _call(learning_store.get_store().list_windows, operator.agency_id, 50)}


@router.post("/windows/close", status_code=201)
def post_close_window(body: CloseWindow, operator: Operator = Depends(_maker)):
    return _call(close_window, body, operator)


@router.post("/windows/replay", status_code=201)
def post_replay_window(body: ReplayWindow, operator: Operator = Depends(_maker)):
    return _call(replay_window, body, operator)


@router.get("/windows/{window_id}")
def get_window(window_id: UUID, operator: Operator = Depends(_reader)):
    row = _call(learning_store.get_store().get_window, window_id, operator.agency_id)
    if row is None:
        raise HTTPException(status_code=404, detail="window_not_found")
    return row


@router.get("/scenarios")
def get_scenarios(operator: Operator = Depends(_reader)):
    data = load_scenarios()
    return {"version": data["version"], "note": data["note"],
            "scenarios": [{k: s[k] for k in ("id", "title", "source", "event_ref", "hazard")} for s in data["scenarios"]]}


@router.get("/proposals")
def list_proposals(operator: Operator = Depends(_reader)):
    return {"proposals": _call(learning_store.get_store().list_proposals, operator.agency_id, 50)}


@router.post("/proposals", status_code=201)
def post_proposal(body: CreateProposal, operator: Operator = Depends(_maker)):
    return _call(create_proposal, body.window_id, operator)


@router.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: UUID, operator: Operator = Depends(_reader)):
    store = learning_store.get_store()
    row = _call(store.get_proposal, proposal_id, operator.agency_id)
    if row is None:
        raise HTTPException(status_code=404, detail="proposal_not_found")
    subjects = [str(proposal_id)] + ([row["applied_version"]] if row.get("applied_version") else [])
    return {**row, "audit": _call(store.audit_for, subjects, operator.agency_id)}


@router.post("/proposals/{proposal_id}/submit")
def post_submit(proposal_id: UUID, operator: Operator = Depends(_maker)):
    return _call(submit_proposal, proposal_id, operator)


@router.post("/proposals/{proposal_id}/review")
def post_review(proposal_id: UUID, body: Review, operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_checker", "platform_admin"})
    return _call(review_proposal, proposal_id, body, operator)


@router.post("/proposals/{proposal_id}/apply")
def post_apply(proposal_id: UUID, body: Apply, operator: Operator = Depends(get_operator)):
    require_role(operator, {"platform_admin"})
    connectors.require_not_paused()  # changing what the engine evaluates is blocked while paused
    return _call(apply_proposal, proposal_id, body, operator)


@router.get("/config")
def get_config(operator: Operator = Depends(_reader)):
    effective = hazard_watch.effective_config()
    return {"effective_version": effective["version"], "config_source": effective["config_source"],
            "fixture_version": hazard_watch.load_config()["version"],
            "thresholds": {name: {level: spec[level] for level in LEVELS} for name, spec in effective["hazards"].items()},
            "versions": _call(learning_store.get_store().list_config_versions, 20)}
