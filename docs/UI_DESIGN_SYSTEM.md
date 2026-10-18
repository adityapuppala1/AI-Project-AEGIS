# AEGIS UI/UX system — Operations Graphite

## Purpose

AEGIS is a high-stakes, exercise-only public-safety decision-support prototype. The interface prioritizes legibility, evidence provenance, uncertainty and explicit human control. Visual depth helps operators scan the workspace; it must never imply that synthetic data is live or that a proposed response has been executed.

## Implemented foundation

- **Stack:** Next.js 15.5, React 19, Tailwind CSS 4.3, CSS custom-property tokens, Lucide icons, Recharts and MapLibre GL.
- **Theme:** system-adaptive light/dark through `next-themes`, with a manual header toggle. Both themes use the same semantic tokens.
- **Typography:** local system fonts (Inter when installed, then Segoe UI and Arial); the application makes no external font request.
- **Responsive behavior:** a compact mobile header, two-column mobile metric grids, wider four-column grids, a horizontally scrollable guided-stage selector and deliberately contained table overflow.
- **Accessibility:** semantic landmarks, labeled controls, visible keyboard focus, text plus color for status, chart/table equivalents, reduced-motion handling and a usable incident list when the map is unavailable.
- **Information integrity:** every observation, model measure, task and acknowledgement is identified as synthetic or scripted. Transport errors and stale timestamps remain visible.

## Operations Graphite visual language

The product uses cool neutral surfaces rather than a generic neon dashboard. Graphite framing gives dense operational data a stable hierarchy; electric blue identifies interaction and cyan identifies system signals.

| Semantic role | Light | Dark | Use |
|---|---:|---:|---|
| Canvas | `#f4f7fb` | `#060914` | Page background and restrained 32 px grid |
| Surface | `#ffffff` | `#0d1220` | Panels and navigation rail |
| Elevated | `#edf2f8` | `#131a2b` | Inputs and nested data regions |
| Stroke | `#d8e0ec` | `#242d42` | Separation without heavy shadows |
| Ink | `#172033` | `#f3f7fc` | Primary text |
| Muted | `#5e6c82` | `#93a4bd` | Secondary text |
| Action | `#1452da` | `#5b8cff` | Focus, links and primary action |
| Signal | `#0899b0` | `#2dd4bf` | System activity and data accents |

Amber, rose, emerald and violet are reserved for named states and always have a readable label. Panels use compact radii, fine borders and restrained shadows. A three-pixel blue-to-cyan rail gives major workspaces depth without continuous animation. Decorative motion is limited to noncritical help surfaces and stops when `prefers-reduced-motion` is enabled.

## Information architecture

The persistent rail groups routes by operator intent. Incident detail routes retain the Incident Registry parent selection.

| Group | Route | Operator purpose |
|---|---|---|
| Overview | `/` | Command Center status, queue, map and next actions |
| Overview | `/demo` | Guided end-to-end synthetic exercise |
| Observe | `/incidents` | Search, filter and open synthetic cases |
| Observe | `/incidents/{id}` | Evidence, chronology, assessment and spatial candidates |
| Observe | `/sources` | Source freshness and missing/stale context |
| Observe | `/ingestion` | Accepted, duplicate and quarantined replay events |
| Observe | `/model-lab` | Reproducible synthetic model evaluation and limits |
| Coordinate | `/approvals` | Identity-gated maker/checker decision workspace |
| Coordinate | `/department-tasks` | Proposal-linked scripted desk work |
| Coordinate | `/agency-sync` | Seeded fictional task and acknowledgement examples |
| Govern | `/audit` | Bounded public audit export and checksum |
| Govern | `/playbooks` | Illustrative response preparation steps |
| Govern | `/help` | Searchable guidance, shortcuts and AI limitations |
| Govern | `/admin` | Local policy and integration previews |

Global Ctrl/Command+K search covers navigation and public synthetic incidents; it does not index private agency data. The Command Center action deck routes directly to evidence triage, approval review, desk coordination and audit.

## Maps, charts and depth

MapLibre GL renders public OpenStreetMap raster tiles with attribution. This sends requests to a third-party host and is unsuitable for a restricted deployment without an approved internal tile service. When WebGL or tile transport fails, the warning, retry affordance and incident list remain usable.

Recharts visuals have adjacent text or table equivalents. Animation is off for technical charts. Three.js is intentionally absent: the present workflow does not need 3D terrain to make a decision, and decorative GPU load would reduce clarity on the target 16 GB Windows laptop. A future terrain view must be optional, lazy-loaded, backed by an equivalent 2D representation and disabled on low-power devices.

## Interaction rules

- Primary actions describe the next reversible step; destructive or live operations are not exposed.
- Loading, empty, stale, locked and failed states use explanatory text.
- Approval views fail closed without a trusted identity and never invent a local operator.
- Model output is described as a synthetic research measurement, never as real-world forecasting accuracy.
- Proximity is not labeled exposure. Missing evidence stays unknown.
- A captured response draft must pass an independent checker before scripted department work can be prepared.
- Tables retain headers and controlled horizontal overflow at high zoom.
- Minimum interactive height is 40 px; focus uses the action token with a three-pixel offset.

## Acceptance evidence

The local automated browser gate checks desktop and 390 px layouts, keyboard reachability, sampled axe rules, theme contrast, locked identity guidance, transport warnings and the full route set. The latest executed commands and results belong in [the local handoff](LOCAL_DEMO_HANDOFF.md).

Automated checks support but do not replace screen-reader and operator review. Use [the demo rehearsal and acceptance record](DEMO_REHEARSAL.md) for manual evidence. Do not call the interface certified or the full maker/checker journey accepted until those open gates are recorded.

## Deliberate limits

This design is not a certified emergency interface. Authentication provider activation, real telemetry, validated hazard forecasting, operational map-data governance, production monitoring, formal accessibility conformance and agency acceptance remain outside the completed local synthetic demonstration.

Related detail: [UX roadmap](UX_INTERACTION_ROADMAP.md), [Incident Intelligence](INCIDENT_INTELLIGENCE_WORKSPACE.md), and [Magic UI feasibility](MAGIC_UI_FEASIBILITY.md).
