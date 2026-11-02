#!/usr/bin/env python3
"""Resumable, rate-limited, checksummed Open-Meteo downloader for the Phase 1 pilot.

Only the two allowlisted Open-Meteo hosts are contacted, redirects are refused, every response is
validated before it is saved, and a manifest records source, parameters, retrieval time and SHA-256.
Re-running skips files whose checksum already matches the manifest.
"""
import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

import pilot_config as cfg

MANIFEST_NAME = "openmeteo.json"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def build_jobs() -> list[dict]:
    jobs = []
    for point in cfg.RAIN_POINTS:
        query = urlencode({"latitude": point["lat"], "longitude": point["lon"], "start_date": cfg.START_DATE,
                           "end_date": cfg.END_DATE, "daily": ",".join(cfg.RAIN_VARIABLES), "timezone": "Asia/Kolkata"})
        jobs.append({"id": point["id"], "source": "openmeteo-archive", "point": point, "variables": list(cfg.RAIN_VARIABLES),
                     "url": f"https://archive-api.open-meteo.com/v1/archive?{query}"})
    for point in cfg.DISCHARGE_POINTS:
        query = urlencode({"latitude": point["lat"], "longitude": point["lon"], "start_date": cfg.START_DATE,
                           "end_date": cfg.END_DATE, "daily": ",".join(cfg.DISCHARGE_VARIABLES)})
        jobs.append({"id": point["id"], "source": "openmeteo-flood", "point": point, "variables": list(cfg.DISCHARGE_VARIABLES),
                     "url": f"https://flood-api.open-meteo.com/v1/flood?{query}"})
    return jobs


def http_get(url: str, timeout: int = 90):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in cfg.ALLOWED_HOSTS:
        raise ValueError("URL is not allowlisted")
    request = Request(url, headers={"User-Agent": cfg.USER_AGENT, "Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            return response.status, response.read(cfg.MAX_BYTES + 1), dict(response.headers)
    except HTTPError as error:
        return error.code, error.read(65536), dict(error.headers or {})


def fetch_with_retry(url: str, get=http_get, sleep=time.sleep, attempts: int = 3) -> bytes:
    """Return the body of a 200 response. Retries 429, 5xx and network errors with backoff; fails fast on other 4xx."""
    last = "no attempt"
    for attempt in range(1, attempts + 1):
        try:
            status, body, headers = get(url)
        except (URLError, TimeoutError, OSError) as error:
            last = f"network error: {type(error).__name__}"
            sleep(10 * attempt)
            continue
        if status == 200:
            if len(body) > cfg.MAX_BYTES:
                raise RuntimeError("response too large")
            return body
        if status == 429:
            retry_after = headers.get("Retry-After", "")
            last = "HTTP 429 (rate limited)"
            sleep(int(retry_after) if retry_after.isdigit() else 60 * attempt)
        elif 500 <= status < 600:
            last = f"HTTP {status}"
            sleep(10 * attempt)
        else:
            reason = ""
            try:
                reason = str(json.loads(body).get("reason", ""))[:200]
            except Exception:
                pass
            raise RuntimeError(f"HTTP {status} {reason}".strip())
    raise RuntimeError(f"gave up after {attempts} attempts: {last}")


def validate(job: dict, body: bytes, expected_days: int = cfg.EXPECTED_DAYS) -> dict:
    """Parse and sanity-check one response; returns summary fields for the manifest."""
    document = json.loads(body)
    if not isinstance(document, dict) or document.get("error"):
        raise ValueError("API returned an error document")
    daily = document.get("daily")
    if not isinstance(daily, dict) or not isinstance(daily.get("time"), list):
        raise ValueError("missing daily time axis")
    days = daily["time"]
    if len(days) != expected_days or days[0] != cfg.START_DATE or days[-1] != cfg.END_DATE:
        raise ValueError(f"unexpected date coverage: {len(days)} days, {days[:1]}..{days[-1:]}")
    present = 0
    for name in job["variables"]:
        series = daily.get(name)
        if not isinstance(series, list) or len(series) != len(days):
            raise ValueError(f"variable {name} missing or wrong length")
        present += sum(1 for value in series if value is not None)
    if present == 0:
        raise ValueError("no values returned")
    return {"rows": len(days), "first_date": days[0], "last_date": days[-1], "non_null_values": present,
            "returned_lat": document.get("latitude"), "returned_lon": document.get("longitude"),
            "elevation": document.get("elevation"), "units": document.get("daily_units")}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def raw_path(job: dict):
    return cfg.RAW_DIR / job["source"] / f"{job['id']}.json"


def manifest_path():
    return cfg.MANIFEST_DIR / MANIFEST_NAME


def load_manifest() -> dict:
    path = manifest_path()
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"files": {}}


def save_manifest(manifest: dict) -> None:
    cfg.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    temporary = manifest_path().with_suffix(".tmp")
    temporary.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, manifest_path())


def write_raw(job: dict, body: bytes) -> None:
    path = raw_path(job)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(body)
    os.replace(temporary, path)


def run(max_requests: int, delay: float, force: bool = False, get=http_get, sleep=time.sleep, jobs: list[dict] | None = None) -> dict:
    manifest = load_manifest()
    summary = {"fetched": 0, "cached": 0, "failed": [], "stopped_at_cap": False}
    for job in jobs if jobs is not None else build_jobs():
        key = f"{job['source']}/{job['id']}.json"
        path = raw_path(job)
        entry = manifest["files"].get(key)
        if not force and entry and path.is_file() and sha256(path.read_bytes()) == entry["sha256"]:
            summary["cached"] += 1
            continue
        if summary["fetched"] + len(summary["failed"]) >= max_requests:
            summary["stopped_at_cap"] = True
            break
        try:
            body = fetch_with_retry(job["url"], get=get, sleep=sleep)
            details = validate(job, body)
        except Exception as error:  # record and continue; a failed file is never half-saved
            summary["failed"].append({"file": key, "error": str(error)[:200]})
            sleep(delay)
            continue
        write_raw(job, body)
        manifest["files"][key] = {
            "source": job["source"], "id": job["id"], "url": job["url"], "variables": job["variables"],
            "requested_lat": job["point"]["lat"], "requested_lon": job["point"]["lon"], "note": job["point"].get("note"),
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "bytes": len(body), "sha256": sha256(body),
            **details,
        }
        manifest["attribution"] = cfg.ATTRIBUTION
        manifest["licence_register"] = cfg.LICENCE_REF
        manifest["notes"] = ("Reanalysis (ERA5-based) rainfall and GloFAS model discharge. Not station or gauge observations. "
                             "Non-commercial research use only; raw files are not redistributed.")
        save_manifest(manifest)  # after every success, so an interrupted run resumes cleanly
        summary["fetched"] += 1
        sleep(delay)
    return summary


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-requests", type=int, default=cfg.DEFAULT_MAX_REQUESTS)
    parser.add_argument("--delay", type=float, default=cfg.DEFAULT_DELAY_SECONDS)
    parser.add_argument("--force", action="store_true", help="re-download even if the checksum matches")
    args = parser.parse_args(argv)
    if args.max_requests < 1 or args.max_requests > 100 or args.delay < 1:
        parser.error("max-requests must be 1-100 and delay at least 1 second")
    result = run(args.max_requests, args.delay, args.force)
    print(json.dumps(result, indent=2))
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
