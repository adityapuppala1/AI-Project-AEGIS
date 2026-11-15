"""ISRO/NRSC Bhuvan API connector: display-only geospatial reference, labelled live.

Tokens come only from the `isro_bhuvan` connector (encrypted, platform_admin, docs/BHUVAN_CONNECTORS.md). Every
call goes to the one documented host over HTTPS through `connectors.bounded_request` (no redirects, no proxy,
bounded size and time). Coordinates are server-validated numbers inside India's bounding box; place search accepts
only a short plain name. Answers are cached in memory for an hour and never written to PostgreSQL, and they never
create or enrich cases, assessments, proposals, approvals, tasks, warnings or CAP. The portal sign-in has a
CAPTCHA, so tokens are pasted by an administrator (one per theme, valid one day); nothing here signs in.
"""
import json
import math
import re
import threading
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Query

from app import connector_secrets, connectors, proactive_store
from app.security import EXERCISE_RECORD_ROLES, Operator, scoped_operator

HOST = "bhuvan-app1.nrsc.gov.in"
BASE = f"https://{HOST}/api"
CONNECTOR = "isro_bhuvan"
ATTRIBUTION = "Data: Bhuvan, NRSC/ISRO"
TERMS_URL = "https://bhuvan.nrsc.gov.in/home/terms.php"
CACHE_SECONDS = 3600
CACHE_MAX = 200
BACKOFF_SECONDS = 60
MAX_BYTES = 262_144
INDIA = {"lat": (6.0, 38.0), "lon": (68.0, 98.0)}
# Coarse box around Andhra Pradesh: the postal and hospital theme covers only that state.
ANDHRA = {"lat": (12.6, 19.95), "lon": (76.7, 84.8)}
AOI_HALF_DEGREES = 0.01  # about 1 km either side of the point
PLACE_NAME = re.compile(r"[A-Za-z][A-Za-z .'-]{1,39}")
KEY_TEXT = re.compile(r"[A-Za-z0-9_ ./()%-]{1,40}")

# theme -> (secret field, documented path, short label, coverage note)
THEMES = {
    "proximity": ("token_proximity", "/api_proximity/curl_hos_pos_prox.php", "Postal and Hospital",
                  "Andhra Pradesh only"),
    "village_geocode": ("token_village_geocode", "/api_proximity/curl_village_geocode.php", "Village Geocoding",
                        "Census 2001 villages, Andhra Pradesh and Karnataka"),
    "reverse_geocode": ("token_reverse_geocode", "/api_proximity/curl_reverse_village.php", "Village Reverse Geocoding",
                        "Census 2001 villages, Andhra Pradesh and Karnataka"),
    "lulc_stats": ("token_lulc_stats", "/lulc/curljson.php", "LULC Statistics",
                   "LULC 50k, 2005-06 and 2011-12, by state or district"),
    "lulc_aoi": ("token_lulc_aoi", "/lulc/curl_aoi.php", "LULC AOI Wise", "LULC 50k, area of interest"),
    "routing": ("token_routing", "/routing/curl_routing_state.php", "Routing",
                "Shortest road path within one state; interstate routing not offered"),
    "geoid": ("token_geoid", "/geoid/curl_gdal_api.php", "Geoid",
              "CartoDEM tile download (zip); not called by IndTrana"),
}
# One small documented read per theme, using the portal's own example values.
TEST_QUERIES = {
    "proximity": {"theme": "hospital", "lat": 16.2794, "lon": 80.5884, "buffer": 1000},
    "village_geocode": {"village": "seKuRu"},
    "reverse_geocode": {"lat": 16.2794, "lon": 80.5884},
    "lulc_stats": {"statcode": "AN", "year": "1112"},
    "lulc_aoi": {"geom": "POLYGON((77.537826049804 18.312927062987,77.539885986327 18.279624755858,"
                         "77.596190917968 18.295417602538,77.537826049804 18.312927062987))"},
    "routing": {"lat1": 17.385, "lon1": 78.4867, "lat2": 17.44, "lon2": 78.35},
}

LIMITATIONS = [
    "Live reference from the Bhuvan API, not an IndTrana assessment, warning or dispatch input.",
    "Viewing purposes only under the Bhuvan terms of service; nothing is stored or redistributed.",
    "Coverage is limited by theme (for example villages: Andhra Pradesh and Karnataka; hospitals: Andhra Pradesh).",
]

_cache: dict[tuple, dict] = {}
_next_attempt: dict[str, float] = {}
_lock = threading.Lock()


class BhuvanError(Exception):
    """A fixed failure code; never carries upstream text."""

    def __init__(self, code: str, status: int = 502):
        super().__init__(code)
        self.code, self.status = code, status


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def valid_point(lat: float, lon: float, box=INDIA) -> bool:
    return (all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (lat, lon))
            and box["lat"][0] <= lat <= box["lat"][1] and box["lon"][0] <= lon <= box["lon"][1])


def _point(lat: float, lon: float) -> tuple[float, float]:
    if not valid_point(lat, lon):
        raise HTTPException(status_code=422, detail="point_outside_india")
    return round(lat, 4), round(lon, 4)


def token_state(theme: str) -> dict:
    """Saved/expiry state for one theme. Never reads or returns the value."""
    field = THEMES[theme][0]
    data = proactive_store.get_store().list_configs()
    view = connectors._view(CONNECTOR, data)
    entry = next(f for f in view["fields"] if f["name"] == field)
    return {"set": entry["set"], "saved_at": entry.get("saved_at"), "expires_at": entry.get("expires_at"),
            "expired": entry.get("expired", False), "enabled": view["enabled"]}


def _token(theme: str, *, require_enabled: bool) -> str:
    state = token_state(theme)
    if require_enabled and not state["enabled"]:
        raise BhuvanError("bhuvan_disabled", 503)
    if not state["set"]:
        raise BhuvanError("token_missing", 503)
    if state["expired"]:
        raise BhuvanError("token_expired", 503)
    try:
        value = connectors.read_secret(CONNECTOR, THEMES[theme][0])
    except (connector_secrets.ConnectorKeyMissing, connector_secrets.SecretUnreadable):
        raise BhuvanError("connector_key_missing", 503) from None
    if not value:
        raise BhuvanError("token_missing", 503)
    return value


def build_url(theme: str, params: dict, token: str) -> str:
    query = urlencode({**params, "token": token}, quote_via=quote, safe="(),")
    return BASE + THEMES[theme][1] + "?" + query


def call(theme: str, params: dict, token: str):
    """One documented GET. Returns parsed JSON (or None for the portal's 'no data' answers)."""
    try:
        status, body = connectors.bounded_request(
            build_url(theme, params, token), connectors.REGISTRY[CONNECTOR]["hosts"],
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            max_bytes=MAX_BYTES)
    except TimeoutError:
        raise BhuvanError("timeout") from None
    except ValueError as error:
        raise BhuvanError("upstream_too_large" if str(error) == "upstream_too_large" else "invalid_response") from None
    except OSError:
        raise BhuvanError("network_error") from None
    if status != 200:
        raise BhuvanError("upstream_status")
    text = body.decode("utf-8", "replace").strip()
    if text.lower() in ("", "false", "null", "[]", "{}"):
        return None
    try:
        parsed = json.loads(text)
    except ValueError:
        raise BhuvanError("invalid_response") from None
    if isinstance(parsed, dict) and parsed.get("error") in ("invalid_token", "expired_token", "invalid_request"):
        raise BhuvanError("token_rejected", 503)
    return parsed


# --- sanitising: only short scalar fields are kept; nothing is passed through as HTML or free structure ----

def _scalar(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        cleaned = re.sub(r"<[^>]*>", "", value).replace("\x00", "").strip()
        return cleaned[:120] if cleaned else None
    return None


def flatten(obj, limit=40, prefix="") -> list[dict]:
    """Scalar leaves as [{key, value}] with safe short keys; nested objects use dotted keys."""
    rows: list[dict] = []

    def walk(node, path, depth):
        if len(rows) >= limit or depth > 4:
            return
        if isinstance(node, dict):
            for key, value in list(node.items())[:60]:
                if isinstance(key, str) and KEY_TEXT.fullmatch(key):
                    walk(value, f"{path}.{key}" if path else key, depth + 1)
        elif isinstance(node, list):
            for index, value in enumerate(node[:10]):
                walk(value, f"{path}[{index}]", depth + 1)
        else:
            value = _scalar(node)
            if value is not None and path and len(path) <= 60 and path not in ("token", "key"):
                rows.append({"key": path, "value": value})

    walk(obj, prefix, 0)
    return rows


def records(obj, limit=20) -> list[list[dict]]:
    """A list of records (hospitals, villages): each one flattened to at most 12 fields."""
    if isinstance(obj, list):
        items = obj
    elif isinstance(obj, dict):
        items = next((v for v in obj.values() if isinstance(v, list)), [obj])
    else:
        items = []
    if isinstance(obj, dict) and obj.get("type") == "FeatureCollection":
        items = [f.get("properties") or {} for f in obj.get("features") or [] if isinstance(f, dict)]
    return [row for row in (flatten(item, 12) for item in items[:limit]) if row]


def _haversine_km(a, b) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def route_summary(obj) -> dict:
    """Path length from the GeoJSON line geometry (computed here), plus a thinned path for display."""
    lines: list[list] = []

    def collect(geometry):
        if not isinstance(geometry, dict):
            return
        kind, coords = geometry.get("type"), geometry.get("coordinates")
        if kind == "LineString" and isinstance(coords, list):
            lines.append(coords)
        elif kind == "MultiLineString" and isinstance(coords, list):
            lines.extend(c for c in coords if isinstance(c, list))

    features = obj.get("features") if isinstance(obj, dict) else None
    for feature in (features if isinstance(features, list) else [obj])[:500]:
        if isinstance(feature, dict):
            collect(feature.get("geometry") if "geometry" in feature else feature)
    points = [p for line in lines for p in line[:5000]
              if isinstance(p, list) and len(p) >= 2 and valid_point(p[1], p[0])][:20000]
    length = sum(_haversine_km(points[i], points[i + 1]) for i in range(len(points) - 1)) if len(points) > 1 else None
    step = max(1, len(points) // 300)
    return {"distance_km": round(length, 2) if length is not None else None,
            "segments": len(lines), "path": [[round(p[1], 5), round(p[0], 5)] for p in points[::step]][:301]}


def _summarise(kind: str, parsed) -> dict:
    if parsed is None:
        return {"no_data": True}
    if kind == "route":
        return {"no_data": False, **route_summary(parsed)}
    if kind in ("hospitals", "village"):
        rows = records(parsed)
        return {"no_data": not rows, "records": rows}
    rows = flatten(parsed)
    return {"no_data": not rows, "fields": rows}


KIND_THEME = {"place": "reverse_geocode", "landuse": "lulc_aoi", "route": "routing", "hospitals": "proximity",
              "village": "village_geocode"}


def lookup(kind: str, params: dict) -> dict:
    """Cached live lookup. Raises BhuvanError with a fixed code."""
    theme = KIND_THEME[kind]
    key = (kind, tuple(sorted(params.items())))
    now = time.time()
    with _lock:
        hit = _cache.get(key)
    if hit and now - hit["fetched_epoch"] < CACHE_SECONDS:
        return {**hit, "cached": True}
    if now < _next_attempt.get(theme, 0):
        raise BhuvanError("upstream_backoff", 503)
    token = _token(theme, require_enabled=True)
    try:
        upstream = {k: v for k, v in params.items() if not (kind == "landuse" and k in ("lat", "lon"))}
        parsed = call(theme, upstream, token)
    except BhuvanError as error:
        if error.code not in ("token_rejected",):
            _next_attempt[theme] = time.time() + BACKOFF_SECONDS
        raise
    finally:
        del token
    _next_attempt.pop(theme, None)
    fetched = time.time()
    entry = {"classification": "live", "source": "Bhuvan (NRSC/ISRO)", "theme": THEMES[theme][2], "kind": kind,
             "coverage": THEMES[theme][3], "attribution": ATTRIBUTION, "terms_url": TERMS_URL,
             "fetched_epoch": fetched, "fetched_at": datetime.fromtimestamp(fetched, tz=timezone.utc).isoformat(),
             "cache_seconds": CACHE_SECONDS, "limitations": LIMITATIONS, "display_only": True,
             "writes_to_database": False, "query": {k: v for k, v in params.items() if k != "geom"},
             **_summarise(kind, parsed)}
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(min(_cache, key=lambda k: _cache[k]["fetched_epoch"]))
        _cache[key] = entry
    return {**entry, "cached": False}


def clear_cache() -> None:
    with _lock:
        _cache.clear()
    _next_attempt.clear()


# --- administrator token tests ------------------------------------------------------------------

def test_token(theme: str) -> dict:
    started = time.monotonic()
    if theme == "geoid":
        result = {"ok": False, "status_code": None, "message": "download_only_not_called"}
    else:
        try:
            parsed = call(theme, TEST_QUERIES[theme], _token(theme, require_enabled=False))
            result = {"ok": True, "status_code": 200, "message": "reachable_no_data" if parsed is None else "reachable_data"}
        except BhuvanError as error:
            result = {"ok": False, "status_code": None, "message": error.code}
    return {**result, "theme": theme, "latency_ms": int((time.monotonic() - started) * 1000), "tested_at": _now_iso()}


def test_any_token() -> dict:
    """Connector-level Test: the first saved, unexpired, callable token (reverse geocoding first)."""
    for theme in ("reverse_geocode", "lulc_aoi", "routing", "lulc_stats", "village_geocode", "proximity"):
        state = token_state(theme)
        if state["set"] and not state["expired"]:
            result = test_token(theme)
            return {"ok": result["ok"], "status_code": result["status_code"], "message": result["message"]}
    return {"ok": False, "status_code": None, "message": "secret_missing"}


admin_router = APIRouter(prefix="/v1/proactive/bhuvan", tags=["proactive"],
                         dependencies=[Depends(connectors.require_proactive)])
_admin = scoped_operator(frozenset({"platform_admin"}))


@admin_router.get("/tokens")
def bhuvan_tokens(operator: Operator = Depends(_admin)):
    try:
        return {"themes": [{"theme": theme, "label": spec[2], "coverage": spec[3], **token_state(theme)}
                           for theme, spec in THEMES.items()]}
    except Exception:
        raise HTTPException(status_code=503, detail="proactive_store_unavailable") from None


@admin_router.post("/tokens/{theme}/test")
def bhuvan_token_test(theme: str, operator: Operator = Depends(_admin)):
    if theme not in THEMES:
        raise HTTPException(status_code=404, detail="unknown_theme")
    result = test_token(theme)
    connectors._store_call(proactive_store.get_store().add_audit, CONNECTOR, "test", result["ok"],
                           {k: result[k] for k in ("theme", "status_code", "latency_ms", "message")}, operator.subject)
    return result


# --- display-only reference reads (signed-in, explicit roles, exercise agency) -------------------

reference_router = APIRouter(prefix="/v1/reference/bhuvan", tags=["reference"])
READ = scoped_operator(EXERCISE_RECORD_ROLES)


def _serve(kind: str, params: dict) -> dict:
    if not connectors.proactive_enabled():
        raise HTTPException(status_code=503, detail="bhuvan_disabled")
    try:
        return lookup(kind, params)
    except BhuvanError as error:
        raise HTTPException(status_code=error.status, detail=error.code) from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="bhuvan_unavailable") from None


@reference_router.get("/status")
def bhuvan_status(_operator: Operator = Depends(READ)):
    themes = {}
    if connectors.proactive_enabled():
        try:
            for theme in KIND_THEME.values():
                state = token_state(theme)
                themes[theme] = {"ready": state["enabled"] and state["set"] and not state["expired"],
                                 "expires_at": state["expires_at"]}
        except Exception:
            themes = {}
    return {"classification": "live", "source": "Bhuvan (NRSC/ISRO)", "attribution": ATTRIBUTION,
            "terms_url": TERMS_URL, "display_only": True, "writes_to_database": False, "themes": themes}


@reference_router.get("/place")
def bhuvan_place(lat: float = Query(...), lon: float = Query(...), _operator: Operator = Depends(READ)):
    lat, lon = _point(lat, lon)
    return _serve("place", {"lat": lat, "lon": lon})


@reference_router.get("/landuse")
def bhuvan_landuse(lat: float = Query(...), lon: float = Query(...), _operator: Operator = Depends(READ)):
    lat, lon = _point(lat, lon)
    d = AOI_HALF_DEGREES
    ring = [(lon - d, lat - d), (lon + d, lat - d), (lon + d, lat + d), (lon - d, lat + d), (lon - d, lat - d)]
    geom = "POLYGON((" + ",".join(f"{x:.5f} {y:.5f}" for x, y in ring) + "))"
    return _serve("landuse", {"geom": geom, "lat": lat, "lon": lon})


@reference_router.get("/route")
def bhuvan_route(lat1: float = Query(...), lon1: float = Query(...), lat2: float = Query(...),
                 lon2: float = Query(...), _operator: Operator = Depends(READ)):
    lat1, lon1 = _point(lat1, lon1)
    lat2, lon2 = _point(lat2, lon2)
    return _serve("route", {"lat1": lat1, "lon1": lon1, "lat2": lat2, "lon2": lon2})


@reference_router.get("/hospitals")
def bhuvan_hospitals(lat: float = Query(...), lon: float = Query(...), _operator: Operator = Depends(READ)):
    lat, lon = _point(lat, lon)
    if not valid_point(lat, lon, ANDHRA):
        raise HTTPException(status_code=422, detail="outside_coverage_andhra_pradesh")
    return _serve("hospitals", {"theme": "hospital", "lat": lat, "lon": lon, "buffer": 3000})


@reference_router.get("/village")
def bhuvan_village(name: str = Query(..., max_length=40), _operator: Operator = Depends(READ)):
    if not PLACE_NAME.fullmatch(name):
        raise HTTPException(status_code=422, detail="invalid_place_name")
    return _serve("village", {"village": name})
