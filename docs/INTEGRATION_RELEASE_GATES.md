# AEGIS Release Gate 0 — Integration, Migration and Security Verification

**Branch:** `feat/integration-readiness-gates`  
**Scope:** Local Windows 16 GB exercise-stack consolidation, **not production certification**.

## Current continuation

The branch and branch-switching examples below describe the original milestone.
For current local work, retain `feat/aegis-local-demo-continuation` and follow
[LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md), which separates current executed
checks from historical evidence. Do not switch back to an older branch to run
this release candidate. Record manual results in the fillable
[demo rehearsal and human acceptance record](DEMO_REHEARSAL.md). The human IdP
and owner acceptance gates remain open.

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
6. CI is label/manual opt-in under [CI Cost Policy](CI_COST_POLICY.md).
   This continuation runs locally only; no labels or Actions are authorized.

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
| Browser UX | key pages and workflows render | Automated desktop/mobile/keyboard and sampled axe checks pass; manual screen-reader/operator acceptance remains |
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

## Release Candidate — original full demo integration

The consolidated branch `feat/ciphercop-integrated-demo-rc` adds:
- additive `009_exercise_agency_sync.sql` and seven fictional tasks/13 events;
- read-only AgencySync board and Audit360 case export with unsigned digest;
- versioned read-only PolicyStudio manifest;
- interactive original-rule synthetic index demo (not trained AI);
- opt-in local-only source freshness rehearsal with deterministic run IDs;
- single guided `/demo` journey connecting the existing modules;
- new negative tests, schema readiness counts and Windows smoke checks.

**These features are not release-tested merely because code is committed.**
Full review must check at least one clean PostGIS volume, one backed-up old
volume, `python -m app.scenario_runner --confirm-synthetic` on a disposable
exercise volume, idempotent rerun, API test suite, production Next build,
keyboard/screen reader, model disclaimers and OIDC refusal behavior.
A provisioned real IdP is required to actually demonstrate independent
operator/checker approval.

See the authoritative
[CipherCop Release Audit](CIPHERCOP_2026_RELEASE_AUDIT.md).


## Current local continuation

[LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md) records actual Linux verification
and remaining Windows/browser/IdP gates. Run `python scripts/verify-local-http.py`
against loopback API/web services for repeatable HTTP smoke and audit checksum
verification. The private `/v1/exercise/proposals/{id}/audit` route requires a
verified signed-agency identity. The existing transition endpoint accepts
`simulate` only for an operator and an independently approved evidence-linked
draft; repeated calls preserve one receipt. This is a scripted local rehearsal,
not department communication or operational task execution.


### Docker and observation-to-case follow-up

Local Linux application images now build and run as a complete Compose stack;
container preflight/security/model and full HTTP smoke passed. Both populated
and isolated fresh full Compose stacks were checked in Linux. Optional
`compose.proxy-ca.yaml` supplies a build-only trusted CA bundle. The local
replay CLI's `--incident-id` option explicitly associates accepted observations
with synthetic case evidence/chronology, preserving quality and timestamps.
Real PostGIS tests prove this evidence appears in the approval snapshot and
that evidence-write failure rolls back ingestion. See the current handoff for
exact evidence; Windows and actual independent human OIDC acceptance remain
separate, uncleared gates.


### Actual Windows laptop verification

On 17 October the registered Adys_ROG laptop was connected and its actual
`C:\xampp\htdocs\AI-Project-AEGIS` checkout inspected. The clean integration
baseline was updated with verified local Git bundles, preserving main and all
existing database volumes. A readable pg_dump backup was saved before upgrade.
Native API tests: 218 passed; a separate laptop PostGIS test database passed all
3 integration tests. Native frontend typecheck/build, complete Compose rebuild
and existing-volume startup, Windows smoke, public audit checksum, and the
case-linked replay script passed. Source freshness rehearsal added only three
fictional rows and history was preserved. Automated Chrome checks found light
contrast defects which were fixed; see the current handoff for final browser
results and exact SHAs. Manual assistive-technology, performance, owner review
and actual independent-human IdP approval gates remain separate.

### Recovery, latency and identity review follow-up

Actual Windows backup restoration into a separate database passed doctor and
schema validation. The bounded read-only local benchmark passed all five p95
targets with no HTTP errors; this does not establish production capacity.
The identity-provider review package passes static contract/syntax checks but
has not been activated, trusted or exercised with two people. Production npm
audit reports zero findings; seven development-toolchain findings remain open,
and the single-stage image still retains build dependencies. These remaining
gates prevent a blanket security/release-complete claim. Current evidence is
in [LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md).

> **Update 2026-11-02.** The web image has since been multi-stage and non-root
> (standalone runner, UID 1000), and the npm audit was later recorded as zero
> including development dependencies (see the handoff). The API image was the
> remaining root image: it now runs as an unprivileged user (UID 10001) and the
> slim base contains no compilers, which was verified inside the running
> container; the P0 smoke, recovery drill and PostGIS integration suite pass on
> it. A true multi-stage API build was judged not worthwhile because there is
> nothing to strip. This does not make the project release-complete.


The audit consistency follow-up (`a613a04`) passed four real PostGIS integration
tests on both Linux and the actual Windows laptop, native Windows API/model/type
checks, API rebuild and HTTP smoke. Actual IdP/two-person acceptance is deferred
by the owner's keep-inactive decision; see current handoff and rehearsal checklist.
