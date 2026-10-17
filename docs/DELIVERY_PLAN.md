# Delivery plan — 30 Nov–1 Dec 2026

| Window | Milestone | Exit check |
|---|---|---|
| 16–20 Oct | Scope, UX and architecture | End-to-end scenario and acceptance criteria signed off |
| 21–27 Oct | API + console foundation | Local demo starts and health checks work |
| 28 Oct–3 Nov | GIS + events + cases | Incident replay drives map and case state |
| 4–10 Nov | Baseline forecasting | Honest holdout metrics, calibration and provenance |
| 11–17 Nov | Maker-checker + agency tasks | Reviewer cannot approve own submission |
| 18–23 Nov | Integrated exercise | Full demo reproducible offline |
| 24–29 Nov | Load/security and demo polish | Runbook, recovery path and judge presentation |

## Definition of done

All demo measurements labeled synthetic if synthetic; API contract tests pass; no operational warning or dispatch endpoints enabled; logs retain actors, rationale, source provenance and model version.

## Current local acceptance status — 17 October 2026

Continue `feat/aegis-local-demo-continuation`; do not switch to historical
feature branches to run the current demo. Exact source SHAs and executed
commands are recorded in [LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md).

| Demo gate | Current evidence / remaining work |
|---|---|
| Local startup and integration | Verified on the actual Windows laptop: native API/frontend, existing-volume Compose, separate PostGIS integration DB and HTTP/checksum smoke |
| Observation → evidence → assessment → draft | Implemented and covered by local API/PostGIS tests; replay is idempotent and drafts retain citations |
| Independent human approval | Code and signed-test identity checks pass; local IdP review package prepared; owner chose keep inactive, so activation/trust and two-person MFA browser acceptance are deferred |
| Approved exercise CAP draft | Private XML download and captured references implemented; native/schema/real-DB/proxy tests passed. No transmission or operational profile certification |
| Simulated tasks/acknowledgements → audit | Approved-only staged scripted tasks with rationale, atomic audit and concurrent retry/legacy tests passed; actual two-human acceptance remains deferred |
| Browser/accessibility | Automated desktop/mobile/keyboard, sampled light/dark axe and map-failure/recovery checks passed; manual screen-reader/operator review pending |
| Recovery and latency | Separate backup restoration and bounded local software latency check passed; no production capacity claim |
| Security/release | Full npm audit zero on Windows/Linux after Tailwind 4 upgrade; standalone non-root runtime/browser regression passed; owner review pending |

The dated windows above are planning milestones. Historical branch delivery
and CI evidence do not establish current acceptance. Official data feeds,
scientifically validated forecasting, agency accreditation and real dispatch
are outside this synthetic demonstration's scope. No CI or merge is authorized.

## Next development sequence

The [operator assistance roadmap](AI_ASSISTANCE_ROADMAP.md) extends this plan
with context/uncertainty reporting, grounded copilot, bounded durable agent runs,
predictive research and measured responsiveness. Close the outstanding laptop
confirmation first; preserve the deferred human identity/acceptance gates.

The context panel and deterministic cited brief are incremental assistance
slices, not evidence that a generative copilot, agent runner or validated
forecast has shipped. See [brief scope](CITED_REVIEW_BRIEF.md) and the handoff
for actual local test results and deferred human acceptance.
