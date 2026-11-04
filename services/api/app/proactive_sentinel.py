"""Evidence-change sentinel (roadmap A2): compare open runs with each new evidence refresh.

After a refresh (manual or scheduled) every open run in the agency is compared with the newly
evaluated trigger for the same area/hazard and may receive one appended flag:
strengthened, weakened, contradicted (the trigger would no longer fire) or stale (the newest
evidence is older than its freshness limit). Flags carry cited evidence ids and a timestamp and
are written through the row-locked run update, so each one has an audit row. The sentinel never
edits drafts, judgments, variants or CAP content, never advances or cancels a run and never
sends anything. A flag is an observation for the accountable human, not a forecast or accuracy
claim.
"""
from datetime import datetime, timezone

from app import hazard_watch

ACTOR = "system:sentinel"
FLAGS = ("strengthened", "weakened", "contradicted", "stale")
MAX_FLAGS = 50
MAX_CITED = 20
RANK = {"clear": 0, "watch": 1, "candidate": 2}


def _newest(rows: list[dict]):
    stamps = [r.get("retrieved_at") for r in rows if isinstance(r.get("retrieved_at"), datetime)]
    return max(stamps) if stamps else None


def classify(original: dict, current: dict | None, original_evidence: list[dict], now: datetime) -> tuple[str, list[str]] | None:
    """Pure comparison. `current` is the newest evaluation of the same trigger_id, or None if absent."""
    if current is not None:
        cited = list(current.get("evidence_ids") or [])[:MAX_CITED]
        if current["state"] == "clear":
            return "contradicted", cited
        old_score, new_score = original.get("score"), current.get("score")
        old_rank, new_rank = RANK.get(original.get("state"), 0), RANK.get(current["state"], 0)
        if new_rank < old_rank:
            return "weakened", cited
        if isinstance(old_score, (int, float)) and isinstance(new_score, (int, float)):
            if new_score > old_score:
                return "strengthened", cited
            if new_score < old_score:
                return "weakened", cited
        return None
    cited = [r["id"] for r in original_evidence][:MAX_CITED] or list(original.get("evidence_ids") or [])[:MAX_CITED]
    newest = _newest(original_evidence)
    if newest is None or (now - newest).total_seconds() > hazard_watch.STALE_SECONDS:
        return "stale", cited
    return None


def append_flag(state: dict, flag: dict) -> tuple[dict, bool, str, dict]:
    """update_run mutator: append only; identical consecutive flags are not repeated."""
    if state.get("status") != "running":
        return state, False, "sentinel_flag", {}
    flags = list(state.get("sentinel_flags") or [])
    last = flags[-1] if flags else None
    if last and last.get("flag") == flag["flag"] and last.get("evidence_ids") == flag["evidence_ids"]:
        return state, False, "sentinel_flag", {}
    flags.append(flag)
    # Run state keeps the newest MAX_FLAGS; the append-only run audit keeps every flag.
    return {**state, "sentinel_flags": flags[-MAX_FLAGS:]}, True, "sentinel_flag", dict(flag)


def apply(store, agency_id, triggers: list[dict], now: datetime | None = None) -> int:
    """Flag every open run of `agency_id` against freshly evaluated `triggers`. Returns flags recorded."""
    now = now or datetime.now(timezone.utc)
    latest = {t["trigger_id"]: t for t in triggers}
    recorded = 0
    for state in store.list_runs(agency_id, 200):
        if state.get("status") != "running":
            continue
        original = store.get_trigger(state["trigger_event_id"])
        if original is None:
            continue
        current = latest.get(original["trigger_id"])
        evidence = [] if current is not None else store.list_evidence(500, ids=original.get("evidence_ids") or [])
        result = classify(original, current, evidence, now)
        if result is None:
            continue
        name, cited = result
        flag = {"flag": name, "evidence_ids": cited, "at": now.isoformat(),
                "trigger_event_id": current["id"] if current is not None else None,
                "previous_score": original.get("score"), "score": current.get("score") if current is not None else None}
        _, changed = store.update_run(state["id"], lambda s, f=flag: append_flag(s, f), ACTOR, agency_id)
        recorded += bool(changed)
    return recorded
