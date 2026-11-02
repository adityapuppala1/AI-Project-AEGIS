"""Replay the heavy-rain trigger on the pilot Open-Meteo archive (research/real-data/raw).

--train uses 2000-2017 only. --final-test (2018-2025) needs --i-understand-test-years-are-used-once,
writes a dated report and the FINAL_TEST_USED marker, and refuses a second run. Synthetic rehearsal
thresholds, not calibrated: the table is a rehearsal check, not forecasting accuracy.
"""
import argparse
import csv
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.hazard_watch import load_config

TRAIN_YEARS = (2000, 2017)
TEST_YEARS = (2018, 2025)
WINDOW_DAYS = 1


def _research_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "research" / "real-data"
        if candidate.is_dir():
            return candidate
    return Path("research/real-data")


def daily_max_rain(raw_dir: Path, years) -> dict:
    files = sorted((raw_dir / "openmeteo-archive").glob("*.json"))
    if not files:
        raise FileNotFoundError("raw archive missing")
    best: dict = {}
    for path in files:
        daily = json.loads(path.read_text(encoding="utf-8"))["daily"]
        for day, value in zip(daily["time"], daily["precipitation_sum"]):
            if value is None or not years[0] <= int(day[:4]) <= years[1]:
                continue
            best[day] = max(best.get(day, 0.0), float(value))
    return best


def flood_events(catalogue: Path, years) -> list[date]:
    with catalogue.open(encoding="utf-8", newline="") as handle:
        return sorted(date.fromisoformat(r["date"]) for r in csv.DictReader(handle)
                      if r.get("label") == "flood_event" and years[0] <= int(r["date"][:4]) <= years[1])


def score(rain: dict, events: list[date], level: str) -> dict:
    spec = load_config()["hazards"]["heavy_rain"]
    threshold = spec[level]
    fired = sorted(date.fromisoformat(d) for d, v in rain.items() if v >= threshold)
    near = lambda day: any(abs((day - e).days) <= WINDOW_DAYS for e in events)
    hits = [e for e in events if any(abs((f - e).days) <= WINDOW_DAYS for f in fired)]
    false_days = [f for f in fired if not near(f)]
    episodes = sum(1 for i, f in enumerate(false_days) if i == 0 or f - false_days[i - 1] > timedelta(days=1))
    return {"level": level, "threshold_mm": threshold, "fired_days": len(fired), "hits": len(hits),
            "misses": len(events) - len(hits), "false_alarm_episodes": episodes}


def render(results: list[dict], years, events) -> str:
    lines = [f"Heavy-rain trigger replay {years[0]}-{years[1]} ({len(events)} flood_event rows, +/-{WINDOW_DAYS} day window)",
             "Synthetic rehearsal thresholds, not calibrated; not forecasting accuracy.",
             f"{'level':<10}{'mm/day':>8}{'fired':>8}{'hit':>6}{'miss':>6}{'false_alarm':>13}"]
    for r in results:
        lines.append(f"{r['level']:<10}{r['threshold_mm']:>8}{r['fired_days']:>8}{r['hits']:>6}{r['misses']:>6}{r['false_alarm_episodes']:>13}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.proactive_replay")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--train", action="store_true")
    mode.add_argument("--final-test", action="store_true")
    parser.add_argument("--i-understand-test-years-are-used-once", dest="understood", action="store_true")
    parser.add_argument("--research-dir", type=Path, default=None)
    args = parser.parse_args(argv)
    root = args.research_dir or _research_root()
    results_dir = root / "results"
    marker = results_dir / "FINAL_TEST_USED"
    if args.final_test:
        if not args.understood:
            print("--final-test requires --i-understand-test-years-are-used-once", file=sys.stderr)
            return 2
        if marker.exists():
            print(f"Final test years were already used ({marker}); refusing a second run.", file=sys.stderr)
            return 3
    years = TRAIN_YEARS if args.train else TEST_YEARS
    try:
        rain = daily_max_rain(root / "raw", years)
    except (FileNotFoundError, OSError, KeyError, ValueError):
        print(f"Raw pilot data not found under {root / 'raw'}; run research/real-data/download_openmeteo.py first.",
              file=sys.stderr)
        return 2
    events = flood_events(root / "catalogue" / "known_events.csv", years)
    table = render([score(rain, events, level) for level in ("watch", "candidate")], years, events)
    print(table)
    if args.final_test:
        results_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        (results_dir / f"final_test_{stamp}.txt").write_text(table + "\n", encoding="utf-8")
        marker.write_text(stamp + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
