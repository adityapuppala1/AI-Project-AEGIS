# Phase 2 retrospective evaluation: pre-registered protocol

Status: **registered 2026-11-02, before any Phase 2 result exists.** These rules are binding. The code in
`indicators.py` and `evaluate.py` implements them, and the SHA-256 of this file is stored in every frozen
threshold file. Any change to this file after registration requires a dated row in the amendments log at the
end of this file (see "What would change this protocol"). The amendment must be written before the changed
analysis is run.

## 1. Purpose and non-goals

Purpose: describe, retrospectively, how simple rainfall (and, where present, discharge) indicators derived from
reanalysis data line up with a small, human-reviewed catalogue of flood and non-flood days in Hyderabad.

Non-goals:

- No operational forecast, warning, alert, dispatch or public message of any kind.
- No claim of forecasting skill, forecast accuracy or predictive ability for real floods.
- No input to the AEGIS application, its workflow, approvals or Model Lab, unless a later reviewed decision says
  so; any such display must be labelled "Real historical retrospective" and stay read-only.
- No hourly analysis (see section 5).

## 2. Data inputs and their limits

- **Rainfall:** Open-Meteo Historical Weather API, daily `precipitation_sum` (mm) at the 9 grid points in
  `pilot_config.RAIN_POINTS`, requested with `timezone=Asia/Kolkata`. The analysed value is the **grid mean**: the
  arithmetic mean over the points that report a value that day. A day with fewer than 5 reporting points is
  **missing** (the same rule as `candidates.py`). Missing days are never interpolated or filled.
- **Discharge (optional):** Open-Meteo Flood API daily `river_discharge` (GloFAS model output) at the Musi basin
  points. Used only if the user supplies it; otherwise the discharge indicator is reported as "not available".
- **Limits:** both inputs are model/reanalysis products, **not** rain-gauge or river-gauge observations. Grid cells
  are about 11 km; local convective extremes can be smoothed out. The API may snap several points to the same
  cell. GloFAS cells may not sit on the river. Results describe agreement between these products and reviewed
  labels, nothing more.

## 3. Unit of analysis

One calendar day in Indian Standard Time (UTC+05:30), identified by an ISO date `YYYY-MM-DD`. Each catalogue date is
one unit. Duplicate dates in the catalogue are excluded (all copies) and counted.

## 4. Label definition

A catalogue row (column layout of `candidates.FIELDS`) **qualifies** only if all of the following hold:

1. `label` is exactly `event` (flood-impact day) or `non_event`. Any other value, including `unlabelled`, excludes it.
2. `reviewer_1` and `reviewer_2` are both non-empty and are different people (case-insensitive comparison).
3. `evidence_url` is non-empty and starts with `http://` or `https://`.
4. `date` is a valid ISO date inside 2000-01-01..2025-12-31.

Rows that fail are **excluded, never guessed**. The number excluded, by reason, is reported in every report.
`needs_second_person_review` is recorded but does not override rules 1 to 3; a row still marked `true` despite two
reviewers is counted as a "flag inconsistency" and reported.

## 5. Indicators (fixed list)

For evaluated day `d`, with `P(x)` the grid-mean daily precipitation on day `x`:

| ID | Definition | Window |
|---|---|---|
| `rain_1d` | `P(d)` | day `d` only |
| `rain_3d` | `P(d-2) + P(d-1) + P(d)` | trailing 3 days **including** `d` |
| `antecedent_7d` | `P(d-7) + ... + P(d-1)` | 7 days ending the day **before** `d` (excludes `d`) |
| `discharge_pct` | fraction of the **training-period** discharge sample that is `<=` the discharge on `d` | discharge on `d`; reference sample from train dates only |

If any day in a window is missing, the indicator is **not computable** for that row; the row is excluded from that
rule's evaluation and counted. Hourly 1 h / 3 h / 24 h indicators are **out of scope** for this daily-only pilot.

## 6. Baseline

`rain_1d >= T_base` with **T_base = 64.5 mm**, the lower bound of the IMD "heavy rain" category. It is a published
convention, **not a tuned value**, and it is never adjusted using any data.

## 7. Candidate rules and threshold selection

Each candidate rule is a single threshold on one indicator: "event if indicator >= threshold". Thresholds are chosen
**only from training rows** by this deterministic procedure:

- Fixed grids: `rain_1d` 5..200 mm step 5; `rain_3d` 10..400 mm step 10; `antecedent_7d` 10..400 mm step 10;
  `discharge_pct` 0.50..0.99 step 0.01.
- For each grid value compute the critical success index (CSI) on the training rows; an undefined CSI counts as 0.
- Choose the value with the highest CSI; ties are broken by the **higher** threshold.
- If the training period has no qualifying event, no threshold is selected and the rule is reported as
  "not selectable".

All candidate rules and the baseline are reported on the test period. No rule is chosen as "best" using test data.

## 8. Time split (fixed now)

- **Train:** 2000-01-01 to 2017-12-31 inclusive. Used for threshold selection and the discharge reference sample.
- **Test:** 2018-01-01 to 2025-12-31 inclusive. Used once, for evaluation only.
- There is **no separate validation period**. Thresholds are frozen from the training period only.
- A row dated 2017-12-31 is train; a row dated 2018-01-01 is test.
- The 7-day and 3-day windows of an early test day may reach back into December 2017; that uses only past rainfall
  and is allowed. No window ever reaches forward.

Random or shuffled splits are **forbidden**: rainfall is autocorrelated in time, neighbouring days would land on
both sides, and the result would describe interpolation within known seasons instead of performance on unseen
years. Climate, land use and drainage also change over time, so only a forward split is honest.

## 9. Metrics

From the confusion counts on test rows (hits `a`, false alarms `b`, misses `c`, correct negatives `d`):

- Probability of detection / hit rate `POD = a / (a + c)`
- False-alarm ratio `FAR = b / (a + b)`
- False-alarm rate / probability of false detection `POFD = b / (b + d)`
- Miss count `c`
- Critical success index `CSI = a / (a + b + c)`
- **Lead time: not assessed.** Daily data cannot measure warning lead time; every report says so.

A rate with a zero denominator is reported as "undefined", never as 0 or 1.

## 10. Uncertainty

- Exact Clopper-Pearson 95% intervals for POD, FAR and POFD (numerical inversion of the binomial distribution).
  CSI is reported without an interval because it is not a single binomial proportion.
- The **number of test events** is stated at the top of every report.
- If test events are fewer than 10, the report states that no claim of statistical significance or difference
  between rules is made.

## 11. Stop rules

- If the test period contains **fewer than 5 qualifying events**, the report status is **"insufficient events"**,
  and **no rates** (POD, FAR, POFD, CSI or intervals) appear in the report or any chart. Counts are still listed.
- If the training period has no events, candidate rules are "not selectable"; the baseline is still reported.

## 12. Mandatory reporting

Every report includes: every metric for every rule (subject to the stop rules); every hit, miss and false alarm
listed by date; the number of excluded rows with reasons; the class balance in train and test; the frozen threshold
file SHA-256 and protocol SHA-256; data source and attribution; and this sentence: "These results describe
reanalysis rainfall against reviewed labels only; they are not gauge observations and not a forecast evaluation."

## 13. Leakage controls

- No indicator uses data from after the evaluated day; `antecedent_7d` ends the day before.
- Thresholds and the discharge reference sample are computed from training rows/dates only.
- Test rows are never used for selection. The frozen threshold file records its own SHA-256.
- Test evaluation runs once per frozen hash. A re-run requires an `--amendment` note, which is recorded in the
  evaluation log alongside the original run.

## 14. Required expert review before any display

No result may be shown outside this folder (app, slides, social posts) until a person with hydrology or
disaster-management expertise has reviewed the report and the review is recorded in the amendments log or the
research plan.

## 15. Wording

Allowed: "retrospective agreement between reanalysis rainfall indicators and reviewed historical labels",
"hit rate on the 2018-2025 test period", "missed events", "false alarms", "insufficient events".

Forbidden: "forecast accuracy", "predicts floods", "prediction accuracy", "early warning performance",
"validated model", "operational skill", or any statement that the rules can warn of future floods.

## 16. What would change this protocol

Any change to the inputs, label rules, indicators, grids, tie-breaking, split, metrics, stop rules or wording
requires, **before** the changed analysis runs: a new dated row in the amendments log stating what changed, why,
and whether test results had been seen. If test results had been seen, the amended analysis is reported as
exploratory, next to the original result, never in place of it. A changed protocol hash is refused by
`evaluate.py` unless the amendments log has gained at least one row since the thresholds were frozen.

## Amendments log

| Date | Change | Test results seen before change? |
|---|---|---|
| 2026-11-02 | initial registration | no |
