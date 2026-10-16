# Architecture decision record — initial baseline

## Runtime boundaries

- Web console: React/Next.js, TypeScript, accessible UI components, MapLibre GL.
- Operational API: FastAPI, OpenAPI, strict schema validation, role and jurisdiction checks.
- Authoritative datastore: PostgreSQL/PostGIS with transactional incident and approval records.
- Ingestion: adapters with quarantined payload validation, source signatures, timestamps and idempotency keys.
- Events: outbox then stream transport (SQS/Kinesis or Kafka at measured scale).
- Historical/media: private S3 buckets with classification, encryption and lifecycle controls.
- Intelligence: separate forecasting/CV workers, versioned models, feature store and holdout testing.
- Governance: central OIDC/MFA, policy engine, audit journal, mandatory maker-checker for public warnings/dispatch.
- Operations: OpenTelemetry, security alerts, infrastructure as code, backup and restore exercises.

## Important design decisions

1. Modular monolith for initial incident operations; workers scale independently.
2. No model writes directly to operational action endpoints.
3. A policy engine independently validates every state-changing request.
4. Every observation stores both observed_at and ingested_at and is marked stale when applicable.
5. Video analysis is restricted to authorized environmental hazard assessment; do not build mass facial recognition.
6. Recorded replays and simulated feeds remain clearly labeled and isolated from live workflows.

## Hosting roadmap

Local Docker Compose for development; AWS ECS/RDS/S3/KMS/EventBridge/SQS as reference production design. Government hosting, agency authorization and data residency require a separate compliance review.


## DataFusion exercise ingestion v1

A first event-plane slice is now implemented with a bundled synthetic
fixture, Pydantic v1 event validation, agency-scoped registered source lookup,
measurement-unit checks, event UUID / canonical fingerprint idempotency,
local PostgreSQL ledger and metadata-only quarantine. Input processing is
transactional and deterministic; the local replay serializes writers via an
advisory transaction lock.

The capability is **not a production event stream**: no live external
ingest endpoint, Kinesis/Kafka, signed devices or durable broker offsets
are deployed. Delayed and stale timestamps are kept; data age is visible in
Source Health rather than hidden during ingestion. Browser access is
read-only at `/ingestion`. Next P1 design must add approved external source
credentials, full ABAC, transport identity, bounded queues, durable retries,
DLQ retention, source signature validation and incident correlation.
