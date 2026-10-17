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

## Reproducible synthetic model evaluation

The `app.model_scenarios` fixture generator creates 216 fictional cases
across 24 scenario groups. `app.model_lab` trains an offline logistic
baseline on 18 groups and measures standard diagnostics on 6 disjoint
holdout groups, producing a versioned SHA-256-linked report. A unit test
and CLI `python -m app.model_lab --check` recompute the report exactly.

The application serves this signed-off artifact through a *read-only*
FastAPI Model Lab endpoint and Next.js dashboard. No online inference or
incident-scoring adapter is enabled. No actual flood labels or official
data have been integrated; model metrics cannot be used as real-world
predictive performance claims. See [model methodology](MODEL_EVALUATION_LAB.md).


## Explicit synthetic replay-to-case evidence

The existing modular monolith now supports an optional incident UUID on the
local replay CLI. It validates the selected case's demo-agency/fixture scope,
then associates only accepted observation records with existing case evidence
and chronology tables under the same transaction/advisory lock. Deterministic
case/event IDs make attachment idempotent. Source quality and original times
are preserved; summaries cite accepted event/source UUIDs and payload digests.
This is explicit tabletop association, not inferred physical correlation.
No live ingest endpoint, automatic incident creation or new runtime service is
introduced. Proposal snapshots preserve the checklist/citations at draft time;
independent approval gates a private scripted task receipt and audit history.


## Local web runtime packaging

The console still uses Next.js/React, Tailwind and MapLibre. Tailwind 4 retains
the existing theme configuration and uses its PostCSS integration. Compose web
builds use Next standalone tracing in a separate runner stage under UID 1000;
static assets and pinned same-origin map workers are copied explicitly. The
runtime excludes the full development installation (including Tailwind/braces).
This changes packaging, not the API, data model or approval boundaries. The
optional local IdP override remains review-only until owner activation/trust
approval and does not replace default locked authentication behavior.


## Private exercise CAP artifacts

Existing signed-agency proposal audit supplies a consistent captured snapshot
for a stdlib XML serializer. Only approved warning-preparation proposals with
independent checker decisions and synthetic citations can export. The existing
BFF proxies attachment bytes with no-store/nosniff headers; server-side tokens
remain absent from browser JavaScript. CAP Draft/Private fields and fictional
addresses are fixed, not user-selectable. This adds no transport, DB table,
public feed, operational warning or IdP activation. See CAP_EXERCISE_DRAFTS.md.


## Staged scripted task progress

Approved proposals can prepare a v2 JSON receipt and record per-task scripted
acknowledgement/closure. Existing proposal row locks serialize concurrent writes;
receipt and audit events commit in one transaction. Signed agency/operator scope
is unchanged. V1 completed receipts and legacy one-shot calls are preserved;
preparing or simulating twice never replaces an existing receipt. This adds no
schema/service/transport and does not model real department identity or SLAs.

## Incident context explanation

The existing read-only readiness response additionally exposes its checklist
version, source freshness evaluation reference time, explicit unknowns and next
human-review step. The existing incident panel displays these fields and every
freshness bucket. This reuses the deterministic assessment and existing API/BFF;
no model provider, worker, migration or authorization change is introduced.
See [context semantics](INCIDENT_CONTEXT_PANEL.md). A generic service failure
is displayed as unavailable, not attributed to an unobserved dependency.

## Deterministic cited review brief

The existing assessment response now includes `review_brief` version v1 with
template findings, checked evidence/source references, illustrative playbook
review options and limitations. `create_proposal` captures it in the existing
response snapshot, and a shared component renders case and captured proposal
views. It does not invoke a provider, interpret raw source instructions or gain
write authority. Historic snapshots without the field remain compatible.
See [brief scope](CITED_REVIEW_BRIEF.md).

## Context failure stages

The assessment adapter wraps expected read/configuration and validation failures
with fixed stage codes. Existing readiness and proposal-create handlers return
503; the readiness BFF allowlists these codes and the client renders static
guidance. No raw exception details or infrastructure metadata are returned.
Missing cases remain 404; normal assessment/captured snapshots are unchanged.
See [failure diagnostics](CONTEXT_FAILURE_DIAGNOSTICS.md).

## Ephemeral workbench draft buffer

A bounded page-memory buffer separates unsaved exercise rationale by incident
and action under the verified session subject/agency. It clears on scope/access
loss or successful save; no credentials, browser storage, server auto-save or
new auth capability is introduced. The form cannot create while authorized
cases are unavailable. See [draft behavior](UNSAVED_EXERCISE_DRAFTS.md).
