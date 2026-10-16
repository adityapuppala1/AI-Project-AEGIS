# AEGIS Release Gate 0 — Integration, Migration and Security Verification

**Branch:** `feat/integration-readiness-gates`  
**Scope:** Local Windows 16 GB exercise-stack consolidation, **not production certification**.

## Integration changes

Rather than adding another stand-alone screen, this milestone establishes one
definitive definition of when the *synthetic exercise environment* can be used
for a complete end-to-end demo.

1. `app.doctor` inspects mandatory PostgreSQL tables, migrated columns and
   synthetic fixture counts **without modifying data**. It does not print
   `DATABASE_URL`, credentials or internal network details.
2. `GET /v1/exercise/system/readiness` returns HTTP 200 only if all checks
   pass; missing tables, incomplete migration, missing fixture rows and
   unavailable Postgres return HTTP 503. It is not a real emergency readiness
   or external-provider connectivity endpoint.
3. The authenticated **exercise** maker/checker storage operations now
   additionally require `incidents.is_exercise_fixture IS TRUE`, alongside
   the verified OIDC agency ID. This prevents future non-demo incidents
   within a given agency from leaking into the synthetic approval workflow.
4. `scripts/verify-windows.ps1` runs a **read-only** suite against the
   already-started local web and API, including preflight, all major screens,
   synthetic data boundaries, model disclaimers and blocked live warnings.
5. The expensive Docker integration CI job remains **manual only**
   (`workflow_dispatch` with `run_compose=true`). If explicitly enabled,
   it now checks migrations, fixture readiness, models, incident readiness
   and double replay idempotence on an **ephemeral** CI volume.
6. Lightweight CI continues running only when marking a PR ready for review.
   It never starts Docker containers automatically per commit.

## Ready-for-demo acceptance checklist

| Gate | Read-only validation | Expected |
|---|---|---|
| API | `GET /health` | status ok, mode exercise |
| PostgreSQL migrations | `python -m app.doctor` | status ready / exit code 0 |
| Synthetic incident registry | fixture UUID/agency marker | at least 5 expected incidents |
| DataFusion | registered fixture sources | 4 sources, 24+ readings |
| Incident Intelligence | chronology and evidence | 7+ events, 5+ evidence records |
| Geospatial assets | fictional point registry | 5 named exercise assets |
| Model integrity | `python -m app.model_lab --check` | deterministic committed report matches |
| Human readiness | `GET /v1/exercise/incidents/{id}/readiness` | probability null, approval still required |
| Security | `POST /v1/live/public-warning` | 403 blocked |
| Anonymous approvals | `GET /v1/exercise/proposals` | 401/503, never an unauthenticated list |
| Browser UX | all eight key pages render | HTTP 200; manual mobile/keyboard still required |
| Replay | local CLI run twice (optional) | ledger stable; quarantine stable |

The synthetic fixture counts are **lower bounds**; the DataFusion replay
adds legitimate exercise sample rows without invalidating readiness.

`app.doctor` is a database prerequisite checker, not a source that
guarantees Docker networking, UI accessibility, real operator identities,
scientific model calibration, service reliability or readiness to operate
during any actual emergency.

## Windows runbook (no destructive reset)

From PowerShell in the existing repository directory:

```powershell
cd C:\xampp\htdocs\AI-Project-AEGIS
git fetch origin
git switch feat/integration-readiness-gates
docker compose up --build -d
docker compose ps
docker compose exec -T api python -m app.doctor
powershell -ExecutionPolicy Bypass -File .\scripts\verify-windows.ps1
```

Do **not** run `docker compose down -v`: that destroys local Postgres data.
The checker and script never write to the database or run a replay.
If checks fail, investigate:

```powershell
docker compose logs --tail=120 db migrate seed api web
docker compose config --quiet
```

Only after an operator explicitly wants to exercise the deterministic replay:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\replay-windows.ps1
docker compose exec -T api python -m app.doctor
```

The old fixture may become **stale** with time. Staleness does not by
itself fail structural preflight; the Source Health screen will show it.
A preflight result of `ready` does **not** mean observations are fresh,
physical devices are online or real flooding risk is known.

## PR stack consolidation policy

All numbered PRs depend on earlier feature branches. Do NOT batch merge
these PRs to `main` without sequential review: merging #14 directly
would combine undeclared earlier work; merging child PRs out of order can
make review history and integration diffs misleading.

Recommended gate sequence:
- Confirm one approved, consolidated integration branch after review.
- Run lightweight Python/TypeScript checks and one isolated full-Compose
  smoke when resources allow.
- Test migrations both on a new empty database and a **backed-up** existing
  development volume, preserving all local records.
- Verify linked screens in browser and agency roles with two real, approved
  test identities where provider access is available.
- Perform accessibility/privacy/license and threat-model review.
- Only then request explicit user approval for merge or deployment.

No paid cloud resources, official telemetry ingestion, identity provider,
public warning issuance or responder dispatch is enabled by this gate.


## Release Gate 0.1 — database security constraints

The structural fixture preflight now has a complementary **read-only** security
schema audit: `docker compose exec -T api python -m app.migration_audit`.
It checks PostGIS/pg_trgm extensions, important spatial/history indexes,
the **unique approval per proposal index**, and that the PostgreSQL
**independent checker trigger** is present and enabled. A missing or disabled
guard fails with exit code 1 rather than silently reporting readiness.

The Windows smoke script and optional manually triggered full Docker CI job
invoke this audit without changing data. Unit tests check missing guards,
parameterized SQL catalog queries, and fail-closed results. The regular
API CI remains lightweight and does **not** start Docker automatically.

The audit does **not** replace an authenticated two-operator OIDC workflow,
Postgres integration testing, security review, or evidence of operational
readiness. Do not merge draft PRs until those gates are cleared.


## Approval workbench agency-scoped incident discovery

The browser Approval Workbench must never populate its incident selector
from the public exercise registry after an OIDC login. Its source is now
`GET /api/proposals/incidents`, which uses the short-lived encrypted,
HttpOnly operator session and sends the bearer token **server-side** only
to `GET /v1/exercise/proposals/incidents`. FastAPI verifies the signed
agency ID and appropriate role. Database SQL checks both
`agency_id` and `is_exercise_fixture IS TRUE` with a hard result cap.
A user from another agency receives an empty eligible list rather than
the public demonstration cases.

The workbench also clears the cached selector and proposals after logout,
failed refresh, or an invalidated agency selection. API tests cover
anonymous/role-denied results and agency-bound SQL. This work does not
provision a real IdP or enable real operations. Manual IdP browser E2E
with multiple independently authenticated operators is still required.
