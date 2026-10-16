# AEGIS Windows local development — 16 GB RAM

## Prerequisites
- Windows 10/11 with WSL2 enabled; Docker Desktop using WSL2 backend.
- Git for Windows, PowerShell and optionally VS Code.
- Docker Desktop memory target: approximately 4–6 GB for this lightweight stack; keep other heavy apps closed.
- Host ports 3000 and 8000 available. PostgreSQL uses port 5432 **inside Docker only**; no Windows port 5432 is required.
- This environment is **exercise-only**; never use it for real warnings or emergency dispatch.

## Clone and run
```powershell
git clone https://github.com/adityapuppala1/AI-Project-AEGIS.git
cd AI-Project-AEGIS
git fetch origin
git switch feat/windows-local-dev
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```
Open http://localhost:3000 (command center), http://localhost:3000/admin (admin preview) and http://localhost:8000/docs (API reference).

## Fix for Windows error: `listen tcp4 127.0.0.1:5432: bind ... forbidden by its access permissions`

Older versions of this branch published the database's port 5432 to Windows. That is unnecessary and can conflict with local PostgreSQL, Windows reserved ports, or local security software. The Compose configuration now **removes the host port mapping** without changing the internal database connection.

If you previously attempted to start the stack, update your branch and restart from the repository root:

```powershell
git switch feat/windows-local-dev
git pull --ff-only origin feat/windows-local-dev
docker compose down
docker compose up --build -d
docker compose ps
```

`docker compose down` **does not delete the PostgreSQL volume**. Do **not** add `-v` unless you deliberately want to delete local database data. The first successful database initialization seeds two exercise incidents.

To inspect PostgreSQL without exposing it to Windows:

```powershell
docker compose exec db psql -U aegis -d aegis -c "SELECT count(*) FROM incidents;"
```

If you still see a port error, check whether it mentions **3000 or 8000** instead; those host ports are still required for browser access.

## Common commands
```powershell
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose down
docker compose up --build -d
```
Stop using `powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1`.

## Seed data
On the **first** startup, PostgreSQL runs `db/schema.sql` and `db/seed.sql`. Two synthetic Hyderabad incidents are inserted. The dashboard loads them from the API and PostGIS. To reset the database **and permanently delete local database contents**, run `docker compose down -v` before restarting. Never use that command on valuable data.

## Security and troubleshooting
- Frontend/API ports bind only to 127.0.0.1. PostgreSQL has no published host port; API reaches it at `db:5432` on the internal Docker network.
- Database password defaults to a development-only value. Set `POSTGRES_PASSWORD` in your PowerShell environment before starting if needed; use the same value consistently for the existing volume.
- If Docker cannot start, open Docker Desktop and check WSL2 integration.
- If ports are occupied, stop conflicting local services.
- If the page shows zero incidents, inspect `docker compose logs api db` and confirm seed initialization.
- The initial Docker web image is built for local evaluation, not production.
- Frontend is a responsive schematic command center, not a real GIS map.
- No operational SSO, external agency integration or trained prediction model is configured.

## Development workflow
Commit only to `adityapuppala1/AI-Project-AEGIS`. Use feature branches and PR review; never merge to main without validation. To run backend tests separately: `cd services/api; python -m pip install -r requirements.txt; python -m pytest -q`.

## New command-center UI branch (October 2026)
After checking that your current working tree has no uncommitted changes, use:
```powershell
git fetch origin
git switch feat/command-center-ui-v1
docker compose down
docker compose up --build -d
docker compose ps
```
You can also run `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1`.

Available screens:
- `http://localhost:3000` — Command Center (responsive dark/light theme, MapLibre map, telemetry and incident queue).
- `http://localhost:3000/incidents` — filterable exercise incident registry.
- `http://localhost:3000/playbooks` — illustrative response procedures.
- `http://localhost:3000/admin` — non-persistent policy preview.
- `http://localhost:8000/docs` — FastAPI OpenAPI reference.

**Existing database volumes:** The `seed` service runs an idempotent `db/seed.sql` script after PostgreSQL becomes healthy. This adds any missing synthetic incidents without erasing existing data. Do **not** run `docker compose down -v` to upgrade. Map tiles are requested from the public OpenStreetMap tile server and require an internet connection. Do not use this external tile service for confidential operational data.

Troubleshooting:
```powershell
docker compose logs --tail=80 db seed api web
docker compose exec db psql -U aegis -d aegis -c "SELECT count(*) FROM incidents;"
```
The frontend uses the API through internal Next.js route handlers; browser requests to `/api/incidents` and `/api/telemetry` should return exercise JSON when the backend is healthy.

**Resource note:** The Next.js production build can require more temporary RAM than its runtime container. On a 16 GB laptop, keep Docker Desktop's WSL2 memory allocation around 4–6 GB or higher if builds fail, and close memory-intensive applications.
