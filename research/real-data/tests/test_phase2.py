"""Offline tests for the Phase 2 protocol code. Synthetic data only; no real rainfall is read."""
import contextlib
import csv
import io
import hashlib
import json
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import candidates as cand  # noqa: E402
import evaluate as ev  # noqa: E402
import indicators as ind  # noqa: E402


def synthetic_series(seed=7, start="2000-01-01", end="2025-12-31"):
    rng = random.Random(seed)
    return {day: round(rng.expovariate(1 / 6.0), 1) for day in ind.date_range(start, end)}


def synthetic_catalogue(precip, seed=11, per_year=4):
    """Event days are the wettest synthetic days each year; non-events are random dry-ish days."""
    rng, rows = random.Random(seed), []
    for year in range(2000, 2026):
        days = [d for d in precip if d.startswith(str(year)) and d[5:] != "01-01"]
        wet = sorted(days, key=lambda d: (-precip[d], d))[:per_year]
        dry = rng.sample([d for d in days if d not in wet], per_year)
        for day, label in [(d, "event") for d in wet] + [(d, "non_event") for d in dry]:
            rows.append(row(day, label))
    return sorted(rows, key=lambda r: r["date"])


def row(day, label, r1="Reviewer A", r2="Reviewer B", url="https://example.org/evidence", flag="false"):
    return {"date": day, "kind": "synthetic", "grid_mean_precip_mm": "", "max_point_precip_mm": "", "points_reporting": "",
            "rank_by_grid_mean": "", "label": label, "evidence_url": url, "reviewer_1": r1, "reviewer_2": r2,
            "needs_second_person_review": flag}


def write_catalogue(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=cand.FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def quiet_main(args):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return ev.main(args)


def without_disclaimer(text):
    start, end = text.index(ev.DISCLAIMER_START), text.index(ev.DISCLAIMER_END) + len(ev.DISCLAIMER_END)
    return text[:start] + text[end:]


class IndicatorTests(unittest.TestCase):
    def setUp(self):
        days = ind.date_range("2010-01-01", "2010-01-10")
        self.series = {day: float(i + 1) for i, day in enumerate(days)}   # 1, 2, ..., 10

    def test_rolling_windows(self):
        day = "2010-01-08"                                              # value 8
        self.assertEqual(ind.rain_1d(self.series, day), 8.0)
        self.assertEqual(ind.rain_3d(self.series, day), 6.0 + 7.0 + 8.0)
        self.assertEqual(ind.antecedent_7d(self.series, day), sum(range(1, 8)))

    def test_antecedent_excludes_the_evaluated_day(self):
        changed = dict(self.series, **{"2010-01-08": 999.0})
        self.assertEqual(ind.antecedent_7d(changed, "2010-01-08"), ind.antecedent_7d(self.series, "2010-01-08"))
        self.assertNotEqual(ind.rain_3d(changed, "2010-01-08"), ind.rain_3d(self.series, "2010-01-08"))

    def test_missing_days_are_never_interpolated(self):
        gap = dict(self.series)
        del gap["2010-01-05"]
        self.assertIsNone(ind.antecedent_7d(gap, "2010-01-08"))
        self.assertIsNone(ind.rain_3d(gap, "2010-01-06"))
        self.assertIsNone(ind.antecedent_7d(dict(gap, **{"2010-01-05": None}), "2010-01-08"))
        self.assertIsNone(ind.antecedent_7d(self.series, "2010-01-03"))   # window runs before the series
        aligned = ind.align({"p": gap}, "2010-01-04", "2010-01-06")
        self.assertEqual(aligned["p"], [4.0, None, 6.0])

    def test_strict_dates_and_values(self):
        for bad in ("2010-1-5", "2010/01/05", 20100105):
            with self.assertRaises((ValueError, TypeError)):
                ind.clean_series({bad: 1.0})
        with self.assertRaises(ValueError):
            ind.clean_series({"2010-01-05": float("nan")})
        with self.assertRaises(ValueError):
            ind.window_total(self.series, "2010-01-05", 0, 1)

    def test_percentile_uses_only_the_supplied_training_sample(self):
        sample = ind.training_sample({"2017-12-30": 1.0, "2017-12-31": 3.0, "2018-01-01": 100.0}, "2017-12-31")
        self.assertEqual(sample, [1.0, 3.0])
        self.assertEqual(ind.percentile_rank(2.0, sample), 0.5)
        self.assertIsNone(ind.percentile_rank(2.0, []))
        self.assertIsNone(ind.percentile_rank(None, sample))

    def test_grid_mean_needs_five_points(self):
        points = [{"2010-01-01": 2.0, "2010-01-02": 1.0}] * 5 + [{"2010-01-01": 8.0, "2010-01-02": None}] * 4
        mean = ind.grid_mean(points)
        self.assertAlmostEqual(mean["2010-01-01"], (5 * 2 + 4 * 8) / 9)
        self.assertEqual(mean["2010-01-02"], 1.0)
        self.assertIsNone(ind.grid_mean(points[:4])["2010-01-01"])


class SplitAndLabelTests(unittest.TestCase):
    def test_split_boundary(self):
        train, test = ev.split([{"date": "2017-12-31", "label": "event"}, {"date": "2018-01-01", "label": "event"}])
        self.assertEqual([r["date"] for r in train], ["2017-12-31"])
        self.assertEqual([r["date"] for r in test], ["2018-01-01"])

    def test_unqualified_rows_are_excluded_and_counted(self):
        rows = [row("2010-06-01", "event"), row("2010-06-02", "unlabelled"), row("2010-06-03", "event", r2=""),
                row("2010-06-04", "event", r2="reviewer a"), row("2010-06-05", "event", url=""),
                row("2010-06-06", "non_event", url="file:///x"), row("1999-12-31", "event"), row("bad", "event"),
                row("2010-06-07", "event"), row("2010-06-07", "non_event"), row("2010-06-08", "non_event", flag="true")]
        kept, excluded, inconsistent = ev.qualify(rows)
        self.assertEqual([r["date"] for r in kept], ["2010-06-01", "2010-06-08"])
        self.assertEqual(excluded, {"unreviewed_or_invalid_label": 1, "missing_reviewer": 1, "same_reviewer": 1,
                                    "missing_evidence": 2, "invalid_or_out_of_range_date": 2, "duplicate_date": 2})
        self.assertEqual(inconsistent, 1)

    def test_generated_candidates_never_qualify(self):
        rows = cand.build_candidates([{"date": f"2010-07-{d:02d}", "mean": float(d), "max": float(d), "n": 9} for d in range(1, 29)],
                                     heavy=5, wet=5, dry=0)
        kept, excluded, _ = ev.qualify(rows)
        self.assertEqual(kept, [])
        self.assertEqual(excluded["unreviewed_or_invalid_label"], len(rows))


class ClopperPearsonTests(unittest.TestCase):
    def test_known_values(self):
        self.assertEqual(ev.clopper_pearson(0, 10)[0], 0.0)
        self.assertAlmostEqual(ev.clopper_pearson(0, 10)[1], 1 - 0.025 ** 0.1, places=5)   # 0.308497
        self.assertAlmostEqual(ev.clopper_pearson(10, 10)[0], 0.025 ** 0.1, places=5)      # 0.691503
        self.assertEqual(ev.clopper_pearson(10, 10)[1], 1.0)
        low, high = ev.clopper_pearson(5, 10)
        self.assertAlmostEqual(low, 0.187086, places=5)
        self.assertAlmostEqual(high, 0.812914, places=5)
        low, high = ev.clopper_pearson(1, 1)
        self.assertAlmostEqual(low, 0.025, places=6)

    def test_edge_cases(self):
        self.assertIsNone(ev.clopper_pearson(0, 0))
        with self.assertRaises(ValueError):
            ev.clopper_pearson(3, 2)
        self.assertEqual(ev.rates({"hits": [], "false_alarms": [], "misses": [], "correct_negatives": []})["pod"]["value"], None)


class FreezeAndEvaluateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.precip = synthetic_series()
        self.rows = synthetic_catalogue(self.precip)
        self.protocol = self.dir / "PHASE2_PROTOCOL.md"
        self.protocol.write_text(ev.PROTOCOL_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        self.catalogue, self.series = self.dir / "catalogue.csv", self.dir / "series.json"
        write_catalogue(self.catalogue, self.rows)
        self.series.write_text(json.dumps({"precipitation_mm": self.precip}), encoding="utf-8")
        self.frozen = self.dir / "frozen.json"
        self.assertEqual(quiet_main(["freeze", "--catalogue", str(self.catalogue), "--series", str(self.series),
                                  "--out", str(self.frozen), "--protocol", str(self.protocol)]), 0)

    def tearDown(self):
        self.tmp.cleanup()

    def evaluate(self, out="out", amendment=None):
        args = ["evaluate", "--catalogue", str(self.catalogue), "--series", str(self.series), "--frozen", str(self.frozen),
                "--out-dir", str(self.dir / out), "--protocol", str(self.protocol)]
        return quiet_main(args + (["--amendment", amendment] if amendment else []))

    def test_thresholds_come_from_the_fixed_grid_and_baseline_is_fixed(self):
        frozen = json.loads(self.frozen.read_text())
        self.assertEqual(frozen["baseline"]["threshold"], 64.5)
        self.assertIn(frozen["thresholds"]["rain_1d"], ev.GRIDS["rain_1d"])
        self.assertIsNone(frozen["thresholds"]["discharge_pct"])           # no discharge supplied
        self.assertEqual(frozen["protocol_sha256"], ev.protocol_sha256(self.protocol.read_text()))

    def test_leakage_test_period_and_future_values_never_change_thresholds(self):
        protocol = self.protocol.read_text()
        before = ev.freeze(self.rows, self.precip, None, protocol)
        rng = random.Random(3)
        noisy = {d: (v if d <= ev.TRAIN_END else rng.uniform(0, 500)) for d, v in self.precip.items()}
        flipped = [dict(r, label="non_event" if r["label"] == "event" else "event") if r["date"] >= ev.TEST_START else r
                   for r in self.rows]
        flipped += [row("2019-08-01", "event"), row("2024-09-09", "event")]
        discharge = {d: (1.0 if d <= ev.TRAIN_END else 900.0) for d in self.precip}
        after = ev.freeze(flipped, noisy, None, protocol)
        self.assertEqual(before["thresholds"], after["thresholds"])
        self.assertEqual(before["frozen_sha256"], after["frozen_sha256"])
        with_q = ev.freeze(self.rows, self.precip, discharge, protocol)
        with_q_future = ev.freeze(self.rows, self.precip, {d: (v if d <= ev.TRAIN_END else 0.0) for d, v in discharge.items()}, protocol)
        self.assertEqual(with_q["thresholds"], with_q_future["thresholds"])

    def test_tie_break_prefers_higher_threshold(self):
        train = [{"date": "2001-01-01", "label": "event", "rain_1d": 100.0},
                 {"date": "2001-01-02", "label": "non_event", "rain_1d": 1.0}]
        self.assertEqual(ev.select_threshold(train, "rain_1d"), 100.0)     # 5..100 all give CSI 1
        self.assertIsNone(ev.select_threshold(train[1:], "rain_1d"))

    def test_test_period_is_evaluated_once(self):
        self.assertEqual(self.evaluate(), 0)
        self.assertEqual(self.evaluate(), 2)
        self.assertEqual(self.evaluate(amendment="2026-12-01 re-run after reviewer correction"), 0)
        log = json.loads((self.dir / "out" / "evaluation_log.json").read_text())
        self.assertEqual([run["run_number"] for run in log["runs"]], [1, 2])
        self.assertIsNotNone(log["runs"][1]["amendment"])

    def test_tampered_frozen_file_is_refused(self):
        frozen = json.loads(self.frozen.read_text())
        frozen["thresholds"]["rain_1d"] = 5.0
        self.frozen.write_text(json.dumps(frozen))
        self.assertEqual(self.evaluate(), 2)

    def test_protocol_hash_mismatch_is_refused_without_amendment(self):
        original = self.protocol.read_text()
        self.protocol.write_text(original.replace("T_base = 64.5 mm", "T_base = 50 mm"))
        self.assertEqual(self.evaluate(), 2)
        self.assertFalse((self.dir / "out" / "report.json").exists())
        self.protocol.write_text(original.replace("T_base = 64.5 mm", "T_base = 50 mm")
                                 + "| 2026-12-01 | changed baseline wording | no |\n")
        self.assertEqual(self.evaluate(), 0)

    def test_freeze_never_overwrites(self):
        self.assertEqual(quiet_main(["freeze", "--catalogue", str(self.catalogue), "--series", str(self.series),
                                  "--out", str(self.frozen), "--protocol", str(self.protocol)]), 2)

    def test_report_contents_and_wording(self):
        self.assertEqual(self.evaluate(), 0)
        report = json.loads((self.dir / "out" / "report.json").read_text())
        text = (self.dir / "out" / "report.md").read_text()
        self.assertEqual(report["status"], "reported")
        self.assertEqual(report["test_events"], 32)
        self.assertEqual(report["lead_time"], "not assessed (daily data)")
        self.assertIn(ev.DISCLOSURE, text)
        self.assertIn(ev.ALLOWED_WORDING, text)
        self.assertIn(ev.DISCLAIMER, text)
        self.assertIn("forecast accuracy", text)
        outside = without_disclaimer(text).lower()
        for word in ("predicts", "forecast accuracy"):
            self.assertNotIn(word, outside)
        baseline = report["rules"][0]
        self.assertEqual(baseline["threshold"], 64.5)
        listed = sum(len(baseline["dates"][k]) for k in ("hits", "false_alarms", "misses", "correct_negatives", "not_computable"))
        self.assertEqual(listed, report["test_events"] + report["test_non_events"])
        for day in baseline["dates"]["misses"]:
            self.assertIn(day, text)

    def test_stop_rule_hides_all_rates(self):
        few = [r for r in self.rows if r["date"] <= ev.TRAIN_END or r["label"] == "non_event"]
        few += [r for r in self.rows if r["date"] >= ev.TEST_START and r["label"] == "event"][:4]
        write_catalogue(self.catalogue, few)
        self.assertEqual(self.evaluate(), 0)
        report = json.loads((self.dir / "out" / "report.json").read_text())
        text = (self.dir / "out" / "report.md").read_text()
        self.assertEqual(report["status"], "insufficient_events")
        self.assertEqual(report["test_events"], 4)
        self.assertIn("no claim of statistical significance", report["significance"])
        for rule in report["rules"]:
            self.assertNotIn("rates", rule)
        for marker in ("POD", "CSI", "95% CI", "false alarm rate"):
            self.assertNotIn(marker, text)

    def test_determinism(self):
        self.assertEqual(self.evaluate("a"), 0)
        self.assertEqual(self.evaluate("b"), 0)
        for name in ("report.json", "report.md"):
            digests = {hashlib.sha256((self.dir / out / name).read_bytes()).hexdigest() for out in ("a", "b")}
            self.assertEqual(len(digests), 1, name)
        again = ev.freeze(self.rows, self.precip, None, self.protocol.read_text())
        self.assertEqual(again["frozen_sha256"], json.loads(self.frozen.read_text())["frozen_sha256"])

    def test_registered_protocol_has_initial_amendment(self):
        text = ev.PROTOCOL_PATH.read_text(encoding="utf-8")
        self.assertIn("| 2026-11-02 | initial registration |", text)
        self.assertEqual(ev.amendment_count(text), 1)
        for phrase in ("2000-01-01 to 2017-12-31", "2018-01-01 to 2025-12-31", "T_base = 64.5 mm", "not assessed"):
            self.assertIn(phrase, text)

    def test_isolated_from_the_application(self):
        for module in (ev, ind):
            source = Path(module.__file__).read_text()
            self.assertNotIn("import app", source)
            self.assertNotIn("urllib.request", source)
            self.assertNotIn("psycopg", source)


if __name__ == "__main__":
    unittest.main()
