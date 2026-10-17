# Operator assistance and prediction roadmap

Planned 17 October 2026 on `feat/aegis-local-demo-continuation`, after inspecting
source at `9c9b67c98db33e016bd8242db5fb0e1528c1045f`. This document records
proposed work; implementation updates below distinguish delivered slices from
remaining capabilities. Continue the
Next.js/FastAPI/PostGIS architecture and the existing observation → evidence →
assessment → draft → independent approval → scripted tasks → audit flow.

## Who this should help

Control-room operators need to understand what changed, which evidence is
credible, and what needs attention. Reviewers need traceable reasons and enough
context to challenge a draft. Department coordinators need clear ownership and
progress. People affected by flooding benefit only if these decisions become
more timely, understandable and reliable; a synthetic demo cannot establish
that real-world benefit. Start with these users, rather than agent count.

Measure benefit in rehearsals: time to find supporting evidence, time to
produce a reviewable draft, reviewer correction rate, overlooked stale/conflicting
sources, task ownership errors, and accessibility task completion. Record
baseline and assisted results with scenario IDs and limitations. Do not treat
faster approval or higher AI acceptance as proof of better decisions.

## Source reconciliation

| Existing implementation | Gap to address |
|---|---|
| `assessment.py`, `source_health.py`, `doctor.py`: deterministic readiness/freshness checks | Consolidated incident-level explanation of missing context and degraded services |
| `model_lab.py`, `model_scenarios.py`: reproducible synthetic offline baseline | No validated incident forecast or real-data generalization |
| Evidence-linked drafts and playbook snapshots in `workflow_store.py` | No generative, evidence-grounded copilot or durable agent runner |
| Approved staged tasks in `proposal_simulation.py` | Operator-recorded simulation; no actual department sessions or SLA coordination |
| Next.js proxies with timeouts; responsive UI and sampled browser checks | End-to-end operator performance budgets and human acceptance need further evidence |

“Self awareness” means observable software state: what data/model/version it
uses, what it last did, what failed, what is unknown and when it should abstain.
It does not mean consciousness or an ability to grant itself authority.
“Agentic” means bounded, inspectable assistance. Agents may collect permitted
context, check quality, suggest drafts and flag missing steps. They cannot
approve their own proposals, change policy, fabricate evidence/acknowledgements,
activate integrations or dispatch messages.

## Ordered implementation backlog

| Order / owner role | Slice and operator benefit | Exit evidence / dependencies |
|---|---|---|
| 0 / integration | Prior label build/HTTP confirmed and saved planning documentation synced; finish current context acceptance and final handoff sync | Source through `061e35a` is on the laptop. Latest connector timeout blocks remaining browser/DB confirmation and final docs sync; inspect existing jobs/logs before rerunning. No resets |
| 1 / API + UX | Incident context panel: freshness, conflicting/missing evidence, dependency state, last successful assessment, explicit unknowns and next permitted step | Deterministic fixtures for stale/missing/conflicting sources and API/DB failure; timestamps/versions visible; no invented confidence. Reuse readiness/assessment contracts |
| 2 / API + UX | Grounded Response Copilot: summarize the selected case, answer evidence questions, draft playbook-based options and list missing information | Every factual statement links to an authorized evidence/playbook ID; invalid citations/unsupported output rejected; unknowns explicitly retained; cross-agency and prompt-injection tests; reviewer can edit/reject. Deterministic fallback works without a model |
| 3 / API | Durable bounded agent run: gather → quality check → draft → validate → stop for review | Persist run ID, input snapshot/version, permitted tools, bounded steps/time/output budget, cancellation and audit. Resume/retry/crash/concurrent requests do not duplicate writes; revalidate changed evidence before submission. No automatic task acknowledgement or approval |
| 4 / ML | Predictive research extension in ReplayLab, then separately gated real-data research | Define target, horizon, geography, event labels and error costs first. Compare seasonal/persistence/rule and simple statistical baselines. Use event-disjoint temporal/geographic holdouts, calibration, uncertainty, missing-data abstention, lead-time and subgroup results. Synthetic scenario results remain synthetic; model output never becomes authority |
| 5 / UX + performance | Fast operator flow on the actual laptop and small screens | Measure warm/cold p50/p95 with workload/concurrency stated; cancel stale requests, avoid overlapping polling, bound payloads, preserve unsaved drafts and recover errors. Keep map/model optional for core evidence/approval flow. Keyboard, screen-reader, mobile and reduced-motion rehearsal |
| 6 / coordination | Department-owned exercise task inbox and simulated due-time tracking | Define scoped department identity/permissions first; isolated agency views, acknowledgement provenance, clock/retry/race tests and auditable reassignment. Display simulated SLA breaches without sending notifications. Existing v1/v2 receipts remain compatible |
| 7 / operators + owner | Independent human acceptance and release review | Owner currently keeps IdP inactive: two-person MFA sign-in and actual role-specific browser rehearsal remain deferred. Manual screen-reader acceptance pending. Do not bypass these gates or call the full roadmap complete |

Order 5 measurements begin during order 1; optimize only demonstrated bottlenecks.
Order 4 dataset/target design can proceed independently, but no external data or
model service is connected by this plan. Each slice must join the same case
workflow and ship with a small acceptance demo, not another isolated dashboard.
The next feature slice is grounded drafting after the current context
acceptance and remaining context gaps are addressed.

## Model and agent design decisions

Use a small provider interface behind FastAPI, with deterministic local fallback.
A future model receives only the scoped evidence snapshot and approved playbook
excerpts, never database credentials, tokens or unrestricted shell/network tools.
Treat retrieved text as data; allowlist read tools and validate structured output
and citations in ordinary code. An agent suggestion has no approval privileges.
Record evidence/playbook/model/prompt versions and concise action reasons; do
not request or store hidden reasoning. Preserve revisions and invalidate a draft
when its supporting evidence/policy changes. Surface disagreement to the reviewer.

No external LLM account, paid API, local model download or GPU requirement is
selected yet. Benchmark laptop memory/latency before choosing a local model;
approve credentials/costs/data sharing before a hosted model. A provider outage
must leave evidence browsing and ordinary human drafting available. Do not add
Kafka, a vector database or agent framework unless a measured need justifies it.

## Acceptance budgets and evaluation

Proposed software targets, **not measured promises**: visible button feedback
within 100 ms; warm local read APIs p95 within 1 second and case content within
2 seconds under a documented modest workload. AI generation has a separate
benchmark: show progress/cancel promptly, enforce a configured deadline and
return a clear fallback on timeout. Choose the generation deadline only after
measuring candidate hardware/models. Never show success before server commit.

Build a versioned evaluation set covering supported answers, absent evidence,
contradictory/stale readings, altered citations, malicious retrieved instructions,
wrong agency, provider failure and changed case versions. Report citation
validity, unsupported claims, abstention, reviewer corrections, latency and
resource use. Gate zero unauthorized actions/cross-agency disclosure and zero
accepted fabricated citation IDs in this set; these tests do not guarantee
universal model reliability. Separate model evaluation from authorization tests.

For real forecasting, authorized historical datasets and domain reviewers are
external dependencies. Publish data rights/provenance, event definitions,
held-out results and intervals, drift/rollback criteria and failure cases before
any real forecasting claim. Do not automatically retrain or deploy new models.

## Operating constraints and status

Rows above describe target scope; the implementation update below records
partial progress and the handoff records executed acceptance. Existing tests are recorded in [current handoff](LOCAL_DEMO_HANDOFF.md),
not rerun for this planning change. Preserve the owner's inactive IdP decision,
independent approval, synthetic labels and no live dispatch. No paid deployments,
GitHub Actions/labels, push, merge, trust changes or destructive resets are part
of this plan. Scope estimates should follow the first measured slice and model
benchmark rather than promising a completion date without those inputs.

## Implementation update — incident context slice

Source `061e35a103f2722d6ee07399ad37ed9cc34eb875` adds explicit unknowns,
freshness evaluation time/version, browser retrieval time, all freshness
counts and a context-dependent next review step to the existing panel. See
[context panel scope](INCIDENT_CONTEXT_PANEL.md). Source agreement detection
and per-dependency diagnostics remain pending; this does not complete all of
order 1. Exact acceptance results and laptop sync are in the handoff. The next
feature slice is grounded drafting with a deterministic fallback, retaining
ordinary authenticated submission and independent review. Generative model
selection and durable agent execution are still planned, not enabled.
