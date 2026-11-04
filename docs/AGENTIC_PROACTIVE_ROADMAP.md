# Agentic and proactive roadmap — next stage (4 November 2026)

Status: **proposal, not implemented.** Extends `PROACTIVE_MULTI_HAZARD_PLAN.md`, whose P1–P3 and P5
foundations (source adapters, trigger engine, bounded run, CAP exercise export) already exist behind
`compose.proactive.yaml`. Everything below stays local, synthetic-labelled and default-off, and keeps
the rules in `AGENTS.md`: no live warnings, dispatch or external messages; verified OIDC scope;
independent two-person approval; immutable snapshots; audit.

## 1. Autonomy ladder (the boundary for every feature)

| Level | What the system may do | AEGIS |
|---|---|---|
| L0 | Display data | yes (Earth Watch) |
| L1 | Detect and flag (watch items, stale/contradiction flags) | yes |
| L2 | Prepare: gather evidence, simulate, draft, recommend a pre-agreed option | yes (bounded run) |
| L3 | Route: open a draft in a maker's queue on its own, with deadline and reminders | **target of this roadmap** |
| L4 | Act: approve, send, dispatch, notify the public or agencies | **never** |

"More agentic" here means doing more L1–L3 work without being asked. The human decision and the
issuing authority stay the same.

## 2. Proposed additions, in priority order

| # | Feature | Agentic behaviour | Effort |
|---|---|---|---|
| A1 | **Scheduled watch loop** | Evaluate triggers on a fixed cadence (e.g. 30 min) inside the single-instance lease; when a trigger fires, open a watch item and start a bounded run to draft only (L3). Idempotent per trigger version + evidence hash. | 4–5 d |
| A2 | **Evidence-change sentinel** | When new evidence arrives, re-run context revalidation on open proposals and runs; flag "contradicted", "stale" or "strengthened" with citations. Never edits a draft. | 3–4 d |
| A3 | **Impact-based triggers** | Move from hazard thresholds to impact thresholds (IFRC anticipatory-action practice): hazard surface × exposure (hospitals, schools, roads from curated OSM extracts; population grid). Versioned, reviewed config. | 6–8 d |
| A4 | **Additional authoritative feeds** | Google Flood Forecasting API (free, CC BY 4.0, waitlist + key; owner action) and GDACS event feed, both via the existing allowlisted, no-redirect adapter pattern. | 3–4 d each |
| A5 | **Pre-positioning planner** | Given a watch item and team availability, a deterministic optimiser (e.g. OR-Tools) proposes 2–3 pre-positioning options with travel-time evidence. Draft for the maker; no task is created until approval. | 6–8 d |
| A6 | **Read-only operator copilot (tool use)** | Natural-language questions answered only through fixed read-only tools (search incidents, read evidence, compare sources). Cites UUIDs; abstains otherwise. No write tools exist in its registry. | 5–6 d |
| A7 | **Shift-handover brief** | At shift change, generate a cited brief: open watches, pending approvals, overdue synthetic SLA items, evidence changes since the last brief. | 2–3 d |
| A8 | **Post-event learning agent** | After an event window closes, compute hit/miss/false-alarm per trigger and propose a threshold change as a reviewed config diff that needs two-person approval. Never self-applies. | 4–5 d |
| A9 | **Exercise generator and coach** | Build tabletop drills from historical known events (`research/real-data/catalogue`), replay them on a clock, score operator timeliness against the synthetic SLA. Clearly labelled exercise. | 5–6 d |
| A10 | **Multilingual CAP drafts** | Telugu/Hindi CAP `info` blocks from approved templates; native-language reviewer sign-off recorded (`NATIVE_LANGUAGE_REVIEW.csv`). | 3–4 d |

Status 4 November 2026: **A8, A9 and A10 are implemented on `feat/agentic-proactive-l3`, pending runtime,
browser and IdP verification and native-language review** (unit, golden, Node and typecheck gates pass;
migration 016 not applied; opt-in PostGIS test not run). A8: per-rule rehearsal statistics with Wilson
intervals, stats-only threshold diffs, maker-checker approval that never applies, explicit `platform_admin`
apply to a versioned overlay ([POST_EVENT_LEARNING.md](POST_EVENT_LEARNING.md)). A9: drills on a simulated
clock, exercise-only state, synthetic SLA v3 coach report ([EXERCISE_DRILLS.md](EXERCISE_DRILLS.md)). A10:
te-IN/hi-IN CAP info blocks from fixed templates with review status ([CAP_EXERCISE_DRAFTS.md](CAP_EXERCISE_DRAFTS.md)).

Status 4 November 2026: **A1 and A2 are implemented on `feat/agentic-proactive-l3`, pending
runtime verification** on the Windows laptop (unit, golden, Node and typecheck gates pass;
migration 014 not yet applied to the running stack; the opt-in PostGIS test was updated but not
run). A1: in-process scheduler thread, default off (`compose.proactive-scheduler.yaml`,
`start-windows.ps1 -ProactiveScheduler`), per-tick PostgreSQL advisory lock, `dedupe_key` unique
index, kill-switch skip, draft-only runs that stop before `hand_to_human`, tick log and
`GET /v1/proactive/scheduler`. A2: sentinel flags (`strengthened`, `weakened`, `contradicted`,
`stale`) appended with citations after every refresh, never editing drafts. A1 deviates from the
row above in one respect: the loop is serialised by a database advisory lock rather than the
laptop's single-instance lease, because the lease is a host-side PowerShell guard that the API
container cannot hold. See [PROACTIVE_ADMIN_RUNBOOK.md](PROACTIVE_ADMIN_RUNBOOK.md#7-scheduled-watch-loop-a1-autonomy-l3-prepare-and-route-never-act).
A2 covers proactive runs only; re-validating open *proposals* stays with the existing proposal
context revalidation and was not changed.

Status 4 November 2026 (step 3): **A3 and A4 are implemented on `feat/agentic-proactive-l3`,
pending runtime verification and owner keys/terms** (unit, golden, Node and typecheck gates pass;
migration 015 and the synthetic exposure seed not yet applied to the running stack; the opt-in
PostGIS test was extended but not run). A3: `015_exposure.sql` (`exposure_features`, PostGIS
geography index), synthetic Hyderabad seed `db/seed_exposure.sql`, offline importer
`python -m app.exposure_import` for user-supplied OSM GeoJSON (ODbL) and WorldPop XYZ/CSV (CC BY 4.0;
GeoTIFF converted with `gdal_translate` first), deterministic impact rules
`impact_triggers.v2.json` combining hazard state with people exposed / critical facilities / road
segments inside a fixed footprint, cited exposure feature ids in the trigger, run evidence bundle
and Exercise CAP text; scheduler dedupe includes the impact config version. Without exposure data
the v1 hazard state is kept and labelled hazard-only. A4: `gdacs` and `google_flood_forecasting`
connectors (default disabled, fixed hosts, no redirects, JSON only, Google key as a connector
secret sent in a header), thresholds in `feed_triggers.v1.json`. Owner actions: confirm GDACS terms,
obtain the Google waitlist key, choose real exposure extracts, review the synthetic impact
thresholds. See [PROACTIVE_ADMIN_RUNBOOK.md](PROACTIVE_ADMIN_RUNBOOK.md#9-impact-based-triggers-and-the-exposure-layer-a3).

Status 4 November 2026 (step 4): **A7 and A6 are implemented on `feat/agentic-proactive-l3`,
pending runtime verification** (unit, Node and typecheck gates pass; the API container has not been
restarted and `web` has not been rebuilt). A7: `GET /v1/exercise/handover` plus the `/handover` page
([SHIFT_HANDOVER.md](SHIFT_HANDOVER.md)). A6: `POST /v1/copilot/ask` plus the `/copilot` page, with a
fixed read-only tool registry and deterministic intents ([OPERATOR_COPILOT.md](OPERATOR_COPILOT.md)).
Neither adds a migration or a write path.

A5 is **implemented (pending runtime/browser verification)**. It adds an optional, non-submitting run step,
`plan_prepositioning`, between `draft_cap` and `hand_to_human`. The planner is a small deterministic
solver (exact search up to a hard bound, with a greedy fallback; no OR-Tools). It uses the synthetic team
fixture and the cited exposure features. Travel times are estimated and synthetic. The plan is a
recommendation only and creates no task. See [PREPOSITIONING_PLANNER.md](PREPOSITIONING_PLANNER.md).

## 3. Cross-cutting work needed before any of A1–A10 ship

Status 4 November 2026: the harness, kill switch and run agency scope are **implemented on
`feat/agentic-proactive-l3`, pending runtime verification** on the Windows laptop (unit, Node and
typecheck gates pass; migration 013 not yet applied to the running stack; the opt-in PostGIS test
was not run). Run observability is implemented as well (pending runtime/browser verification).

- **Agent evaluation harness:** golden cases per agent (expected option, expected abstention),
  run on every change; prompt-injection cases built from public-intake-style text.
  *Implemented (pending runtime verification):* `services/api/tests/test_proactive_agent_golden.py`
  pins trigger state per fixture threshold, abstention on missing/NaN/unusable values, no
  `recommended` band on stale or missing evidence, a run that always stops at `hand_to_human`, and
  injection text in evidence fields that never changes the chosen option.
- **Run observability:** step graph, per-step latency, budget used, cancellation reason, all
  through the existing audit, not a new store. *Implemented (pending runtime/browser verification):*
  `GET /v1/proactive/runs/{id}/observability` derives events, nodes, budget, cancellation and sentinel
  counts from run state and audit. Scheduler ticks report `duration_ms`. The run panel shows a step graph
  with a table fallback. See [PREPOSITIONING_PLANNER.md](PREPOSITIONING_PLANNER.md#run-observability).
- **Kill switch:** one admin toggle that stops all scheduled agents and leaves drafts untouched.
  *Implemented (pending runtime verification):* `proactive_pause` single-row table plus append-only
  `proactive_pause_audit` (migration 013); `PUT /v1/proactive/pause` is platform_admin only with a
  10–500 character reason; run start, run advance and watch refresh return 409 `proactive_paused`.
  See [PROACTIVE_ADMIN_RUNBOOK.md](PROACTIVE_ADMIN_RUNBOOK.md#5-kill-switch).
- **Per-agency scoping of proactive runs** (found as a design question in the 4 November security
  review): record the verified operator agency on each run and filter reads/transitions by it,
  unless the owner confirms the shared-desk model.
  *Implemented (pending runtime verification):* `proactive_runs.agency_id` (migration 013) is set
  from the verified `aegis_agency_id`; get, list, advance, cancel and CAP download filter by it and
  return 404 across agencies. Legacy NULL rows are invisible to everyone (fail closed).

## 4. Suggested order

1. Cross-cutting items (harness, kill switch, run agency scope).
2. A1 + A2, so the system becomes proactive end-to-end at L3.
3. A3 + A4, so its triggers become more meaningful.
4. A7, A6, A5, then A8–A10.

Roughly 50–60 engineer-days in total, plus reviewer time. No accuracy claim is made without the skill
tables required by the registered protocol.

## 5. Owner decisions

1. Approve the L3 ceiling and the order above.
2. Apply for the Google Flood Forecasting API key; confirm GDACS terms.
3. Choose the exposure datasets and their licences for A3.
4. Shared-desk or per-agency proactive runs.
5. Name reviewers for impact thresholds and native-language CAP text.

## Sources

- Google Flood Forecasting API: https://developers.google.com/flood-forecasting
- GDACS multi-hazard early warning guide: https://www.gdacs.org/documents/2025/GDACS_MHEWS_guide.pdf
- Anticipation Hub, impact-based forecasting: https://www.anticipation-hub.org/learn/emerging-topics/impact-based-forecasting
