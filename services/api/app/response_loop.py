"""Team response loop rules (docs/RESPONSE_LOOP.md). Pure: no database and no I/O beyond the team fixture.

Exercise only. A team is "alerted" only by a request appearing inside IndTrana; this module has no transport and
none may be added. Answers never change a proposal, an approval, a CAP draft or an incident status.
"""
import math
import unicodedata
from datetime import datetime

from app.prepositioning import available, load_teams, travel_minutes

ACTIVE = ("requested", "accepted", "en_route", "on_site")
TERMINAL = ("declined", "completed", "stood_down")
STATES = ACTIVE + TERMINAL
TASK_IDS = ("control_room", "infrastructure", "communications")

DECLINE = ("already_committed", "out_of_area", "not_equipped", "off_shift", "other")
SITUATION = ("as_expected", "worse_than_expected", "better_than_expected", "access_blocked", "nothing_found")
SUPPORT = ("more_people", "equipment", "medical", "transport", "other")

# kind -> (new state or None, allowed from-states, team may record, closed code list or None)
KINDS: dict[str, tuple[str | None, tuple[str, ...], bool, tuple[str, ...] | None]] = {
    "accepted": ("accepted", ("requested",), True, None),
    "declined": ("declined", ("requested",), True, DECLINE),
    "en_route": ("en_route", ("accepted",), True, None),
    "on_site": ("on_site", ("en_route",), True, SITUATION),
    "completed": ("completed", ("on_site",), True, SITUATION),
    "situation_report": (None, ("accepted", "en_route", "on_site"), True, SITUATION),
    "needs_support": (None, ("accepted", "en_route", "on_site"), True, SUPPORT),
    "stood_down": ("stood_down", ACTIVE, False, None),
    "desk_handled": (None, STATES, False, None),  # additionally requires the attention flag
}
REPORT_KINDS = tuple(KINDS)
ALL_CODES = tuple(dict.fromkeys(DECLINE + SITUATION + SUPPORT))
AUTHORITIES = ("team", "department_relay", "department")
NOTE_MIN, NOTE_MAX = 10, 1000

# Fixed incident hazard labels -> fixture hazard keys. Unknown labels are never guessed.
HAZARD_KEYS = {
    "Heavy rainfall": "heavy_rain",
    "Urban waterlogging": "flood_gauge",
    "Road inundation": "flood_gauge",
    "Water-level observation": "flood_gauge",
    "Drainage obstruction": "flood_gauge",
}

CODE_LABELS = {
    "already_committed": "already committed", "out_of_area": "out of area", "not_equipped": "not equipped",
    "off_shift": "off shift", "other": "other",
    "as_expected": "as expected", "worse_than_expected": "worse than expected",
    "better_than_expected": "better than expected", "access_blocked": "access blocked",
    "nothing_found": "nothing found",
    "more_people": "more people", "equipment": "equipment", "medical": "medical", "transport": "transport",
}
# Timeline templates: only the fixture team label and a closed code label are substituted. Never the note.
TIMELINE = {
    "requested": "SIMULATION: {team} requested by a department desk. Exercise only; nobody was contacted.",
    "accepted": "SIMULATION: {team} accepted the request.",
    "declined": "SIMULATION: {team} declined the request ({code}).",
    "en_route": "SIMULATION: {team} reported en route.",
    "on_site": "SIMULATION: {team} reported on site; situation {code}.",
    "completed": "SIMULATION: {team} reported the work completed; situation {code}.",
    "situation_report": "SIMULATION: {team} situation report: {code}.",
    "needs_support": "SIMULATION: {team} asked for support: {code}.",
    "stood_down": "SIMULATION: {team} stood down by the department desk.",
}


class ResponseError(Exception):
    """Fixed, caller-safe message plus HTTP status. Never wraps raw exception text."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.message = message
        self.status = status


def team_index(config: dict | None = None) -> dict[str, dict]:
    return {team["id"]: team for team in (config or load_teams())["teams"]}


def clean_note(note: object) -> str:
    if not isinstance(note, str):
        raise ResponseError("Note must be text", 422)
    text = note.strip()
    if not NOTE_MIN <= len(text) <= NOTE_MAX:
        raise ResponseError("Note must be 10 to 1000 characters", 422)
    if any(unicodedata.category(ch) in {"Cc", "Cf", "Zl", "Zp"} for ch in text):
        raise ResponseError("Note must not contain control characters", 422)
    return text


def check_code(kind: str, code: object) -> str | None:
    allowed = KINDS[kind][3]
    if allowed is None:
        if code is not None:
            raise ResponseError("This report kind takes no code", 422)
        return None
    if not isinstance(code, str) or code not in allowed:
        raise ResponseError("Choose a code from the list for this report kind", 422)
    return code


def authority_for(kind: str, caller: str) -> str:
    """caller is 'team' or 'department'. Team-only kinds recorded by a desk are a relay."""
    if kind not in KINDS:
        raise ResponseError("Unknown report kind", 422)
    team_allowed = KINDS[kind][2]
    if caller == "team":
        if not team_allowed:
            raise ResponseError("Only the department desk may record this report", 403)
        return "team"
    if caller == "department":
        return "department_relay" if team_allowed else "department"
    raise ResponseError("Insufficient response scope", 403)


def apply_report(request: dict, last: dict | None, *, kind: str, code: str | None, note: str,
                 actor: str, caller: str, expected_version: object) -> dict | None:
    """Validate one report against the request. Returns the change, or None for an exact retry.

    request: {state, version, needs_attention}. last: the latest stored report {kind, code, note, actor_subject}.
    """
    authority = authority_for(kind, caller)
    code = check_code(kind, code)
    note = clean_note(note)
    if type(expected_version) is not int or expected_version < 0:
        raise ResponseError("Invalid expected version", 422)
    version = int(request["version"])
    # Exact immediate retry (double submit): same kind, actor, note and code one version behind.
    if (expected_version == version - 1 and last is not None and last.get("kind") == kind
            and last.get("actor_subject") == actor and last.get("note") == note and last.get("code") == code):
        return None
    if expected_version != version:
        raise ResponseError("This request changed; refresh before retrying", 409)
    target, sources, _team, _codes = KINDS[kind]
    state = request["state"]
    if state not in sources:
        raise ResponseError("This report is not allowed in the request's current state", 409)
    attention = bool(request["needs_attention"])
    if kind == "desk_handled":
        if not attention:
            raise ResponseError("This request is not flagged", 409)
        attention = False
    elif kind in {"declined", "needs_support"}:
        attention = True
    elif kind == "stood_down":
        attention = False
    return {"kind": kind, "code": code, "note": note, "authority": authority,
            "state": target or state, "needs_attention": attention, "version": version + 1,
            "state_changed": target is not None}


def timeline_summary(kind: str, team_label: str, code: str | None) -> str | None:
    template = TIMELINE.get(kind)
    if template is None:
        return None  # desk_handled adds no timeline line
    return template.format(team=team_label, code=CODE_LABELS.get(code or "", "not stated"))


def hazard_key(label: object) -> str | None:
    return HAZARD_KEYS.get(label) if isinstance(label, str) else None


def suggest_teams(hazard_label: object, point: dict | None, active_counts: dict[str, int],
                  at: datetime, config: dict | None = None) -> dict:
    """Facts behind the suggestion for every fixture team. The desk decides; nothing is created here."""
    config = config or load_teams()
    key = hazard_key(hazard_label)
    required = set(config["hazard_capabilities"].get(key, [])) if key else set()
    teams = []
    for team in config["teams"]:
        matched = sorted(set(team["capabilities"]) & required)
        active = int(active_counts.get(team["id"], 0))
        free = max(int(team["capacity"]) - active, 0)
        now_available = available(team, at)
        minutes = travel_minutes(team["base"], point, config["travel_model"]) if point else None
        teams.append({"id": team["id"], "label": team["label"], "kind": team["kind"],
                      "capabilities": list(team["capabilities"]), "matched_capabilities": matched,
                      "capacity": int(team["capacity"]), "active_requests": active, "free_capacity": free,
                      "available_now": now_available, "available_utc": list(team["available_utc"]),
                      "estimated_travel_minutes": minutes,
                      "suggested": bool(key) and bool(matched) and free > 0 and now_available})
    teams.sort(key=lambda t: (-len(t["matched_capabilities"]), -t["free_capacity"], not t["available_now"],
                              t["estimated_travel_minutes"] if t["estimated_travel_minutes"] is not None else math.inf,
                              t["id"]))
    return {"capability_basis": "assessed" if key else "not_assessed", "hazard_key": key,
            "hazard_label": hazard_label if isinstance(hazard_label, str) else None,
            "travel_label": "Planning estimate only (synthetic travel model)",
            "travel_model": config["travel_model"], "teams_source": config["version"], "teams": teams}


def check_request_allowed(suggestion: dict, team_id: str) -> dict:
    team = next((t for t in suggestion["teams"] if t["id"] == team_id), None)
    if team is None:
        raise ResponseError("Unknown synthetic team", 422)
    if team["free_capacity"] <= 0:
        raise ResponseError("This team has no free capacity", 409)
    if not team["available_now"]:
        raise ResponseError("This team is outside its availability window", 409)
    if suggestion["capability_basis"] == "assessed" and not team["matched_capabilities"]:
        raise ResponseError("This team has no capability for this hazard", 409)
    return team
