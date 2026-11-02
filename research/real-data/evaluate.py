#!/usr/bin/env python3
"""Phase 2 retrospective evaluation, implementing PHASE2_PROTOCOL.md exactly.

Two steps, both deterministic and offline:
  py -3 evaluate.py freeze   --catalogue CSV --series JSON --out frozen_thresholds.json
  py -3 evaluate.py evaluate --catalogue CSV --series JSON --frozen frozen_thresholds.json --out-dir DIR [--amendment NOTE]

Series JSON (supplied by the user): {"precipitation_mm": {"YYYY-MM-DD": grid-mean mm or null, ...},
"river_discharge": {...} (optional)}. Nothing here reads raw/ or manifests/ by itself, and nothing here is
imported by, or imports from, services/api or apps/web. Results are not forecast evaluations.
"""
import argparse
import csv
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import indicators as ind

ROOT = Path(__file__).resolve().parent
PROTOCOL_PATH = ROOT / "PHASE2_PROTOCOL.md"

DATA_START, DATA_END = "2000-01-01", "2025-12-31"
TRAIN_START, TRAIN_END = "2000-01-01", "2017-12-31"
TEST_START, TEST_END = "2018-01-01", "2025-12-31"
T_BASE_MM = 64.5                     # IMD "heavy rain" lower bound; a convention, never tuned
MIN_TEST_EVENTS = 5                  # stop rule: fewer events -> no rates at all
SIGNIFICANCE_EVENTS = 10             # fewer events -> no significance claim
ALPHA = 0.05
LABELS = ("event", "non_event")


def _grid(start: float, stop: float, step: float, digits: int) -> list[float]:
    count = int(round((stop - start) / step)) + 1
    return [float(round(start + i * step, digits)) for i in range(count)]


GRIDS = {
    "rain_1d": _grid(5, 200, 5, 1),
    "rain_3d": _grid(10, 400, 10, 1),
    "antecedent_7d": _grid(10, 400, 10, 1),
    "discharge_pct": _grid(0.50, 0.99, 0.01, 2),
}
INDICATOR_IDS = tuple(GRIDS)

ATTRIBUTION = "Weather data by Open-Meteo.com (https://open-meteo.com/), CC BY 4.0, https://open-meteo.com/en/licence"
DISCLOSURE = ("These results describe reanalysis rainfall against reviewed labels only; they are not gauge "
              "observations and not a forecast evaluation.")
ALLOWED_WORDING = ("Allowed wording: retrospective agreement between reanalysis rainfall indicators and reviewed "
                   "historical labels on the 2018-2025 test period.")
DISCLAIMER_START, DISCLAIMER_END = "<!-- wording-disclaimer:start -->", "<!-- wording-disclaimer:end -->"
FORBIDDEN_TERMS = ("forecast accuracy", "predicts floods", "prediction accuracy", "early warning performance",
                   "validated model", "operational skill")
DISCLAIMER = ("Forbidden wording: these results must never be described as "
              + ", ".join(f"'{term}'" for term in FORBIDDEN_TERMS)
              + ", or as showing that any rule predicts or can warn of future floods.")


class ProtocolError(RuntimeError):
    """Raised when a protocol rule would be broken; the CLI refuses to continue."""


# ---------- hashing ----------

def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def protocol_sha256(text: str) -> str:
    return sha256_bytes(text.replace("\r\n", "\n").encode("utf-8"))


def amendment_count(text: str) -> int:
    section = text.split("## Amendments log", 1)
    if len(section) < 2:
        return 0
    return sum(1 for line in section[1].splitlines() if re.match(r"^\|\s*\d{4}-\d{2}-\d{2}\s*\|", line))


# ---------- catalogue ----------

def load_catalogue(path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def qualify(rows: list[dict]) -> tuple[list[dict], dict, int]:
    """Apply protocol section 4. Returns (qualified rows, exclusion counts by reason, flag inconsistencies)."""
    excluded = {"unreviewed_or_invalid_label": 0, "missing_reviewer": 0, "same_reviewer": 0,
                "missing_evidence": 0, "invalid_or_out_of_range_date": 0, "duplicate_date": 0}
    kept, inconsistent, seen = [], 0, {}
    for row in rows:
        day = (row.get("date") or "").strip()
        label = (row.get("label") or "").strip()
        r1, r2 = (row.get("reviewer_1") or "").strip(), (row.get("reviewer_2") or "").strip()
        url = (row.get("evidence_url") or "").strip()
        try:
            ind.parse_day(day)
            in_range = DATA_START <= day <= DATA_END
        except ValueError:
            in_range = False
        if not in_range:
            excluded["invalid_or_out_of_range_date"] += 1
        elif label not in LABELS:
            excluded["unreviewed_or_invalid_label"] += 1
        elif not r1 or not r2:
            excluded["missing_reviewer"] += 1
        elif r1.casefold() == r2.casefold():
            excluded["same_reviewer"] += 1
        elif not url.lower().startswith(("http://", "https://")):
            excluded["missing_evidence"] += 1
        else:
            if (row.get("needs_second_person_review") or "").strip().lower() == "true":
                inconsistent += 1
            seen.setdefault(day, []).append({"date": day, "label": label})
            continue
    for day in sorted(seen):
        if len(seen[day]) > 1:
            excluded["duplicate_date"] += len(seen[day])
        else:
            kept.append(seen[day][0])
    return kept, excluded, inconsistent


def split(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    train = [row for row in rows if TRAIN_START <= row["date"] <= TRAIN_END]
    test = [row for row in rows if TEST_START <= row["date"] <= TEST_END]
    return train, test


# ---------- series and indicators ----------

def load_series(path) -> tuple[dict, dict | None]:
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if "precipitation_mm" not in document:
        raise ProtocolError("series JSON needs a 'precipitation_mm' object of {date: grid-mean mm or null}")
    precip = ind.clean_series(document["precipitation_mm"])
    discharge = ind.clean_series(document["river_discharge"]) if document.get("river_discharge") else None
    return precip, discharge


def with_indicators(rows: list[dict], precip: dict, discharge: dict | None) -> list[dict]:
    reference = ind.training_sample(discharge, TRAIN_END) if discharge else []
    return [{**row, **ind.indicators_for(row["date"], precip, discharge, reference)} for row in rows]


# ---------- metrics ----------

def confusion(rows: list[dict], indicator: str, threshold: float) -> dict:
    out = {"hits": [], "false_alarms": [], "misses": [], "correct_negatives": [], "not_computable": []}
    for row in rows:
        value = row.get(indicator)
        if value is None:
            out["not_computable"].append(row["date"])
            continue
        flagged, event = value >= threshold, row["label"] == "event"
        key = "hits" if flagged and event else "false_alarms" if flagged else "misses" if event else "correct_negatives"
        out[key].append(row["date"])
    return out


def csi_of(counts: dict) -> float | None:
    a, b, c = len(counts["hits"]), len(counts["false_alarms"]), len(counts["misses"])
    return a / (a + b + c) if a + b + c else None


def select_threshold(train_rows: list[dict], indicator: str) -> float | None:
    """Maximise CSI on train over the fixed grid; undefined CSI counts as 0; ties -> higher threshold."""
    if not any(row["label"] == "event" and row.get(indicator) is not None for row in train_rows):
        return None
    best, best_score = None, -1.0
    for threshold in GRIDS[indicator]:
        score = csi_of(confusion(train_rows, indicator, threshold)) or 0.0
        if score >= best_score:            # >= keeps the later (higher) threshold on ties
            best, best_score = threshold, score
    return best


def _log_pmf(k: int, n: int, p: float) -> float:
    if p <= 0.0:
        return 0.0 if k == 0 else -math.inf
    if p >= 1.0:
        return 0.0 if k == n else -math.inf
    return (math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
            + k * math.log(p) + (n - k) * math.log1p(-p))


def binom_cdf(k: int, n: int, p: float) -> float:
    if k < 0:
        return 0.0
    if k >= n:
        return 1.0
    return min(1.0, sum(math.exp(_log_pmf(i, n, p)) for i in range(k + 1)))


def _bisect(func, target: float, increasing: bool) -> float:
    low, high = 0.0, 1.0
    for _ in range(200):
        mid = (low + high) / 2
        if (func(mid) < target) == increasing:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def clopper_pearson(k: int, n: int, alpha: float = ALPHA) -> tuple[float, float] | None:
    """Exact interval: lower solves P(X >= k | p) = alpha/2, upper solves P(X <= k | p) = alpha/2."""
    if n <= 0:
        return None
    if not 0 <= k <= n:
        raise ValueError("need 0 <= k <= n")
    lower = 0.0 if k == 0 else _bisect(lambda p: 1.0 - binom_cdf(k - 1, n, p), alpha / 2, increasing=True)
    upper = 1.0 if k == n else _bisect(lambda p: binom_cdf(k, n, p), alpha / 2, increasing=False)
    return round(lower, 6), round(upper, 6)


def rates(counts: dict) -> dict:
    a, b, c, d = (len(counts[key]) for key in ("hits", "false_alarms", "misses", "correct_negatives"))

    def rate(k, n):
        return {"value": round(k / n, 6) if n else None, "k": k, "n": n,
                "ci95": list(clopper_pearson(k, n)) if n else None}
    csi = csi_of(counts)
    return {"pod": rate(a, a + c), "far": rate(b, a + b), "pofd": rate(b, b + d),
            "csi": {"value": round(csi, 6) if csi is not None else None, "ci95": None}}


# ---------- freezing ----------

def freeze(catalogue_rows: list[dict], precip: dict, discharge: dict | None, protocol_text: str) -> dict:
    qualified, _, _ = qualify(catalogue_rows)
    train, _ = split(qualified)
    train = with_indicators(train, precip, discharge)
    body = {
        "protocol_sha256": protocol_sha256(protocol_text),
        "protocol_amendment_count": amendment_count(protocol_text),
        "train": [TRAIN_START, TRAIN_END], "test": [TEST_START, TEST_END],
        "baseline": {"indicator": "rain_1d", "threshold": T_BASE_MM, "source": "IMD heavy-rain lower bound (convention)"},
        "selection": "max CSI on train over fixed grid; undefined CSI = 0; ties -> higher threshold",
        "thresholds": {name: select_threshold(train, name) for name in INDICATOR_IDS},
        "train_events": sum(1 for row in train if row["label"] == "event"),
        "train_non_events": sum(1 for row in train if row["label"] == "non_event"),
    }
    return {**body, "frozen_sha256": sha256_bytes(canonical(body))}


def verify_frozen(frozen: dict) -> str:
    body = {key: value for key, value in frozen.items() if key != "frozen_sha256"}
    digest = sha256_bytes(canonical(body))
    if digest != frozen.get("frozen_sha256"):
        raise ProtocolError("frozen threshold file has been modified (SHA-256 mismatch)")
    return digest


def check_protocol(frozen: dict, protocol_text: str) -> None:
    if protocol_sha256(protocol_text) == frozen["protocol_sha256"]:
        return
    if amendment_count(protocol_text) > frozen["protocol_amendment_count"]:
        return
    raise ProtocolError("PHASE2_PROTOCOL.md differs from the version frozen with the thresholds and no amendment "
                        "row has been added; add a dated amendment entry first")


# ---------- evaluation (once) ----------

def build_report(catalogue_rows: list[dict], precip: dict, discharge: dict | None, frozen: dict) -> dict:
    qualified, excluded, inconsistent = qualify(catalogue_rows)
    train, test = split(qualified)
    test = with_indicators(test, precip, discharge)
    events = sum(1 for row in test if row["label"] == "event")
    status = "insufficient_events" if events < MIN_TEST_EVENTS else "reported"
    rules = [{"id": "baseline_rain_1d", "indicator": "rain_1d", "threshold": T_BASE_MM, "kind": "baseline"}]
    rules += [{"id": f"candidate_{name}", "indicator": name, "threshold": frozen["thresholds"][name], "kind": "candidate"}
              for name in INDICATOR_IDS]
    results = []
    for rule in rules:
        entry = dict(rule)
        if rule["threshold"] is None:
            entry["status"] = "not_selectable"
        elif rule["indicator"] == "discharge_pct" and discharge is None:
            entry["status"] = "not_available"
        else:
            counts = confusion(test, rule["indicator"], rule["threshold"])
            entry["status"] = "evaluated"
            entry["counts"] = {key: len(value) for key, value in counts.items()}
            entry["dates"] = counts
            if status == "reported":
                entry["rates"] = rates(counts)
        results.append(entry)
    return {
        "status": status,
        "test_events": events,
        "test_non_events": len(test) - events,
        "train_events": sum(1 for row in train if row["label"] == "event"),
        "train_non_events": sum(1 for row in train if row["label"] == "non_event"),
        "significance": ("no claim of statistical significance is made (fewer than 10 test events)"
                         if events < SIGNIFICANCE_EVENTS else "intervals shown; no rule is declared best"),
        "excluded_rows": excluded, "excluded_total": sum(excluded.values()),
        "review_flag_inconsistencies": inconsistent,
        "lead_time": "not assessed (daily data)",
        "split": {"train": [TRAIN_START, TRAIN_END], "test": [TEST_START, TEST_END]},
        "frozen_sha256": frozen["frozen_sha256"], "protocol_sha256": frozen["protocol_sha256"],
        "rules": results,
        "source": ATTRIBUTION, "disclosure": DISCLOSURE, "allowed_wording": ALLOWED_WORDING, "disclaimer": DISCLAIMER,
    }


def _fmt_rate(rate: dict) -> str:
    if rate["value"] is None:
        return "undefined"
    low, high = rate["ci95"]
    return f"{rate['value']:.3f} ({rate['k']}/{rate['n']}; 95% CI {low:.3f}-{high:.3f})"


def render_markdown(report: dict) -> str:
    lines = ["# Phase 2 retrospective evaluation (reanalysis rainfall vs reviewed labels)", "",
             f"**Test events: {report['test_events']}** (non-events: {report['test_non_events']}). "
             f"Status: **{report['status'].replace('_', ' ')}**.", "",
             report["disclosure"], "", f"Significance: {report['significance']}.",
             f"Lead time: {report['lead_time']}.", "",
             f"Split: train {report['split']['train'][0]}..{report['split']['train'][1]}, "
             f"test {report['split']['test'][0]}..{report['split']['test'][1]}.",
             f"Class balance: train {report['train_events']} events / {report['train_non_events']} non-events; "
             f"test {report['test_events']} / {report['test_non_events']}.",
             f"Excluded catalogue rows: {report['excluded_total']} "
             + "(" + ", ".join(f"{k}: {v}" for k, v in report["excluded_rows"].items()) + ").",
             f"Rows with two reviewers still flagged for second review: {report['review_flag_inconsistencies']}.",
             f"Frozen thresholds SHA-256: `{report['frozen_sha256']}`; protocol SHA-256: `{report['protocol_sha256']}`.", ""]
    if report["status"] == "insufficient_events":
        lines += ["Insufficient events: fewer than 5 test events, so no rates are shown.", ""]
    for rule in report["rules"]:
        lines.append(f"## {rule['id']} ({rule['indicator']} >= {rule['threshold']})")
        if rule["status"] != "evaluated":
            lines += [f"Status: {rule['status'].replace('_', ' ')}.", ""]
            continue
        counts = rule["counts"]
        lines.append(f"Hits {counts['hits']}, false alarms {counts['false_alarms']}, misses {counts['misses']}, "
                     f"correct negatives {counts['correct_negatives']}, not computable {counts['not_computable']}.")
        if "rates" in rule:
            r = rule["rates"]
            csi = "undefined" if r["csi"]["value"] is None else f"{r['csi']['value']:.3f} (no interval)"
            lines.append(f"Hit rate (POD) {_fmt_rate(r['pod'])}; false-alarm ratio {_fmt_rate(r['far'])}; "
                         f"false alarm rate (POFD) {_fmt_rate(r['pofd'])}; CSI {csi}.")
        for key, title in (("misses", "Missed events"), ("false_alarms", "False alarms"), ("hits", "Hits")):
            lines.append(f"{title}: {', '.join(rule['dates'][key]) or 'none'}.")
        lines.append("")
    lines += [f"Source: {report['source']}. Changes: aggregated to a grid mean by this project.", "",
              report["allowed_wording"], "", DISCLAIMER_START, report["disclaimer"], DISCLAIMER_END, ""]
    return "\n".join(lines)


def record_run(log_path: Path, frozen_hash: str, amendment: str | None, now: str) -> None:
    log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else {"runs": []}
    previous = [run for run in log["runs"] if run["frozen_sha256"] == frozen_hash]
    if previous and not (amendment and amendment.strip()):
        raise ProtocolError("the test period has already been evaluated for this frozen hash; "
                            "a re-run needs --amendment and a matching entry in the protocol amendments log")
    log["runs"].append({"frozen_sha256": frozen_hash, "at": now, "amendment": (amendment or "").strip() or None,
                        "run_number": len(previous) + 1})
    log_path.write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")


def run_evaluation(catalogue_path, series_path, frozen_path, out_dir, amendment=None, protocol_path=PROTOCOL_PATH,
                   now: str | None = None) -> dict:
    frozen = json.loads(Path(frozen_path).read_text(encoding="utf-8"))
    digest = verify_frozen(frozen)
    check_protocol(frozen, Path(protocol_path).read_text(encoding="utf-8"))
    rows = load_catalogue(catalogue_path)
    precip, discharge = load_series(series_path)
    report = build_report(rows, precip, discharge, frozen)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    record_run(out / "evaluation_log.json", digest,
               amendment, now or datetime.now(timezone.utc).isoformat(timespec="seconds"))
    (out / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (out / "report.md").write_text(render_markdown(report), encoding="utf-8")
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    f = sub.add_parser("freeze", help="select thresholds from the training period only and freeze them")
    f.add_argument("--catalogue", required=True)
    f.add_argument("--series", required=True)
    f.add_argument("--out", required=True)
    e = sub.add_parser("evaluate", help="evaluate the frozen rules on the test period (once)")
    e.add_argument("--catalogue", required=True)
    e.add_argument("--series", required=True)
    e.add_argument("--frozen", required=True)
    e.add_argument("--out-dir", required=True)
    e.add_argument("--amendment", default=None, help="required to re-run; recorded in the evaluation log")
    for p in (f, e):
        p.add_argument("--protocol", default=str(PROTOCOL_PATH))
    args = parser.parse_args(argv)
    try:
        if args.command == "freeze":
            out = Path(args.out)
            if out.exists():
                raise ProtocolError(f"{out} already exists; frozen thresholds are never overwritten")
            precip, discharge = load_series(args.series)
            frozen = freeze(load_catalogue(args.catalogue), precip, discharge, Path(args.protocol).read_text(encoding="utf-8"))
            out.write_text(json.dumps(frozen, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(json.dumps({"frozen_sha256": frozen["frozen_sha256"], "thresholds": frozen["thresholds"]}, indent=2))
        else:
            report = run_evaluation(args.catalogue, args.series, args.frozen, args.out_dir, args.amendment, args.protocol)
            print(json.dumps({"status": report["status"], "test_events": report["test_events"]}, indent=2))
    except ProtocolError as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
