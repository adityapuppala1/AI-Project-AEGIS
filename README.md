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
