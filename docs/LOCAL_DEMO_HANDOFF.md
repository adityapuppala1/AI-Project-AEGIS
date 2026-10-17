# Local synthetic demo handoff — 17 October 2026

Branch: `feat/aegis-local-demo-continuation`.
Baseline: `b71172cd93038148a2e9eafdc7bf91196f9eada1` (`feat/ciphercop-integrated-demo-rc`).
Previous implementation commit: `917d13ec55bbc01556b8ef97e9f6f46043982ddf`.
Latest continuation implementation: `aad50579f3fca54092668c076bda6caa67fbad7b`.
The latest checks ran against the implementation working tree committed at that SHA.
Checks below ran against the implementation working tree committed at that SHA.
A subsequent documentation-only commit records this SHA; no CI was triggered.

## Environment and preservation

Actual runner: Linux `/workspace/AI-Project-AEGIS`, not the Windows laptop at
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
- **Pending:** Windows laptop startup, its backed-up existing-volume upgrade,
  keyboard/mobile/screen-reader/browser interaction QA, laptop resource
  measurement and owner review. Full Docker verification in Linux is recorded
  in the latest continuation below; it does not establish Windows acceptance.
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
