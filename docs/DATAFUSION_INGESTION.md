# AEGIS DataFusion — strict synthetic ingestion and reproducible replay

**Status:** feature branch `feat/datafusion-exercise-ingestion`
**Purpose:** provide the first measurable, safe event-processing vertical slice
without connecting public-safety authorities or live sensors.

## Architectural decision

Initial ingestion uses a bounded, bundled JSON fixture processed through a
**local Docker container CLI**. It does NOT expose an HTTP POST ingestion
endpoint, accept arbitrary third-party URLs, ingest private camera footage,
or connect weather/government APIs. This explicitly avoids unverified source
injections and unauthorized external actions.

```text
Code-reviewed synthetic JSON fixture
  → strict Pydantic v1 event-contract validation
  → bounded payload + timezone + nonfuture timestamp checks
  → source registration and unit validation (PostgreSQL)
  → idempotent event ledger (UUID + canonical payload fingerprint)
  → accepted synthetic sample history
  ↘ invalid/conflicting record → metadata-only quarantine
  → read-only API status → browser DataFusion Observatory
```

## Features, why, where and safeguards

| Feature | Why needed | Where | Behavior |
|---|---|---|---|
| Versioned event contract | Prevent silent shape/semantics changes | `app/ingestion_contract.py` | `aegis.exercise.observation.v1`; rejects extra or missing attributes |
| Synthetic-only gate | Prevent accidental operational processing | Contract + DB | Signed-off fixture requires `synthetic: true`; CLI only |
| Source registry check | Stop fabricated/unregistered feed IDs | `app/ingestion_store.py` | Source UUID must exist in the fixed synthetic demo agency |
| Unit matching | Avoid mixing mm/cm/reports | Ingestion DB lookup | Metric unit must equal registered source unit |
| Time validation | Protect freshness analysis | Contract | Timezone required; future observations rejected |
| Canonical SHA-256 fingerprint | Identify replay duplicates/conflicts | Ledger | Same ID/same hash => duplicate; same ID/different hash => quarantine |
| Transactional delivery | No half-written ledger/history batches | PostgreSQL | Ledger, samples and quarantine in one transaction; advisory lock serializes local replay |
| Metadata-only quarantine | Prevent raw untrusted payload retention | `exercise_ingestion_quarantine` | Fixed reason codes + bounded IDs + digest only |
| Idempotent replay | Demonstrable stable processing | `python -m app.replay` | Reruns don't duplicate samples or quarantines |
| Read-only status API | Show outcomes without granting network write access | `GET /v1/exercise/ingestion/status` | Aggregate counts and quarantine reasons only |
| Operator status screen | Audit processing quality | `/ingestion` | Exercise-only banners and local CLI instructions |
| Automatic schema migration | Update Windows volume safely | Docker Compose `migrate` | Idempotent `007_exercise_ingestion.sql` |

## Contract example

```json
{
  "contract_version": "aegis.exercise.observation.v1",
  "event_id": "d4000000-0000-4000-8000-000000000001",
  "source_id": "c3000000-0000-4000-8000-000000000001",
  "synthetic": true,
  "observed_at": "2026-10-15T09:00:00Z",
  "metric_value": 35.125,
  "metric_unit": "mm",
  "quality_status": "synthetic_curated"
}
```

This is a **fictional** reading, not an IMD report or a verified observation
of an actual Hyderabad hazard. `quality_status` describes demo curation,
not scientific calibration or field verification.

## Current exercise replay

The code-reviewed fixture contains **nine** records:
- 3 valid records;
- 1 duplicate of the first valid record;
- 5 invalid or conflicting records (unit mismatch, unknown source, future
  observation, unexpected attribute, reused event UUID with changed value).

**Expected results on first replay** (fresh database):
`accepted=3, duplicate=1, quarantined=5`.

The same fixture can be replayed multiple times. On subsequent runs:
`accepted=0, duplicate=4, quarantined=5` as *processing outcomes*, while
the persisted accepted ledger stays at 3 and unique quarantine table at 5.
The original 24 source samples plus 3 accepted ingestion samples total 27.
The fixture uses fixed historical timestamps, so even a freshly ingested
replayed record must NOT be interpreted as a current observation.

**The quarantine counts are unique invalid fingerprints, not a complete
attempt counter.** Real audit replay and authentication are future work.

## Windows 16 GB quick start

```powershell
cd C:\xampp\htdocs\AI-Project-AEGIS
git fetch origin
git switch feat/datafusion-exercise-ingestion
docker compose down
docker compose up --build -d
docker compose ps
powershell -ExecutionPolicy Bypass -File .\scripts\replay-windows.ps1
```

View `http://localhost:3000/ingestion` for aggregate statuses; inspect
`http://localhost:3000/sources` for historical samples. The system has
**no browser replay action**; it must be started by a locally authorized
terminal operator.

```powershell
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_ingestion_ledger;"
docker compose exec db psql -U aegis -d aegis -c "SELECT reason_code,COUNT(*) FROM exercise_ingestion_quarantine GROUP BY reason_code ORDER BY reason_code;"
```

The `migrate` job applies the schema to existing volumes and the seed job
prepares the trusted synthetic source registry. Never run
`docker compose down -v` casually: that deletes local database data.

## Constraints and next iteration

The current repository is a **public GitHub project**, so do not commit
source credentials, personal records, real incident photos or authorized
agency incident feeds. Never assume replay is automatically secure for real
operational ingestion.

A production-capable DataFusion system requires:
1. Source onboarding by agency administrators; signed device credentials
   and permissioned government API agreements.
2. mTLS/device keys, rotation, rate limits, tenant isolation, ABAC/RLS and
   replay-prevention windows.
3. Schema registry, normalized units/timezones, PII minimization, DLP and
   input quarantine with appropriate retention controls.
4. Event bus with consumer offsets, durable dead-letter queues and
   per-source backpressure, service-to-service authorization.
5. Immutable append-only custody metadata and forensic log controls.
6. Reconciliation with real source truth, manual verification, quality
   calibration, drift checks and incident replay simulations.
7. Human approval and complete evidence before any consequential
   emergency action; never let an AI model directly dispatch or alert.

Cost guideline: do not deploy AWS/Kinesis/MSK until measured throughput
and authorized data justify cloud cost. This milestone uses local Postgres
only and adds no new runtime Python/npm dependencies.
