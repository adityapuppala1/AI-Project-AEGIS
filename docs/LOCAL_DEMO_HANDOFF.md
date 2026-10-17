# Current local synthetic demo handoff

Updated: 17 October 2026 (IST). Repository: `adityapuppala1/AI-Project-AEGIS`.
Branch: `feat/aegis-local-demo-continuation`; integration baseline `b71172c`.
Latest tested API source: `413dd9765c0a50781411457d66cc87fd2fd55daa`;
web follow-ups: `4ce96a2` strict task fields and `cb9650b` department control labels
(final label-only production rebuild is awaiting laptop confirmation).
Laptop: `C:\xampp\htdocs\AI-Project-AEGIS`; Linux mirror:
`/workspace/AI-Project-AEGIS`. No push, CI, main merge or destructive reset.

## Current implementation

The existing Next.js/FastAPI/PostgreSQL/PostGIS architecture is retained.
Accepted replay observations attach idempotently to synthetic case evidence and
chronology, preserving provenance/quality/timestamps. Drafts capture assessment,
playbook and citations. Signed agency/role checks and independent maker-checker
approval gate a private scripted task/acknowledgement receipt and audit.
Approved warning-preparation proposals also support private exercise CAP XML
downloads; see [CAP artifact scope](CAP_EXERCISE_DRAFTS.md). No message transport.
Public AgencySync/Audit360 screens remain separate seeded examples; use the
proposal's authenticated audit link for its actual rehearsal history.

## Verification and source

Previous verified laptop application source: `481a9f27cc599d007eee487425b4108027b46cdf`;
previous clean handoff commit `c57fd8850f3506b9a9174ac501fc1cddca56cb9a`.
New implementation: `b4f5f4b` adds non-root standalone web image;
`65167dddc535193bd7612a7e6f63cbe2f2e8763f` upgrades Tailwind/PostCSS integration
and preserves theme configuration, small rounding and focus utility semantics.
Final laptop frontend/container/browser acceptance passed on that application source;
a subsequent documentation-only commit records the results below.

| Gate | Executed evidence |
|---|---|
| Latest API/model | Windows: `python -m pytest -q` **254 passed, 6 skipped**; `python -m app.model_lab --check` PASS. Prior Linux CAP suite: 239 passed, 4 skipped. One upstream Starlette/httpx deprecation warning |
| Real database | Latest laptop run: **6 integration tests passed**, separate `aegis_verification_57878ac` DB, including concurrent checker/audit and task retry regressions |
| Latest frontend in Linux | `npm install --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm run build`: PASS on Tailwind 4.3.3; full `npm audit --json`: **zero vulnerabilities**, no suppression |
| Latest Windows dependency/type check | `npm.cmd ci --no-audit --no-fund` and `npm.cmd run typecheck`: PASS; `npm.cmd audit --json`: **zero vulnerabilities including development dependencies**, no suppression |
| Prior laptop browser/HTTP | 21 functional desktop/mobile/keyboard checks, zero sampled axe violations; five map failure/retry/worker/WebGL checks; HTTP routes, locked approvals, blocked live warning and independently recomputed public audit checksum passed |
| Replay | Laptop replay twice: 3 accepted/linked then 0; 5 unique quarantines; history retained |
| Backup recovery | Retained dump restored into separate `aegis_restore_fe36bd885d4542018ad7cf432563a4c5`; doctor/schema audit PASS |
| Bounded latency | Laptop `python scripts/benchmark-local.py --output .git/aegis-local-benchmark.json`: 100 measured requests, concurrency 4, zero errors, all declared p95 targets passed; not production capacity |
| Local IdP review | Two static tests passed on Windows/Linux; Compose and PowerShell syntax/default read-only helper passed; provider not activated |

Exact earlier commands, test DB/backup details and chronological results are
preserved in [verification history](LOCAL_DEMO_VERIFICATION_HISTORY.md).

## Completed, partial, pending and blocked

- **Completed:** observation-to-case evidence, assessment/cited drafts,
  authenticated independent-approval logic, approved-only scripted receipts,
  proposal audit and idempotency checks; actual laptop startup/integration,
  backup recovery, automated sampled browser/map QA and bounded latency.
- **Partial:** local identity-provider configuration is reviewable. See
  [LOCAL_IDP_REVIEW.md](LOCAL_IDP_REVIEW.md). Runtime realm import, HTTPS, PKCE,
  MFA, role claims and actual independent human rehearsal remain unverified.
- **Deferred by owner decision (keep inactive):** activating local IdP containers and adding
  their CA to Windows CurrentUser Root trust. No credentials or trust changes
  have been made. Do not paste secrets or tokens into chat.
- **Pending human acceptance:** two different people in separate browser profiles
  rehearse the maker/checker denial cases, approved simulation and private audit;
  manual screen-reader/operator review and owner release decision.
- **Completed:** final Windows frontend/container/browser regression on the
  Tailwind/standalone upgrade and full npm audit (including dev) with zero findings.
- **Out of scope:** live feeds, agency accreditation, validated forecasting,
  operational dispatch, real department sessions/SLAs and paid infrastructure.

## Resume safely

Inspect `git status`, branch/SHA and existing build processes first. Preserve
local work and import only verified local bundles. Current default startup:
`docker compose up --build -d`; API docs `http://localhost:8000/docs`, guided demo
`http://localhost:3000/demo`. Existing DB volumes must remain intact.

From `services/api`: `.venv/Scripts/python.exe -m pytest -q` and
`.venv/Scripts/python.exe -m app.model_lab --check`.
From `apps/web`: `npm.cmd ci --no-audit --no-fund`, `npm.cmd run typecheck`;
Compose web build runs the production build and copies pinned local map workers.
Then run `node .git/browser-qa/offline-map.cjs`,
`node .git/browser-qa/smoke.cjs` and
`services/api/.venv/Scripts/python.exe scripts/verify-local-http.py` at repo root.
Browser tooling is isolated under `.git/browser-qa`; it is not an app dependency.

## Docker builds behind a trusted HTTPS proxy

Use optional `compose.proxy-ca.yaml` only with an approved build-only CA bundle.
Never disable TLS verification or commit private credentials/certificates.
See [detailed proxy/build evidence](LOCAL_DEMO_VERIFICATION_HISTORY.md#docker-builds-behind-a-trusted-https-proxy).

## Final upgrade evidence — Windows laptop

Application source: `65167dddc535193bd7612a7e6f63cbe2f2e8763f`.
The helper `.git/verify-toolchain.ps1` waited for the earlier verification job
before fast-forwarding the verified bundle; it did not overlap builds or reset
any data. Actual commands/results:

| Command | Result |
|---|---|
| `npm.cmd ci --no-audit --no-fund`; `npm.cmd run typecheck` from apps/web | PASS, clean install of 112 packages; Recharts deprecation warning |
| `npm.cmd audit --json` | PASS, **0 total advisories**, including development dependencies |
| `docker compose up --build -d web` | PASS, native-dependency install, Next production build and existing-volume startup; benign Tailwind TS config module-type warning |
| `node .git/browser-qa/offline-map.cjs` | 5 checks PASS: failure warning, retained markers, failed retry, recovered fixture tiles, local worker and WebGL fallback |
| `node .git/browser-qa/smoke.cjs` | 21 functional checks PASS, zero page errors, zero axe violations on sampled light/dark pages |
| `node .git/browser-qa/registry.cjs` | 5 checks PASS: UUID search, empty/clear state, active filter, sort/filter preservation and reduced-motion scrolling |
| `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py` | PASS, public routes/checksum, locked anonymous approvals, blocked live warning |
| `docker compose exec -T web id` | `uid=1000(node) gid=1000(node)` |
| `docker compose exec -T web sh -c 'test ! -d node_modules/tailwindcss && test ! -d node_modules/braces'` | PASS; no complete development installation shipped |
| `services/api/.venv/Scripts/python.exe scripts/benchmark-local.py --output .git/toolchain-latency.json` | PASS: 100 requests, concurrency 4, zero errors, 5.89 seconds; p95 health 100.42 ms, registry 146.62, assessment 236.55, audit 374.18, demo 536.72; all declared local targets passed |

.git/browser-qa/visual-check.cjs also rendered the environment cards and captured
light/dark mobile screenshots; both were visually inspected after the upgrade.

Evidence artifacts: `.git/toolchain-{native.log,audit.json,build.log,browser.log,http.log,latency.json}`, `.git/toolchain-progress.txt`,
`.git/registry-verification.log` and `.git/browser-qa/*results.json`.
The 220-test API/model runs above are from this same continuation; the frontend
upgrade does not alter API/database behavior. The three opt-in DB tests were
skipped in that suite, with prior separate successful laptop PostGIS execution
preserved in history. No claim of real two-person approval, full accessibility
certification, container OS vulnerability certification or production capacity.

## Codebase scan follow-up

See [remaining original roadmap](CIPHERCOP_2026_RELEASE_AUDIT.md#remaining-from-the-broader-original-roadmap)
and the [manual rehearsal checklist](DEMO_REHEARSAL.md). The owner explicitly
chose to keep the IdP inactive; do not repeatedly request activation or modify
certificate trust. Native local verification now automatically uses the repo
Python venv when present (or an explicit -PythonExecutable), and npm.cmd on Windows.


## Audit consistency and original-plan scan — 17 October 2026

Latest tested application/verification source:
`a613a044f2aca3425a6f875c8810a7ad41aabbfa` (audit implementation `0b90289`).
Private proposal audit previously performed three READ COMMITTED reads; a
checker could commit between them, mixing an old submitted proposal with a new
approved decision/event. A deterministic two-connection PostGIS test reproduced
this failure before the fix. Export reads now use one **REPEATABLE READ, READ
ONLY** transaction; the same export stays submitted with no decision while the
concurrent checker commits, and a later export observes the complete approval.

Actual verification:
- Linux mirror: separate DB `aegis_verify_audit_20261017` created and populated
  from a non-destructive dump/restore of its existing synthetic DB. All **4 real
  PostGIS tests passed** with the changed source mounted read-only; original DB
  preserved. The initial regression failed as expected before the fix.
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all`
  passed **220 API tests, 4 integration skips**, model reproduction and frontend
  typecheck. It correctly selected `services/api/.venv/Scripts/python.exe`;
  production web rebuild intentionally skipped because no web source changed.
- Windows: `docker compose up --build -d api` passed; existing DB preserved.
- Windows: `docker compose run --rm --no-deps -T -v <repo>/services/api/integration_tests:/integration_tests:ro api sh -c 'export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verification_57878ac; python -m pytest -q -p no:cacheprovider /integration_tests'`
  passed all **4 real PostGIS integration tests** in the designated test DB.
- Windows: `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`
  passed module/page checks and independent public checksum; private auth still
  locked and live warning blocked. Logs: `.git/audit-snapshot-{native,build,http}.log`.
- One stale source-string assertion initially failed when the local helper began
  selecting executables; it was generalized to check the required commands and
  the full native suite reran successfully. CI policy and workflow unchanged.

The owner explicitly chose **keep IdP inactive**. No provider, root trust,
credentials, live connection, push, merge, CI or destructive reset was enabled.
The broader original roadmap remains partial; its current missing capabilities
are listed in the release audit, with a concrete manual rehearsal checklist.


## Approved-only CAP exercise draft — 17 October 2026

Implemented in `3b489bd`, anonymous smoke in `4e6d4cf`, five isolated proxy tests
in `9337c84`; latest API contract source `d3f1ed715fff7d01492b38220b1b903895b6ed2c`.
A signed-agency approved `prepare_warning` proposal with a recorded independent
checker decision and captured synthetic citations can download private CAP XML.
The artifact is `Draft`/`Private`, explicitly fictional/never-transmit, has
unknown urgency/severity/certainty, and contains no validated flood geometry.
No send capability, IdP activation, trust change, dependency or DB migration.
See [scope and validation](CAP_EXERCISE_DRAFTS.md).

Actual verification:
- Windows `scripts/verify-code-local.ps1 -Suite all`: **239 passed, 4 skipped**,
  model reproduction and frontend typecheck PASS. Initial full production web
  and API rebuild via `docker compose up --build -d api web`: PASS.
- Windows and Linux four real PostGIS tests: **4 passed**. Existing chain now
  includes denied premature export, separate TEST-key checker approval,
  same-agency XML reads, anonymous/cross-agency denials, stable bytes before/
  after task simulation, and unchanged decision/audit event counts after reads.
- Windows and Linux `cd apps/web; node --test scripts/tests/proposal-proxy.test.cjs`:
  **5 passed**. Test-only auth/fetch substitution never enables deployed sessions.
- XML fixture validated against the packaged CAP 1.2 XSD on Linux (lxml) and
  Windows (.NET), both with network/entity resolution disabled. Reference
  provenance/hash and limits are documented in CAP_EXERCISE_DRAFTS.md. The
  initial schema check caught UTC `Z` formatting; CAP offset form corrected it.
- Windows browser smoke: **21 passed**, zero page errors and sampled axe
  violations. No actual signed-in CAP download browser session was fabricated;
  real IdP/two-human acceptance remains deferred by owner decision.
- After OpenAPI XML declaration follow-up: native targeted CAP/workflow suite
  **30 passed**; API rebuilt and running `/openapi.json` advertises XML, not JSON,
  for successful CAP export. HTTP/checksum smoke reran successfully, including
  **503** for both anonymous API/BFF CAP paths and **403** for live warning.
- Linux latest API suite: **239 passed, 4 skipped**, model reproduction PASS.
  One upstream Starlette/httpx warning remains. A targeted Windows follow-up was
  initially invoked from the wrong working directory, then reran correctly from
  services/api and passed; no failed command is treated as acceptance evidence.

Laptop logs: `.git/cap-{native,build,browser,http}.log`, `.git/cap-progress.txt`,
`.git/cap-schema-result.txt`, `.git/cap-contract-{tests,build,http}.log` and
`.git/cap-contract-result.txt`. Four DB tests used only the designated laptop
`aegis_verification_57878ac` database. Existing app DB retained, no volume reset.


## Staged scripted task workflow — 17 October 2026

Implementation `413dd97`; strict proxy types `4ce96a2`; accessible task labels
`cb9650b38ceeed789ce83b41690905b071e90b90`. Approved proposals now prepare v2
receipts with three fictional tasks; an authorized signed-agency operator
records scripted acknowledgement and then closure with rationale. Proposal row
locks serialize JSON/audit writes. Retries are no-ops that retain the first
actor/reason, including acknowledgement retried after closure. Existing v1
completed receipts remain untouched; legacy simulate cannot skip v2 progress.
No real department session, SLA, message, new role, migration or IdP activation.

Actual Windows results on `413dd97`:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all`:
  **254 passed, 6 integration skips**, model reproduction and typecheck PASS.
- `cd apps/web; node --test scripts/tests/proposal-proxy.test.cjs`: **9 passed**.
- `docker compose up --build -d api web`: production builds/start PASS.
- `docker compose run --rm --no-deps -T -v <repo>/services/api/integration_tests:/integration_tests:ro api sh -c 'export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verification_57878ac; python -m pytest -q -p no:cacheprovider /integration_tests'`:
  **6 passed**. Includes signed TEST-key staged workflow/denials, CAP bytes
  unchanged as tasks advance, legacy JSON/audit preservation, and two real
  concurrent database writers producing one acknowledgement/audit event.
- `node .git/browser-qa/smoke.cjs`: **21 checks passed**, zero page errors and
  sampled axe violations. `python scripts/verify-local-http.py`: PASS, public
  checksum and locked private/live-warning boundaries preserved.

Core logs: `.git/staged-{native,proxy,build,browser,http}.log` and
`.git/staged-progress.txt`; helpers and logs stay under .git. Existing app DB
and designated verification DB retained. One upstream deprecation warning.
Strict proxy follow-up additionally rejects array/coerced operation/task IDs;
9 proxy tests, native typecheck, production web build and HTTP smoke reran.
Department-specific rationale labels and button accessible names are a separate
frontend follow-up; do not infer actual signed-in screen-reader acceptance.
See [task workflow and limits](STAGED_TASK_REHEARSAL.md).

Final label-only follow-up (`cb9650b`): the laptop build reached successful
compilation, type validity and page generation, but final build/HTTP completion
could not be confirmed. Desktop Commander read call
`39421fd6-a3d7-47f0-a5ed-e0bfbf6710c4` timed out without a device response.
Do not mark this final follow-up verified yet. Check
`.git/staged-labels-result.txt` and `.git/staged-labels-{tests,build,http}.log`
before rerunning anything; job PID 44204 may have completed in the background.
The preceding full implementation and strict-proxy checks above remain valid.
This documentation update is committed in the Linux mirror; laptop sync requires
confirmation of a clean tree and final job state. No remote push was performed.
