#!/usr/bin/env python3
"""Draft candidate days for the event catalogue, derived only from the downloaded rainfall.

Nothing here says whether a day was a flood. Every row is `unlabelled` and `needs_second_person_review`
until a person checks it against a primary source. Heavy-rain days are the top grid-mean days; the
comparison days are wet but not extreme; dry days give a plain baseline. Sampling uses a fixed seed.
"""
import csv
import json
import random
import sys
from statistics import mean

import pilot_config as cfg

SEED = 20261102
FIELDS = ["date", "kind", "grid_mean_precip_mm", "max_point_precip_mm", "points_reporting", "rank_by_grid_mean",
          "label", "evidence_url", "reviewer_1", "reviewer_2", "needs_second_person_review"]


def grid_rows(raw_dir=None) -> list[dict]:
    directory = (raw_dir or cfg.RAW_DIR) / "openmeteo-archive"
    files = sorted(directory.glob("*.json"))
    if not files:
        raise SystemExit("no archive files found; run download_openmeteo.py first")
    per_day: dict[str, list[float]] = {}
    for path in files:
        daily = json.loads(path.read_text(encoding="utf-8"))["daily"]
        for day, value in zip(daily["time"], daily["precipitation_sum"]):
            if value is not None:
                per_day.setdefault(day, []).append(float(value))
    return [{"date": day, "mean": mean(values), "max": max(values), "n": len(values)} for day, values in sorted(per_day.items())]


def build_candidates(rows: list[dict], heavy: int = 40, wet: int = 40, dry: int = 20, seed: int = SEED, min_points: int = 5) -> list[dict]:
    usable = [dict(row) for row in rows if row["n"] >= min_points]
    ranked = sorted(usable, key=lambda row: (-row["mean"], row["date"]))
    for position, row in enumerate(ranked, 1):
        row["rank"] = position
    rng = random.Random(seed)
    wet_pool = ranked[heavy:200]
    dry_pool = [row for row in ranked if row["mean"] < 1.0]
    chosen = [("heavy_rain_candidate", row) for row in ranked[:heavy]]
    chosen += [("wet_day_comparison", row) for row in rng.sample(wet_pool, min(wet, len(wet_pool)))]
    chosen += [("dry_day_baseline", row) for row in rng.sample(dry_pool, min(dry, len(dry_pool)))]
    return [{
        "date": row["date"], "kind": kind, "grid_mean_precip_mm": f"{row['mean']:.1f}", "max_point_precip_mm": f"{row['max']:.1f}",
        "points_reporting": row["n"], "rank_by_grid_mean": row["rank"], "label": "unlabelled", "evidence_url": "",
        "reviewer_1": "", "reviewer_2": "", "needs_second_person_review": "true",
    } for kind, row in sorted(chosen, key=lambda item: item[1]["date"])]


def write_csv(rows: list[dict], path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    rows = build_candidates(grid_rows())
    write_csv(rows, cfg.CATALOGUE_DIR / "candidates.csv")
    kinds: dict[str, int] = {}
    for row in rows:
        kinds[row["kind"]] = kinds.get(row["kind"], 0) + 1
    print(json.dumps({"written": len(rows), "by_kind": kinds}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
