# Local synthetic demo rehearsal and human acceptance record

This is the authoritative manual evidence form for the local release candidate. Copy the blank record section for each run; do not replace earlier results. A checkbox is evidence only when a named tester actually performs the step and records the outcome.

Keep the local IdP **inactive** and Windows certificate trust unchanged under the owner's 17 October 2026 decision. The authenticated two-person rehearsal is deferred, not passed. This runbook never authorizes live messages, warning issuance, deployment, CI, a push or a database reset.

## Before the rehearsal

From the existing continuation checkout, confirm the recorded commit and the single-instance runtime. These checks are read-only.

```powershell
git status --short --branch
git rev-parse HEAD
powershell -ExecutionPolicy Bypass -File .\scripts\check-local-runtime.ps1 -RequireRunning
```

Stop and investigate if the checkout is unexpectedly dirty, a required service is absent, or duplicate AEGIS services are reported. Do not stop unrelated laptop processes.

Automated proxies exist for parts of A1, A2, A5 and A6 (see the handoff for the latest executed results). They reduce the chance of avoidable findings but are **not** outcomes for this record: fill A1–A9 only from what the named tester observes with their own keyboard, zoom setting and assistive technology.

## Five-minute locked-identity walkthrough

1. Open `http://localhost:3000/demo`. State that all incidents, sources and model measurements are fictional. Readiness cards report local fixture availability, not emergency readiness. Missing or stale context is valid and remains visible.
2. Inspect `/ingestion` and `/sources`: accepted and quarantined events, observed/ingested times, delayed/stale/missing sources and quality. Open sample case `22222222-2222-4222-8222-222222222222` and inspect its accepted replay evidence and chronology. Do not reset the database.
3. Inspect the case assessment and URB playbook. State that proximity is not exposure and the index is not a calibrated forecast. Model Lab results are reproducible measurements on synthetic holdout scenarios only.
4. Open `/approvals`. Confirm unconfigured identity fails closed. Explain the implemented captured-draft → independent-checker → staged scripted-task workflow and the approved-only exercise CAP XML draft download. Do not describe this as a completed two-human browser demonstration.
5. Open `/department-tasks`, `/agency-sync` and `/audit`. Distinguish proposal-linked private tasks from seeded public examples. Export the public JSON/checksum. Private decisions and proposal receipts remain locked.

Replaying sources is optional and writes synthetic history. When specifically included in a rehearsal, use the confirmed replay/scenario helper and record its run ID. Never delete volumes to refresh data.

## Blank acceptance record

### Run metadata

| Field | Recorded value |
|---|---|
| Date and time (with timezone) | |
| Tester name/role | |
| Observer/operator name/role | |
| Branch | |
| Commit SHA | |
| Browser and version | |
| Screen reader/assistive technology | |
| Display size and scaling | |
| Runtime guard result | |
| Optional replay run ID | Not run / |

Outcome values are **Pass**, **Fail**, **Blocked** or **Not run**. Record a finding or reproduction note for every result other than Pass.

### Scenario and comprehension

| ID | Task and expected evidence | Outcome | Finding / evidence reference |
|---|---|---|---|
| S1 | Guided exercise identifies every record as synthetic and links each stage to its workspace. | | |
| S2 | Ingestion separates accepted, duplicate and quarantined events without implying live collection. | | |
| S3 | Source view exposes observed/ingested times, freshness evaluation time and missing context. | | |
| S4 | Sample case shows source provenance, chronology, uncertainty and the rule-only assessment. | | |
| S5 | Playbook is illustrative and an operator can explain that its steps are proposed guidance. | | |
| S6 | Approval Workbench fails closed and explains the independent checker requirement. | | |
| S7 | Department tasks are clearly scripted/prepared and are never described as dispatched. | | |
| S8 | Public audit JSON downloads and its displayed SHA-256 checksum verifies. | | |
| S9 | Operator correctly explains stale evidence, unknowns, model limits and public/private audit boundaries. | | |

### Accessibility and responsive behavior

| ID | Task and expected evidence | Outcome | Finding / evidence reference |
|---|---|---|---|
| A1 | Keyboard reaches navigation, global search, registry controls, case links, guided stages and audit export in logical order. | | |
| A2 | Focus remains visible; Escape closes overlays; no keyboard trap occurs. | | |
| A3 | Screen reader announces page titles, headings, landmarks, labels and loading/error/empty states. | | |
| A4 | Table headers and filter/sort feedback are understandable; charts and map markers have text alternatives. | | |
| A5 | At 200% zoom, navigation/actions remain reachable and text does not overlap; tables may scroll within their container. | | |
| A6 | At a 390 px viewport, the task selector, metrics and controls remain usable without page-level horizontal overflow. | | |
| A7 | Light and dark themes preserve readable text/status distinctions. | | |
| A8 | Reduced-motion preference removes nonessential animation without hiding information. | | |
| A9 | In an isolated test browser, blocked map tiles show a warning, retry and usable incident-list fallback. | | |

Do not alter the laptop firewall or network to test A9. Browser request blocking is sufficient.

### Findings

| Finding ID | Severity | Route/control | Reproduction and expected behavior | Owner/status |
|---|---|---|---|---|
| | | | | |

Suggested severity: **Critical** blocks safe task completion; **Major** causes an incorrect decision or inaccessible primary task; **Minor** causes friction without changing the decision; **Editorial** is a wording correction.

## Deferred authenticated two-person rehearsal

Run this section only after the owner separately authorizes local IdP activation and the documented CurrentUser certificate-trust change. Never put passwords, tokens or client secrets in this record.

| ID | Required evidence | Outcome | Finding / evidence reference |
|---|---|---|---|
| I1 | Two distinct approved test identities authenticate through the configured local provider. | Deferred | Owner kept setup inactive |
| I2 | Maker creates and submits an evidence-linked proposal; the same identity cannot approve it. | Deferred | |
| I3 | Independent checker reviews captured evidence/assessment/playbook and approves or rejects with rationale. | Deferred | |
| I4 | Only an approved proposal can prepare scripted department tasks and the exercise CAP XML draft. | Deferred | |
| I5 | Task acknowledgements/closure and private audit show verified identities, timestamps and proposal linkage. | Deferred | |
| I6 | Logout/session expiry returns protected views to the locked state and does not expose another agency's records. | Deferred | |

Setup and reversal are documented in [LOCAL_IDP_REVIEW.md](LOCAL_IDP_REVIEW.md). Until I1–I6 pass, the original observation-to-independent-human-approval browser journey remains incomplete.

## Owner release decision

| Field | Recorded value |
|---|---|
| Decision | Pending / Accept locked-identity presentation / Reject pending fixes |
| Accepted commit SHA | |
| Open findings explicitly accepted | |
| Reviewer name | |
| Review date | |
| Notes | |

The reviewer should compare this record with [the current handoff](LOCAL_DEMO_HANDOFF.md). Acceptance of the locked-identity presentation does not certify real operations and does not authorize merge, push, CI, deployment, live telemetry, public warning or responder dispatch.
