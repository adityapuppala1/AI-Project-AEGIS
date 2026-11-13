# Earth Watch enhancement plan — IndTrana-inspired capabilities for IndTrana

Status: **plan written on the owner's instruction of 2026-11-02; E0 and E1/E2 started.**
Branch: `feat/aegis-local-demo-continuation`. Time zone: Asia/Kolkata (IST).
Authorized remote and CI rules in `AGENTS.md` are unchanged: no push, merge, CI
trigger or label is authorized by this plan.

## Why

A review of the public IndTrana prototype (`Cyberekta-Security-Solutions/indtrana`,
read-only; no code copied, and the repository has no licence file) showed that it
is visibly strong where IndTrana is thin: real satellite imagery, real public hazard
markers, honest freshness and staleness, citizen-style report intake and a simple
team-availability view. It is weak where IndTrana is strong: persistence, identity,
independent approval, audit, tests and governance.

The goal is **IndTrana governance plus IndTrana-style visibility**. We borrow ideas,
write our own code, and never weaken an IndTrana control.

## Scope baseline (what is already done, what is pending)

Done (see `LOCAL_DEMO_HANDOFF.md`): the full synthetic chain from observation to
audit, department inbox, grounded guide, bounded runs, private CAP drafts,
graphite UI, recovery and latency checks.

Pending and **not changed by this plan**: owner-deferred IdP/MFA two-person
rehearsal, manual screen-reader/operator acceptance, owner release review,
real historical-data research (Phase 0 approval still blank), real forecasting
claims. This plan adds capability; it does not close those gates.

## Capability comparison that drives the plan

| IndTrana idea | IndTrana today | Plan item |
|---|---|---|
| Live USGS earthquakes + NASA EONET events | none (synthetic only) | E1 |
| NASA GIBS satellite imagery with date picker | OSM base map only | E2 |
| Stale-cache semantics, fetch time vs observation time, allowlisted upstreams | source freshness exists for synthetic sources | E1 (reused pattern) |
| "Alive" feel: auto-refresh, freshness pulse | one-minute recompute on Sources page | E3 |
| Context around a case | spatial candidates (synthetic only) | E4 |
| Public report intake (unverified) | none | E5 (gated) |
| Team availability board | department inbox, no capacity view | E6 |
| Downloadable situation brief | private CAP draft, cited review brief | E7 |

## Safety rules for every item

1. **Display-only.** Public data never creates, edits or enriches a case,
   assessment, proposal, evidence row, approval or task. It never enters the
   DataFusion replay tables or the synthetic fixtures.
2. **Default off.** Base Compose does not enable it. An optional override file
   (`compose.public-earth.yaml`) sets `AEGIS_PUBLIC_EARTH_FEEDS=1`, following the
   `compose.local-copilot.yaml` pattern. When disabled the API returns a clear
   `503 disabled` and the page explains how to enable it.
3. **Allowlist only.** The API fetches a fixed set of HTTPS URLs. No user-supplied
   URL, no redirects followed to other hosts, bounded response size and timeout,
   no secrets or cookies sent.
4. **Honest freshness.** Every payload carries fetch time, per-record observation
   time, a `stale` flag, and the upstream's own caveats. Failure never substitutes
   demo data. "No markers" never means "safe".
5. **Never a warning service.** No alert, dispatch, notification or CAP is derived
   from public data. The label "Public reference data — not an IndTrana assessment"
   stays visible.
6. **Labels stay separate.** Synthetic and public records use different colours,
   legend entries and the `source` classification field; the UI refuses payloads
   with an unexpected classification.
7. Existing rules still apply: single-instance runtime lease around custom jobs,
   no volume reset, preserve OIDC and maker-checker, reduced-motion behaviour,
   2D default, HTML incident queue.

## Work packages, effort and calendar

Effort is engineering hours, not elapsed time, and excludes owner/human gates.
Basis: comparable earlier slices (context panel, department inbox, source
comparison) took roughly one to three working days each including laptop
acceptance. Ranges widen for browser-dependent items.

| ID | Package | What ships | Effort | Window |
|---|---|---|---|---|
| E0 | Plan and safety decisions | This document, tracker/handoff/backlog links, `AGENTS.md` rule | 3–4 h | 2 Nov |
| E1 | Earth Watch public feeds | API adapters (USGS, EONET) with allowlist, TTL cache, stale flag; strict BFF route; `/earth-watch` page with map markers, feed status and event list; opt-in Compose override; unit tests | 16–24 h | 2–5 Nov |
| E2 | Satellite imagery layer | GIBS capabilities adapter (layers, availability ranges); imagery source and UTC date control; "coverage may be partial" status; tile-failure fallback to OSM | 8–12 h | 4–7 Nov |
| E3 | Make it alive | Visible-tab auto-refresh, per-feed freshness pulse and countdown, "new since your last look" strip, Command Center public-signal tile; all motion honours reduced-motion | 12–18 h | 9–12 Nov |
| E4 | Case context | "Public signals near this case" panel using great-circle distance, explicit radius, labelled as context not evidence; never stored | 12–16 h | 10–14 Nov |
| E6 | Team availability board | Synthetic department capacity and current assignments from existing department tasks; read-only; no new authority | 16–24 h | 16–20 Nov |
| E7 | Cited situation brief | Text/Markdown download built from the existing cited review brief and approved proposal context; template-based; no model text | 8–12 h | 17–19 Nov |
| E5 | Public intake (gated) | Unverified report form into a **quarantine** table via additive migration; abuse limits, size limits, no PII fields, review queue visible to operators; never auto-linked to cases | 32–48 h | 18–26 Nov, **only after owner and security-review approval** |
| E8 | Hardening and docs | Full native/proxy/PostGIS gates, browser and axe checks, 390/1440 layouts, stale-doc fixes, handoff update, rehearsal script update | 24–36 h | 23–29 Nov |

Totals: **96–142 h without E5; 128–190 h with E5.** At the observed pace this is
about four calendar weeks, ending before the 30 Nov–1 Dec demonstration window.
E5 is the first item to drop if time is short; nothing else depends on it.

## Acceptance for each package

- Server unit tests with mocked upstreams (cache hit, stale on failure, no data
  on cold failure, unknown source blocked, oversized or malformed payload
  rejected, disabled flag).
- Node route tests for strict payload validation and classification checks.
- `npm run typecheck`, `npm run build`, `python -m pytest -q`,
  `python -m app.model_lab --check`.
- Browser check at 390 and 1440 widths, keyboard path, axe sample and a
  failure/retry scenario (upstream offline, tiles blocked).
- Handoff updated with commands, results, branch and SHA only after execution.
  Distinguish Linux/mirror results from the Windows laptop.

## Risks

| Risk | Mitigation |
|---|---|
| Public data mistaken for an IndTrana assessment or warning | Permanent labels, separate legend, display-only rule, no workflow link |
| Upstream outage or rate limits | Server TTL cache, stale labelling, single in-flight fetch per feed, no client-side direct calls |
| SSRF or open proxy | Fixed URL allowlist, no redirects, size/time limits, no user-controlled host |
| Licence or terms change | Attribution shown in UI; re-check USGS, NASA EONET and GIBS terms before any release review |
| Scope creep into real forecasting | Out of scope; real historical research stays under `REAL_DATA_RESEARCH_PLAN.md` |
| Intake abuse (E5) | Quarantine only, strict limits, no PII, rate limit, owner approval first |
| Time | E5 is optional; E3/E4 can shrink to the Command Center tile |

## Decisions recorded

- Earth Watch uses USGS, NASA EONET and NASA GIBS only. IMD, NDMA, CWC and
  other regional sources require formal access and stay in the real-data program.
- Imagery is delayed daily composites, never live video.
- The India view is a bounding box (5–38 N, 65–100 E), not a political boundary.
- No data from this layer is written to PostgreSQL in E1–E4.

## Status log

| Date | Item | State |
|---|---|---|
| 2026-11-02 | E0 plan | done |
| 2026-11-02 | E1 public feeds (USGS, EONET) | implemented; API, Node, typecheck, build and live HTTP/browser checks passed locally (see handoff) |
| 2026-11-02 | E2 imagery layer (GIBS, UTC date, fallback) | implemented; 390 px, Lighthouse accessibility and API-down failure scenario passed; keyboard-only and tile-blocked checks pending |
| 2026-11-02 | E3 "alive" UX | done: auto-refresh, countdown, freshness chips and "new since last refresh" on Earth Watch; Command Center public-signals strip (only when enabled); motion graphics are decorative and motion-safe |
| 2026-11-02 | E4 case context | done: radar and table on the incident page, 100/300/1000 km, never stored, "Not evidence" |
| 2026-11-02 | E6 team availability | done: `/response-teams` from the seeded fictional task table; capacity is a labelled synthetic parameter |
| 2026-11-02 | E7 cited situation brief | done: template-only Markdown download; excludes public data |
| 2026-11-02 | E5 public intake | done and independently security-reviewed (Opus, read-only); medium and low findings fixed the same day; accepted limits and exposure prerequisites in [PUBLIC_INTAKE_SECURITY.md](PUBLIC_INTAKE_SECURITY.md) |
| 2026-11-02 | E8 hardening and docs | done: stale-doc corrections applied; P0 smoke, 21-check browser smoke with axe, theme, offline-map and HTTP gates, new `public-pages.cjs` (axe, keyboard-only, radar dots, reduced motion) and the PostGIS integration suite (20 passed) all passed on the laptop; default-off verified. Linux mirror, manual screen-reader review and the owner gates remain |

### Effort versus estimate

All packages were implemented in one working session. The estimates above (96–142 h, 128–190 h with E5) describe a
human engineer including laptop acceptance and review waits; they were not met by elapsed time and should not be read as
a measurement. Remaining effort before a release review is the unrun checks listed in the handoff plus the owner and
human gates, which this plan does not close.

### What this plan does not change

Owner-deferred IdP/MFA two-person rehearsal, manual screen-reader and operator acceptance, owner release review,
real historical-data research approval, validated forecasting and any network exposure of public intake all remain pending.
