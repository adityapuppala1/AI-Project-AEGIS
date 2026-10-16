# AEGIS — Adaptive Emergency Geospatial Intelligence System

CipherCop 2026 · AI-powered disaster prediction, preparedness and accountable response.

## Status

**Foundation / exercise-only prototype.** Not an emergency-warning or dispatch system. All hazard scoring is synthetic and unvalidated.

## Run API

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs` for OpenAPI. Run `pytest -q` from `services/api`.

## Documentation

- [Product vision and feature catalog](docs/PRODUCT_VISION.md)
- [Architecture decisions](docs/ARCHITECTURE.md)
- [Security and governance](docs/SECURITY_AND_GOVERNANCE.md)
- [Delivery roadmap](docs/DELIVERY_PLAN.md)

**Repository boundary:** Only use GitHub account `adityapuppala1` and repository `adityapuppala1/AI-Project-AEGIS` for this project. Do not pull or merge from unrelated repositories. Feature branches and reviewed PRs precede changes to main.

## Command Center UI (development branch)
The responsive Next.js/Tailwind Command Center, exercise incident registry, policy preview and playbooks are available on `feat/command-center-ui-v1`. This branch builds on `feat/windows-local-dev`, which builds on `feat/aegis-foundation`; none should be merged without CI and review.

**Windows quick start**
```powershell
git fetch origin
git switch feat/command-center-ui-v1
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

Browse `http://localhost:3000` for the Command Center, `/incidents`, `/playbooks`, `/admin`, and `http://localhost:8000/docs` for the API.

The API reads synthetic incidents from PostgreSQL/PostGIS. An idempotent Compose seed service adds exercise incidents even when an existing database volume is present; no database reset is required. Telemetry is a deterministic **synthetic fixture**. The map uses external OpenStreetMap tiles and requires internet. This is not a real emergency forecasting or dispatch system.

See [UI design system](docs/UI_DESIGN_SYSTEM.md) and [Windows local setup](docs/WINDOWS_LOCAL_SETUP.md).


## Authenticated exercise approvals (development milestone)

The latest branch `feat/oidc-agency-authorization` adds OIDC-verified operator
identities, cryptographically signed agency/role claims and agency-isolated,
transactional maker-checker proposals. Public alerts and real responder dispatch
remain **disabled**.

To inspect this work on Windows without affecting your database:

```powershell
git fetch origin
git switch feat/oidc-agency-authorization
docker compose down
docker compose up --build -d
```

The public exercise dashboard remains at `http://localhost:3000`.
Protected proposal endpoints fail closed with HTTP 503 until a trusted IdP is
configured. No demo logins or hardcoded operator credentials are shipped.
Review [OIDC identity and authorization](docs/OIDC_IDENTITY_AND_AUTHORIZATION.md)
and [workflow security](docs/WORKFLOW_SECURITY.md).

`main` remains untouched; changes are reviewed through stacked draft PRs.

## Browser operator login & exercise approvals

The `feat/browser-oidc-approvals` branch adds an OIDC Authorization Code +
PKCE browser sign-in flow, a short-lived encrypted HttpOnly session, a
server-side authenticated FastAPI proxy, and the `/approvals` workbench.

**No trusted identity provider configured?** The Command Center works as before;
the approval interface explains that verified sign-in is required and does not
create fake operator identities. No public emergency warning or responder
dispatch is available.

See [browser SSO and approval workbench guide](docs/BROWSER_SSO_AND_APPROVAL_WORKBENCH.md).

### Local authorization security checks

After starting the exercise environment, run the **read-only** checks from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\security-smoke-windows.ps1
```

Without a configured IdP, this verifies no implicit operator session,
protected proposals fail closed, and the backend remains in exercise mode.
It does not replace full integration testing with a registered provider.

## UX discovery and data-grid milestone

Branch: `feat/ux-discovery-data-grid` (draft PR stacked on browser-auth work).

Features:
- `/incidents`: server-driven, sortable, filtered, paginated synthetic
  incident registry. Queries are validated, SQL parameters are bound and
  search indexes are applied by Docker's idempotent migrate service.
- **Ctrl/⌘+K**: universal *navigation + synthetic incident* search palette.
  Sensitive operational records are not indexed.
- `/help`: searchable knowledge center with curated answers, warnings and
  transparent AI limitations.
- Restrained, original CSS visual polish inspired by interaction patterns;
  **no Magic UI code copied from another GitHub repository** and no added
  UI animation dependency.

For Windows:
```powershell
git fetch origin
git switch feat/ux-discovery-data-grid
docker compose down
docker compose up --build -d
```

See [Magic UI evaluation](docs/MAGIC_UI_FEASIBILITY.md) and
[UX roadmap](docs/UX_INTERACTION_ROADMAP.md).


## Incident Intelligence Workspace (October milestone)

The `feat/incident-intelligence-workspace` branch adds a case detail screen at
`/incidents/{uuid}` with a synthetic source-provenance manifest, observation
and ingestion timestamps, simulated historical chronology, map context and
transparent absence of a validated AI forecast.

Exercise incidents are explicitly flagged in the database; public exercise
list/search/detail APIs are confined to the named synthetic agency **and**
`is_exercise_fixture=TRUE`. No real incident or restricted approval audit rows
should be exposed by these demonstration routes.

The Incident Registry now supports bookmarkable filter views and links directly
to the detailed workspace. Ctrl/⌘+K incident results and Command Center
selection also link to case details.

Run on Windows:

```powershell
git fetch origin
git switch feat/incident-intelligence-workspace
docker compose down
docker compose up --build -d
```

See [Incident Intelligence contract](docs/INCIDENT_INTELLIGENCE_WORKSPACE.md).


## DataFusion milestone: Source Health & Freshness

The branch `feat/source-health-freshness` introduces a **synthetic-only**
Source Freshness Observatory at `http://localhost:3000/sources`.
The screen separates stale, delayed, missing and clock-anomalous observations,
shows per-source history in an accessible chart/table, and links to the
Command Center, universal search and Help Center.

```powershell
git fetch origin
git switch feat/source-health-freshness
docker compose down
docker compose up --build -d
```

Migration 006 and the source fixtures run idempotently for fresh and existing
PostgreSQL volumes. Do not delete your volume just to update. No physical
devices, official feeds or actual disaster risk model is connected.
See [Source Health & Freshness Architecture](docs/SOURCE_HEALTH_OBSERVATORY.md).


## DataFusion event replay milestone

Branch: `feat/datafusion-exercise-ingestion`. The `/ingestion` screen shows
versioned synthetic event validation, accepted unique IDs and quarantined
metadata. It does **not** accept live data, images, real camera streams or
government connectors. The replay runs only by a local Docker CLI.

```powershell
git fetch origin
git switch feat/datafusion-exercise-ingestion
docker compose down
docker compose up --build -d
powershell -ExecutionPolicy Bypass -File .\scripts\replay-windows.ps1
```

View `http://localhost:3000/ingestion`. First replay of the bundled nine
records should accept three unique events, flag one duplicate and quarantine
five unique invalid/conflicting fingerprints. Subsequent replay does not
add accepted rows or repeat quarantine rows. Do **not** reset Postgres volumes
for this feature. See [DataFusion replay design](docs/DATAFUSION_INGESTION.md).
