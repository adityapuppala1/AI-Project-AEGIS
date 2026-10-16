# AEGIS Product Experience, Discovery and Interaction Roadmap

Updated: 2026-10-16 · For CipherCop 2026 · **Exercise-only**

## Product design objective

Provide a fast, reliable, accessible multi-agency operating console where users
can find incidents and trustworthy evidence without having to memorize menus
or depend on an LLM. Critical information remains readable when live feeds,
maps, motion or external services fail.

The UI has four consistent modes: **Observe → Investigate → Recommend →
Authorize**, followed by **Execute (authorized external workflow only)**.
The current prototype implements only safe exercise workflows; it cannot
execute live public alerts or dispatch.

## Feature and component register

Status legend: DONE = code available on `feat/ux-discovery-data-grid`,
PARTIAL = earlier demo/placeholder, PLANNED = future scope.

| Component / feature | Why it matters | Where/how it is used | Status | Target |
|---|---|---|---|---|
| Responsive AppShell | Orientation and consistent navigation | All pages, side menu and theme | DONE | P0 |
| Universal command palette | Find workflows without menu hunting | Header Ctrl/⌘+K; route links + synthetic incident matches | DONE | P0 |
| Global indexed search | Query authorized cases, SOPs, assets at scale | Search service with scoped facets/ranking | PLANNED | P1 |
| Server-filtered incident table | Reduce browser load, trustworthy pagination | /incidents, exact SQL allowlist + status filter | DONE | P0 |
| Sort/filter/page size controls | Faster incident discovery | Incident Registry, sort headers and 10/25/50 rows | DONE | P0 |
| Search freshness indicators | Prevent stale-data misinterpretation | Incident table, last refreshed / error state | DONE | P0 |
| Incident detail drawer | Deepen investigation without losing context | Registry and map linked selection | PARTIAL | P1 |
| Saved views | Repeatable department-specific workflows | Filter presets by jurisdiction and duty role | PLANNED | P1 |
| Evidence provenance panel | Validate facts before action | Source, observed/ingested timestamps and signatures | PLANNED | P1 |
| Data source catalog | Source quality and health | Admin integrations: permitted feeds, rate/latency | PARTIAL | P1 |
| Role-aware menus | Reduce cognitive load, protect operations | Navigation/hide unauthorized commands, server still enforces | PARTIAL | P1 |
| Approval workbench | Controlled decisions | /approvals, signed OIDC + maker-checker | PARTIAL | P0 |
| Audit timeline | Accountability and forensic review | Incident and proposal detail | PARTIAL | P1 |
| Response playbooks | Repeatable operator workflows | /playbooks; templates, evidence and prerequisites | PARTIAL | P1 |
| Contextual self-help | Fast, independent problem solving | /help searchable curated FAQ and troubleshooting | DONE | P0 |
| AI transparency explanations | Prevent overtrust | /help AI sections, future model cards | PARTIAL | P1 |
| Human-reviewed RAG Copilot | Grounded action suggestions | Evidence/SOP citations with abstention and checker | PLANNED | P2 |
| KPI dashboard | Rapid operational overview | / metrics with source and validity labels | DONE | P0 |
| Time series analytics | Spot changes and uncertainty | Recharts in Command Center | PARTIAL | P1 |
| Spatial exposure layers | Identify impacted facilities | MapLibre overlay and PostGIS spatial joins | PLANNED | P1 |
| Map 2D fallback | Work through WebGL/network failures | Incident registry and lists | DONE | P0 |
| Chart-to-table toggle | Accessible precise data reading | Rainfall and resource trend panels | PLANNED | P1 |
| Advanced filtering | Complex operator drill-down | Source, severity, jurisdiction, time ranges | PLANNED | P1 |
| Column visibility/density | Handle diverse control rooms | Grid preferences per role, compact mode | PLANNED | P2 |
| Live events & acknowledgements | Avoid delayed responses | Authenticated realtime subscription with sequencing | PLANNED | P1 |
| Bulk actions | Speed safe administrative work | Only for bounded reversible ops, explicit confirmation | PLANNED | P2 |
| Notification preferences | Reduce alert fatigue | Severity and jurisdiction-based preferences | PLANNED | P2 |
| Multilingual interface | Support Indian field operations | English/Telugu/Hindi locale dictionaries | PLANNED | P1 |
| Guided onboarding | Teach safe workflows | Role-specific first-run checklist | PLANNED | P1 |
| Design token manager | Consistent visual behavior | Tailwind + CSS variables + theme modes | DONE | P0 |
| Magic UI microinteractions | Polish noncritical UI | Help/onboarding patterns only | PARTIAL | P2 |
| 3D scenario viewer | Terrain/flood visual explanation | Optional GPU-aware mode, 2D fallback | PLANNED | P3 |

## Implemented discovery architecture

**Current browser universal search**
- Routes and help are local curated navigation commands.
- Search term is debounced and forwarded to the read-only, synthetic incident
  search API. Search currently returns at most 8 matching incidents; a separate
  link opens the complete paginated incident registry.
- Keyboard Ctrl/⌘+K, Escape, arrow keys, Enter; focus-restoring modal.
- No protected proposal data, PII or credentials are indexed.
- No search history is stored on the server or in browser storage.

**Current incident table API**
`GET /v1/exercise/incidents/query?search=&status=&sort=&direction=&page=&page_size=`
- Supported sortable fields are server-whitelisted: `created_at`,
  `hazard_type`, `status`; max page size 50, page 1–10000.
- SQL values use bound parameters; user cannot inject sort columns.
- PostgreSQL/PostGIS source returns count and page metadata.
- Trigram index and status/created index added via idempotent migration.
- Frontend uses debounced text input, request cancellation, stale/error state,
  semantic sortable headings and accessible navigation.

**Production scaling upgrade**
- Agency/role scoped queries (ABAC enforced within DB/API, not just browser).
- Full-text/PostgreSQL GIN for documents and incidents, PostGIS for geographic
  scopes; OpenSearch only if measured indexing and search demand justify it.
- Cursor/keyset pagination beyond moderate datasets; no deep-offset queries.
- Materialized counts/facets, query plan review and search limits; never display
  unbounded content client-side. For huge tables, server-driven virtualized rows.
- Distinguish `query result count` from `total indexed records`, and
  disclose source freshness, failed providers and retrieval confidence.
- File/document search must include classification, consent/authority,
  retention and rights controls; scoped vectors only within authorized corpora.

## Interaction states required on every operational screen

Loading · Empty · Filtering · No-match · Partial-service outage · Stale ·
Offline/read-only · Permission denied · Human approval required · Success with
audit reference · Recoverable error · Permanent error · Simulation vs Live.

Consequence-bearing buttons must communicate what will happen, which agency
authorizes it, the source evidence, whether the action is reversible and
whether a checker is required.

## AI interfaces and controls

Future AI must visibly separate:
1. Verified observation, as-of time, geolocation and provenance.
2. Model prediction, model/version, confidence/calibration and horizon.
3. Assumptions and uncertainty (including when model should abstain).
4. SOP-backed recommendation with quotations/references.
5. Proposed human decision and audit record.

Use specialized forecasting/CV/spatial models for measurable signals and
LLMs only for evidence-backed explanation and playbooks. Avoid inflated
accuracy claims. Never allow an LLM to invoke live dispatch or warning APIs.

## Motion, design and operational performance

- Light and dark themes, 320 px mobile to command-wall layouts, strong
  contrast and focus rings, accessible legends.
- Magic UI pattern selection documented in `MAGIC_UI_FEASIBILITY.md`.
  Decorative motion only, reduced-motion honored; critical alerts never pulse
  continuously, and approvals must stay visually calm.
- Avoid Three.js/particle effects in the normal Command Center.
- Targets (to measure on real devices): INP <200 ms at p75, CLS <0.1,
  LCP <2.5 s p75 where network permits; dashboard p95 query latency <500ms
  on development seed data, with separately measured production SLOs.
- Prefer lightweight dependencies, code splitting, bounded polling, and
  strict third-party asset privacy policies.

## Sequencing and cost control

- This milestone: self-help, universal keyboard search, DB pagination/sorting,
  index migration, human-centered visual polish and docs.
- Next: incident detail views, source provenance, accessible chart data tables,
  saved views, configurable user preferences, and comprehensive test data.
- Later: role-scoped search, multilingual UI, integrated evidence RAG,
  explainability console, real-time event streams and approved feeds.
- CI is manual/ready-for-review only; run one combined validation milestone,
  not per-commit GitHub Action runs. All code stays in user's sole repo.


## Incident Intelligence milestone — implementation status

The branch `feat/incident-intelligence-workspace` implements:
- A detailed, mobile-responsive incident workspace with live PostGIS **exercise**
  case metadata, map marker, source provenance and synthetic timeline tabs.
- Explicit absence of any validated AI prediction rather than fabricated
  confidence values or made-up response actions.
- Read-only, UUID-validated `/v1/exercise/incidents/{id}` API with bounded
  50-source/100-event records and 404/422 handling.
- Named synthetic source/time records and idempotent migration/seed.
- Safer public exercise query isolation via `is_exercise_fixture` and
  hard-coded demo agency constraints.
- Direct links from command palette, case grid, and Command Center map/feed,
  plus synthetic bookmarkable filter views.

The workspace remains an **exercise-only** UX; future encrypted evidence files,
real agency ABAC, accurate weather sources, trained models, and live multi-agency
coordination are outside this implementation.

See [feature-specific contract](INCIDENT_INTELLIGENCE_WORKSPACE.md).


## Source Health & Freshness milestone

A separate Source Observatory is added at `/sources` in the
`feat/source-health-freshness` branch. It provides:
- per-feed expected observation interval, last observed/ingested timestamps,
  ingestion delay, current age and quality label;
- clear *within demo window, delayed, stale, absent, clock-anomalous* statuses;
- filter/sort/search controls, drill-down trend and equivalent data table;
- accessible degraded-mode messages, last calculation timestamp and manual refresh;
- Command Center source-status summary and global command/help navigation;
- a source trust contract with full documentation and synthetic-only DB scope.

The source data is **synthetic**, not a live connection or an AI prediction.
Status colors are paired with text. Reduced motion is respected.
See [Source Health & Freshness](SOURCE_HEALTH_OBSERVATORY.md).


## DataFusion replay observability milestone

The branch `feat/datafusion-exercise-ingestion` adds `/ingestion`,
a read-only screen for accepted synthetic events and rejected reason codes.
A compact status summary appears on the Command Center, and global search
and Help route users to the new information.

The UI intentionally **does not expose a "Run Replay" network action**.
Replays use a bundled reviewed JSON file via the local Docker API container
CLI, preserving clear boundaries between a visual workflow and untrusted
data ingestion. Quality/freshness indicators never imply a trained flood
prediction or real government source verification.

See [DataFusion Ingestion architecture](DATAFUSION_INGESTION.md).


## Spatial Candidate Explorer — next P1 slice

The synthetic incident details page now includes source proximity and
fictional facility discovery. Operators can select 1, 3, or 5 km radius,
inspect per-source staleness, see bounded candidate distances, and read
verification guidance. No risk chart, artificial impact score or animated
warning suggests that proximity alone demonstrates a hazard.

The query uses PostGIS geography distance in meters; the UI remains
accessible with text explanations and no new heavy mapping/3D libraries.
See [Spatial Correlation Explorer](SPATIAL_CORRELATION_EXPLORER.md).

## Offline Model Lab — synthetic-only interpretation

The `/model-lab` route shows a versioned, actual computed *synthetic*
holdout evaluation with a compact score-bin chart and accessible equivalent
table, confusion matrix, dataset SHA, grouped split explanation and model
limitations. Navigation, Help and Incident Intelligence link to the lab.
Incident-specific screens continue to say no validated forecast is attached.
The dashboard never displays model outputs as calibrated real-world flood
probabilities or automated recommendation authorizations.
