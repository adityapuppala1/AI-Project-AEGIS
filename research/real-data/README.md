# Real historical data — Phase 1 pilot (offline research, not part of the application)

Status: **bounded pilot**, approved under the conditions in
[`docs/REAL_DATA_RESEARCH_PLAN.md`](../../docs/REAL_DATA_RESEARCH_PLAN.md). This folder is separate from
`services/api` and `apps/web`: nothing here is imported by the application, nothing here writes to a database,
and no result here may be shown in the app or described as forecasting accuracy before Phase 2 and an expert review.

Terms of use for every source: [`LICENCES.md`](LICENCES.md). Only Open-Meteo (row 1) is used in this pilot.

## What it does

| Step | Command (run from this folder) | Output |
|---|---|---|
| Tests (offline) | `py -3 -m unittest discover -s tests` | 25 tests, no network |
| Download | `py -3 download_openmeteo.py` | `raw/` (**not committed**) and `manifests/openmeteo.json` (committed) |
| Verify | `py -3 verify.py` | checks sizes, checksums and structure against the manifest |
| Reproducibility | `py -3 verify.py --refetch 3` | re-downloads 3 files and compares checksums |
| Candidate days | `py -3 candidates.py` | `catalogue/candidates.csv` (committed) |

Python 3.10+ and the standard library only; no packages and no credentials are needed.

## Data

- 9 rainfall grid points over Hyderabad (3 x 3, about 11 km spacing) from the Open-Meteo Historical Weather API:
  daily `precipitation_sum`, `rain_sum`, `precipitation_hours`, 2000-01-01 to 2025-12-31 (9,497 days).
- 5 approximate Musi basin points from the Open-Meteo Flood API: daily `river_discharge`, `_mean`, `_max`.
- The API snaps each point to its own model cell and returns the coordinates it used; these are stored in the
  manifest, so duplicate cells are visible.
- **What the data is:** reanalysis-based rainfall and GloFAS model discharge. It is **not** station rainfall and
  **not** gauge data. IMD and India-WRIS data are excluded until written terms exist.

## Rules the code enforces

- Only `archive-api.open-meteo.com` and `flood-api.open-meteo.com`, HTTPS, redirects refused.
- About 15 requests per minute (the published limit is 600), at most 40 requests per run (14 jobs in total),
  retry with backoff on 429 and 5xx, fail fast on other errors. If the API reports it is overloaded, wait and
  re-run: completed files are skipped.
- Every response is validated (date coverage, variables, lengths, not all empty) before it is saved; a failed
  download never leaves a partial file. Files are written atomically and the manifest is updated after each success.
- The manifest records source, URL, parameters, retrieval time, size, SHA-256, returned grid cell, attribution and
  the licence-register reference.
- Raw files are Git-ignored. Under 5 GB by a wide margin (14 files of a few hundred kilobytes).

## Attribution (required wherever results are shown)

"Weather data by Open-Meteo.com" (https://open-meteo.com/), CC BY 4.0, https://open-meteo.com/en/licence.
Changes made: aggregated and resampled by this project. Non-commercial use only.

## The catalogue (human review required)

- `catalogue/known_events.csv`: two historical floods (August 2000, October 2020) taken from **secondary** sources,
  with the source URL. Each needs a primary-source check (IMD or GHMC) and two reviewers.
- `catalogue/candidates.csv` (generated): heavy-rain days (top 40 by grid-mean rainfall), wet comparison days and dry
  baseline days. **Every row is `unlabelled` and `needs_second_person_review`.** Rainfall alone does not say whether a
  day was a flood. Phase 1 exits only when at least 30 event and non-event days have been reviewed by a second person.

## Not done here

No indicators, no model, no accuracy figures: that is Phase 2, with a strict time split fixed before results are
seen, and an expert review before anything is displayed.
