# Local synthetic demo handoff — 17 October 2026

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
