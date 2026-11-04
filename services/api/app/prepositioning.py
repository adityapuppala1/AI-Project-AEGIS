"""Deterministic pre-positioning planner (roadmap A5). Recommendation only: no team is moved or notified.

Given a run's cited exposure features (impact block from the trigger, migration 015) and the
synthetic team fixture (app/fixtures/synthetic_teams.v1.json), propose 2-3 ranked options that
assign each eligible team to one staging point chosen from the cited facilities/shelters.

Travel time is "estimated, synthetic": haversine distance x road factor / fixed speed. Objective,
compared lexicographically: cover the most critical facilities within team capacity, then minimise
the maximum staging-to-facility travel time, then the total of the deterministic matching, then the
maximum base-to-staging time, then stable team/feature ids. The search is exact (full enumeration)
when staging_points ** teams <= EXACT_BOUND and a deterministic greedy otherwise. No clock, random
number or model is used, so the same inputs always produce the same plan.

This module only reads. It never creates department tasks, assignments, messages or notifications;
any later task still goes through the approved-only proposal flow.
"""
import hashlib
import heapq
import itertools
import json
import math
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from app import impact

VERSION = "aegis.prepositioning.plan.v1"
TEAMS_PATH = Path(__file__).parent / "fixtures" / "synthetic_teams.v1.json"
LABEL = "Recommendation only — no team is moved or notified"
EXACT_BOUND = 4096
MAX_TEAMS = 6
MAX_CRITICAL = 20
MAX_STAGING = 10
MAX_OPTIONS = 3
STAGING_PRIORITY = {"shelter": 0, "school": 1, "hospital": 2}
REASONS = frozenset({"run_blocked", "no_exposure", "no_critical_facilities", "no_staging_points", "no_available_teams",
                     "exposure_unavailable", "teams_unavailable"})


@lru_cache(maxsize=1)
def load_teams() -> dict:
    return json.loads(TEAMS_PATH.read_text(encoding="utf-8"))


def travel_minutes(a: dict, b: dict, model: dict) -> float:
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b["lon"] - a["lon"]) / 2) ** 2
    km = 6371.0 * 2 * math.asin(min(1.0, math.sqrt(h)))
    return round(km * float(model["road_factor"]) / float(model["speed_kmh"]) * 60.0, 1)


def _minutes_of_day(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def available(team: dict, at: datetime | None) -> bool:
    """Daily UTC window; a window that wraps midnight is supported. No time known -> not available."""
    if at is None:
        return False
    start, end = (_minutes_of_day(v) for v in team["available_utc"])
    now = at.hour * 60 + at.minute
    return start <= now <= end if start <= end else (now >= start or now <= end)


def eligible_teams(config: dict, hazard: str, at: datetime | None) -> list[dict]:
    required = set(config["hazard_capabilities"].get(hazard, []))
    teams = [t for t in config["teams"] if required & set(t["capabilities"]) and int(t["capacity"]) >= 1 and available(t, at)]
    return sorted(teams, key=lambda t: t["id"])[:MAX_TEAMS]


def _match(times: list[list[float]], capacity: list[int], threshold: float) -> list[int | None]:
    """Capacitated bipartite matching (augmenting paths) in stable facility/team order. -> team per facility."""
    load: list[list[int]] = [[] for _ in capacity]
    owner: list[int | None] = [None] * len(times)

    def augment(f: int, seen: set, current: int | None = None) -> bool:
        for t, minutes in enumerate(times[f]):
            if t == current or minutes > threshold or t in seen:
                continue
            seen.add(t)
            if len(load[t]) < capacity[t]:
                load[t].append(f)
                owner[f] = t
                return True
            for other in list(load[t]):
                if augment(other, seen, t):  # move `other` elsewhere, freeing a slot on t
                    load[t].remove(other)
                    load[t].append(f)
                    owner[f] = t
                    return True
        return False

    for f in range(len(times)):
        augment(f, set())
    return owner


def evaluate(placement: tuple[int, ...], teams: list[dict], staging: list[dict], critical: list[dict], model: dict) -> dict:
    """Best coverage, then the bottleneck time, for one team -> staging placement."""
    times = [[travel_minutes(staging[s], c, model) for s in placement] for c in critical]
    capacity = [int(t["capacity"]) for t in teams]
    owner = _match(times, capacity, math.inf)
    covered = sum(o is not None for o in owner)
    thresholds = sorted({m for row in times for m in row})
    lo, hi = 0, len(thresholds) - 1
    while lo < hi:  # smallest threshold that still achieves the maximum coverage
        mid = (lo + hi) // 2
        if sum(o is not None for o in _match(times, capacity, thresholds[mid])) == covered:
            hi = mid
        else:
            lo = mid + 1
    if thresholds:
        owner = _match(times, capacity, thresholds[lo])
    served = [(f, o) for f, o in enumerate(owner) if o is not None]
    worst = max((times[f][o] for f, o in served), default=0.0)
    total = round(sum(times[f][o] for f, o in served), 1)
    preposition = [travel_minutes(t["base"], staging[s], model) for t, s in zip(teams, placement)]
    ids = tuple(staging[s]["id"] for s in placement)
    key = (-covered, worst, total, max(preposition, default=0.0), ids)
    return {"key": key, "placement": placement, "owner": owner, "times": times, "preposition": preposition}


def _greedy(teams, staging, critical, model, banned: tuple[int, int] | None = None) -> dict:
    order = sorted(range(len(teams)), key=lambda i: (-int(teams[i]["capacity"]), teams[i]["id"]))
    chosen: dict[int, int] = {}
    for i in order:
        best = None
        for s in range(len(staging)):
            if banned == (i, s):
                continue
            trial = {**chosen, i: s}
            idx = sorted(trial)
            result = evaluate(tuple(trial[k] for k in idx), [teams[k] for k in idx], staging, critical, model)
            if best is None or result["key"] < best[0]:
                best = (result["key"], s)
        if best is None:
            best = (None, 0)
        chosen[i] = best[1]
    return evaluate(tuple(chosen[i] for i in range(len(teams))), teams, staging, critical, model)


def search(teams: list[dict], staging: list[dict], critical: list[dict], model: dict) -> tuple[list[dict], str, int]:
    combinations = len(staging) ** len(teams)
    if combinations <= EXACT_BOUND:
        results = (evaluate(p, teams, staging, critical, model) for p in itertools.product(range(len(staging)), repeat=len(teams)))
        return heapq.nsmallest(MAX_OPTIONS, results, key=lambda r: r["key"]), "exact", combinations
    first = _greedy(teams, staging, critical, model)
    pool = {first["placement"]: first}
    order = sorted(range(len(teams)), key=lambda i: (-int(teams[i]["capacity"]), teams[i]["id"]))
    for i in order[:MAX_OPTIONS - 1]:
        alt = _greedy(teams, staging, critical, model, banned=(i, first["placement"][i]))
        pool.setdefault(alt["placement"], alt)
    return sorted(pool.values(), key=lambda r: r["key"])[:MAX_OPTIONS], "greedy", combinations


def _option(rank: int, result: dict, teams, staging, critical) -> dict:
    assignments = []
    for t, (team, s) in enumerate(zip(teams, result["placement"])):
        covers = [{"feature_id": critical[f]["id"], "minutes": result["times"][f][t]}
                  for f, o in enumerate(result["owner"]) if o == t]
        assignments.append({"team_id": team["id"], "team_label": team["label"], "capacity": int(team["capacity"]),
                            "staging_feature_id": staging[s]["id"], "staging_kind": staging[s]["kind"],
                            "preposition_minutes": result["preposition"][t], "covers": covers})
    covered, worst, total, prep, _ = result["key"]
    return {"rank": rank, "covered": -covered, "critical_total": len(critical), "max_minutes": worst, "total_minutes": total,
            "max_preposition_minutes": prep, "assignments": assignments,
            "uncovered_feature_ids": [critical[f]["id"] for f, o in enumerate(result["owner"]) if o is None]}


def _abstain(reason: str, config: dict | None, extra: dict | None = None) -> dict:
    return {"version": VERSION, "status": "abstained", "reason": reason, "label": LABEL, "synthetic": True,
            "teams_source": (config or {}).get("version"), "travel_model": (config or {}).get("travel_model"),
            "options": [], "cited_team_ids": [], "cited_feature_ids": [], **(extra or {}),
            "team_moved": False, "notification_sent": False, "tasks_created": False}


def plan(state: dict, trigger: dict, store, config: dict | None = None) -> dict:
    """Pure function of (run impact block, trigger hazard/fired_at, exposure points, team fixture)."""
    try:
        config = config or load_teams()
    except Exception:
        return _abstain("teams_unavailable", None)
    if (state.get("judgment") or {}).get("decision_band") == "blocked":
        return _abstain("run_blocked", config)
    block = state.get("impact") or {}
    feature_ids = sorted(str(i) for i in (block.get("exposure_feature_ids") or []))
    if block.get("status") != "evaluated" or not feature_ids:
        return _abstain("no_exposure", config)
    try:
        points = store.exposure_points(feature_ids)
    except Exception:
        return _abstain("exposure_unavailable", config)
    critical_kinds = set(impact.load_config()["critical_kinds"])
    facilities = sorted((p for p in points if p.get("kind") in critical_kinds and str(p.get("id")) in set(feature_ids)
                         and isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lon"), (int, float))),
                        key=lambda p: str(p["id"]))
    critical = [{"id": str(p["id"]), "kind": p["kind"], "lat": float(p["lat"]), "lon": float(p["lon"])} for p in facilities][:MAX_CRITICAL]
    if not critical:
        return _abstain("no_critical_facilities", config)
    staging = sorted((c for c in critical if c["kind"] in STAGING_PRIORITY),
                     key=lambda c: (STAGING_PRIORITY[c["kind"]], c["id"]))[:MAX_STAGING]
    if not staging:
        return _abstain("no_staging_points", config)
    fired = trigger.get("fired_at")
    if isinstance(fired, str):
        try:
            fired = datetime.fromisoformat(fired)
        except ValueError:
            fired = None
    teams = eligible_teams(config, trigger.get("hazard", ""), fired if isinstance(fired, datetime) else None)
    if not teams:
        return _abstain("no_available_teams", config, {"critical_feature_ids": [c["id"] for c in critical]})
    model = config["travel_model"]
    results, method, combinations = search(teams, staging, critical, model)
    options = [_option(i + 1, r, teams, staging, critical) for i, r in enumerate(results)]
    material = json.dumps({"teams": [[t["id"], t["capacity"], t["base"]] for t in teams],
                           "critical": [[c["id"], c["kind"], c["lat"], c["lon"]] for c in critical],
                           "staging": [s["id"] for s in staging], "model": model, "teams_version": config["version"]},
                          sort_keys=True, separators=(",", ":"))
    cited_features = sorted({c["id"] for c in critical} | {s["id"] for s in staging})
    return {"version": VERSION, "status": "planned", "reason": None, "label": LABEL, "synthetic": True,
            "teams_source": config["version"], "travel_model": model, "evaluated_at": fired.isoformat() if isinstance(fired, datetime) else None,
            "search": {"method": method, "combinations": combinations, "exact_bound": EXACT_BOUND},
            "objective": "maximise covered critical facilities, then minimise the maximum travel time",
            "critical_feature_ids": [c["id"] for c in critical], "staging_feature_ids": [s["id"] for s in staging],
            "options": options, "cited_team_ids": [t["id"] for t in teams], "cited_feature_ids": cited_features,
            "input_sha256": hashlib.sha256(material.encode()).hexdigest(),
            "team_moved": False, "notification_sent": False, "tasks_created": False}


def audit_detail(result: dict) -> dict:
    """Compact audit row for the plan step (ids and counts only)."""
    best = result["options"][0] if result.get("options") else None
    return {"plan_status": result["status"], "reason": result.get("reason"), "options": len(result.get("options") or []),
            "search": (result.get("search") or {}).get("method"), "max_minutes": best["max_minutes"] if best else None,
            "cited_team_ids": result.get("cited_team_ids", []), "input_sha256": result.get("input_sha256"),
            "team_moved": False, "notification_sent": False, "tasks_created": False}
