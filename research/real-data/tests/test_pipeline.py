"""Offline tests for the Phase 1 pilot toolchain. No network access is used."""
import json
import re
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import candidates as cand  # noqa: E402
import download_openmeteo as dl  # noqa: E402
import pilot_config as cfg  # noqa: E402
import verify  # noqa: E402

START = date.fromisoformat(cfg.START_DATE)
DAYS = [(START + timedelta(days=i)).isoformat() for i in range(cfg.EXPECTED_DAYS)]


def document(variables, value=1.5, lat=17.4, lon=78.5, days=DAYS):
    return {"latitude": lat, "longitude": lon, "elevation": 540, "daily_units": {name: "mm" for name in variables},
            "daily": {"time": list(days), **{name: [value] * len(days) for name in variables}}}


def encode(doc):
    return json.dumps(doc).encode()


class FakeHttp:
    def __init__(self, responses=None):
        self.calls, self.responses = [], responses or {}

    def __call__(self, url):
        self.calls.append(url)
        response = self.responses.get(url)
        if callable(response):
            return response()
        if response is not None:
            return response
        job = next(job for job in dl.build_jobs() if job["url"] == url)
        return 200, encode(document(job["variables"])), {}


class Sandbox(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = (cfg.RAW_DIR, cfg.MANIFEST_DIR, cfg.CATALOGUE_DIR)
        cfg.RAW_DIR, cfg.MANIFEST_DIR, cfg.CATALOGUE_DIR = root / "raw", root / "manifests", root / "catalogue"
        self.sleeps = []
        self.sleep = self.sleeps.append

    def tearDown(self):
        cfg.RAW_DIR, cfg.MANIFEST_DIR, cfg.CATALOGUE_DIR = self.saved
        self.tmp.cleanup()

    def two_jobs(self):
        return dl.build_jobs()[:1] + dl.build_jobs()[-1:]


class ConfigTests(unittest.TestCase):
    def test_expected_days_matches_the_date_range(self):
        span = (date.fromisoformat(cfg.END_DATE) - START).days + 1
        self.assertEqual(span, cfg.EXPECTED_DAYS)

    def test_points_are_unique_and_inside_hyderabad_region(self):
        points = cfg.RAIN_POINTS + cfg.DISCHARGE_POINTS
        self.assertEqual(len({p["id"] for p in points}), len(points))
        for point in points:
            self.assertTrue(17.0 <= point["lat"] <= 17.7 and 78.2 <= point["lon"] <= 79.0, point)
        self.assertEqual(len(cfg.RAIN_POINTS), 9)

    def test_job_count_stays_far_below_published_limits(self):
        jobs = dl.build_jobs()
        self.assertEqual(len(jobs), 14)
        self.assertTrue(all(job["url"].startswith("https://") for job in jobs))
        self.assertTrue(len(jobs) <= cfg.DEFAULT_MAX_REQUESTS)

    def test_toolchain_is_isolated_from_the_application(self):
        for name in ("pilot_config.py", "download_openmeteo.py", "verify.py", "candidates.py"):
            source = (Path(cfg.ROOT) / name).read_text()
            self.assertIsNone(re.search(r"^\s*(from|import)\s+(app|services|apps)\b", source, re.M), name)
            self.assertNotIn("psycopg", source)
            self.assertNotIn("DATABASE_URL", source)


class HttpTests(Sandbox):
    def test_non_allowlisted_or_insecure_urls_are_refused(self):
        for url in ("https://example.com/x", "http://archive-api.open-meteo.com/v1/archive", "file:///etc/passwd",
                    "https://169.254.169.254/latest", "https://archive-api.open-meteo.com.evil.test/x"):
            with self.assertRaises(ValueError):
                dl.http_get(url)

    def test_rate_limit_is_retried_with_backoff_then_succeeds(self):
        answers = iter([(429, b"", {"Retry-After": "7"}), (200, b"ok", {})])
        body = dl.fetch_with_retry("u", get=lambda _u: next(answers), sleep=self.sleep)
        self.assertEqual(body, b"ok")
        self.assertEqual(self.sleeps, [7])

    def test_client_errors_fail_fast_without_retry(self):
        calls = []
        def get(_u):
            calls.append(1)
            return 400, json.dumps({"reason": "bad latitude"}).encode(), {}
        with self.assertRaisesRegex(RuntimeError, "HTTP 400 bad latitude"):
            dl.fetch_with_retry("u", get=get, sleep=self.sleep)
        self.assertEqual(len(calls), 1)

    def test_server_errors_and_network_failures_give_up_after_three_attempts(self):
        calls = []
        def get(_u):
            calls.append(1)
            return 503, b"", {}
        with self.assertRaisesRegex(RuntimeError, "gave up after 3"):
            dl.fetch_with_retry("u", get=get, sleep=self.sleep)
        self.assertEqual(len(calls), 3)
        def broken(_u):
            raise OSError("offline")
        with self.assertRaisesRegex(RuntimeError, "network error"):
            dl.fetch_with_retry("u", get=broken, sleep=self.sleep)

    def test_oversized_response_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "too large"):
            dl.fetch_with_retry("u", get=lambda _u: (200, b"x" * (cfg.MAX_BYTES + 1), {}), sleep=self.sleep)


class ValidationTests(unittest.TestCase):
    job = {"variables": list(cfg.RAIN_VARIABLES)}

    def test_good_document_is_summarised(self):
        details = dl.validate(self.job, encode(document(self.job["variables"])))
        self.assertEqual(details["rows"], cfg.EXPECTED_DAYS)
        self.assertEqual(details["returned_lat"], 17.4)

    def test_bad_documents_are_rejected(self):
        good = document(self.job["variables"])
        bad = {
            "api error": {"error": True, "reason": "x"},
            "short series": document(self.job["variables"], days=DAYS[:-5]),
            "wrong start": document(self.job["variables"], days=["1999-12-31"] + DAYS[1:]),
            "missing variable": {**good, "daily": {k: v for k, v in good["daily"].items() if k != "rain_sum"}},
            "ragged variable": {**good, "daily": {**good["daily"], "rain_sum": [1.0] * 10}},
            "all null": {**good, "daily": {**good["daily"], **{n: [None] * len(DAYS) for n in self.job["variables"]}}},
            "no daily block": {"latitude": 1},
        }
        for name, doc in bad.items():
            with self.subTest(name), self.assertRaises(ValueError):
                dl.validate(self.job, encode(doc))
        with self.assertRaises(ValueError):
            dl.validate(self.job, b"[]")


class RunTests(Sandbox):
    def test_first_run_fetches_validates_and_records_checksums(self):
        http = FakeHttp()
        summary = dl.run(10, 1, get=http, sleep=self.sleep, jobs=self.two_jobs())
        self.assertEqual((summary["fetched"], summary["cached"], summary["failed"]), (2, 0, []))
        manifest = dl.load_manifest()
        self.assertEqual(len(manifest["files"]), 2)
        for key, entry in manifest["files"].items():
            data = (cfg.RAW_DIR / key).read_bytes()
            self.assertEqual(entry["sha256"], dl.sha256(data))
            self.assertEqual(entry["bytes"], len(data))
            self.assertTrue(entry["retrieved_at"].endswith("+00:00"))
        self.assertIn("Open-Meteo", manifest["attribution"])
        self.assertIn("Not station or gauge observations", manifest["notes"])

    def test_rerun_is_resumable_and_makes_no_requests(self):
        dl.run(10, 1, get=FakeHttp(), sleep=self.sleep, jobs=self.two_jobs())
        http = FakeHttp()
        summary = dl.run(10, 1, get=http, sleep=self.sleep, jobs=self.two_jobs())
        self.assertEqual((summary["fetched"], summary["cached"]), (0, 2))
        self.assertEqual(http.calls, [])

    def test_tampered_file_is_downloaded_again(self):
        dl.run(10, 1, get=FakeHttp(), sleep=self.sleep, jobs=self.two_jobs())
        jobs = self.two_jobs()
        dl.raw_path(jobs[0]).write_bytes(b"tampered")
        http = FakeHttp()
        summary = dl.run(10, 1, get=http, sleep=self.sleep, jobs=jobs)
        self.assertEqual((summary["fetched"], summary["cached"]), (1, 1))
        self.assertEqual(verify.verify_files(), [])

    def test_request_cap_stops_the_run(self):
        http = FakeHttp()
        summary = dl.run(1, 1, get=http, sleep=self.sleep, jobs=self.two_jobs())
        self.assertTrue(summary["stopped_at_cap"])
        self.assertEqual(len(http.calls), 1)

    def test_failed_download_is_reported_and_leaves_no_partial_file(self):
        jobs = self.two_jobs()
        http = FakeHttp({jobs[0]["url"]: (400, b'{"reason":"nope"}', {})})
        summary = dl.run(10, 1, get=http, sleep=self.sleep, jobs=jobs)
        self.assertEqual(len(summary["failed"]), 1)
        self.assertFalse(dl.raw_path(jobs[0]).exists())
        self.assertEqual(summary["fetched"], 1)
        self.assertNotIn(f"{jobs[0]['source']}/{jobs[0]['id']}.json", dl.load_manifest()["files"])

    def test_invalid_content_is_never_saved(self):
        jobs = self.two_jobs()
        bad = encode(document(jobs[0]["variables"], days=DAYS[:100]))
        summary = dl.run(10, 1, get=FakeHttp({jobs[0]["url"]: (200, bad, {})}), sleep=self.sleep, jobs=jobs)
        self.assertEqual(len(summary["failed"]), 1)
        self.assertFalse(dl.raw_path(jobs[0]).exists())


class VerifyTests(Sandbox):
    def prepare(self):
        dl.run(10, 1, get=FakeHttp(), sleep=self.sleep, jobs=self.two_jobs())

    def test_clean_download_verifies(self):
        self.prepare()
        self.assertEqual(verify.verify_files(), [])

    def test_problems_are_detected(self):
        self.prepare()
        jobs = self.two_jobs()
        dl.raw_path(jobs[0]).write_bytes(b"{}")
        dl.raw_path(jobs[1]).unlink()
        (cfg.RAW_DIR / "openmeteo-archive" / "stray.json").write_text("{}")
        problems = " | ".join(verify.verify_files())
        self.assertIn("size", problems)
        self.assertIn("checksum mismatch", problems)
        self.assertIn("file missing", problems)
        self.assertIn("raw file not in manifest", problems)

    def test_empty_manifest_is_a_problem(self):
        self.assertIn("manifest has no files", verify.verify_files())

    def test_refetch_confirms_reproducibility_and_flags_revisions(self):
        self.prepare()
        self.assertEqual(verify.refetch_sample(2, 1, get=FakeHttp(), sleep=self.sleep), [])
        job = self.two_jobs()[0]
        revised = encode(document(job["variables"], value=9.9))
        mismatches = verify.refetch_sample(2, 1, get=FakeHttp({job["url"]: (200, revised, {})}), sleep=self.sleep)
        self.assertEqual(len(mismatches), 1)
        self.assertIn("differs", mismatches[0])


class CandidateTests(Sandbox):
    def rows(self):
        out = []
        for index, day in enumerate(DAYS[:400]):
            out.append({"date": day, "mean": float((index * 37) % 211) / 2, "max": float((index * 37) % 211) / 2 + 3, "n": 9})
        out.append({"date": "2001-01-01x", "mean": 999.0, "max": 999.0, "n": 2})  # too few reporting points
        return out

    def test_candidates_are_deterministic_unlabelled_and_flagged(self):
        first = cand.build_candidates(self.rows())
        second = cand.build_candidates(self.rows())
        self.assertEqual(first, second)
        self.assertTrue(all(row["label"] == "unlabelled" and row["needs_second_person_review"] == "true" for row in first))
        self.assertTrue(all(row["evidence_url"] == "" and row["reviewer_1"] == "" for row in first))

    def test_kinds_ranks_and_exclusions(self):
        rows = cand.build_candidates(self.rows())
        by_kind = {}
        for row in rows:
            by_kind.setdefault(row["kind"], []).append(row)
        self.assertEqual(len(by_kind["heavy_rain_candidate"]), 40)
        self.assertTrue(all(int(r["rank_by_grid_mean"]) <= 40 for r in by_kind["heavy_rain_candidate"]))
        self.assertTrue(all(40 < int(r["rank_by_grid_mean"]) <= 200 for r in by_kind["wet_day_comparison"]))
        self.assertTrue(all(float(r["grid_mean_precip_mm"]) < 1.0 for r in by_kind["dry_day_baseline"]))
        self.assertNotIn("2001-01-01x", {r["date"] for r in rows})
        self.assertEqual([r["date"] for r in rows], sorted(r["date"] for r in rows))

    def test_grid_rows_average_available_points_and_skip_missing(self):
        archive = cfg.RAW_DIR / "openmeteo-archive"
        archive.mkdir(parents=True)
        for index, values in enumerate(([10.0, None], [20.0, 4.0])):
            doc = document(["precipitation_sum"], days=["2020-10-13", "2020-10-14"])
            doc["daily"]["precipitation_sum"] = values
            (archive / f"p{index}.json").write_text(json.dumps(doc))
        rows = cand.grid_rows()
        self.assertEqual(rows[0], {"date": "2020-10-13", "mean": 15.0, "max": 20.0, "n": 2})
        self.assertEqual(rows[1], {"date": "2020-10-14", "mean": 4.0, "max": 4.0, "n": 1})

    def test_csv_has_the_review_columns(self):
        path = Path(self.tmp.name) / "c.csv"
        cand.write_csv(cand.build_candidates(self.rows()), path)
        header = path.read_text().splitlines()[0].split(",")
        self.assertEqual(header, cand.FIELDS)
        self.assertIn("reviewer_2", header)


if __name__ == "__main__":
    unittest.main()
