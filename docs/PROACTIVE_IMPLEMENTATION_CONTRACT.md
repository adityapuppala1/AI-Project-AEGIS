# Proactive multi-hazard build — implementation contract

Companion to [PROACTIVE_MULTI_HAZARD_PLAN.md](PROACTIVE_MULTI_HAZARD_PLAN.md). This fixes the
API/web contract so backend and frontend can be built in parallel. Everything is **default off**:
the API routers return 404 unless `AEGIS_PROACTIVE=1` (same pattern as Earth Watch), enabled by
`compose.proactive.yaml` / `start-windows.ps1 -Proactive`.

## Rules that do not bend
- No send path. `authority_notification` cannot be enabled (API returns 409). CAP output is a
  download with `<status>Exercise</status>`; the exporter refuses any other status.
- Secrets are write-only. Responses carry `set: true/false` and an 8-hex SHA-256 fingerprint,
  never the value. Secrets are AES-256-GCM encrypted with `AEGIS_CONNECTOR_KEY` (base64, 32 bytes);
  without that key, saving a secret fails closed (`503 connector_key_missing`).
- Roles come only from the verified OIDC claim `aegis_roles`. New role: `platform_admin`.
  Connector configuration and tests require `platform_admin`. Watch refresh and runs require
  `incident_operator`. Watch read is public display-only when the feature is enabled.
- No automatic case, proposal, task or approval. A trigger candidate is information; a human
  links it to a case.
- LLM/Jev only selects among code-supplied options over cited evidence; it never writes facts.
- Synthetic/exercise labels everywhere; no accuracy claim.

## Connector registry (code-defined, `services/api/app/connectors.py`)
| id | category | fields (secret*) | settings | test |
|---|---|---|---|---|
| open_meteo | weather/flood | — | `models` (default `ecmwf_aifs025`), `points` (fixed Hyderabad grid) | GET forecast 1 point, 1 day |
| nasa_firms | fire | `map_key*` | `area` (fixed India bbox), `days` (1–3) | GET `/api/area/csv/{key}/VIIRS_SNPP_NRT/{bbox}/1` first 2 KB |
| nasa_lhasa | landslide | — | `base_url` (fixed) | HEAD/GET status, 64 KB cap |
| copernicus_cdse | satellite flood extent | `client_id*`, `client_secret*` | `collection` fixed `SENTINEL-1` | OAuth2 client-credentials token request only |
| imd_warnings | official warnings | — | `terms_accepted` (bool, default false), `base_url` fixed | blocked until `terms_accepted` |
| typesafe_jev | decision judgments | `api_key*` | `model` (`jev-latest`), `monthly_input_token_budget` | GET `https://api.typesafe.ai/v1/models` |
| cap_handover | hand-over | — | `mode` fixed `file_export` | validates exporter |
| authority_notification | hand-over | — | `enabled` fixed false | always 409 on enable |

Allowlisted hosts per connector are hard-coded; no redirects; 10 s socket / 25 s deadline;
response body capped at 64 KB in tests and never persisted.

## Database (`db/migrations/012_proactive.sql`, additive, idempotent)
- `connector_config(connector_id TEXT PK, enabled BOOL, settings JSONB, version INT, updated_at, updated_by)`
- `connector_secrets(connector_id, key_name, ciphertext BYTEA, nonce BYTEA, key_version INT, fingerprint TEXT, updated_at, updated_by, PRIMARY KEY(connector_id,key_name))`
- `connector_audit(id UUID, connector_id, action TEXT CHECK IN ('save','clear_secret','test','enable','disable'), ok BOOL, detail JSONB (never secrets), actor, at)`
- `hazard_evidence(id UUID, connector_id, hazard TEXT, observed_at TIMESTAMPTZ, lat, lon, value DOUBLE PRECISION, unit TEXT, payload JSONB, sha256 TEXT UNIQUE, retrieved_at, source_url TEXT)`
- `hazard_trigger_events(id UUID, trigger_id TEXT, config_version TEXT, hazard TEXT, state TEXT CHECK IN ('clear','watch','candidate'), fired_at, lat, lon, score DOUBLE PRECISION, evidence_ids UUID[], rationale JSONB)`
- `proactive_runs(id UUID, trigger_event_id UUID, state JSONB, created_by, created_at, updated_at)`
- `proactive_run_audit(id UUID, run_id UUID, step TEXT, actor, at, detail JSONB)`
Compose mounts 012 for both `db` init and `migrate`.

## API (`/v1/proactive/...`)
Connectors (platform_admin):
- `GET /connectors` → `{master_key_configured, connectors:[{id,name,category,licence,hosts,enabled,version,updated_at,updated_by,settings,fields:[{name,label,secret,required,set,fingerprint}],last_test:{at,ok,status_code,latency_ms,message}|null}]}`
- `PUT /connectors/{id}` body `{expected_version, enabled, settings, secrets:{name: value|null}}` → updated connector; 409 on version mismatch; 409 for `authority_notification.enabled=true`
- `POST /connectors/{id}/test` → `{ok,status_code,latency_ms,message,tested_at}` and audit row
- `GET /connectors/{id}/audit` → last 50 rows
Watch:
- `GET /watch` (public when enabled) → `{generated_at, config_version, disclaimer, evidence:[≤500 {id,connector_id,hazard,observed_at,lat,lon,value,unit,stale}], triggers:[{id,trigger_id,hazard,state,fired_at,lat,lon,score,threshold,evidence_ids,rationale}]}`
- `GET /watch/history?days=7` → trigger events by day and hazard
- `POST /watch/refresh` (incident_operator or platform_admin) → `{fetched:{connector: n|error_code}, evidence_added, triggers:{clear,watch,candidate}}`; failing connectors never raise
- `GET /triggers/config` → versioned threshold config (`app/fixtures/hazard_triggers.v1.json`)
Runs (incident_operator):
- `POST /runs` `{trigger_event_id}` → run; steps `gather_evidence → simulate_variants → judge → draft_cap → hand_to_human`
- `POST /runs/{id}/advance` `{expected_step}`; `POST /runs/{id}/cancel` `{rationale}`; `GET /runs/{id}`
- `GET /runs/{id}/cap.xml` → CAP 1.2, `status=Exercise`, sha256 header
- Run state: `{version:"aegis.proactive.run.v1", id, status: running|review_ready|cancelled, trigger_event_id, evidence_ids, variants:[{id,label,threshold_delta,resulting_state,score}], judgment:{provider:"typesafe_jev"|"test_double", model, playbook_option:{choice,confidence,probabilities}, citation_clean:{noul}, severity_band:{score,confidence,probabilities}, staleness_risk:{noul}, decision_band: recommended|needs_review|blocked}, cap:{sha256, generated_at}|null, completed_steps, next_step, needs_accountable_human_review:true, operational_actions_enabled:false}`
- Decision band policy (code): `recommended` if playbook confidence ≥0.9 and citation_clean ≥0.9 and staleness_risk <0.5; `blocked` if playbook confidence <0.5 or citation_clean <0.9; otherwise `needs_review`.

Replay CLI: `python -m app.proactive_replay --train` evaluates triggers on 2000–2017 pilot data only; `--final-test` requires `--i-understand-test-years-are-used-once` and writes a dated report; refuses to run twice.

## Web
- `Role` gains `platform_admin`; `apps/web/lib/proactive-proxy.ts` (BFF: session, same-origin on writes, role checks, payload validation, bearer server-side).
- Routes under `apps/web/app/api/proactive/`: `connectors`, `connectors/[id]`, `connectors/[id]/test`, `connectors/[id]/audit`, `watch`, `watch/history`, `watch/refresh`, `triggers/config`, `runs`, `runs/[id]`, `runs/[id]/advance`, `runs/[id]/cancel`, `runs/[id]/cap`.
- Pages: `/admin/connectors` (platform_admin; list, edit settings, set/clear secrets write-only, Test, Save with version, audit list, master-key status banner) and `/watch` (Hazard Watch: MapLibre 3D columns per trigger with heatmap of evidence, default 2D, pitch toggle respects reduced motion, HTML list fallback; click a trigger → **Live | Predicted** split panel; evidence drawer with cited UUIDs; trigger timeline; "Start bounded run" → step graph with motion; judgment card with probabilities and decision band; CAP preview + download; disclaimers). Nav entries and `t()` for main labels.
- Node tests for proxy validation; browser checks added to `scripts/browser/public-pages.cjs` later by the integrator.
