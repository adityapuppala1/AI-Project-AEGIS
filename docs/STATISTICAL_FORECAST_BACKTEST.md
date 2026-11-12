# Back-test of the optional statistical river forecast (TimesFM 2.5)

Rehearsal statistics on modelled data. None of these numbers is the accuracy of flood prediction.

## What was tested, and on what data
- **The feature:** the display-only 30-day forecast from TimesFM 2.5 (200M, Apache-2.0), run exactly as in `services/api/app/statistical_forecast.py` (package `timesfm==3.0.2`, checkpoint `google/timesfm-2.5-200m-pytorch`, same ForecastConfig, last 400 daily values as context, horizon 30, 10 % and 90 % quantiles, outputs clamped at 0). CPU torch.
- **The data:** daily *modelled* river discharge from the Open-Meteo Flood API (GloFAS reanalysis, about 5 km grid), 2015-01-01 to 2026-11-05. This is a computer model of the river, not gauge readings, and it is smoother than real gauges.
- **17 grid cells** on Indian rivers (list below). **83 forecast origins per cell, one every 30 days from 2020-01-01 to 2026-10-06 (about 6.8 years, every season, 7 monsoons): 1,411 forecasts = 1,411 model calls**, 42,330 forecast-days. Run time 14 minutes. No origins were dropped or thinned.
- **Compared with three simple baselines** on the same origins: (a) repeat the last value; (b) seasonal average = mean of the same calendar day in earlier years only; (c) same days last year.
- The design was written down before any forecast was run: `PREREGISTRATION.md`. Nothing was tuned afterwards.

## Headline answer
Against "repeat the last value", the model had a smaller error in the monsoon and post-monsoon, but a **larger error in the dry seasons (Dec-May)**. Its 10-90 % range held about 81 % of values overall (target 80 %), but **it contained the peak of only about 27 % of rising high-flow events, and the forecast peak was typically about half the real peak (median ratio 0.49)**.

## Results
Skill = 1 - model error / baseline error. Above 0 means the model is better. Mean absolute error is taken per cell and then averaged equally over the 17 cells, so big rivers do not dominate. Brackets are 95 % intervals from resampling cells and origins.

**By forecast day**

| Days | vs repeat last value | vs seasonal average | vs same days last year | Range holds actual (target 80 %) |
|---|---|---|---|---|
| 1-3 | +0.17 (0.04 to 0.25) | +0.73 (0.67 to 0.78) | +0.80 (0.76 to 0.84) | 89 % |
| 4-7 | +0.16 (0.08 to 0.22) | +0.41 (0.33 to 0.49) | +0.59 (0.53 to 0.65) | 85 % |
| 8-14 | +0.20 (0.13 to 0.26) | +0.16 (0.06 to 0.24) | +0.35 (0.26 to 0.42) | 85 % |
| 15-30 | +0.24 (0.18 to 0.29) | **-0.18 (-0.30 to -0.08)** | +0.05 (-0.05 to 0.13) | 77 % |
| All | +0.22 (0.17 to 0.27) | +0.08 (-0.00 to 0.16) | +0.29 (0.22 to 0.34) | 81 % |

**By season of the forecast start**

| Season | vs repeat last value | vs seasonal average | vs same days last year | Range holds actual |
|---|---|---|---|---|
| Pre-monsoon (Mar-May) | **-0.45 (-1.14 to -0.14)** | -0.19 (-0.82 to 0.11) | +0.10 (-0.52 to 0.30) | 85 % |
| Monsoon (Jun-Sep) | +0.17 (0.11 to 0.23) | +0.11 (0.01 to 0.19) | +0.30 (0.23 to 0.37) | **74 %** |
| Post-monsoon (Oct-Nov) | +0.49 (0.37 to 0.60) | **-0.24 (-0.57 to 0.03)** | +0.09 (-0.24 to 0.30) | 87 % |
| Winter (Dec-Feb) | **-0.17 (-0.49 to 0.03)** | -0.19 (-0.58 to 0.07) | -0.13 (-0.63 to 0.22) | 83 % |

Plain reading:
- The seasonal-average and last-year baselines are poor at days 1-7 (they ignore today's flow), so the large positive numbers there say little. The fair short-range test is "repeat the last value".
- Against that fair test the model wins by a modest margin in wet periods and **loses in dry periods at every horizon** (pre-monsoon days 1-3: -0.79; winter days 1-3: -0.59). When the river is nearly flat, the model adds drift that the flat line does not.
- At 15-30 days the model beats "repeat the last value" (+0.24) but **is worse than the seasonal average (-0.18)**; only 2 of 17 cells beat the seasonal average at that range.
- Over all days the model beat persistence in 16 of 17 cells; the exception is Yamuna at Delhi (-0.02, a heavily regulated reach). Per cell: `results/table_per_cell.csv`. Per season and day bucket: `results/table_bs.csv`.
- A scale-free error (MASE: error divided by the typical day-to-day change in the 400-day context) is 5.4 for the model against 6.8 for persistence overall. Both are far above 1 because 30-day errors are much larger than one-day changes.

## Calibration of the 10-90 % range
- Overall 81 % of actual values fell inside the range (target 80 %). That looks fine, but it is an average that includes easy dry-season flat periods.
- It is too narrow where it matters: **74 % in the monsoon, 69 % for monsoon days 15-30**. By cell it ranges from 73 % (Musi, Kaveri) to 90 % (Bhima).
- It is also wide: its width averages 0.9 times the average flow, 1.1 times at days 15-30 (2.2 times for post-monsoon days 15-30). A range that wide says little about the level.

## Rising high flows
Defined before looking: a 30-day window in which discharge goes above that cell's own 90th percentile, starting from a day at or below it. 189 such windows, covering all 17 cells.
- The forecast peak was **below the real peak in 94 % of them; median forecast peak / actual peak = 0.49** (95 % interval 0.43-0.55; middle half 0.25-0.67). In 52 % the forecast peak was under half the real one.
- The 90 % line was at or above the real peak on the peak day in **27 %** of windows (95 % interval 21-34 %), and at some point in the window in 34 %.
- For comparison, repeat-last-value gave a median peak ratio of 0.35 and the seasonal average 0.71. The model's error over these windows was only slightly smaller than persistence (skill +0.06), worse than the seasonal average (-0.14) and better than last year's values (+0.18).
- This matches the existing in-app caveat that extremes may be underestimated. It is now measured.

## What this does and does not show
- Data are GloFAS **modelled** discharge, not gauge observations. Real gauges are noisier and can be regulated by dams; results could be better or worse.
- This is **not a comparison with GloFAS forecasts** or any physics-based forecast that uses rainfall forecasts. Those are the real alternative. The baselines here are deliberately simple.
- The model sees only the discharge history: no rain, snow, dams or other covariates.
- One model version, one setting, no tuning. The cells share rivers and weather, so they are not 17 independent samples; the intervals reflect resampling only.
- 11 of the 17 starting points first landed on small tributary cells and were moved to the main stem by a rule written before forecasting (see Deviations). Two cells remain small (Godavari near Nashik and Musi, mean about 27 m3/s). The "small Himalayan" cell (Alaknanda) is mid-sized (mean 260 m3/s).
- These are rehearsal statistics on one historic period, not accuracy of flood prediction and not a basis for any warning.

## Recommendation for the app
1. Keep it display-only and off by default. Do not describe it as accurate or reliable.
2. **Limit the horizon shown to 14 days** (hide or grey out days 15-30). Beyond that it was no better than the seasonal average, and the range was too narrow in the monsoon.
3. **Always draw a reference next to it** (the repeat-last-value line, ideally also the seasonal average), because in dry months the model was worse than the flat line.
4. **Do not present the 10-90 % band as a safety margin.** If shown, call it "typical spread, misses peaks": it reached the flood peak in only about one rising high-flow event out of four. Prefer hiding it by default.
5. Add a plain label: "Statistical pattern forecast. In past tests, flood peaks were usually forecast at about half their real height."
6. Before anyone relies on it: repeat this on gauge data and against GloFAS forecasts. Until then the GloFAS forecast stays the primary reference and this stays a secondary view.

## Cells (grid cell actually used; mean modelled discharge m3/s)
| Cell | Lat | Lon | Mean |
|---|---|---|---|
| Brahmaputra_Guwahati | 26.18 | 91.65 | 13,999 |
| Brahmaputra_Dibrugarh | 27.53 | 94.82 | 7,272 |
| Ganga_Patna | 25.62 | 85.15 | 9,734 |
| Ganga_Varanasi | 25.32 | 83.03 | 3,606 |
| Ganga_Farakka | 24.85 | 87.87 | 13,271 |
| Kosi_Baltara | 25.45 | 87.25 | 12,755 |
| Yamuna_Delhi | 28.67 | 77.20 | 330 |
| Godavari_Rajahmundry | 16.95 | 81.73 | 4,179 |
| Godavari_Nashik | 19.94 | 73.89 | 27 |
| Krishna_Vijayawada | 16.47 | 80.61 | 1,500 |
| Mahanadi_Cuttack | 20.48 | 85.88 | 2,376 |
| Narmada_Bharuch | 21.71 | 73.00 | 1,300 |
| Kaveri_Trichy | 10.83 | 78.70 | 502 |
| Tapi_Surat | 21.18 | 72.73 | 591 |
| Musi_Hyderabad | 17.37 | 78.58 | 27 |
| Alaknanda_Rudraprayag (small Himalayan) | 30.28 | 78.88 | 260 |
| Bhima_Pandharpur (peninsular) | 17.67 | 75.33 | 264 |

## Deviations from the plan
- A first pass showed 11 of the 17 starting points on small tributary cells. Rule fixed before forecasting: for any point with mean below 100 m3/s, probe a 5x5 grid within 0.1 degrees using calendar year 2019 only and keep the highest-mean point. 11 points moved (`snapped.json`; first-pass files `cache/firstpass_*.json`). Only discharge size was used, never forecast results.
- Rather than the original 12-16 cells, 17 were used. Fewer origins were not needed.

## Reproduce
Python venv: `..\tfm\venv` (timesfm 3.0.2 package, torch 2.15 CPU; weights are the Apache-2.0 2.5 checkpoint; pandas and matplotlib were pip-installed into it). From this folder:
```
python fetch.py            # first pass, cached in cache/
python snap.py             # pre-registered main-stem snapping (probes cached)
python fetch2.py           # full history for the final cells -> final_cells.json
set HF_HUB_OFFLINE=1 & set NT=12 & python run_backtest.py   # 1,411 model calls, about 14 min -> results/origins.csv
python analyze.py          # tables, bootstrap, charts -> results/
```
Outputs in `results/`: `origins.csv` (per cell, origin and forecast day: actual, model, q10, q90, baselines), `table_*.csv`, `table_skill_bootstrap.csv`, `rising_high_flow.csv`, `summary.json`, `analysis_output.txt`, `chart_skill_coverage.png`, `chart_high_flow_and_cells.png`. Bootstrap: 2,000 resamples of cells then origins, seed 7. Data requests: one per call, 1.1-1.5 s apart, generic user agent, all cached.

Definitions: skill uses each cell's mean absolute error, then the equal-weight mean over cells. Seasonal average uses the same calendar day (365-day steps) from up to 5 earlier years, all before the origin. Persistence repeats the last observed value before the origin. Peak ratio compares the highest forecast value in the window with the highest actual value (timing not matched).
