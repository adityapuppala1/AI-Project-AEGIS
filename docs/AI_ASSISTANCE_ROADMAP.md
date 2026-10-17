# Operator assistance and prediction roadmap

Current extensions: [saved proposal-context revalidation](PROPOSAL_CONTEXT_REVALIDATION.md)
and [single-instance local operation guards](SINGLE_INSTANCE_LOCAL_RUNTIME.md)
passed laptop acceptance: 299 native tests, 31 proxy tests, seven PostGIS tests,
production builds, guarded startup and HTTP/browser checks. Deterministic context
only at that checkpoint. [Optional saved review focus](SAVED_REVIEW_FOCUS.md)
is implemented in the next slice; a bounded explicit-step durable run and
explicit synthetic source comparison are also accepted locally. Broader
free-form assistance and deeper dependency diagnostics remain pending. Exact source,
commands and the retained startup failure/fix are in [the handoff](LOCAL_DEMO_HANDOFF.md).

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
| 0 / integration | Context acceptance recovered and passed; deterministic brief runtime acceptance also passed on `6b2211c` | Current handoff records 259 native tests, six real DB tests, production/browser/HTTP checks and guarded final documentation sync. Human acceptance remains deferred |
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

No external LLM account, paid API, model download or GPU requirement is
selected. An existing local CPU model now supports an opt-in selection preview;
see [local review focus](LOCAL_REVIEW_FOCUS.md). Benchmark additional candidates before expanding model use;
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

## Implementation update — deterministic brief foundation

`396d531` / `f06ab89` implement the [cited template brief](CITED_REVIEW_BRIEF.md)
in the existing incident readiness response and captured proposal snapshot.
It cites only checked evidence/source IDs, retains gaps and playbook review
options, and uses no model or external service. This is the deterministic
fallback foundation of order 2, not a completed generative copilot or agent
runner. Context runtime acceptance on `061e35a` has passed; consult the handoff
for the latest brief runtime tests and final documentation sync state.

Final brief application source `6b2211c`: Windows native 259 tests (six DB
skips), model/type checks, six real PostGIS tests, production build, targeted
brief/mobile/malformed-response browser checks, sampled browser/axe and HTTP
passed. The brief is a tested deterministic fallback; order 2's generative
capability and subsequent agent/prediction stages remain planned.

## Implementation update — context failure stages

`29138a3` / `eb4624e` add [safe stage failure feedback](CONTEXT_FAILURE_DIAGNOSTICS.md)
for case reads, geographic reads and context validation, propagated through the
existing readiness route with static operator guidance. This is partial
dependency visibility, not per-host monitoring or root-cause diagnosis. Actual
source agreement remains not evaluated: comparable measurement windows/sensor
groups are absent, and comparing nearby raw values would be misleading.
Exact executed acceptance remains in the handoff. No model or agent is enabled.

Context diagnostic acceptance on `eb4624e`: 264 native API tests (six DB
skips), 17 Node route/proxy tests, six real PostGIS tests, production builds,
targeted stage-failure/recovery/mobile browser checks, browser smoke/axe and
HTTP passed on Windows. This closes stage feedback, not agreement inference
or complete dependency monitoring. IdP/human acceptance remains deferred.

## Implementation update — explicit source comparison

`272d029` closes the earlier agreement-inference gap with opt-in source group,
unit, time-window and tolerance metadata. The deterministic checklist reports
agreement, disagreement or not comparable and cites only eligible current,
curated synthetic sources. It never infers comparability from proximity.
Windows native, real PostGIS, production build, HTTP/checksum and browser gates
passed as recorded in the handoff. This is a review diagnostic, not confidence,
forecast accuracy, independent corroboration or operational authority.

## Implementation update — bounded unsaved workbench text

`c22780a` / `0c7c788` add [page-memory draft isolation](UNSAVED_EXERCISE_DRAFTS.md)
by incident/action, retention during workbench Refresh and failed saves,
successful-save clearing and identity/agency/role-loss clearing. Loading or
missing authorized cases disable creation. Session verification failures hide
private text and offer retry. This partially closes order 5's unsaved-work
requirement; hard reload/navigation destroys memory by design. Local warm
latency is remeasured separately; cold-start, manual accessibility and actual
signed-in acceptance are not inferred from isolated browser fixtures.

Final UI `0c7c788`: native typecheck, 23 Node tests, production web build,
fixture-only session/draft recovery cases, real anonymous browser/axe and HTTP
passed on Windows. Warm latency v1 failed; `79086bd` fixes its client-setup
confound and reports v2 with unchanged targets: 100 requests at concurrency
four, zero errors, all five route targets passed. Failed samples remain in the
handoff. This closes in-page unsaved-draft recovery and a bounded warm HTTP
gate; it does not close hard-reload recovery, cold/in-use responsiveness,
actual human acceptance, model-backed AI, agent orchestration or forecasting.

## Implementation update — local model selection preview

`597a603` / `258a157` add an opt-in [local review focus](LOCAL_REVIEW_FOCUS.md)
button in the existing incident panel. The model selects existing template
items only; server-side validation supplies original citations and limitations.
Base Compose stays disabled; the optional override uses the existing loopback
Ollama runtime. Native CPU inference has run on an already-installed tinyllama
model, with no download or hosted provider. Full application acceptance is
recorded in the handoff. This is an initial model-backed selection slice of
order 2, not complete free-form drafting, Q&A or a durable agent runner.

Application acceptance on `258a157` passed on the Windows laptop: 280 native
API tests (six DB skips), 31 Node tests, six real PostGIS tests, production
builds, real local inference through API/BFF/browser, fallback/unsafe/cancel
checks and public browser/HTTP. No proposal writes. The optional local override
is active on the laptop; base Compose remains disabled. This closes the local
provider/selection/fallback integration slice, not semantic quality evaluation,
free-form drafting, durable execution or actual human approval acceptance.

## Implementation update — captured selection

`6611465` adds opt-in server-generated review focus to new proposal snapshots
and creation audits. Checked citations, model/fallback classification and input
fingerprint persist through independent review; changed inputs during selection
refuse creation. Linux: 300 API tests, 32 Node tests, 10 real PostGIS tests,
production images and HTTP passed. Laptop corrective sync/acceptance is blocked
by remote timeouts; targeted browser interaction remains pending. This closes
Linux persistence checks for the bounded selection slice, not the durable runner,
free-form copilot, real human sign-in or prediction programme.


Saved-focus laptop acceptance recovered on `5c9bc0e` (application `6611465`):
300 API tests, 32 Node tests, 10 real PostGIS tests, production images/startup,
HTTP, public browser/axe and targeted saved-focus mobile/browser fixtures passed.
One API/web/DB, no conflicting AEGIS job. The earlier connector blocker is closed;
real human sign-in and the broader assistance roadmap remain open. See handoff.

## Implementation update — bounded durable run

`e01cb4d` closes the bounded explicit-step portion of order 3. The existing
proposal row stores a server-issued run ID, context fingerprint, fixed tool and
three-step budget, expected-step retry token, results, status and timestamps.
Each maker request commits one step and audit event; row locking and expected
steps make concurrent retries idempotent. Context changes block progress while
audited cancellation remains available. The run stops at `review_ready` and
cannot submit, approve, acknowledge tasks or perform operational actions.

Actual laptop acceptance: 308 API tests, 37 Node tests, 13 PostGIS tests,
production images/startup, HTTP and targeted mobile browser fixtures passed.
See the handoff for exact commands and limits. This is durable state-machine
orchestration through explicit requests, not a background autonomous worker.
Free-form grounded assistance, semantic evaluation and real human acceptance
remain open.
