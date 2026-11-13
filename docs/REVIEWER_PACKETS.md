# Reviewer packets (prepared 2026-11-02)

Everything here is prepared for people to act on. None of it has been reviewed, and nothing is marked verified.

## Telugu and Hindi wording
- File: `docs/NATIVE_LANGUAGE_REVIEW.csv` (opens in Excel; UTF-8 with BOM). One row per interface string.
- The reviewer fills `telugu_ok` / `hindi_ok` with y or n, adds a correction where n, then signs with name and date.
- Check first: the safety rows (112 emergency line, "not an IndTrana assessment", quarantine wording). Wrong wording there matters more than style.
- After corrections come back, update `apps/web/lib/translations.ts` and run `node --test scripts/tests/translations.test.cjs`.

## Heavy-rain candidates (hydrology reviewer)
- Files: `research/real-data/catalogue/candidates.csv` (100 rows from Open-Meteo gridded rainfall) and `known_events.csv` (named events from secondary sources).
- Both need two reviewers (`reviewer_1`, `reviewer_2`) before any row is labelled. Rows start `unlabelled`.
- The reviewer should confirm each event against an IMD bulletin or GHMC record, not the encyclopedia source listed.
- Phase 2 evaluation (`PHASE2_PROTOCOL.md`) must not run until labels exist. The test years may be used once.

## Rehearsal and screen-reader
- Use `docs/DEMO_REHEARSAL.md` (fillable record) and `docs/DEMO_RUNBOOK.md`. Run `scripts/verify-demo-ready.ps1` first.
