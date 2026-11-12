# Statistical forecast (TimesFM 2.5): optional, display-only

Added 10 November 2026. **Off by default.** It adds a second, purely statistical 30-day forecast of river discharge
beside the GloFAS river-model forecast in Alert Journey → Live Earth → Flood.

## What it is and is not

- The model is Google Research's TimesFM 2.5 (200M parameters): a general pattern forecaster. Code and 2.5 weights
  are Apache-2.0. The open release is not an officially supported Google product.
- It knows nothing about rivers or weather and was not trained on Indian hydrology. It can under-estimate extremes.
- The result is labelled a statistical estimate with a 10–90 % range. The "check on the last 30 known days" compares
  the model with simply repeating the last value on one slice of history. It is **not accuracy**.
- Display-only: nothing is stored, and the result cannot create or change a case, assessment, proposal, task or alert.
- **Do not use TimesFM 3.0 weights.** Their licence allows only non-commercial, non-production use when self-hosted.

## How it is wired

Browser (signed-in operator, Flood tab button) → `POST /api/forecast` (session, role and Origin checked; 60–2048
numbers, horizon 1–64) → API `POST /v1/statistical-forecast` (bearer token and role checked again; refuses unless
`AEGIS_TIMESFM=1`; loads the model once; clamps output) → reply re-validated by the web server → chart.
The input series (last 400 days of modelled discharge) comes from Open-Meteo through the existing relay.

## Switching it on (local)

1. Once, on the host: `pip install huggingface_hub`, then `hf download google/timesfm-2.5-200m-pytorch` (883 MB).
2. Set `AEGIS_TIMESFM_CACHE` to the Hugging Face cache folder (the one that contains `hub`), which on Windows is
   normally the `.cache/huggingface` folder in your user profile.
3. Start with `scripts/start-windows.ps1 -PublicEarth -StatisticalForecast` (or add `-f compose.timesfm.yaml`).

Cost: the API image grows by about 1 GB (CPU-only PyTorch), its memory limit rises from 512 MB to 3 GB, the first
request takes up to a minute to load the model, and later ones take well under a second on a laptop CPU.

## Verified (Windows laptop, 10 November 2026)

- `tests/test_statistical_forecast.py`: 16 pass (off by default, sign-in and role, bounds, clamping, no write path).
- Live run signed in as a demo operator: status enabled, 30-day forecast returned for a Guwahati grid cell and drawn.
  On that one slice the model's average error was 2.7 m³/s against 3.9 for repeating the last value, but only 1 of
  30 days fell inside its 10–90 % range, so the range was far too narrow there.

## Back-test (12 November 2026)

See [STATISTICAL_FORECAST_BACKTEST.md](STATISTICAL_FORECAST_BACKTEST.md): 17 Indian river cells, 1,411 forecasts on
modelled discharge. Better than repeating the last value overall and in the wet seasons, worse in the dry seasons,
no better than the seasonal average beyond two weeks, and rising flood peaks forecast at about half their real
height. The chart therefore shows 14 days and states these limits. Rehearsal statistics, not accuracy.

## Not done

- No test on gauge observations and no comparison with GloFAS forecasts. Do that before anyone relies on it.
- Rainfall is accepted by the API but has no button yet. No covariates (forecast rain is not fed to the model).
