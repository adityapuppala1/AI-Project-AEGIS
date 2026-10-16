# AEGIS UI/UX system — Command Center v0.2

## Purpose and interaction principles
AEGIS is a high-stakes, exercise-only public safety decision-support prototype. Favor legibility, explicit data provenance, minimal cognitive load and strong operator feedback over decorative complexity.

- **Visual system:** Tailwind CSS 3.4, CSS custom-property tokens, accessible components styled in a shadcn-inspired manner, Lucide icons.
- **Theme:** system-adaptive light/dark via next-themes; manual toggle available in the application header.
- **Responsive:** compact mobile navigation, 2-column tablet metrics, 4-column wide-screen metrics; panels collapse without horizontal scrolling except deliberate tabular data.
- **Accessibility:** semantic landmarks, labeled controls, keyboard focus, status text in addition to color, reduced-motion support, descriptive map fallback.
- **Color:** dark canvas #08101d, dark surface #0f1c2d, teal accent; warning amber and active rose. Light theme uses contrast-aware neutral surfaces.
- **Typography:** system fonts (Inter if locally installed, then Segoe UI/Arial); no external font downloads.
- **Information integrity:** every simulated observation is labeled synthetic; network failure shows a warning and does not imply data is current.

## Application screens
| Route | Function |
|---|---|
| / | Command Center: metrics, live API polling, MapLibre map, searchable queue, synthetic telemetry |
| /incidents | Filterable PostGIS-backed incident registry |
| /playbooks | Clearly labeled illustrative flood-response checklist |
| /admin | Local UI-only preview of policy modes and integration registry |

## Geospatial layer
MapLibre GL renders public OpenStreetMap raster tiles from tile.openstreetmap.org, with attribution. **External network access is required for map tiles**, and the browser sends requests to that third-party host. This public demo configuration is not appropriate for restricted operational deployments; use an approved internal tile server in production. Incident markers use synthetic seed coordinates from PostGIS. When WebGL fails, the incident queue remains usable.

## 3D policy
Do not introduce Three.js into primary operations screens unless a tested task (e.g., terrain-aware inundation visualization) benefits. If introduced later, make it optional, lazy-loaded, GPU-aware, accessible via 2D fallback and disabled by default on low-power devices.

## Components and engineering conventions
- Reusable AppShell and StatusBadge; central CSS theme tokens.
- Fixed server-side API proxy routes; no browser access to private Docker network names.
- 30-second data refresh with explicit last-sync timestamp and stale/error states.
- Avoid fake controls or operationally misleading action buttons.
- Mobile keyboard and screen-reader support remain release acceptance criteria.
- Target 16 GB Windows laptop; Docker Compose includes separate memory limits.

## Production gaps
The UI is not yet a certified emergency interface. Authentication, authorization, actual CAP integration, live hazard forecasting, map data governance, production monitoring, user acceptance tests and formal agency review remain future work.

## Discovery and self-help milestone (October 2026)

Current branch: `feat/ux-discovery-data-grid`.

- **Incident Registry:** read-only backend-driven search, status filter, sortable
  columns, page controls and 10/25/50 rows per page. Stale-data warnings and
  accessible text summaries complement the table.
- **Global search:** Ctrl/⌘+K opens keyboard-accessible navigation and
  synthetic incident discovery; typed search is throttled and backend-sourced.
  The palette is not a full government-wide indexed search system yet.
- **Help Center:** `/help` features curated searchable FAQs, categories and
  clear explanations of the prototype's AI and data limitations.
- **Magic UI feasibility:** decorative components are optional. Original
  `signal-surface` styling is used for the Help header and respects
  reduced motion; no external Magic UI registry code has been installed.
- **Scale:** query pagination uses validated sort allowlists and an idempotent
  trigram index migration. Production full-text/faceted search, keyset
  pagination and multi-tenant ABAC remain follow-up milestones.

See [Magic UI review](MAGIC_UI_FEASIBILITY.md) and
[full UX interaction roadmap](UX_INTERACTION_ROADMAP.md).


## Detailed Incident Experience

The Incident Intelligence workspace follows the same tokens and responsive
layout, with clear simulated-data banners and tab-like category buttons for
source manifests, historical event chronology, and AI transparency. The
interface exposes observed/ingested times, ingestion delay, fixture provenance,
and explicit model-absence and action-disablement states. Critical text does
not depend on color or motion. Real evidentiary-chain and encrypted-media
workflows remain separate milestones. See
[Incident Intelligence Workspace](INCIDENT_INTELLIGENCE_WORKSPACE.md).
