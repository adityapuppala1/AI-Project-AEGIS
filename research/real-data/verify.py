#!/usr/bin/env python3
"""Verify the pilot downloads against the manifest, and optionally re-fetch a sample to prove reproducibility."""
import argparse
import json
import sys
import time

import download_openmeteo as dl
import pilot_config as cfg


def verify_files() -> list[str]:
    """Check every manifest entry (presence, size, checksum, structure) and report unexpected raw files."""
    manifest = dl.load_manifest()
    problems = []
    entries = manifest.get("files", {})
    if not entries:
        problems.append("manifest has no files")
    for key, entry in sorted(entries.items()):
        path = cfg.RAW_DIR / key
        if not path.is_file():
            problems.append(f"{key}: file missing")
            continue
        data = path.read_bytes()
        if len(data) != entry["bytes"]:
            problems.append(f"{key}: size {len(data)} != manifest {entry['bytes']}")
        if dl.sha256(data) != entry["sha256"]:
            problems.append(f"{key}: checksum mismatch")
            continue
        try:
            dl.validate({"variables": entry["variables"]}, data)
        except Exception as error:
            problems.append(f"{key}: invalid content ({error})")
    if cfg.RAW_DIR.is_dir():
        known = set(entries)
        for path in sorted(cfg.RAW_DIR.rglob("*.json")):
            relative = path.relative_to(cfg.RAW_DIR).as_posix()
            if relative not in known:
                problems.append(f"{relative}: raw file not in manifest")
    return problems


def _without_timing(body: bytes):
    """Parsed payload minus the per-request server timing field, which changes on every call."""
    payload = json.loads(body)
    payload.pop("generationtime_ms", None)
    return payload


def refetch_sample(count: int, delay: float, get=dl.http_get, sleep=time.sleep) -> list[str]:
    """Download `count` files again and compare checksums. Differences are reported, never overwritten."""
    manifest = dl.load_manifest()
    mismatches = []
    for key in sorted(manifest.get("files", {}))[:count]:
        entry = manifest["files"][key]
        body = dl.fetch_with_retry(entry["url"], get=get, sleep=sleep)
        if dl.sha256(body) != entry["sha256"]:
            stored = (cfg.RAW_DIR / key).read_bytes()
            if _without_timing(body) == _without_timing(stored):
                continue  # only the per-request generationtime_ms differs; the data is identical
            mismatches.append(f"{key}: re-download differs from the stored checksum (upstream data may have been revised)")
        sleep(delay)
    return mismatches


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refetch", type=int, default=0, help="re-download this many files and compare checksums")
    parser.add_argument("--delay", type=float, default=cfg.DEFAULT_DELAY_SECONDS)
    args = parser.parse_args(argv)
    problems = verify_files()
    print(json.dumps({"files_checked": len(dl.load_manifest().get("files", {})), "problems": problems}, indent=2))
    if args.refetch:
        if args.refetch > 20 or args.delay < 1:
            parser.error("refetch is limited to 20 files and delay must be at least 1 second")
        mismatches = refetch_sample(args.refetch, args.delay)
        print(json.dumps({"refetched": args.refetch, "mismatches": mismatches}, indent=2))
        problems += mismatches
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
