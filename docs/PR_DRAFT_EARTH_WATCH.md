# DRAFT pull request — NOT SUBMITTED

Status: prepared locally on 2026-11-02. **Do not push this branch or open a PR without the owner's explicit
authorization** (`AGENTS.md`). Opening a PR may trigger automation; state in the authorization whether CI is
permitted (the CI cost policy is label- or dispatch-only). Base per `AGENTS.md`: `feat/ciphercop-integrated-demo-rc`;
never `main`.

Branch: `feat/aegis-local-demo-continuation`. Commits: `9d514c9`, `3063ab6`, `9f176ae`, `0ec123c` on base `00e7220`.

---

## Title

Earth Watch: opt-in public reference layer, case context, team board, situation brief, quarantine-only intake

## Summary

Adds IndTrana-style visibility to IndTrana without weakening its governance. Everything public is display-only,
opt-in and off in base Compose.

- **Earth Watch** (`/earth-watch`, Command Center strip): USGS earthquakes, NASA EONET events, NASA GIBS imagery
  through fixed-allowlist adapters with TTL cache and honest stale labels. Never stored; never feeds cases,
  approvals, tasks, warnings or CAP.
- **Case context radar** on the incident page: public reports near a case, labelled "Not evidence", never stored.
- **Team availability board** (`/response-teams`) from the seeded fictional task table.
- **Situation brief** download: template-only Markdown from the case record and existing cited readiness brief.
- **Public intake** (`/public-intake`): quarantine-only, five fields, no contact details, no UPDATE, never a case.
  Independent security review done; accepted limits documented. Loopback only.
- Docs: plan, decision log, security review, stale-doc corrections, acceptance evidence.

## Safety properties (each has a test)

- Base Compose enables neither feature (guard test). Overlays: `compose.public-earth.yaml`, `compose.public-intake.yaml`.
- Live public-warning endpoint remains 403; no dispatch or message path added.
- Intake rows cannot be updated (trigger), hold no identity fields, and touch no case or task table
  (PostGIS integration test).
- Migration `011` is additive and idempotent; applied to the existing volume with no reset.

## Test evidence (Windows laptop, shared operation lease)

- `pytest` 425 passed, 15 skipped; `python -m app.model_lab --check` PASS.
- Web Node tests 95 passed; `npm run typecheck` and `npm run build` PASS.
- PostGIS integration suite 20 passed (separate verification database).
- `verify-windows.ps1` P0 smoke PASSED; browser smoke with axe 21 checks, zero violations; theme, offline-map and
  HTTP gates PASS; `scripts/browser/public-pages.cjs` 7 checks PASS (axe, keyboard-only intake, radar, reduced motion).
- Default profile restart: both features `enabled:false`, all public endpoints 503, live warning 403.

## Not covered / reviewer attention

- Linux mirror has not run these commits.
- Manual screen-reader review, two-person identity rehearsal and owner release review are pending.
- Intake accepted limits (shared rate limiter, unauthenticated queue read, DELETE not blocked, best-effort filters)
  in `docs/PUBLIC_INTAKE_SECURITY.md`; it is not approved for network exposure.
- Upstream terms (USGS, NASA, OSM tiles) are tracked in the licence register under `research/real-data/` and must be
  re-checked before release.

## Checklist for whoever authorizes the push

- [ ] Owner authorizes push to `adityapuppala1/AI-Project-AEGIS` only
- [ ] Owner states whether CI may run
- [ ] PR targets the integration baseline, not `main`
- [ ] Draft PR; no automatic reviews enabled
