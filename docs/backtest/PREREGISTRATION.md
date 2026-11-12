# Pre-registration (written before any model forecast was run)
- Data: Open-Meteo Flood API (GloFAS reanalysis, modelled discharge), 2015-01-01..2026-11-05, daily.
- Cells: 17 candidate points on major Indian rivers. A first pass showed many points hit small tributary cells
  (mean < 100 m3/s). Rule fixed before forecasting: for such points, probe a 5x5 grid (+-0.1 deg) on calendar
  year 2019 only and keep the highest-mean point (the main stem). This uses only discharge magnitude, never forecast results.
  The "small Himalayan" and "small peninsular" slots are filled by the same rule (they may end up mid-size; stated in the write-up).
- Origins: every 30 days, last 6 full years (origin dates from 2020-01-01), the last origin must have 30 observed days after it
  (<= 2026-11-05). Context = 400 days before origin, horizon 30, q10/q90, outputs clamped at 0, same config as the app
  (max_context 2048, normalize_inputs, continuous quantile head, flip invariance, infer_is_positive, fix_quantile_crossing).
- Baselines: persistence; seasonal climatology = mean of same calendar day (+-0 days, per target date) in earlier years (from 2015) only;
  same-days-last-year (value at date-365).
- Metrics: MAE; skill = 1 - MAE_model/MAE_persistence (pooled per bucket); MASE (scaled by in-context mean absolute daily change... see script:
  scale = mean |x_t - x_{t-1}| over the 400-day context); coverage of 10-90 range; mean width / mean actual level.
  Buckets: days 1-3, 4-7, 8-14, 15-30, overall. Seasons by origin month. Rising high-flow: window max > cell p90 (computed
  from the full 2015+ history of that cell) and origin value <= p90; peak ratio = forecast max / actual max, and whether q90 at
  the actual peak day >= actual peak (and whether max q90 >= actual max).
- Uncertainty: bootstrap over origins within cell, then over cells (cluster bootstrap, 2000 resamples), 95% interval on pooled skill.
- No tuning after seeing results. If runtime >40 min, reduce origins uniformly.
