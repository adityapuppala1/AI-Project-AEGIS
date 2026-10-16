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
