# AEGIS Windows local development — 16 GB RAM

## Prerequisites
- Windows 10/11 with WSL2 enabled; Docker Desktop using WSL2 backend.
- Git for Windows, PowerShell and optionally VS Code.
- Docker Desktop memory target: approximately 4–6 GB for this lightweight stack; keep other heavy apps closed.
- Ports 3000, 8000 and 5432 available.
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
- Database/API/frontend ports bind only to 127.0.0.1.
- Database password defaults to a development-only value. Set `POSTGRES_PASSWORD` in your PowerShell environment before starting if needed; use the same value consistently for the existing volume.
- If Docker cannot start, open Docker Desktop and check WSL2 integration.
- If ports are occupied, stop conflicting local services.
- If the page shows zero incidents, inspect `docker compose logs api db` and confirm seed initialization.
- The initial Docker web image is built for local evaluation, not production.
- Frontend is a responsive schematic command center, not a real GIS map.
- No operational SSO, external agency integration or trained prediction model is configured.

## Development workflow
Commit only to `adityapuppala1/AI-Project-AEGIS`. Use feature branches and PR review; never merge to main without validation. To run backend tests separately: `cd services/api; python -m pip install -r requirements.txt; python -m pytest -q`.
