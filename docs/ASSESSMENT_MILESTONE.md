# Unified Exercise Assessment — Implementation and safety contract

**Feature branch:** `feat/assessment-integration-v1`  
**Release posture:** synthetic-only, read-only, reviewable; not a deployed or operational emergency tool.

## End-to-end experience

The Incident Intelligence page includes an independent **Human Assessment Readiness** panel. It composes existing incident evidence and nearby synthetic geospatial candidates from the same UUID and bounded radius, then produces an explainable checklist about missing/aging records and necessary human verification.

```text
Synthetic incident detail (is_exercise_fixture)
   + synthetic evidence manifest / simulated event chronology
   + scoped PostGIS synthetic-only source/asset candidates
   + per-source freshness status (observed timestamp, not ingestion timestamp)
      ↓ strict fail-closed context checks
Read-only simulation context-state and explanation codes
      ↓ human checklist, no emergency instruction
Authenticated exercise Approval Workbench (separate, with maker/checker)
```

The separate Model Evaluation Lab demonstrates reproducibility on generated
examples. Its synthetic metrics are NOT fed into incident readiness, which
**never reports a numerical real-world risk probability**.

## Implemented files

| File | Function |
|---|---|
| `services/api/app/assessment.py` | Deterministic explainable context-state rules, input and classification checks |
| `services/api/app/assessment_adapter.py` | Compose read-only incident and spatial readers |
| `services/api/app/main.py` | GET-only `/v1/exercise/incidents/{id}/readiness?radius_m=3000` |
| `services/api/tests/test_assessment.py` | Negative cases, radius/UUID constraints, safe output and API methods |
| `apps/web/app/api/incidents/[id]/readiness/route.ts` | Bounded BFF proxy, response classification gate |
| `apps/web/components/assessment-readiness.tsx` | Accessible result panel, explanations, strict loading/error state |
| `apps/web/components/incident-intelligence.tsx` | Integrate panel into existing case page |

The radius selector in Assessment Readiness is independent of the Spatial
Correlation Explorer; the UI must show its actual selected radius, and cases
must not silently merge results across different radii.

## Classification and safety

Every accepted result reports:
- `source: synthetic_exercise`;
- `assessment_kind: explainable_context_checklist_only`;
- `context_state` either `insufficient_simulated_context` or
  `simulated_context_for_human_review`;
- `model_eligible_for_real_forecast: false`;
- `validated_risk_model: false`;
- `real_world_risk_probability: null`;
- `real_world_asset_impact_known: false`;
- `operational_actions_enabled: false`;
- `needs_accountable_human_review: true`.

The algorithm rejects cross-incident context mixing, non-synthetic sources,
real impact claims, unsupported freshness/quality states, non-synthetic
evidence, a validated-model assertion, and out-of-range radii. A fresh
*simulated* source and some *simulated* incident evidence only mean there
are exercise records to inspect, **not that a flood hazard is proven**.

No endpoint here writes proposals, issues public warnings or dispatches
responders. The Approval Workbench uses separate verified OIDC access and
maker-checker rules. Public demonstration routes remain limited to the
synthetic fixture agency; do not expose real agency data here.

## Local Windows verification

```powershell
cd C:\xampp\htdocs\AI-Project-AEGIS
git fetch origin
git switch feat/assessment-integration-v1
docker compose down
docker compose up --build -d
docker compose ps
```

Example: `http://localhost:3000/incidents/22222222-2222-4222-8222-222222222222`.

Review the Spatial Correlation Explorer and Human Assessment Readiness
panels. Try radius changes to 1/3/5 km; inspect explanation codes and
fail-closed behavior when data is missing. As existing fixture readings age,
current-window sources may all become stale; this is expected.

Review:
```powershell
curl.exe "http://localhost:8000/v1/exercise/incidents/22222222-2222-4222-8222-222222222222/readiness?radius_m=3000"
docker compose exec -T api python -m pytest -q
```

The implementation requires no new database tables, paid services, Python
packages or npm runtime dependencies. No fake operational events are created.

## Release blockers and next work

- Full Docker Compose and browser smoke (including migration 008 and existing
  PostgreSQL volumes) on the Windows 16 GB machine.
- QA for keyboard navigation, mobile layout, screen readers and same-radius UX.
- Security review, authorization boundary validation and stacked PR review.
- Real ingestion permissions and authenticated source trust before any
  public-safety predictions.
- Independent temporal and geographic holdout and calibration on approved
  real event labels. Generated synthetic model metrics are not transferable.
- Human SOP review, separation of duties, audit retention and authority
  verification before any real operational workflow.

Do not merge to `main` or claim production readiness solely because CI passes.


## Evidence quality prerequisite (P0 integration hardening)

Previously, a fresh but **unverified** synthetic source and any attached
synthetic case evidence were enough to set
`simulated_context_for_human_review`. That could overstate even the
*simulated* context quality.

The quality gate now additionally requires **at least one recent curated
synthetic source and at least one curated synthetic incident evidence record**.
Otherwise it returns `insufficient_simulated_context` and explicit reason
codes `no_curated_current_demo_source` and/or `no_curated_case_evidence`.
The response exposes the curated record counts, so a reviewer can explain
the outcome. Unknown evidence-quality values fail closed.

A curated exercise fixture only means prepared simulation data; it does
**not** mean real-world verification. There remains no calibrated flood
probability, actual impact conclusion, live action or operator approval.


## Freshness provenance follow-up

The current-source check now rejects a bare `fresh` status unless the source
also has a timezone-aware `observed_at`, evaluated against the timezone-aware
`as_of` reference time from the PostGIS source query. Malformed, missing,
timezone-naive and implausibly future-dated (>120 seconds) observations fail
closed. The check does not override the underlying source freshness classifier
or claim actual sensor verification. This prevents incomplete simulated source
data from satisfying the curated evidence review gate.
