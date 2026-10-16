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
