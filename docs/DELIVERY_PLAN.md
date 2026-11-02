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

## Current local acceptance status — 18 October 2026

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
| Security/release | Full npm audit zero on Windows/Linux after Tailwind 4 upgrade; standalone non-root runtime/browser regression passed; owner release review pending |
| Operator workspace | Operations-graphite visual system and grouped information architecture passed production build, 390/1440 structural checks, 21 browser/axe checks and single-runtime verification at application checkpoint `b31b6d1` |

The dated windows above are planning milestones. Historical branch delivery
and CI evidence do not establish current acceptance. Official data feeds,
scientifically validated forecasting, agency accreditation and real dispatch
are outside this synthetic demonstration's scope. No CI or merge is authorized.

## Earth Watch enhancement — started 2 November 2026

A second, additive program combines IndTrana-style visibility (public satellite
imagery, public hazard markers, live freshness) with AEGIS governance. It
was planned across the existing calendar (E1/E2 week of 2 Nov, E3/E4 from 9 Nov,
E6/E7/E5 from 16 Nov, hardening 23–29 Nov; 96–142 engineering hours, 128–190 with E5)
and was implemented locally on 2 Nov 2026. Scope, safety rules, effort and status:
[EARTH_WATCH_ENHANCEMENT_PLAN.md](EARTH_WATCH_ENHANCEMENT_PLAN.md). The remaining
calendar time is better spent on the unrun acceptance checks and the human gates
below. It does not close any human or owner gate.

## Completion plan and decision log — 2 November 2026

The schedule from now to the demonstration, the decisions taken on the owner's behalf (and those deliberately not
taken: push, PR, CI, rehearsal people, release go/no-go), the owner's deadlines and the licence-register findings are
in [DELIVERY_COMPLETION_PLAN.md](DELIVERY_COMPLETION_PLAN.md). A pull-request body is drafted but **not submitted**:
[PR_DRAFT_EARTH_WATCH.md](PR_DRAFT_EARTH_WATCH.md). Day-of operations (profiles, preflight, recovery, safe answers):
[DEMO_RUNBOOK.md](DEMO_RUNBOOK.md).

## Remaining gates after local engineering closure

The authorized local synthetic engineering chain is complete. The context and
uncertainty panels, cited review brief, bounded explicit-step runner, grounded
evidence guide, signed department inbox/reassignment, responsive operator
workspace and single-runtime guard all have executed laptop evidence in the
handoff. These bounded capabilities do not establish self-awareness, autonomous
operations or validated real-world prediction.

Remaining release gates require people or external authorization: owner-deferred
IdP/trust activation and two-person MFA rehearsal, manual screen-reader and
operator usefulness evaluation, owner release review, and authorized historical
data plus independent domain validation before any forecasting claim. Real
feeds, paid infrastructure, public warning delivery and responder dispatch are
separate future programs and remain disabled. Record performed human checks and
the decision in the fillable [demo rehearsal and acceptance record](DEMO_REHEARSAL.md).
