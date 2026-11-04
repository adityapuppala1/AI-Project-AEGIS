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

## 3. Cross-cutting work needed before any of A1–A10 ship

- **Agent evaluation harness:** golden cases per agent (expected option, expected abstention),
  run on every change; prompt-injection cases built from public-intake-style text.
- **Run observability:** step graph, per-step latency, budget used, cancellation reason, all
  through the existing audit, not a new store.
- **Kill switch:** one admin toggle that stops all scheduled agents and leaves drafts untouched.
- **Per-agency scoping of proactive runs** (found as a design question in the 4 November security
  review): record the verified operator agency on each run and filter reads/transitions by it,
  unless the owner confirms the shared-desk model.

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
