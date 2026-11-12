"""Opt-in proactive hazard watch: evidence from ENABLED connectors and versioned trigger evaluation.

Evidence and trigger events are information only. They never create or enrich cases, proposals,
tasks, approvals or warnings; a human links a candidate to a case. Thresholds are synthetic
rehearsal values, not calibrated (app/fixtures/hazard_triggers.v1.json, feed_triggers.v1.json).
A3 impact rules (app/impact.py, impact_triggers.v2.json) then combine each hazard state with the
exposure inside a fixed footprint; without exposure data the hazard state is kept (hazard-only).
"""
import csv
import hashlib
import importlib.util
import io
import json
import math
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from statistics import median
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from app import connectors, impact, proactive_store
from app.security import EXERCISE_RECORD_ROLES, Operator, get_operator, require_role, scoped_operator

CONFIG_PATH = Path(__file__).parent / "fixtures" / "hazard_triggers.v1.json"
FEED_CONFIG_PATH = Path(__file__).parent / "fixtures" / "feed_triggers.v1.json"
FETCH_MAX_BYTES = 4_000_000
MAX_EVIDENCE = 500
STALE_SECONDS = 86400
MAX_CITED = 50
DISCLAIMER = ("Exercise display only. Synthetic rehearsal thresholds, not calibrated; not a forecast, warning or "
              "accuracy claim. Evidence never creates cases, proposals or tasks.")

_FALLBACK_RAIN_POINTS = [{"id": f"hyd_{lat:.2f}_{lon:.2f}", "lat": lat, "lon": lon}
                         for lat in (17.30, 17.40, 17.50) for lon in (78.35, 78.47, 78.60)]
_FALLBACK_DISCHARGE_POINTS = [
    {"id": "musi_himayat_sagar", "lat": 17.32, "lon": 78.38}, {"id": "musi_osman_sagar", "lat": 17.38, "lon": 78.31},
    {"id": "musi_city", "lat": 17.36, "lon": 78.47}, {"id": "musi_downstream", "lat": 17.30, "lon": 78.60},
    {"id": "musi_far_downstream", "lat": 17.20, "lon": 78.85},
]


def _pilot_points():
    """Reuse research/real-data/pilot_config.py when the checkout has it; otherwise the copied coordinates."""
    for parent in Path(__file__).resolve().parents:
        path = parent / "research" / "real-data" / "pilot_config.py"
        if path.is_file():
            try:
                spec = importlib.util.spec_from_file_location("aegis_pilot_config", path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return ([{k: p[k] for k in ("id", "lat", "lon")} for p in module.RAIN_POINTS],
                        [{k: p[k] for k in ("id", "lat", "lon")} for p in module.DISCHARGE_POINTS])
            except Exception:
                break
    return _FALLBACK_RAIN_POINTS, _FALLBACK_DISCHARGE_POINTS


RAIN_POINTS, DISCHARGE_POINTS = _pilot_points()
OPEN_METEO_DAILY = {"precipitation_sum": ("heavy_rain", "mm"), "wind_gusts_10m_max": ("wind", "km/h"),
                    "temperature_2m_max": ("heat", "degC")}


@lru_cache(maxsize=1)
def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


OVERLAY_LEVELS = ("watch", "candidate")


def overlay_config(base: dict, version: dict | None) -> dict:
    """Fixture thresholds with one explicitly applied A8 overlay (016 trigger_config_versions).

    Only numeric watch/candidate values of hazards already in the fixture can change; anything else makes the
    overlay invalid and the fixture is used unchanged. The new version id becomes config_version, so the
    scheduler dedupe key (which includes config_version) changes with it.
    """
    if not version:
        return {**base, "config_source": "fixture"}
    overrides = version.get("overrides")
    if not isinstance(overrides, dict) or version.get("base_version") != base["version"]:
        return {**base, "config_source": "overlay_invalid"}
    hazards = {name: dict(spec) for name, spec in base["hazards"].items()}
    for name, values in overrides.items():
        if name not in hazards or not isinstance(values, dict) or set(values) - set(OVERLAY_LEVELS):
            return {**base, "config_source": "overlay_invalid"}
        merged = {**{k: hazards[name][k] for k in OVERLAY_LEVELS}, **values}
        if not all(_finite(v) and v > 0 for v in merged.values()) or merged["watch"] >= merged["candidate"]:
            return {**base, "config_source": "overlay_invalid"}
        hazards[name].update(merged)
    return {**base, "version": str(version["version_id"]), "base_version": base["version"], "hazards": hazards,
            "config_source": "applied_overlay"}


def effective_config() -> dict:
    """What the engine evaluates with: the fixture plus the newest APPLIED overlay. An approved but unapplied
    threshold proposal never reaches here. If 016 is absent or unreadable the fixture is used."""
    base = load_config()
    try:
        from app import learning_store
        latest = learning_store.get_store().latest_config_version()
    except Exception:
        return {**base, "config_source": "fixture"}
    return overlay_config(base, latest)


@lru_cache(maxsize=1)
def load_feed_config() -> dict:
    """Thresholds for third-party alert feeds (A4). A separate file so v1 stays unchanged."""
    return json.loads(FEED_CONFIG_PATH.read_text(encoding="utf-8"))


class AdapterError(RuntimeError):
    """Carries a fixed error code; never raw upstream text."""


def _finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _day(value: str) -> datetime:
    return datetime.fromisoformat(value[:10]).replace(tzinfo=timezone.utc)


def _row(connector_id, hazard, observed_at, lat, lon, value, unit, payload, source_url) -> dict:
    return {"connector_id": connector_id, "hazard": hazard, "observed_at": observed_at, "lat": float(lat),
            "lon": float(lon), "value": float(value) if value is not None else None, "unit": unit,
            "payload": payload, "source_url": source_url}


def digest(row: dict) -> str:
    material = json.dumps([row["connector_id"], row["hazard"], row["observed_at"].isoformat(), round(row["lat"], 5),
                           round(row["lon"], 5), row["value"], row["unit"], row["payload"].get("point_id")],
                          separators=(",", ":"))
    return hashlib.sha256(material.encode()).hexdigest()


def _get_json(url: str, connector_id: str):
    status, body = connectors.bounded_request(url, connectors.REGISTRY[connector_id]["hosts"], max_bytes=FETCH_MAX_BYTES)
    if status != 200:
        raise AdapterError(f"upstream_status_{status}")
    try:
        return json.loads(body)
    except ValueError:
        raise AdapterError("invalid_response") from None


def _as_list(data) -> list:
    return data if isinstance(data, list) else [data]


def fetch_open_meteo(settings: dict) -> list[dict]:
    rows = []
    query = urlencode({"latitude": ",".join(str(p["lat"]) for p in RAIN_POINTS),
                       "longitude": ",".join(str(p["lon"]) for p in RAIN_POINTS),
                       "daily": ",".join(OPEN_METEO_DAILY), "models": settings.get("models", "ecmwf_aifs025"),
                       "forecast_days": 3, "timezone": "UTC"})
    url = "https://api.open-meteo.com/v1/forecast?" + query
    forecast = _as_list(_get_json(url, "open_meteo"))
    if len(forecast) != len(RAIN_POINTS):
        raise AdapterError("invalid_response")
    for point, item in zip(RAIN_POINTS, forecast):
        daily = item.get("daily") if isinstance(item, dict) else None
        if not isinstance(daily, dict) or not isinstance(daily.get("time"), list):
            raise AdapterError("invalid_response")
        for variable, (hazard, unit) in OPEN_METEO_DAILY.items():
            for day, value in zip(daily["time"], daily.get(variable) or []):
                if _finite(value) and isinstance(day, str):
                    rows.append(_row("open_meteo", hazard, _day(day), point["lat"], point["lon"], value, unit,
                                     {"point_id": point["id"], "variable": variable, "model": settings.get("models")},
                                     "https://api.open-meteo.com/v1/forecast"))
    query = urlencode({"latitude": ",".join(str(p["lat"]) for p in DISCHARGE_POINTS),
                       "longitude": ",".join(str(p["lon"]) for p in DISCHARGE_POINTS),
                       "daily": "river_discharge,river_discharge_median", "forecast_days": 7})
    flood = _as_list(_get_json("https://flood-api.open-meteo.com/v1/flood?" + query, "open_meteo"))
    if len(flood) != len(DISCHARGE_POINTS):
        raise AdapterError("invalid_response")
    for point, item in zip(DISCHARGE_POINTS, flood):
        daily = item.get("daily") if isinstance(item, dict) else None
        if not isinstance(daily, dict) or not isinstance(daily.get("time"), list):
            raise AdapterError("invalid_response")
        values = daily.get("river_discharge") or []
        medians = daily.get("river_discharge_median") or [None] * len(values)
        series = [v for v in values if _finite(v)]
        fallback = median(series) if series else None
        for day, value, med in zip(daily["time"], values, medians):
            if _finite(value) and isinstance(day, str):
                ref = med if _finite(med) and med > 0 else fallback
                rows.append(_row("open_meteo", "river_discharge", _day(day), point["lat"], point["lon"], value, "m3/s",
                                 {"point_id": point["id"], "variable": "river_discharge", "median": ref},
                                 "https://flood-api.open-meteo.com/v1/flood"))
    return rows


def _km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def parse_firms_csv(text: str, radius_km: float = 10.0) -> list[dict]:
    """VIIRS area CSV; only detections within radius_km of a grid point are kept (the rest are irrelevant here)."""
    rows = []
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or not {"latitude", "longitude", "acq_date"}.issubset(reader.fieldnames):
        raise AdapterError("invalid_response")
    for record in reader:
        try:
            lat, lon = float(record["latitude"]), float(record["longitude"])
            observed = _day(record["acq_date"])
            hhmm = (record.get("acq_time") or "0000").zfill(4)
            observed = observed.replace(hour=int(hhmm[:2]) % 24, minute=int(hhmm[2:4]) % 60)
            frp = float(record["frp"]) if record.get("frp") not in (None, "") else None
        except (ValueError, TypeError, KeyError):
            continue
        if not (math.isfinite(lat) and math.isfinite(lon)) or frp is not None and not math.isfinite(frp):
            continue
        if not any(_km(lat, lon, p["lat"], p["lon"]) <= radius_km for p in RAIN_POINTS):
            continue
        rows.append(_row("nasa_firms", "fire", observed, lat, lon, frp, "MW",
                         {"confidence": str(record.get("confidence", ""))[:8], "satellite": str(record.get("satellite", ""))[:8]},
                         "https://firms.modaps.eosdis.nasa.gov/api/area/csv"))
    return rows


def fetch_nasa_firms(settings: dict) -> list[dict]:
    key = connectors.read_secret("nasa_firms", "map_key")
    if not key:
        raise AdapterError("secret_missing")
    days = settings.get("days", 1)
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{connectors.INDIA_BBOX}/{days}"
    status, body = connectors.bounded_request(url, connectors.REGISTRY["nasa_firms"]["hosts"], max_bytes=FETCH_MAX_BYTES)
    if status != 200:
        raise AdapterError(f"upstream_status_{status}")
    return parse_firms_csv(body.decode("utf-8", "replace"))


def fetch_nasa_lhasa(settings: dict) -> list[dict]:
    """Best effort: identify the nowcast pixel at each grid point; the service layout may change."""
    rows, now = [], datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    for point in RAIN_POINTS:
        query = urlencode({"geometry": f"{point['lon']},{point['lat']}", "geometryType": "esriGeometryPoint",
                           "sr": 4326, "tolerance": 1, "mapExtent": "68,6,98,38", "imageDisplay": "400,400,96",
                           "returnGeometry": "false", "f": "json"})
        data = _get_json(connectors.LHASA_URL + "/identify?" + query, "nasa_lhasa")
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            raise AdapterError("invalid_response")
        for result in results[:1]:
            attrs = result.get("attributes") if isinstance(result, dict) else {}
            raw = next((attrs.get(k) for k in ("Pixel Value", "Raster.ServicePixelValue", "value") if k in (attrs or {})), None)
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(value) or value < 0:
                continue
            rows.append(_row("nasa_lhasa", "landslide", now, point["lat"], point["lon"],
                             value / 100 if value > 1 else value, "probability",
                             {"point_id": point["id"], "best_effort": True}, connectors.LHASA_URL))
    return rows


def _not_implemented(settings: dict) -> list[dict]:
    raise AdapterError("not_implemented_in_demo")


# --- A4 feeds: GDACS event list and Google Flood Forecasting (JSON only; no XML parsing) ---------

GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
GOOGLE_FLOOD_URL = "https://floodforecasting.googleapis.com/v1/floodStatus:searchLatestFloodStatusByArea"
GDACS_EVENT_TYPES = {"FL": "flood", "TC": "tropical_cyclone", "EQ": "earthquake", "WF": "wildfire", "DR": "drought",
                     "VO": "volcano"}
GDACS_ALERT = {"green": 1, "orange": 2, "red": 3}
GOOGLE_SEVERITY = {"NO_FLOODING": 0, "ABOVE_NORMAL": 1, "SEVERE": 2, "EXTREME": 3}
GOOGLE_TRENDS = {"RISE", "FALL", "NO_CHANGE", "TREND_UNSPECIFIED"}
MAX_FEED_ITEMS = 500
_SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,60}$")


def _clean_text(value, limit=80) -> str:
    """Printable, bounded display text from an upstream field; never interpreted."""
    if not isinstance(value, str):
        return ""
    return "".join(c for c in value if c.isprintable())[:limit]


def _timestamp(value):
    if not isinstance(value, str) or not 10 <= len(value) <= 40:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _in_bbox(lat, lon, bbox=connectors.INDIA_BBOX) -> bool:
    west, south, east, north = (float(v) for v in bbox.split(","))
    return west <= lon <= east and south <= lat <= north


def _gdacs_row(feature):
    if not isinstance(feature, dict):
        return None
    props, geometry = feature.get("properties"), feature.get("geometry")
    if not isinstance(props, dict) or not isinstance(geometry, dict) or geometry.get("type") != "Point":
        return None
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2 or not all(_finite(c) for c in coords[:2]):
        return None
    lon, lat = float(coords[0]), float(coords[1])
    event_type, event_id = props.get("eventtype"), str(props.get("eventid", ""))
    alert = str(props.get("alertlevel", "")).lower()
    observed = _timestamp(props.get("todate")) or _timestamp(props.get("fromdate"))
    if (event_type not in GDACS_EVENT_TYPES or not event_id.isdigit() or len(event_id) > 12 or alert not in GDACS_ALERT
            or observed is None or not _in_bbox(lat, lon)):
        return None
    episode = str(props.get("episodeid", ""))
    return _row("gdacs", "gdacs_alert", observed, lat, lon, GDACS_ALERT[alert], "gdacs_alert_level",
                {"point_id": f"gdacs_{event_type}_{event_id}", "event_type": GDACS_EVENT_TYPES[event_type],
                 "event_id": event_id, "episode_id": episode if episode.isdigit() and len(episode) <= 12 else None,
                 "alert_level": alert, "name": _clean_text(props.get("name")),
                 "country": _clean_text(props.get("country"), 60), "attribution": "GDACS (UN / European Commission JRC)"},
                GDACS_URL)


def parse_gdacs(data) -> list[dict]:
    """GDACS geteventlist GeoJSON FeatureCollection. Malformed features are skipped; a malformed
    collection raises invalid_response. Only events inside the India bounding box are kept."""
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        raise AdapterError("invalid_response")
    return [row for row in (_gdacs_row(f) for f in data["features"][:MAX_FEED_ITEMS]) if row is not None]


def gdacs_url(settings: dict, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    start = (now - timedelta(days=int(settings.get("days", 3)))).strftime("%Y-%m-%d")
    return GDACS_URL + "?" + urlencode({"eventlist": settings.get("event_types", "FL;TC;EQ;WF;DR;VO"), "fromDate": start,
                                        "toDate": now.strftime("%Y-%m-%d"), "alertlevel": "Green;Orange;Red"})


def _json(body: bytes):
    try:
        return json.loads(body)
    except ValueError:
        raise AdapterError("invalid_response") from None


def fetch_gdacs(settings: dict) -> list[dict]:
    status, body = connectors.bounded_request(gdacs_url(settings), connectors.REGISTRY["gdacs"]["hosts"],
                                              headers={"Accept": "application/json"}, max_bytes=FETCH_MAX_BYTES)
    if status == 204:
        return []  # GDACS answers 204 when no event matches the window
    if status != 200:
        raise AdapterError(f"upstream_status_{status}")
    return parse_gdacs(_json(body))


def _google_row(item, radius_km):
    if not isinstance(item, dict):
        return None
    gauge, location, severity = item.get("gaugeId"), item.get("gaugeLocation"), item.get("severity")
    if not isinstance(gauge, str) or not _SAFE_ID.match(gauge) or not isinstance(location, dict) or severity not in GOOGLE_SEVERITY:
        return None
    lat, lon = location.get("latitude"), location.get("longitude")
    observed = _timestamp(item.get("issuedTime"))
    if not (_finite(lat) and _finite(lon)) or observed is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    if not any(_km(lat, lon, p["lat"], p["lon"]) <= radius_km for p in RAIN_POINTS):
        return None
    trend, source = item.get("forecastTrend"), item.get("source")
    return _row("google_flood_forecasting", "flood_gauge", observed, lat, lon, GOOGLE_SEVERITY[severity],
                "flood_status_severity",
                {"point_id": gauge, "severity": severity, "quality_verified": item.get("qualityVerified") is True,
                 "trend": trend if trend in GOOGLE_TRENDS else None,
                 "source": source if isinstance(source, str) and _SAFE_ID.match(source) else None,
                 "attribution": "Google Flood Forecasting (CC BY 4.0)"},
                GOOGLE_FLOOD_URL)


def parse_google_flood(data, radius_km: float = 150.0) -> list[dict]:
    """searchLatestFloodStatusByArea response. Keeps gauges within radius_km of the pilot grid."""
    if not isinstance(data, dict) or not isinstance(data.get("floodStatuses", []), list):
        raise AdapterError("invalid_response")
    items = data.get("floodStatuses", [])[:MAX_FEED_ITEMS]
    return [row for row in (_google_row(i, radius_km) for i in items) if row is not None]


def fetch_google_flood(settings: dict) -> list[dict]:
    key = connectors.read_secret("google_flood_forecasting", "api_key")
    if not key:
        raise AdapterError("secret_missing")
    # The key travels only in a request header (never the URL), so it cannot reach access logs or error codes.
    body = json.dumps({"regionCode": settings.get("region_code", "IN")}).encode()
    status, payload = connectors.bounded_request(GOOGLE_FLOOD_URL, connectors.REGISTRY["google_flood_forecasting"]["hosts"],
                                                 method="POST", data=body, max_bytes=FETCH_MAX_BYTES,
                                                 headers={"Content-Type": "application/json", "X-Goog-Api-Key": key})
    if status != 200:
        raise AdapterError(f"upstream_status_{status}")
    return parse_google_flood(_json(payload), float(settings.get("radius_km", 150)))


ADAPTERS = {"open_meteo": fetch_open_meteo, "nasa_firms": fetch_nasa_firms, "nasa_lhasa": fetch_nasa_lhasa,
            "copernicus_cdse": _not_implemented, "imd_warnings": _not_implemented, "gdacs": fetch_gdacs,
            "google_flood_forecasting": fetch_google_flood}


# --- trigger evaluation ------------------------------------------------------------------------

def _state(score, watch, candidate) -> str:
    if score is None:
        return "clear"
    return "candidate" if score >= candidate else "watch" if score >= watch else "clear"


def evaluate(evidence: list[dict], config: dict | None = None, scale: float = 1.0) -> list[dict]:
    """Pure evaluation. `scale` multiplies both thresholds (0.8 = -20%). Evidence rows need ids."""
    config = config or load_config()
    hazards = config["hazards"]
    triggers = []

    def emit(hazard, key, lat, lon, score, cited, extra=None):
        spec = hazards[hazard]
        watch, candidate = spec["watch"] * scale, spec["candidate"] * scale
        cited = sorted(cited, key=lambda r: (r["observed_at"], r["id"]), reverse=True)[:MAX_CITED]
        triggers.append({
            "trigger_id": f"{hazard}:{key}", "config_version": config["version"], "hazard": hazard,
            "state": _state(score, watch, candidate), "lat": lat, "lon": lon,
            "score": round(score, 4) if score is not None else None, "evidence_ids": [r["id"] for r in cited],
            "rationale": {"variable": spec["variable"], "unit": spec["unit"], "comparison": spec["comparison"],
                          "threshold": {"watch": round(watch, 4), "candidate": round(candidate, 4)},
                          "score": score, "evidence_count": len(cited), "note": config["note"], **(extra or {})}})

    grouped: dict = {}
    for row in evidence:
        if row["hazard"] == "fire":
            continue
        point = (row.get("payload") or {}).get("point_id") or f"{row['lat']:.2f}_{row['lon']:.2f}"
        grouped.setdefault((row["hazard"], point), []).append(row)
    for (hazard, point), rows in sorted(grouped.items()):
        if hazard not in hazards:
            continue
        if hazards[hazard]["comparison"] == "ratio_to_median":
            scored = [(r["value"] / r["payload"]["median"], r) for r in rows
                      if _finite(r.get("value")) and _finite((r.get("payload") or {}).get("median")) and r["payload"]["median"] > 0]
        else:
            scored = [(r["value"], r) for r in rows if _finite(r.get("value"))]
        if not scored:
            continue
        score = max(s for s, _ in scored)
        emit(hazard, point, rows[0]["lat"], rows[0]["lon"], score, [r for _, r in scored])
    fires = [r for r in evidence if r["hazard"] == "fire"]
    if fires and "fire" in hazards:
        spec = hazards["fire"]
        allowed = {c.lower() for c in spec.get("confidence", [])}
        for point in RAIN_POINTS:
            near = [r for r in fires if _km(r["lat"], r["lon"], point["lat"], point["lon"]) <= spec.get("radius_km", 10)
                    and str((r.get("payload") or {}).get("confidence", "")).lower() in allowed]
            emit("fire", point["id"], point["lat"], point["lon"], float(len(near)), near)
    return triggers


def evaluate_all(evidence: list[dict], scale: float = 1.0, config: dict | None = None) -> list[dict]:
    """Effective hazard thresholds (fixture v1 plus any explicitly applied A8 overlay) and the A4 feed
    thresholds; each trigger keeps its own config_version."""
    return evaluate(evidence, config or effective_config(), scale=scale) + evaluate(evidence, load_feed_config(), scale=scale)


# --- orchestration ------------------------------------------------------------------------------

def _counts(triggers) -> dict:
    counts = {"clear": 0, "watch": 0, "candidate": 0}
    for trigger in triggers:
        counts[trigger["state"]] += 1
    return counts


def refresh() -> dict:
    """Pull every ENABLED hazard connector; failures become fixed codes and never raise."""
    return refresh_detailed()[0]


def refresh_detailed() -> tuple[dict, list[dict]]:
    """refresh() plus the trigger events it stored (for the sentinel and the scheduler)."""
    store = proactive_store.get_store()
    configs = store.list_configs()["configs"]
    fetched, collected = {}, []
    for connector_id, adapter in ADAPTERS.items():
        config = configs.get(connector_id) or {}
        if not config.get("enabled"):
            fetched[connector_id] = "disabled"
            continue
        settings = {**connectors.default_settings(connector_id), **(config.get("settings") or {})}
        try:
            rows = adapter(settings)
            fetched[connector_id] = len(rows)
            collected.extend(rows)
        except AdapterError as error:
            fetched[connector_id] = str(error)
        except connectors.connector_secrets.ConnectorKeyMissing:
            fetched[connector_id] = "connector_key_missing"
        except connectors.connector_secrets.SecretUnreadable:
            fetched[connector_id] = "connector_secret_unreadable"
        except TimeoutError:
            fetched[connector_id] = "timeout"
        except ValueError as error:
            fetched[connector_id] = str(error) if str(error) in {"url_not_allowlisted", "upstream_too_large"} else "invalid_response"
        except OSError:
            fetched[connector_id] = "network_error"
        except Exception:
            fetched[connector_id] = "adapter_failed"
    for row in collected:
        row["sha256"] = digest(row)
        row["id"] = str(uuid4())
    added = store.insert_evidence(collected) if collected else 0
    ids = store.evidence_by_sha([r["sha256"] for r in collected])
    for row in collected:
        row["id"] = ids.get(row["sha256"], row["id"])
    now = datetime.now(timezone.utc)
    triggers = [{**trigger, "id": str(uuid4()), "fired_at": now} for trigger in evaluate_all(collected, config=effective_config())]
    impact.apply(triggers, store)  # A3: never raises; keeps hazard states when exposure is unavailable
    for trigger in triggers:
        store.insert_trigger(trigger)
    return {"fetched": fetched, "evidence_added": added, "triggers": _counts(triggers)}, triggers


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def watch_view() -> dict:
    store = proactive_store.get_store()
    config = effective_config()
    now = datetime.now(timezone.utc)
    evidence = []
    for row in store.list_evidence(MAX_EVIDENCE):
        retrieved = row.get("retrieved_at")
        stale = not isinstance(retrieved, datetime) or (now - retrieved).total_seconds() > STALE_SECONDS
        evidence.append({"id": row["id"], "connector_id": row["connector_id"], "hazard": row["hazard"],
                         "observed_at": _iso(row["observed_at"]), "lat": row["lat"], "lon": row["lon"],
                         "value": row["value"], "unit": row["unit"], "stale": stale})
    triggers = [{"id": t["id"], "trigger_id": t["trigger_id"], "hazard": t["hazard"], "state": t["state"],
                 "fired_at": _iso(t["fired_at"]), "lat": t["lat"], "lon": t["lon"], "score": t["score"],
                 "threshold": (t.get("rationale") or {}).get("threshold"), "evidence_ids": t["evidence_ids"],
                 "impact": (t.get("rationale") or {}).get("impact"),
                 "rationale": {k: v for k, v in (t.get("rationale") or {}).items() if k != "impact"}}
                for t in store.list_triggers()]
    try:
        paused = store.get_pause().get("paused") is True
    except Exception:
        paused = None  # switch unreadable (for example 013 not applied); writes fail closed separately
    return {"generated_at": now.isoformat(), "config_version": config["version"], "config_source": config["config_source"],
            "impact_config_version": impact.load_config()["version"], "disclaimer": DISCLAIMER,
            "paused": paused, "evidence": evidence, "triggers": triggers}


# --- routes -------------------------------------------------------------------------------------

router = APIRouter(prefix="/v1/proactive", tags=["proactive"], dependencies=[Depends(connectors.require_proactive)])


# Watch reads mirror the web read_watch row (every signed-in role) and are limited to the exercise agency.
WATCH_READ = scoped_operator(EXERCISE_RECORD_ROLES)


def _unavailable():
    return HTTPException(status_code=503, detail="proactive_store_unavailable")


@router.get("/watch")
def get_watch(_operator: Operator = Depends(WATCH_READ)):
    try:
        return watch_view()
    except Exception:
        raise _unavailable() from None


@router.get("/watch/history")
def get_watch_history(days: int = Query(default=7, ge=1, le=30), _operator: Operator = Depends(WATCH_READ)):
    try:
        rows = proactive_store.get_store().trigger_history(days)
    except Exception:
        raise _unavailable() from None
    return {"days": days, "config_version": load_config()["version"], "disclaimer": DISCLAIMER, "history": rows}


@router.post("/watch/refresh")
def post_watch_refresh(operator: Operator = Depends(get_operator)):
    require_role(operator, {"incident_operator", "platform_admin"})
    connectors.require_not_paused()
    try:
        summary, triggers = refresh_detailed()
    except Exception:
        raise _unavailable() from None
    # A2 sentinel: flag this agency's open runs against the new evidence. It only appends flags;
    # a sentinel failure never fails the refresh and is reported as a fixed code.
    from app import proactive_sentinel
    try:
        summary["sentinel_flags"] = proactive_sentinel.apply(proactive_store.get_store(), operator.agency_id, triggers)
    except Exception:
        summary["sentinel_flags"] = "sentinel_failed"
    return summary


@router.get("/triggers/config")
def get_trigger_config(_operator: Operator = Depends(WATCH_READ)):
    return effective_config()


@router.get("/triggers/impact-config")
def get_impact_config(_operator: Operator = Depends(WATCH_READ)):
    return {"impact": impact.load_config(), "feeds": load_feed_config()}
