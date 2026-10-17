"""Bounded, read-only tabletop latency check. Not a production load benchmark."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path
import statistics
import time
from urllib.parse import urlparse
from urllib.request import ProxyHandler, build_opener

CASE = "22222222-2222-4222-8222-222222222222"
# Local rehearsal targets, declared before measurement; no forecasting metrics.
ROUTES = [
    ("api_health", "api", "/health", 250),
    ("incident_registry", "api", "/v1/exercise/incidents/query", 750),
    ("assessment", "api", f"/v1/exercise/incidents/{CASE}/readiness", 1000),
    ("case_audit", "api", f"/v1/exercise/incidents/{CASE}/audit", 1500),
    ("guided_demo", "web", "/demo", 2000),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--web", default="http://127.0.0.1:3000")
    parser.add_argument("--requests", type=int, default=20)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 1 <= args.requests <= 200 or not 1 <= args.concurrency <= 8:
        parser.error("Use 1–200 requests per route and 1–8 concurrent workers")
    for base in (args.api, args.web):
        parsed = urlparse(base)
        if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.username or parsed.password:
            parser.error("Only local HTTP services without URL credentials are supported")
    results = []
    started = time.perf_counter()
    for name, service, route, target in ROUTES:
        url = getattr(args, service).rstrip("/") + route
        def request(_):
            begin = time.perf_counter()
            try:
                with build_opener(ProxyHandler({})).open(url, timeout=10) as response:
                    response.read()
                    ok = response.status == 200
            except Exception:
                ok = False
            return round((time.perf_counter() - begin) * 1000, 2), ok
        request(None)  # Warm-up is excluded from the recorded samples.
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            samples = list(pool.map(request, range(args.requests)))
        timings = sorted(value for value, _ in samples)
        p95 = timings[math.ceil(len(timings) * .95) - 1]
        results.append({"route": name, "requests": len(samples),
                        "errors": sum(not ok for _, ok in samples),
                        "median_ms": round(statistics.median(timings), 2),
                        "p95_ms": p95, "target_p95_ms": target,
                        "within_local_target": p95 <= target})
    report = {"kind": "local_synthetic_demo_software_latency", "concurrency": args.concurrency,
              "duration_seconds": round(time.perf_counter() - started, 2),
              "production_capacity_established": False, "routes": results}
    output = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    print(output)
    if any(item["errors"] or not item["within_local_target"] for item in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
