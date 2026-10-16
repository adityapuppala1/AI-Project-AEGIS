# AEGIS Model Evaluation Lab — versioned, synthetic-only foundation

**Milestone:** `feat/synthetic-model-evaluation`
**Application route:** `/model-lab`
**API:** `GET /v1/exercise/model-lab/report` (read-only)
**Exercise model:** `aegis.exercise.logistic-baseline.v1`

## What this does—and does not—establish

This milestone builds a **reproducible offline software evaluation pipeline**.
It exercises train/holdout separation, metric calculation, model versioning,
calibration-bin visualization and honest model-card limitations.

**No historical flood dataset, official weather data, real flood labels,
live model, field-validation study, operational warning or responder dispatch
is used or claimed.** All records are artificially generated from a hidden
synthetic logistic rule with random-like simulated noise. A test-set score
measures only how well a fitted baseline recovers the generator's artificial
relationships. It is **not** a forecast for Hyderabad or an estimated
probability that a real disaster will occur.

The model laboratory remains separate from `/incidents/{uuid}`: an incident
page explicitly says **no validated hazard model is attached** and links
to this standalone offline research demonstration.

## Dataset versioning and leakage prevention

`services/api/app/model_scenarios.py` is a small, dependency-free versioned
generator. It uses a fixed, portable xorshift32 pseudo-random sequence,
seed `20261016`; there is no network dependency or third-party data pull.

- 24 artificially generated scenario groups;
- 9 observation windows in each group, for 216 total synthetic cases;
- 18 complete training groups = 162 observations;
- 6 complete holdout groups = 54 observations;
- no training observations from any holdout scenario ID;
- labels are artificially generated using rainfall, a synthetic water
  index, drainage category and random-like noise.

The generated dataset is content-hashed using canonical JSON. Its SHA-256
is recorded in the checked-in evaluation report. The generator and test
fixtures are versioned source, avoiding storage of hundreds of redundant
JSON rows in Git.

Group-disjoint holdout prevents one particular form of leakage. It does
**not** demonstrate temporal, spatial or real-world generalization.

## Reproducible estimator

`services/api/app/model_lab.py` implements a transparent baseline
**logistic regression** using pure Python standard library:
- rainfall divided by 100;
- synthetic water index divided by 100;
- moderate-drainage indicator;
- limited-drainage indicator;
- intercept (bias).

Batch gradient descent uses 750 fixed epochs, learning rate 0.35, L2
regularization 0.012 (excluding intercept) and classification threshold
0.5. Fixed hyperparameters are selected for the demonstration; they are
**not optimized using the holdout partition**. No GPU/ML dependency
or real-time model inference endpoint has been added.

### Evaluation metrics (synthetic holdout only)

The committed `app/fixtures/model_report_v1.json` contains actual outputs
from the reproducible evaluation—not invented performance figures:

| Metric | Value | Interpretation |
|---|---:|---|
| Synthetic accuracy | 0.7407 | 40 of 54 artificially labeled cases |
| Precision | 0.7297 | Generated positives correctly classified as positive |
| Recall | 0.8710 | Generated positive examples detected |
| F1 | 0.7941 | Harmonic mean of synthetic precision and recall |
| Synthetic ROC AUC | 0.8597 | Ranking of generated labels in the holdout |
| Brier score | 0.1639 | Squared error against generated labels |
| Constant-prevalence baseline Brier | 0.2510 | Simple comparator derived using train prevalence |

Confusion matrix on the synthetic holdout: true positives 27,
true negatives 13, false positives 10, false negatives 4.
Bin counts 0/9/19/9/17 for score intervals in 0.2 increments.
These calibration-bin values are **illustrative** and are not a real
calibration certificate.

**Do not quote these percentages as flood-prediction accuracy, government
readiness, field performance, or public-safety effectiveness.**

## Reproduction, CI and version control

On your Windows development stack:

```powershell
cd C:\xampp\htdocs\AI-Project-AEGIS
git fetch origin
git switch feat/synthetic-model-evaluation
docker compose down
docker compose up --build -d
docker compose exec -T api python -m app.model_lab --check
```

Expected: `PASS: committed synthetic evaluation matches reproducible rebuild`.

View:
- `http://localhost:3000/model-lab`: saved evaluation report and
  accessible score-bin/confusion-matrix summaries.
- `http://localhost:8000/v1/exercise/model-lab/report`: read-only API.
- `http://localhost:3000/incidents`: cases still show no live model
  inference or automatic dispatch.

The API test suite recomputes the report, validates the data contract,
checks that scenario IDs do not leak across partitions, verifies metric
consistency and refuses malformed scenarios. This prevents stale report
metadata from silently diverging from the source generator.

The CI workflow runs Python tests, TypeScript checking and Next.js build
only at chosen review milestones. The costly full Docker Compose integration
remains opt-in. No cloud training instances or new Python/npm dependencies
are introduced.

## Next validation milestones required before real forecasting

1. **Authorized historical event dataset:** reproducible provenance and
   rights to use actual weather, rain-gauge, drainage, infrastructure and
   flood impact labels, with geographic scope and timestamp.
2. **Target definition:** clear event severity/lead-time/region labels,
   objective prediction horizon and meaningful error costs.
3. **Temporal and geographic holdout:** no rainfall observations or incident
   family duplicates leaking from train into test; out-of-event evaluation.
4. **Competing baselines:** historical/seasonal and hydrological heuristics,
   logistic and tree models, calibrated threshold selection; cost-weighted
   false-negative/false-positive evaluation.
5. **Calibrated uncertainty:** reliability, Brier/log loss, uncertainty
   intervals and abstention when sources are stale, conflicting or unknown.
6. **Monitoring:** dataset version, lineage, consent/rights, model cards,
   bias/fairness audits where applicable, drift tests and rollback policy.
7. **Human safety boundary:** registered agency roles and independent
   checker; no model output directly issues a real warning or dispatch.

Only after those gates can we responsibly discuss real-world flood
forecasting performance. The current result is a **working engineering
evaluation harness**, not a verified disaster predictor.
