# AEGIS delivery ownership and implementation backlog

**Current target:** CipherCop 2026 disaster-response exercise, Hyderabad urban flooding.

## Non-negotiable constraints
- GitHub repository/account: `adityapuppala1/AI-Project-AEGIS` using `adityapuppala1` only.
- Keep branches and draft PR reviews. Do not merge to main until CI passes, architecture/security reviews complete, and user approves release.
- Do not deploy paid cloud resources or integrate operational systems without explicit permission.
- The exercise build **must not** issue live public alerts, dispatch services, or identify persons from public surveillance.
- All reported model outputs distinguish calibrated forecasts from unvalidated synthetic scores.
- Documentation and tests are required with code changes.

## Priority stack

| Phase | Capability | Acceptance criteria |
|---|---|---|
| P0 | Windows developer experience | Repeatable Docker Compose startup, API/web build, seed checks, 16 GB laptop performance |
| P0 | Polished interface | Responsive mobile/tablet/desktop, high contrast themes, accessible navigation, warning labels, fallback on unavailable map |
| P0 | Incident governance rules | Strict state transitions, independent checker, rejection rationale, no live action execution, unit tests |
| P1 | Identity and access model | Verified OIDC/MFA, RBAC+ABAC by agency and jurisdiction, no untrusted client role assertions |
| P1 | Persistent incident and approval workflow | DB migrations, atomic state transitions, signed-in maker/checker, audit trail, replay prevention, integration tests |
| P1 | Data fusion | Source registry, measurement freshness, schema checks, dead letter queue, deduplication, replayable fixtures |
| P1 | Spatial exposure analysis | PostGIS overlays for roads and sensitive infrastructure, data quality labels |
| P1 | Training pipeline | Versioned data, holdout evaluation, calibration, drift detection, rollback |
| P2 | Alert integration | CAP-compatible drafts with mandatory accountable operator approval; no live send in prototype |
| P2 | Advanced simulation | Evidence-backed scenario runner, stress tests, optional lazy-loaded 3D terrain view |

## Engineering model
1. Ship small, independently testable vertical slices.
2. Keep PostgreSQL as source of truth, add streams only when throughput demands.
3. Keep operational authorization out of generative AI.
4. Treat untrusted source metadata and retrieved documents as potential prompt-injection inputs.
5. Prefer human-understandable incident status, evidence, and failure modes over animation.
6. Measure throughput, p95 latency and resource use before capacity promises.

## Governance milestone
The pure-Python policy module in `services/api/app/governance.py` currently exercises maker-checker transitions and fail-closed execution. **It is not an authenticated or persisted approvals API.** Next milestone is OIDC identity, PostgreSQL-backed state and append-only audit, followed by authorized approval UX.

## Implementation update: browser OIDC approvals

Implemented on `feat/browser-oidc-approvals` (stacked feature PR): Next.js
OIDC Code + PKCE sign-in flow, encrypted HttpOnly browser sessions, same-origin
proxy, exercise approvals UI with role checks, signout and local smoke script.

Still required before real operations: approved IdP integration with two distinct
test identities and MFA, revocable shared session storage, periodic revalidation
against member lifecycle, full browser integration testing, production security
review, and independent agency authority approval.


## Source quality vertical slice (implemented on feature branch)

`feat/source-health-freshness` implements the first DataFusion-facing
read-only slice: synthetic source registration, observed/ingested timestamps,
deterministic freshness/clock-anomaly classification, safe per-agency fixture
queries, bounded sample history, source-screen trends, accessibility table,
manual/visible-tab polling and operator guidance.

**Do not claim actual sensors or official providers are connected.**
Next DataFusion work: source signature verification, authorized real data
connectors, measured provider latencies, idempotent event capture,
corroboration and simulation replay. These require separate approval before
connecting production emergency data.


## DataFusion ingestion prototype implemented — October 2026

Branch `feat/datafusion-exercise-ingestion` adds:
- bundled synthetic JSON observation v1 contract and strict Pydantic validation;
- guarded local CLI replay (no new HTTP writes);
- source ID and measurement-unit checks against the synthetic registry;
- canonical SHA-256 fingerprint, event UUID idempotency, conflict quarantine;
- transactional ledger/history storage plus bounded metadata-only quarantine;
- idempotent migration, local Windows helper and replay/status UI;
- contract, negative, duplicate and rerun behavior tests.

Follow-up P1 work remains: authorized source adapters, signed device messages,
real provider contracts, system-to-system auth, delivery queues with offsets,
dead-letter retention and per-agency ABAC/RLS. No claim of live operational
prediction or resilience until integrated testing with permitted sources.


## Milestone: safe geospatial candidate search

The branch `feat/spatial-incident-correlation` establishes spatial
source/asset candidates with PostGIS geography distances, bounded radii,
synthetic jurisdiction scoping, source freshness, fictional GIS labels,
and a responsive incident-level inspector.

**Do not conflate proximity with exposure or forecasting.** The algorithm
does not infer risk, casualties, flood-depth, damage, or agency priority.
The next P1 tasks are validated hazard footprints, official geodata
licensing/permission checks, real source-to-incident temporal
corroboration, and measured model accuracy. See
[Spatial Correlation Explorer](SPATIAL_CORRELATION_EXPLORER.md).

## P1 Model Evaluation Lab — foundational pipeline

Branch `feat/synthetic-model-evaluation` establishes deterministic
synthetic scenario generation, grouped train/holdout partitioning,
versioned model report with dataset hash, transparent logistic baseline,
ROC AUC/precision/recall/F1/Brier/confusion metrics and an accessible
React evaluation view. The API is read-only and no real incident model
inference is performed.

**This is not trained on actual historical flooding data.** Before
shipping any prediction claim: obtain authorized event and sensor datasets,
set temporal/spatial holdout, define event/horizon labels, evaluate
reliability and calibration, baseline comparisons, drift/abstention, and
agency human-approval policy. See [model methodology](MODEL_EVALUATION_LAB.md).


## Current P0 Integration Milestone — Human Assessment Readiness

Implemented on branch `feat/assessment-integration-v1`: a read-only
composition of verified-*synthetic* incident case evidence, bounded GIS
candidate matches and source freshness into a human-review checklist.
The endpoint refuses cross-incident context, real data claims, validated
hazard probabilities, asset impact assertions and operational actions.

**This is a simulated context-checklist, not a real-time model.**
The next priority is PR stack consolidation, real browser/Windows Docker
E2E, identity-provider negative testing and security/accessibility review,
before adding expensive external integrations. Track timestamped progress,
dependencies and estimated hours in
[PROJECT_EXECUTION_TRACKER.md](PROJECT_EXECUTION_TRACKER.md).


## Integration Gate 0 hardening branch

`feat/integration-readiness-gates` adds synthetic schema/fixture
readiness gates with fail-closed HTTP 503, checks on all major local
endpoints, and a read-only Windows PowerShell verification. Exercise
approval queries now require `is_exercise_fixture IS TRUE` even when an
agency-scoped OIDC token exists.

A full Docker integration run remains an **opt-in** manual workflow,
not a GitHub action fired on every commit. All PRs are still stacked
and pending sequential review. See
[Integration Release Gates](INTEGRATION_RELEASE_GATES.md).
