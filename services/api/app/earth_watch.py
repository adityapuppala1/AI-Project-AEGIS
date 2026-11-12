"""Opt-in, display-only public Earth reference feeds (USGS, NASA EONET, NASA GIBS).

These records are never written to the database and never feed cases,
assessments, proposals, approvals or tasks. Only fixed HTTPS allowlisted
upstreams are fetched. See docs/EARTH_WATCH_ENHANCEMENT_PLAN.md.
"""
import json
import math
import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from fastapi import APIRouter, Depends, HTTPException

from app.security import EXERCISE_RECORD_ROLES, Operator, scoped_operator

router = APIRouter(prefix="/v1/public-reference/earth-watch", tags=["public-reference"])
# Public reference data, not agency records: a verified operator with an explicit role is required, without
# the exercise-agency check (docs/SECURITY_ASSESSMENT.md).
EARTH_WATCH_READ = scoped_operator(EXERCISE_RECORD_ROLES, fixture_agency=False)

MAX_BYTES = 12_000_000
MAX_RECORDS = 500
TIMEOUT_SECONDS = 10            # per socket read
DEADLINE_SECONDS = 25           # total time for one upstream fetch (stops slow-drip responses)
BACKOFF_SECONDS = 60            # after a failed refresh, do not contact the upstream again for this long
STALE_MAX_SECONDS = 86400       # never serve retained data older than a day
MAX_URL_LENGTH = 500
GIBS_LAYERS = (
    "MODIS_Terra_CorrectedReflectance_TrueColor",
    "MODIS_Aqua_CorrectedReflectance_TrueColor",
    "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
)
# feed -> (fixed HTTPS URL, cache seconds, attribution)
FEEDS = {
    "earthquakes": ("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson", 300,
                    "USGS Earthquake Hazards Program"),
    "events": ("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=500", 300,
               "NASA EONET v3"),
    "imagery": ("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 3600,
                "NASA EOSDIS GIBS"),
}
ALLOWED_HOSTS = {urlparse(url).hostname for url, _, _ in FEEDS.values()}
LIMITATIONS = {
    "earthquakes": ["USGS M2.5+ reports from the past 7 days; some are preliminary.",
                    "Public reference data, not an AEGIS assessment or warning.",
                    "Earthquake data compiled by the U.S. Geological Survey. No USGS endorsement is implied."],
    "events": ["EONET is a curated, incomplete catalogue of open events, not a warning service.",
               "Only the latest point observation per event is shown; no hazard footprint.",
               "No markers does not mean safe.",
               "Event data from NASA EONET. No NASA endorsement is implied."],
    "imagery": ["Daily delayed composites, not live video.",
                "Clouds and gaps are possible; availability does not guarantee coverage.",
                "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services "
                "(GIBS), part of NASA's Earth Science Data and Information System (ESDIS). No NASA endorsement is implied."],
}

_cache: dict[str, dict] = {}
_next_attempt: dict[str, float] = {}
_locks = {name: threading.Lock() for name in FEEDS}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def enabled() -> bool:
    return os.environ.get("AEGIS_PUBLIC_EARTH_FEEDS") == "1"


def _fetch_bytes(url: str) -> bytes:
    """Fetch one allowlisted URL: no redirects, no proxy variables, bounded size and total time, no credentials."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("URL is not allowlisted")
    request = Request(url, headers={"User-Agent": "AEGIS-EarthWatch/1.0", "Accept": "*/*"})
    deadline = time.monotonic() + DEADLINE_SECONDS
    chunks: list[bytes] = []
    size = 0
    # ProxyHandler({}) ignores HTTP(S)_PROXY so the allowlisted host is always contacted directly.
    with build_opener(ProxyHandler({}), _NoRedirect()).open(request, timeout=TIMEOUT_SECONDS) as response:
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError("Upstream too slow")
            chunk = response.read1(65536)  # returns after one socket read, so the deadline is checked often
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("Upstream response too large")
            chunks.append(chunk)
    return b"".join(chunks)


def _valid_point(coords) -> bool:
    return (isinstance(coords, (list, tuple)) and len(coords) >= 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in coords[:2])
            and -180 <= coords[0] <= 180 and -90 <= coords[1] <= 90)


def _https(value) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme == "https" and parsed.hostname and len(value) <= MAX_URL_LENGTH else None


def _iso_from_ms(value) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _iso(value) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()


def normalize_earthquakes(data) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        raise ValueError("Invalid earthquake feed")
    records = []
    seen: set[str] = set()
    for feature in data["features"]:
        geometry = feature.get("geometry") if isinstance(feature, dict) else None
        props = feature.get("properties") if isinstance(feature, dict) else None
        if not isinstance(geometry, dict) or not isinstance(props, dict):
            continue
        if geometry.get("type") != "Point" or not _valid_point(geometry.get("coordinates")):
            continue
        if props.get("type") != "earthquake" or not isinstance(feature.get("id"), str):
            continue
        mag = props.get("mag")
        mag = float(mag) if isinstance(mag, (int, float)) and not isinstance(mag, bool) and math.isfinite(mag) else None
        place = props.get("place") if isinstance(props.get("place"), str) else "Earthquake"
        record_id = "usgs-" + feature["id"][:60]
        if record_id in seen:
            continue
        seen.add(record_id)
        records.append({
            "id": record_id, "source": "USGS", "category": "earthquakes", "kind": "Earthquake",
            "title": f"M{mag:.1f} · {place[:120]}" if mag is not None else place[:120],
            "observed_at": _iso_from_ms(props.get("time")), "updated_at": _iso_from_ms(props.get("updated")),
            "lon": geometry["coordinates"][0], "lat": geometry["coordinates"][1], "magnitude": mag,
            "status": props["status"][:40] if isinstance(props.get("status"), str) else "not supplied",
            "url": _https(props.get("url")),
        })
        if len(records) >= MAX_RECORDS:
            break
    return records


def normalize_events(data) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get("events"), list):
        raise ValueError("Invalid event feed")
    records = []
    seen: set[str] = set()
    for event in data["events"]:
        if not isinstance(event, dict) or not isinstance(event.get("id"), str):
            continue
        if "eonet-" + event["id"][:60] in seen:
            continue
        points = [g for g in (event.get("geometry") or []) if isinstance(g, dict)
                  and g.get("type") == "Point" and _valid_point(g.get("coordinates")) and _iso(g.get("date"))]
        if not points:
            continue
        latest = max(points, key=lambda g: _iso(g["date"]))
        categories = [c for c in (event.get("categories") or []) if isinstance(c, dict)]
        sources = [s for s in (event.get("sources") or []) if isinstance(s, dict)]
        seen.add("eonet-" + event["id"][:60])
        records.append({
            "id": "eonet-" + event["id"][:60], "source": "NASA EONET",
            "category": categories[0]["id"][:40] if categories and isinstance(categories[0].get("id"), str) else "other",
            "kind": (", ".join(str(c.get("title"))[:40] for c in categories if c.get("title")) or "Natural event")[:120],
            "title": str(event.get("title") or "Natural event")[:140],
            "observed_at": _iso(latest["date"]), "updated_at": None,
            "lon": latest["coordinates"][0], "lat": latest["coordinates"][1], "magnitude": None,
            "status": "closed" if event.get("closed") else "open in source catalogue",
            "url": _https(sources[0].get("url")) if sources else _https(event.get("link")),
        })
        if len(records) >= MAX_RECORDS:
            break
    return records


def _reject_unsafe_xml(payload: bytes) -> None:
    """Only plain UTF-8/ASCII XML without DTDs is accepted; other encodings could hide a DOCTYPE from a byte search."""
    if b"\x00" in payload or payload.startswith((b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")) or not payload.lstrip().startswith(b"<"):
        raise ValueError("Unexpected XML encoding")
    declared = re.match(rb"<\?xml[^>]*?encoding\s*=\s*[\"']([^\"']+)", payload[:512], re.I)
    if declared and declared.group(1).lower() not in (b"utf-8", b"us-ascii"):
        raise ValueError("Unexpected XML encoding")
    upper = payload.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("Unexpected XML declarations")


def parse_imagery(payload: bytes) -> list[dict]:
    _reject_unsafe_xml(payload)
    ns = {"w": "http://www.opengis.net/wmts/1.0", "o": "http://www.opengis.net/ows/1.1"}
    root = ET.fromstring(payload)
    layers = []
    for layer in root.findall(".//w:Layer", ns):
        identifier = layer.findtext("o:Identifier", namespaces=ns)
        if identifier not in GIBS_LAYERS:
            continue
        dimension = layer.find("w:Dimension", ns)
        if dimension is None:
            raise ValueError("Imagery dates unavailable")
        ranges = [v.text.strip()[:40] for v in dimension.findall("w:Value", ns) if v.text][:200]
        latest = (dimension.findtext("w:Default", namespaces=ns) or "").strip()[:12]
        matrix = (layer.findtext("w:TileMatrixSetLink/w:TileMatrixSet", namespaces=ns) or "").strip()[:60]
        if not latest or not ranges or not matrix:
            raise ValueError("Imagery dates unavailable")
        layers.append({"id": identifier, "title": (layer.findtext("o:Title", namespaces=ns) or identifier)[:120],
                       "latest": latest, "start": ranges[0].split("/")[0][:12], "ranges": ranges, "matrix": matrix})
    if len(layers) != len(GIBS_LAYERS) or {item["id"] for item in layers} != set(GIBS_LAYERS):
        raise ValueError("Missing supported imagery layers")
    return layers


def _build(feed: str, payload: bytes) -> dict:
    if feed == "earthquakes":
        return {"records": normalize_earthquakes(json.loads(payload))}
    if feed == "events":
        return {"records": normalize_events(json.loads(payload))}
    return {"layers": parse_imagery(payload)}


def load_feed(feed: str) -> dict:
    """Return cached or fresh data; mark retained data stale when upstream fails."""
    url, ttl, attribution = FEEDS[feed]
    now = time.time()
    cached = _cache.get(feed)
    if cached and now - cached["fetched_epoch"] < ttl:
        return {**cached, "stale": False}
    retained = cached if cached and now - cached["fetched_epoch"] < STALE_MAX_SECONDS else None

    def stale(reason: str) -> dict:
        return {**retained, "stale": True, "warning": reason}

    # Never block a shared API worker on a slow upstream: after a failure, back off; while another request
    # is already refreshing, answer from retained data or fail fast instead of queueing behind it.
    if now < _next_attempt.get(feed, 0):
        if retained:
            return stale("Upstream unavailable; showing previously fetched data.")
        raise RuntimeError("upstream recently failed")
    lock = _locks[feed]
    if not lock.acquire(blocking=False):
        if retained:
            return stale("Refresh in progress; showing previously fetched data.")
        raise RuntimeError("refresh in progress")
    try:
        fresh = _cache.get(feed)
        if fresh and time.time() - fresh["fetched_epoch"] < ttl:
            return {**fresh, "stale": False}
        try:
            try:
                body = _build(feed, _fetch_bytes(url))
            except Exception:
                if retained:
                    raise
                # First-ever fetch (for example right after start-up): one retry for transient network errors.
                time.sleep(1)
                body = _build(feed, _fetch_bytes(url))
        except Exception:
            _next_attempt[feed] = time.time() + BACKOFF_SECONDS
            if retained:
                return stale("Upstream unavailable; showing previously fetched data.")
            raise
        _next_attempt.pop(feed, None)
        fetched = time.time()
        entry = {"classification": "public_reference", "feed": feed, "attribution": attribution,
                 "upstream": url, "fetched_epoch": fetched,
                 "fetched_at": datetime.fromtimestamp(fetched, tz=timezone.utc).isoformat(),
                 "cache_seconds": ttl, "limitations": LIMITATIONS[feed], **body}
        _cache[feed] = entry
        return {**entry, "stale": False}
    finally:
        lock.release()


def clear_cache() -> None:
    _cache.clear()
    _next_attempt.clear()


@router.get("/status")
def earth_watch_status(_operator: Operator = Depends(EARTH_WATCH_READ)):
    return {"classification": "public_reference", "enabled": enabled(),
            "feeds": sorted(FEEDS), "display_only": True, "writes_to_database": False,
            "notice": "Public reference data only; not an AEGIS assessment, warning or dispatch input."}


@router.get("/{feed}")
def earth_watch_feed(feed: str, _operator: Operator = Depends(EARTH_WATCH_READ)):
    if feed not in FEEDS:
        raise HTTPException(status_code=404, detail="Unknown public reference feed")
    if not enabled():
        raise HTTPException(status_code=503, detail="Public Earth feeds are disabled in this environment")
    try:
        return load_feed(feed)
    except Exception:
        raise HTTPException(status_code=502, detail="Public data source unavailable; no demo data was substituted")
