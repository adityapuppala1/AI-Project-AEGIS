# Local synthetic demo handoff — 17 October 2026

> Note (13 November 2026): on branch `Aegis_IndTrana` the product was renamed from AEGIS to IndTrana (see docs/BRANDING.md). The rounds below are historical and keep the name used at the time.

Branch: `feat/aegis-local-demo-continuation`.
Baseline: `b71172cd93038148a2e9eafdc7bf91196f9eada1` (`feat/ciphercop-integrated-demo-rc`).
Previous implementation commit: `917d13ec55bbc01556b8ef97e9f6f46043982ddf`.
Latest verified application source: `17334610ceb399496331b3635cbaad4cb6a93743`.
Earlier replay/Docker implementation: `aad50579f3fca54092668c076bda6caa67fbad7b`.
The latest checks ran against the implementation working tree committed at that SHA.
Checks below ran against the implementation working tree committed at that SHA.
A subsequent documentation-only commit records this SHA; no CI was triggered.

## Environment and preservation

Initial runner: Linux `/workspace/AI-Project-AEGIS`; later laptop verification is recorded below at
`C:\xampp\htdocs\AI-Project-AEGIS`. Initial branch `work`, SHA
`ff6e7242de286c7c26b7c4f613ee86dabe3fd8ac`, clean, README/LICENSE only.
Verified the authorized origin; fetched the specified baseline and created a
continuation branch. No existing work overwritten. No Actions, CI labels,
automatic reviews, deployment, pushes, main merge, or volume resets performed.

## Completed and verified

- Fixed fresh initialization ordering: uniform numeric SQL prefixes put base
  schema before governance migrations. Base schema now uses IF NOT EXISTS;
  migrate reapplies it before additive migrations, recovering incomplete
  initialization without deleting data.
- Fixed psycopg percent-placeholder errors in doctor fixture-count queries.
- Committed frontend lockfile, Docker `npm ci`, Next.js 15.5.28 patch upgrade.
- New drafts for the named demo agency preserve the existing assessment,
  uncertainty, playbook version and evidence/source UUIDs in proposal JSON.
- Existing independent approval gate remains enforced. An operator can then
  explicitly run `simulate` once: three fictional department tasks with
  scripted prepared/acknowledged/closed events and an audit event, committed
  transactionally under the proposal row lock. Retries return the same receipt.
- Private signed-agency proposal audit includes captured draft, decisions,
  actors and simulated receipt. Public AgencySync/Audit360 remain fixture-only.
- Approval workbench displays captured recommendations, simulation receipt,
  and private audit link. No fake login or real message transport added.

## Previous validation evidence (first continuation)

Executed in the Linux runner against working-tree implementation:

| Command / check | Result |
|---|---|
| `cd services/api; AEGIS_TEST_DATABASE_URL=<local-test-db> /workspace/scratch/aegis-venv/bin/python -m pytest -q` | **219 passed**, including real PostGIS integration test; one upstream Starlette/httpx deprecation warning |
| `python -m app.model_lab --check` (same venv) | PASS, committed report matches deterministic rebuild |
| `cd apps/web; npm ci --no-audit --no-fund; npm run typecheck` | PASS, clean locked installation |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | PASS, Next 15.5.28, including new private audit route |
| `docker compose config --quiet` | PASS |
| `docker compose -p aegis-verify-fresh up -d db migrate seed` | PASS, fresh PostGIS database, migrate and seed exit 0 |
| Same migrate/seed command rerun on populated test volume | PASS; appended source samples preserved (30), base fixtures retained |
| `DATABASE_URL=<local-test-db> python -m app.doctor` | ready, no missing relations/columns/fixtures |
| `DATABASE_URL=<local-test-db> python -m app.migration_audit` | ready, checker trigger, unique approvals and GIS constraints present |
| Host uvicorn API + Next production server | Started successfully on loopback 8000/3000 |
| `python scripts/verify-local-http.py` | 13 UI pages and public API module routes return 200; anonymous governance/private audit locked; public Audit360 checksum independently recomputed and matched |

The opt-in integration test is `services/api/integration_tests/test_local_demo.py`.
It appends labeled synthetic rows to the database explicitly selected through
`AEGIS_TEST_DATABASE_URL`; never point it at a real operational database. It
runs real ingestion replay twice and checks stable counts, refreshes three
fictional samples idempotently, creates a captured draft, rejects premature
simulation, self-approval, repeated review and cross-agency access, accepts an
independent TEST-key-signed checker, simulates twice with one receipt/audit
mutation, and reads private audit. Test JWKS keys are ephemeral and confined to
pytest; production authentication has no bypass. **This is automated integration
evidence, not real IdP/MFA or two-human browser acceptance.**

## Partial, pending and blocked

- **Blocked:** actual two-human browser approval needs an approved OIDC provider,
  registered client and separately provisioned operator/checker identities.
  No such credentials/configuration are attached. Do not paste secrets into chat.
- **Pending:** manual screen-reader/accessibility review, offline-map behavior,
  measured load/performance and owner review. Windows startup and a backed-up
  existing-volume upgrade have now passed; see the laptop evidence below.
  Automated browser verification is narrower than full manual acceptance.
- **Partial:** accepted replay events can now be explicitly associated with a
  selected existing synthetic case, with provenance and quality preserved.
  Automatic incident creation or inferred correlation remains out of scope.
- **Partial:** proposal tasks are a single scripted rehearsal receipt inside
  existing private proposal storage. They do not model independent department
  sessions, task SLAs, real acknowledgements or live dispatch.
- **Partial:** new evidence snapshots/simulation support the named synthetic
  demo agency. Other signed agencies retain existing proposals; legacy or
  uncited proposals cannot simulate and should be recreated for rehearsal.
- Public fixture audit intentionally excludes private decisions. For a complete
  proposal rehearsal, use its authenticated private audit link in `/approvals`.

## Resume on the laptop

Preserve `git status` and local work first. Transfer/review this branch without
merging main. Run the root README startup and `scripts/verify-windows.ps1`;
never delete the database volume. Run API tests/model check and
`npm ci --no-audit --no-fund`, typecheck and production build locally. Run the
opt-in integration test only against a dedicated synthetic test database.
With a configured trusted IdP, maker creates and submits a new draft; a different
checker reviews its captured citations and rationale; an operator runs the
scripted simulation and opens private audit JSON. Without IdP, demonstrate the
locked gate honestly and leave that acceptance item blocked.


## Latest continuation — case-linked replay and full Docker stack

The optional `app.replay --incident-id <UUID>` CLI adds accepted observations to
case evidence and chronology in the ingestion transaction. Same-ID conflicts,
invalid units and quarantined records never attach. Matching accepted duplicates
can attach to a case once; deterministic case/event UUIDs prevent duplicate rows.
A missing/wrong-scope case fails before ingestion. New evidence preserves source
quality, original times, source/event UUIDs and accepted payload checksum.
The selected association is not independent corroboration or inferred causality.
The updated `/demo` journey points to the same proposal's approval, scripted
receipt and private audit instead of substituting the seeded public boards.

Executed against the latest implementation working tree in this Linux runner:

| Command | Result |
|---|---|
| `cd services/api; AEGIS_TEST_DATABASE_URL=<dedicated-local-db> /workspace/scratch/aegis-venv/bin/python -m pytest -q` | **221 passed**: 218 unit/API tests and 3 real PostGIS integration tests; one upstream deprecation warning |
| `cd apps/web; npm run typecheck` | PASS |
| `AEGIS_BUILD_CA_FILE=/etc/ssl/certs/ca-certificates.crt docker compose -f compose.yaml -f compose.proxy-ca.yaml build api web` | PASS: both images built with TLS verification; Next.js production build succeeds in the web image |
| `docker compose up -d --no-build web` | PASS: db healthy, migrations/seeds exit 0, API and web running on loopback 8000/3000 |
| `docker compose exec -T api python -m app.doctor` | ready; 8 evidence records, 10 chronology events after linking, existing records retained |
| `docker compose exec -T api python -m app.migration_audit` | ready |
| `docker compose exec -T api python -m app.replay --incident-id 22222222-2222-4222-8222-222222222222` twice | First linked 3 previously accepted observations; second linked 0. Both: 0 new ledger events, 4 duplicates, 5 quarantined outcomes; no duplicate evidence |
| `docker compose exec -T api python -m app.model_lab --check` | PASS |
| `docker compose exec -T api sh -c 'test ! -e /run/secrets/proxy_ca'` (and same for web) | PASS: build CA absent from both runtime filesystems |
| `python scripts/verify-local-http.py` | PASS against full Compose stack: 13 UI pages, public API routes, locked private approvals, blocked live warnings and independently verified public audit checksum |

Integration tests now prove that accepted replay evidence IDs appear in the
captured proposal checklist, then follow independent TEST-key-signed review,
simulation and private audit. New accepted events, conflict rejection, preserved
unverified labels, idempotent attachment, unknown-case refusal and rollback of
ledger/sample/quarantine writes on attachment failure are exercised against
PostGIS. This still does not establish real IdP/MFA or two-human browser approval.

### Docker builds behind a trusted HTTPS proxy

Ordinary laptop builds still use `docker compose up --build -d` and system TLS
trust. Managed/corporate proxy builds can explicitly supply a trusted CA bundle:

```sh
AEGIS_BUILD_CA_FILE=/path/to/trusted-ca-bundle.pem docker compose -f compose.yaml -f compose.proxy-ca.yaml build api web
docker compose up -d --no-build
```

The optional override supplies a BuildKit secret to pip/npm dependency steps.
It never disables certificate verification, commits certificates, or copies the
bundle into an image layer. The runner used its public system CA bundle; no
proxy-specific settings were added to the default laptop Compose configuration.


One `docker stats --no-stream` snapshot immediately after smoke showed roughly
110 MiB web, 45 MiB API and 41 MiB database usage in this Linux runner. These are
idle observations, not load measurements or proof of 16 GB laptop performance.
Image sizes were about 1.11 GB web and 197 MB API; no size optimization or load
capacity claim is made. Existing database rows/volumes remain intact.


### Isolated fresh-stack acceptance

A separate full-stack project used the same built images, a new named volume,
and loopback ports 18000 (API) / 13000 (web). The temporary override at
`/workspace/scratch/aegis-smoke.yaml` selected the built `ai-project-aegis-api`
and `ai-project-aegis-web` images, replaced published ports, and set APP_ORIGIN
and CORS_ORIGIN to `http://localhost:13000`.

Executed:

```sh
docker compose -p aegis-compose-smoke -f compose.yaml -f /workspace/scratch/aegis-smoke.yaml up -d --no-build
python scripts/verify-local-http.py --api http://127.0.0.1:18000 --web http://127.0.0.1:13000
```

Both commands **passed**: fresh initialization, additive migrations and seeds
completed, API/web started, all HTTP smoke checks passed. Running the case-linked
replay twice inside this fresh API accepted/linked three observations on its
first run and accepted/linked zero on its second; quarantine remained bounded.

The first fresh-stack attempts hit **ENOSPC** on this runner's 32 GB filesystem
before PostgreSQL initialization completed. Recovery removed only newly created,
unused smoke API/web containers, superseded task-built image references and
reclaimable Docker build cache. Restarting the same failed new test volume then
succeeded. Existing databases and volumes were not deleted, cleared or reset.
The default full Compose application remained running throughout. This records
the observed disk limit rather than claiming effortless startup on every laptop.
After verification, the extra smoke project was stopped and its API/web
containers removed; its database volume was retained. The dedicated test DB
project was also stopped with its volume retained. The default Compose stack
is the active demo on loopback ports 3000/8000.


## Windows laptop verification — 17 October 2026

Device: `Adys_ROG`; actual directory `C:\xampp\htdocs\AI-Project-AEGIS`.
Verified authorized origin and a clean checkout at `b71172cd93038148a2e9eafdc7bf91196f9eada1`.
`git fetch origin` confirmed that baseline was still the latest remote candidate.
Imported a verified Git bundle of this chat's unpushed continuation and switched
the laptop to `feat/aegis-local-demo-continuation` at `57878ac3c310c72ee1ae299f8ddddf0fd52fc621`.
No local changes were overwritten. Origin/main and GitHub CI remain untouched.

Before updating the existing Compose stack, saved and verified a readable
PostgreSQL custom-format backup at:

`C:\xampp\htdocs\AI-Project-AEGIS\.git\local-backups\aegis-before-57878ac-b9b4bd4b-6621-4dbc-97be-70b3eb301e5d.dump`

Backup size: 57,409 bytes; `pg_restore --list` succeeded. This is a local backup,
not a tested disaster-recovery/restore certification. The existing volume was
preserved through rebuild, migration and seed reruns. A separate database,
`aegis_verification_57878ac`, was created inside local Postgres for integration
tests; it is retained and was never substituted for the app database.

Observed laptop tools: Python 3.14.7, Node 24.18.0, npm 11.16.0, Docker 29.8.2,
Compose 5.6.0. Application containers still use Python 3.12 and Node 22.
The laptop has roughly 31 GiB visible RAM; this is not a 16 GiB load test.

| Actual laptop command/check | Result |
|---|---|
| `services/api/.venv/Scripts/python.exe -m pip install -r requirements.txt` | PASS, isolated local venv |
| From `services/api`: `.venv/Scripts/python.exe -m pytest -q` | **218 passed, 3 integration tests explicitly skipped**, one upstream Starlette/httpx warning |
| `.venv/Scripts/python.exe -m app.model_lab --check` | PASS |
| From `apps/web`: `npm.cmd ci --no-audit --no-fund` | PASS; Recharts deprecation and npm sharp-script policy warnings, no global script approval enabled |
| `npm.cmd run typecheck` and `npm.cmd run build` | PASS on continuation SHA `57878ac` |
| `docker compose up --build -d` | PASS on existing laptop database; migrations/seeds exit 0, API/web start |
| `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/verify-windows.ps1` | PASS, including security schema, module APIs, pages, locked anonymous approvals and blocked live warning |
| `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py` | PASS, including independent public audit checksum verification |
| `docker compose exec -T api python -m app.doctor` and model report check | PASS |
| `docker compose run --rm --no-deps -T -v <integration-tests>:/integration_tests:ro api sh -c 'export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verification_57878ac; python -m pytest -q /integration_tests'` | **3 passed**, real PostGIS on the laptop; upstream warning plus harmless read-only pytest cache warning |
| `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/replay-windows.ps1 -IncidentId 22222222-2222-4222-8222-222222222222` twice | First accepted/linked 3; second accepted/linked 0. Ledger 3, quarantine 5, no duplicated evidence |
| `docker compose exec -T api python -m app.scenario_runner --confirm-synthetic --run-id 2b39aef6-1e60-45da-90ed-88db98c69461` | Appended 3 fictional samples, no deleted history; case reached `simulated_context_for_human_review`, probability null, live actions false |

### Browser findings and fix

Isolated headless Chrome on the laptop rendered 13 desktop routes and five
390px mobile routes, with no uncaught page errors or horizontal overflow;
keyboard Ctrl+K/Escape, guided next-stage navigation and locked anonymous
approval UI worked. External network requests were blocked in the test browser.
Temporary tooling and results are under `.git/browser-qa` (outside tracked app
source); no existing browser profile or signed-in user session was used.

Axe found serious **light-theme text contrast** failures on `/demo`, the sample
incident and `/approvals`. Source fix `4fb2578f1d5b99c3962ac7bc96622a483fe0d355`
darkens light-theme accent/muted text and amber warning labels while retaining
dark-theme overrides. The first fix cleared the navigation and incident-page failures. A remaining
approval notice measured 4.39:1 on its tinted background, below 4.5:1; follow-up
`17334610ceb399496331b3635cbaad4cb6a93743` darkens that notice further. Final
light/dark axe rerun **passed** with zero violations on the three audited
routes; post-fix HTTP/checksum smoke also passed. This is sampled automated
verification, not full manual accessibility certification.

Browser QA command: `node .git/browser-qa/smoke.cjs` using local Playwright and
axe-core installed only under `.git/browser-qa`. Screenshots/results are local
artifacts; full manual screen-reader, keyboard and field/operator testing remain
separate. Actual two-human OIDC/MFA approval remains blocked by absent trusted
provider configuration; no production auth bypass was added.


### Final Windows result

Final verified application source: `17334610ceb399496331b3635cbaad4cb6a93743`.
On this source the laptop ran a successful Docker web production rebuild and
container restart, then `node .git/browser-qa/smoke.cjs` and
`services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`, both exit 0.
Browser result: **21 functional checks**, zero uncaught page errors, zero mobile
horizontal-overflow failures, and **zero axe violations** for `/demo`, the sample
case and `/approvals` in both light and dark themes. This does not replace manual
assistive-technology testing or certify pages not audited by axe.

Local browser artifacts:
- `.git/browser-qa/results.json`
- `.git/browser-qa/demo-mobile.png`
- `.git/browser-qa/smoke.cjs`

Final idle/post-smoke Docker snapshot for AEGIS only: web about 132 MiB, API
51 MiB, Postgres 79 MiB. This is not a load benchmark or 16 GB capacity claim.
The working tree was clean before this evidence-only documentation update;
current branch remains `feat/aegis-local-demo-continuation`. No remote push,
Actions, CI label, automatic review, merge to main, paid deployment or database
reset occurred. The backup and isolated test database remain on the laptop.

The app remains running at `http://localhost:3000/demo`, API documentation at
`http://localhost:8000/docs`. To refresh the current/delayed/stale demonstration
later, use the documented confirmed synthetic scenario command; do not reset
the database. Actual two-human approval still requires approved OIDC provider
configuration and separately provisioned users. Signed TEST-key integration
tests do not clear that gate.

## Additional Windows gates — 17 October 2026

Branch remains `feat/aegis-local-demo-continuation`; starting source for this
round was `1547e5fed6f97e46bacf6303d2aab547f0ee4f25`. Local commits
`d5f8091` add map fallback and bounded latency verification, `254ccc4` patch
frontend production dependency advisories, and `0fda53d` prepare the opt-in
identity provider review package. No origin push or CI was triggered.

### Verified backup recovery and bounded latency

The retained pre-upgrade dump was restored with `pg_restore --exit-on-error
--no-owner --no-privileges` into **aegis_restore_fe36bd885d4542018ad7cf432563a4c5**.
`python -m app.doctor && python -m app.migration_audit` ran through the API image
with DATABASE_URL overridden to that separate database: PASS. Restored counts:
5 incidents, 24 samples, 5 evidence items, 7 timeline items, 7 tasks and 13 audit
events; security schema passed. The application's active database was preserved.
The backup, restored database and separate integration database remain available.

Actual laptop command:
`services/api/.venv/Scripts/python.exe scripts/benchmark-local.py --output .git/aegis-local-benchmark.json`
completed with exit 0: concurrency 4, 20 measured requests per route, one excluded
warm-up each, zero errors, all predefined local targets passed. P95 milliseconds:
health 140.84, incident registry 217.53, assessment 196.70, case audit 314.53,
guided demo 397.22. Total recorded duration 6.17 seconds. This measures local
software latency only; production capacity and forecasting accuracy are not
established.

### Dependency audit and identity review

Windows `npm.cmd run typecheck` passed after updating MapLibre to 6.14.0,
PostCSS to 8.5.30 and the sharp override to 0.35.5. MapLibre 6 requires named
module exports; both map imports were adapted. `npm.cmd audit --omit=dev`
reported **zero vulnerabilities**. Full `npm.cmd audit` still reports **7**
(5 high, 2 moderate), involving braces and postcss-selector-parser through the
Tailwind 3 development toolchain. These are pending remediation; the current
single-stage web image still contains build dependencies. The runtime audit
must not be represented as a complete image or dependency security clearance.

The owner requested a local-only identity setup **for review**. Configuration
and exact future commands are in [LOCAL_IDP_REVIEW.md](LOCAL_IDP_REVIEW.md).
Windows and Linux each ran both static IdP security-contract tests successfully;
Compose override syntax parsed on both. Windows PowerShell parsed the helper,
and its default read-only invocation passed. No credentials generated, provider
started, root certificate trusted or OIDC gate enabled. Actual provider realm
import, HTTPS trust, login/MFA and two different human operators remain pending.

### Remaining acceptance work

- Partial: local IdP configuration is reviewable; activation and CurrentUser
  certificate-trust change await the owner's decision, then real two-person MFA
  rehearsal and proposal-specific task/audit acceptance must run.
- Pending: development-toolchain advisories, manual screen-reader/operator
  accessibility rehearsal and owner release review.
- Verified scope remains local synthetic exercise only. No live emergency
  operations, paid infrastructure, destructive reset or main merge occurred.

### Map recovery follow-up

Application source `481a9f27cc599d007eee487425b4108027b46cdf` explicitly refreshes
failed raster tiles and recognizes successful tile events. On the preceding
iteration, Windows `node .git/browser-qa/offline-map.cjs` passed four checks:
visible tile failure with retained markers, failed retry retaining the warning,
successful transport-fixture recovery clearing it, and missing-WebGL fallback.
That run also exposed a worker-loading console error in MapLibre 6: its default
ESM worker URL cannot be inferred from Next's bundled chunk URL. The final
source copies the pinned package's worker/shared module/license into generated,
ignored public assets before dev/build and sets an explicit same-origin URL.
Windows prebuild and typecheck passed; the final production rebuild and worker-
aware browser/HTTP rerun are in progress and must not be called verified until
results are recorded below. Transport PNG fixtures are not geographic evidence.

Connector interruption: after starting the final Windows build/test sequence
(PowerShell PID 52108), Desktop Commander stopped returning laptop results.
The device list reported Online but a subsequent read was explicitly queued
(call fcedefa5-bd55-4858-92cc-92b1e89b18ae). Final worker-aware QA and latest
production rebuild outcomes are **unknown**, not failed or passed. Do not start
a duplicate build until the existing process/log is inspected on reconnection.
The four source changes for `481a9f2` were written to Windows before that build;
Windows HEAD was still `0fda53d`, with those known application changes uncommitted.
The current handoff/status documentation commits remain in the Linux checkout
until a verified bundle can be imported safely. Preserve laptop changes; compare
against the bundle's files before stashing only this agent's known changes and
fast-forwarding. Review configuration already exists on the laptop at `0fda53d`.
No identity activation or trust change was attempted during this interruption.

### Reconnection and final verified Windows result

The owner restarted the terminal-based Desktop Commander agent after its
transport reported fetch failures. Laptop access resumed. The existing build
log confirmed production image build/start completed; no duplicate build was
started. Saved `offline-map-results.json` showed **all five checks passed**:
visible tile failure with retained synthetic markers, disconnected retry keeping
the warning, successful fixture recovery clearing it, same-origin worker loaded
without worker/page errors, and missing-WebGL fallback. Application source is
`481a9f27cc599d007eee487425b4108027b46cdf`.

After reconnecting, `node .git/browser-qa/smoke.cjs` and
`services/api/.venv/Scripts/python.exe scripts/verify-local-http.py` both ran
again on the laptop and exited **0**. Browser result: 21 functional checks,
zero page errors and zero axe violations on the sampled light/dark routes.
HTTP result: all module/page reads and public audit checksum passed; unconfigured
protected approval endpoints remained 503 and live-warning writes remained 403.
API/web remained loopback-only; database healthy. This supersedes the interrupted
verification status above; real two-human OIDC/MFA and manual accessibility
acceptance still have not run.

The laptop's four pending application files were compared to the local Git
bundle: tracked differences empty, new worker helper blob hashes identical.
A scoped stash preserves those known agent changes before fast-forwarding the
bundle; no user work was discarded. The complete documentation update is a
follow-up commit to `65adbd0ce67990f1ae8983332a16fa6633e75a36` on the same
continuation branch. No push, CI, identity activation or trust change occurred.
