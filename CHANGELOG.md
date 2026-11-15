# Changelog

All notable changes to IndTrana are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/) while the product is a local synthetic exercise (0.x).

**0.3.0 is the first tagged release.** `package.json` said 0.2.0 from the first commit and no tag was ever created, so
0.2.0 and 0.1.0 below are summaries of earlier work with a period instead of a release date; they have no tag and no link.

The version number lives only in `apps/web/package.json`. The same entries, in plain user wording, are in
`apps/web/lib/release-notes.ts` and shown on the signed-in **What's new** page (`/whats-new`). How to cut a version:
[docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md).

## [Unreleased]

## [0.5.0] - 2026-11-15

Branch `Aegis_IndTrana`. Windows laptop only. Status and evidence: [docs/LOCAL_DEMO_HANDOFF.md](docs/LOCAL_DEMO_HANDOFF.md),
round 29. Not tagged yet.

### Added
- ISRO/NRSC Bhuvan API connector `isro_bhuvan` ([docs/BHUVAN_CONNECTORS.md](docs/BHUVAN_CONNECTORS.md)): one encrypted
  token per portal theme (postal and hospital, village geocoding, village reverse geocoding, LULC statistics, LULC AOI,
  routing, geoid), fixed host `bhuvan-app1.nrsc.gov.in`, per-token save time, 24-hour expiry and "expired, renew" state,
  and a per-token Test (`POST /v1/proactive/bhuvan/tokens/{theme}/test`, platform_admin). Manual paste only: the portal
  sign-in has a CAPTCHA, so no automated renewal is built.
- Display-only live reference routes `GET /v1/reference/bhuvan/{status,place,landuse,route,hospitals,village}`
  (explicit roles, exercise agency, India bounding box, Andhra Pradesh box for hospitals, one-hour in-memory cache,
  fixed failure codes, nothing written to PostgreSQL) and the "Bhuvan reference (live)" panel on the incident page.
- `DataOrigin` kit badge (Live · source with as-of time, Synthetic, Public reference) and legend; Synthetic badges on the
  incident registry, incident header and Command Center selected case.

### Changed
- Connector secret maps accept up to 8 keys in the web proxy (Bhuvan has 7 tokens); `connector_secrets.updated_at` is
  now read for connectors with day-long tokens.

## [0.4.0] - 2026-11-15

Branch `Aegis_IndTrana`. Windows laptop only; nothing here was run on Linux or macOS. Status and evidence:
[docs/LOCAL_DEMO_HANDOFF.md](docs/LOCAL_DEMO_HANDOFF.md), round 28. Not tagged yet.

### Added
- User management for administrators ([docs/USER_MANAGEMENT.md](docs/USER_MANAGEMENT.md)): an Accounts tab and an
  Activity tab on `/admin/users`. `platform_admin` can list accounts, create one with one role (and a department or
  team when the role needs one), edit name, email, role, department and team, enable, disable (also ends sessions),
  sign a person out everywhere and issue a new temporary password (reset and resend). No delete.
- API module `services/api/app/user_admin.py` (`/v1/user-admin/*`, every route
  `scoped_operator(frozenset({"platform_admin"}))`), provider client `app/user_directory.py` and store
  `app/user_admin_store.py`; web proxy `apps/web/lib/user-admin-proxy.ts` with routes under `app/api/user-admin/`.
- Migration `db/migrations/020_user_admin_audit.sql`: append-only `user_admin_audit` (closed action, outcome and
  changed-field codes; never a password or an email address).
- `scripts/update-local-idp.ps1` step 11: the service client `indtrana-user-admin` (service account only; realm-management
  `view-users`, `query-users`, `manage-users`; default realm roles removed). Its secret goes only to the private
  `user-admin.env`, which `compose.local-idp.yaml` passes to the API as an optional env file.
- Network Identifier Master ([docs/NETWORK_IDENTIFIER_MASTER.md](docs/NETWORK_IDENTIFIER_MASTER.md)) at
  `/admin/networks`: `platform_admin` registry of satellite, mobile, fixed-line, tower and public-reference providers and
  synthetic assets (add, edit, enable, disable, soft delete, restore; version check; append-only audit). API
  `services/api/app/network_registry.py` (`/v1/admin/networks/*`, plus `/v1/network-lanes` for every exercise role:
  names and rehearsal states only), store `app/network_registry_store.py`, fixed link catalogue `app/network_catalogue.py`;
  web proxy `apps/web/lib/network-registry-proxy.ts`. Migration `db/migrations/021_network_registry.sql` (additive,
  idempotent seed of 21 reference entries and 12 synthetic assets). Logo marks for SpaceX, Airtel and Jio bundled offline
  from Simple Icons 15.22.0 (CC0) in `apps/web/lib/network-logos.ts`; others show a kind icon and monogram. The Resilient
  Sensor Link page names its lanes from enabled providers. No provider is called; the CelesTrak reference adapter is a
  documented follow-up, not built.

### Security
- The identity provider stays the account store; IndTrana never stores or verifies a password. Temporary passwords are
  generated server-side, set as temporary (forced change at next sign-in), returned once with `Cache-Control: no-store`
  and never logged, audited or stored. Nothing is emailed; provider SMTP and self-service reset stay off.
- Guards: allowlisted single role, department/team only with their role, strict user names, protected `exercise-*` and
  service accounts, no self-disable/demote/reset/sign-out, last enabled administrator kept, unknown fields and NUL refused,
  fixed error codes only, one advisory-locked transaction per change with the audit row written after the provider call.

### Changed
- Sign-in page: one line on forgotten passwords (ask an administrator). `docs/INSTALL.md`, README and AGENTS.md updated.

### Documentation
- Submission documents in `docs/submission/` rebuilt: an interactive overview page with a 3D layered architecture
  explorer, a 3D storm timeline for the Resilient Sensor Link rehearsal, seven validated Archify diagrams, sortable and
  filterable tables and a Markdown document viewer (works offline); the Word document (now with the ERD, sign-in
  sequence, proposal lifecycle, repository tree and version timeline) with a PDF export; and a Markdown edition with its
  assets. Nothing in the application changed.

## [0.3.0] - 2026-11-14

Branch `Aegis_IndTrana`. Windows laptop only; nothing here was run on Linux or macOS. Status and evidence per round:
[docs/LOCAL_DEMO_HANDOFF.md](docs/LOCAL_DEMO_HANDOFF.md), rounds 22 to 26.

### Added
- Guided tours: a Welcome tour for the shell and one tour per page and tab (`apps/web/lib/tours.ts`), role-filtered, with an engine
  in `apps/web/components/tour/` (spotlight, bottom sheet at phone width, keyboard and screen-reader support, reduced motion).
  Started from the account menu (Tour this page, Restart welcome tour, Tour all my pages, Show tour hints) or the "Take the tour"
  button beside "How this page works". Tour state is flags only in one `localStorage` key, `aegis-tours`
  (`apps/web/lib/tour-storage.ts`). Pages carry `data-tour` hooks; the kit's `Tabs` and `SegmentedControl` take a `tour` prop.
- Version and release notes: `apps/web/lib/version.ts` (reads `apps/web/package.json`), `apps/web/lib/release-notes.ts`, the
  `/whats-new` page (a tab beside Help & Learning), a "New" marker in the account menu until the current version has been
  opened, and the sidebar footer version as a link. This file and [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md).
- `/sensor-link` "Resilient Sensor Link": a browser-only rehearsal of 12 synthetic sensors over an internet lane and a satellite
  lane, five link scenarios, a five-step storm timeline and a "what stays possible" strip. No API call, no transport.
  Patent credit (Indian Patent No. 598835) on the landing page, About and the new page ([docs/PATENT_SENSOR_LINK.md](docs/PATENT_SENSOR_LINK.md)).
- `scripts/migrate-local-idp-address.sh` and the `aegis.sh start` / `doctor` offer for macOS and Linux (same safeguards as the
  Windows script: verified backup, in-place rename, rollback).

### Changed
- Post-event Learning shows its one `role="status"` message as a notice at the top of the action area instead of a line pinned
  to the bottom of the window.
- The configured brand name reaches the global search dialog label and the error page.
- Shell accessible names (open and close navigation, primary navigation, theme toggle, operator sign in) go through `t()`; the
  long account name and user name in the account menu carry a `title` with the full text.
- The version number is no longer hard-coded in the sidebar footer.
- Screenshots and all walkthrough videos re-recorded with the IndTrana name; `docs/media/NARRATION.md` rewritten to match.

### Fixed
- Sign-out returns to the app (client attributes were dropped by the address update; `aegis.ps1`, `aegis.sh` and
  `scripts/update-local-idp.ps1` now read and merge the whole client; PKCE and the sign-out address are restored).
- "Ask grounded guide" did nothing; drill actions gave no message; Learning and Drills showed raw codes; a NUL character in a
  rationale gave a server error; no Retry on the Approvals and Hazard Watch failed states; stale Approve and Reject after a
  conflict; team and department accounts were sent to the wrong page from a refusal; "Close rehearsal task" was enabled while
  blocked; US-order dates on task cards; the Retry button squeezed its message on phones.
- The Live Earth consent text now says that public data goes through the IndTrana server relay.

### Security
- `POST /api/exercise/risk` checks the request origin; platform-wide administration is limited to the exercise agency's
  administrator; API replies carry defensive headers; three public-feed values are escaped; request models reject unknown
  fields, NaN and Infinity, over-long connector keys and NUL characters. Record:
  [docs/SECURITY_TEST_REPORT_2026-11-14.md](docs/SECURITY_TEST_REPORT_2026-11-14.md). Not an independent penetration test.

## [0.2.0] - Summary of earlier work (no tagged release), up to 13 November 2026

State of the product up to the rename, as recorded in [docs/LOCAL_DEMO_HANDOFF.md](docs/LOCAL_DEMO_HANDOFF.md) rounds 7 to 21.

### Added
- Product renamed to IndTrana (visible name only; `aegis` technical identifiers kept, see [docs/BRANDING.md](docs/BRANDING.md)).
  Administrator brand settings (name, PNG/JPEG/WebP logo up to 256 KB, restore defaults) with an append-only `brand_audit`.
- Sign-in gate in `apps/web/middleware.ts` and `lib/session-gate.ts`; local identity provider with demo accounts for the six
  roles, including department desks and response teams ([docs/INSTALL.md](docs/INSTALL.md)).
- Team response loop ([docs/RESPONSE_LOOP.md](docs/RESPONSE_LOOP.md)): in-app rehearsal only, no transport.
- Opt-in staff email notices behind `AEGIS_STAFF_EMAIL=1` and the `comms_email` connector, fixed templates only
  ([docs/COMMUNICATION_CHANNELS.md](docs/COMMUNICATION_CHANNELS.md)); communication channels on the Connectors page for credentials only.
- One-step `aegis.cmd` / `aegis.sh` install, start, stop, status and doctor with port fallback ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- Local sign-in provider moved to `indtrana-idp.localhost:8443` with a backed-up, reversible migration
  ([docs/LOCAL_IDP_ADDRESS.md](docs/LOCAL_IDP_ADDRESS.md)); CAP template v3 with `indtrana.*` keys.

### Changed
- Merged menu with tabs, shared UI kit (`components/ui`), per-page instruction block (`lib/page-help.ts`), account menu with
  role and agency, India-centred globe on the landing and sign-in pages.
- Everything sent out names IndTrana: CAP drafts, staff email, download names, outbound User-Agent.

### Security
- Every API data route needs a verified operator, an explicit role list and the exercise-agency check
  (`tests/test_route_auth_inventory.py`); seeded exercise records are served only to their owning agency.

### Fixed
- Earth Watch says when reference map tiles are unavailable.

## [0.1.0] - Summary of earlier work (no tagged release), October 2026

First local synthetic demonstration (repository started 16 October 2026).

### Added
- Next.js / FastAPI / PostgreSQL + PostGIS stack run locally with Docker Compose; incident registry and incident workspace,
  Source Freshness and DataFusion replay, Spatial Correlation Explorer, Synthetic Model Evaluation Lab
  (holdout figures labelled as not real accuracy), unified assessment checklist.
- Proposals with independent maker-checker approval, an approved-only CAP exercise draft and a staged scripted task workflow.
- Product vision, architecture, security and delivery documents under `docs/`.

[0.5.0]: https://github.com/adityapuppala1/AI-Project-AEGIS/releases/tag/v0.5.0
[0.4.0]: https://github.com/adityapuppala1/AI-Project-AEGIS/releases/tag/v0.4.0
[0.3.0]: https://github.com/adityapuppala1/AI-Project-AEGIS/releases/tag/v0.3.0
