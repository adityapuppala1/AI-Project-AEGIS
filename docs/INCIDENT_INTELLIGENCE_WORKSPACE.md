# Incident Intelligence Workspace — Design, Schema and Safety Contract

**Version:** v0.1 · **Status:** implemented in `feat/incident-intelligence-workspace` · **Mode:** synthetic exercise only.

## Product goal

An operator can click an incident in the Command Center, global search or
Incident Registry and immediately understand:
- the case's simulated location and state;
- which simulated source records were attached and what quality labels mean;
- observed versus ingested timestamps and ingestion delay;
- what was entered in its historical exercise chronology;
- whether trained AI has supplied a validated prediction (currently **no**);
- which actions are prohibited and where the separate maker-checker exercise is.

Route: `/incidents/{uuid}`. Data comes from the FastAPI read-only endpoint
`GET /v1/exercise/incidents/{uuid}`.

## Data model

`db/migrations/005_incident_intelligence.sql` adds:

| Table/field | Purpose | Security boundary |
|---|---|---|
| `incidents.is_exercise_fixture` | Explicitly identify public fixture records | Default FALSE. Only 5 named fixture UUIDs are flagged TRUE by the seed |
| `exercise_incident_events` | Synthetic chronology | FK to case, constrained event type, immutable-looking read UI (not an audit log) |
| `exercise_incident_evidence` | Simulated source manifest | Source kind and quality enum, observed/ingested timestamps, synthetic-only check |
| `incidents_demo_scope_idx` | Indexed public fixture scope | Agency + is_exercise_fixture |
| Timeline/evidence indexes | Efficient retrieval by incident and time | Bound parameters, per-case limits |

Read-only queries MUST enforce *both* the hard-coded seeded demonstration agency
`11111111-1111-4111-8111-111111111111` and `is_exercise_fixture IS TRUE`.

The pre-existing public exercise registry, command-center list, and search route
are also restricted to these same constraints. Do **not** reuse these routes for
future authenticated real-agency data. Such APIs will need OIDC ABAC, RLS,
purpose-bound access, classification, and field-level auditing.

## API contract

`GET /v1/exercise/incidents/{incident_uuid}`

Returns:
- `incident`: id, hazard_type, status, created_at, lat, lon
- `timeline[]`: event_type, summary, actor_label, occurred_at, recorded_at, synthetic
- `evidence[]`: source_label, source_kind, summary, observed_at,
  ingested_at, ingest_lag_seconds, quality_status, synthetic
- `assessment`: status `not_assessed`, no model version,
  no probability, no prediction horizon, explanatory message
- `source: synthetic_exercise`; `operational_actions_enabled: false`
- `generated_at`: time the server constructed the response

Missing scoped case returns 404; malformed UUID returns 422.
Timeline responses are limited to 100 events, evidence to 50 rows.
These are application limits, **not** production capacity targets.

### Evidence semantics

- `synthetic_curated` means a human-authored fixture for the demo,
  **not** verified field evidence.
- `synthetic_unverified` remains visibly labeled.
- Ingestion delay is `ingested_at - observed_at`, **not** current source freshness.
- The chronology represents a staged training history, **not** a signed chain of
  custody, and is wholly separate from the authenticated proposal audit trail.
- No raw CCTV, face recognition, sensitive personal information, real emergency
  intelligence, or government confidential records are stored in these tables.

## Seed, migration and Windows updates

The idempotent `db/seed_intelligence.sql` contains synthetic events and
source manifests for the five training incidents. On first installation,
Docker's database init executes migrations followed by case seed and intelligence
seed. For an **existing** local Postgres volume, the Compose one-shot `migrate`
service applies migration 005 and the `seed` service adds only missing UUIDs.

Update locally:

```powershell
git fetch origin
git switch feat/incident-intelligence-workspace
docker compose down
docker compose up --build -d
docker compose ps
```

Never use `docker compose down -v` for routine upgrades, as it deletes local data.

Inspect fixtures:

```powershell
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_incident_events;"
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_incident_evidence;"
```

Open:
- `http://localhost:3000/incidents`: paginated incidents with linked names
- `http://localhost:3000/incidents/22222222-2222-4222-8222-222222222222`:
  detailed waterlogging simulation
- `http://localhost:3000`: select an incident on the map/feed and open its
  detailed workspace
- Ctrl/⌘+K: search a synthetic case and navigate directly to its details

## Security and operational readiness

There are NO working operational alert/dispatch actions. The `/approvals`
page requires a verified identity provider, with independent checker
constraints. The incident intelligence workspace is a **public synthetic-only**
demo and must never show private approval audit rows.

## Next implementation targets

1. Authenticated agency-scoped incident-detail endpoints for future nonpublic
   test tenants, separated from the public synthetic fixtures.
2. Evidence upload sandbox with safe file scanning, content hashing, malware
   quarantine, rights classification and time/source authentication.
3. Real GIS exposure analysis using authorized map datasets and uncertainty.
4. Verified provenance connectors and freshness SLAs for permitted IMD/NDMA
   sources, including degraded-mode behavior.
5. Source conflict resolution and dynamic charts, with accessible table views.
6. Explainable validated predictions and SOP-backed RAG, **with citations,
   confidence and explicit abstention**.
7. Paginated timelines and cursor-based storage once actual volume warrants it.

Performance: Prefer explicit indexes, bounded result pages, lightweight
server rendering, minimal motion and no extra 3D dependencies until measured.
