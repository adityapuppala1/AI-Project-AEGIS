# Source Health & Freshness Observatory

**Milestone:** AEGIS DataFusion source-quality foundation · 2026-10-16
**Branch:** `feat/source-health-freshness` · **Mode:** Synthetic exercise only

## Operational problem and goal

A prediction based on an observation from ten minutes ago is not equivalent
to a prediction based on one from six hours ago. AEGIS must expose source
provenance, event time, ingestion time, timeliness and evidence quality **before**
any model or human relies on its signals.

This milestone does **not** connect physical devices or government APIs. It
provides a reproducible, timestamp-driven demonstration and a reusable
classification boundary.

## Implemented features

| Feature | Purpose | Where used |
|---|---|---|
| Synthetic source registry | Define expected update interval, data type and unit | PostgreSQL `exercise_data_sources` |
| Historical samples | Preserve immutable-style synthetic observations and arrival times | `exercise_source_samples`, bounded API |
| Freshness classifier | Separate fresh/delayed/stale/absent/clock anomalies | Pure Python `source_health.py` |
| Feed observatory | Dashboard of source statuses and filters | `/sources` |
| Per-source trends | Read-only historical chart and accessible data table | Source detail pane |
| Command Center summary | Surface data freshness risks without implying real alerts | `/` |
| Self-help and universal search | Discover how to read freshness status | `/help`, Ctrl+K |
| Idempotent migrations | Upgrade existing local Postgres without deleting volumes | Docker Compose migrate/seed jobs |
| Test coverage | Timeliness boundaries, future clocks, route limits, query isolation | API test suite |

## Strict source classification

Algorithm compares `as_of - observed_at`, NOT `as_of - ingested_at`.
A delayed ingestion cannot make an old reading current.

Given expected interval `T`, warning multiplier `W` and stale multiplier `S`:
- **Within demo window:** observation age at most `T × W`.
- **Delayed:** age above `T × W` and at most `T × S`.
- **Stale:** age above `T × S`.
- **No observations:** source exists but no sample was recorded.
- **Clock anomaly:** future timestamps more than 120 seconds beyond
  reference clock, ingestion predates observation, or missing timezone.

The thresholds are *configurable simulation heuristics*, **not
scientifically calibrated flood prediction thresholds, vendor uptime
measurements or operational SLAs**.

Every response is marked `source = synthetic_exercise`,
`real_connectors_enabled = false`, with an explicit server `as_of`.
Source quality is separately labelled `synthetic_curated` or
`synthetic_unverified`. “Within window” never means “verified accurate.”

## Database and seed contracts

`db/migrations/006_exercise_source_health.sql` adds:
- `exercise_data_sources`: agency UUID, kind, labels, units,
  expected interval, warning/stale multipliers, synthetic-only flag.
- `exercise_source_samples`: source FK, unique sample UUID, observation
  and ingestion timestamps, nonnegative value, quality and synthetic flag.
- Index on source/history timestamps and agency/source name.

`db/seed_sources.sql` adds four deterministic source fixtures:
1. Rain Gauge A1: initially within freshness window;
2. Water Level B2: initially delayed;
3. Field Report C3: initially stale;
4. Drainage D4: intentionally no observations.

Three sources have eight historical samples each; one has zero. Fixtures
are inserted **once** with deterministic IDs. A persisted volume therefore
becomes stale naturally over time. Rebuilding containers does **not**
automatically refresh old observations or fabricate new ones. An operator can
see degradation without a fake live data stream.

The public read-only endpoints query **only** the hard-coded demonstration
agency and `synthetic IS TRUE`. Do not use these endpoints for any real
departmental data or restricted source catalogue.

## API

| Endpoint | Result | Validation |
|---|---|---|
| `GET /v1/exercise/sources` | Status overview and up to 100 demo sources | Hard-coded agency, only synthetic records |
| `GET /v1/exercise/sources/{uuid}/history?limit=24` | Latest read-only sample history | UUID, 1–48 limit, 404 unknown agency source |
| `GET /api/sources` | Next.js API proxy of safe overview | Requires marked exercise data |
| `GET /api/sources/{uuid}/history` | Next.js bounded proxy | Client UUID and limit validation |

This prototype's `/sources` page performs a 60-second refresh while the
browser tab is visible; manual refresh is also available. It does not
subscribe to real devices or data streams.

## Windows 16 GB local instructions

```powershell
cd C:\xampp\htdocs\AI-Project-AEGIS
git fetch origin
git switch feat/source-health-freshness
docker compose down
docker compose up --build -d
docker compose ps
```

Open `http://localhost:3000/sources` and select a source, or use the
Command Center source summary. Inspect the source registry if needed:

```powershell
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_data_sources;"
docker compose exec db psql -U aegis -d aegis -c "SELECT COUNT(*) FROM exercise_source_samples;"
```

Expected initial counts: **four** exercise sources and **24** samples.

Docker's one-shot `migrate` service applies migration 006 even when a
volume already exists, then the one-shot `seed` service inserts missing
fixture IDs. **Do not use `docker compose down -v`** in an attempt to fix
the UI; it permanently deletes the database volume.

## Production architecture work remaining

- Authorized IMD/NDMA and IoT ingestion adapters with explicit usage
  permission, source authentication, payload validation and unit conversion;
- Device identity, signed observations, schema registry and time synchronization;
- Durable event pipeline, idempotent consumers, replay and dead-letter queues;
- Per-source real SLA profiles, scheduling jitter, maintenance windows and
  failover signals without conflating no-data with healthy;
- Cross-source corroboration and confidence weighting trained/evaluated on
  verified historical incidents;
- Secure agency-scoped operations, ABAC, classification, RLS, retention,
  audit evidence and private tile services;
- Meaningful load tests before setting production latency targets;
- Model-ready feature-store snapshots and human-reviewed feedback.
- No model should treat a freshness status as a calibrated disaster
  probability or permit live dispatch/warnings automatically.

## Acceptance checklist

- [x] Backend classifier with deterministic boundaries and security tests authored.
- [x] Synthetic schema/seed and Compose integration committed.
- [x] Typed frontend overview/detail, trends, help, navigation committed.
- [ ] GitHub API/typecheck/build verification.
- [ ] Windows existing-volume migration/seed smoke.
- [ ] Browser/manual accessibility and reduced-motion review.
- [ ] Real IdP, approved sources, and security review before production.
