# Local synthetic demo handoff — 17 October 2026

Branch: `feat/aegis-local-demo-continuation`.
Baseline: `b71172cd93038148a2e9eafdc7bf91196f9eada1` (`feat/ciphercop-integrated-demo-rc`).
Implementation commit: `917d13ec55bbc01556b8ef97e9f6f46043982ddf`.
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

## Actual validation evidence

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
  full API/web Docker image builds and Compose service startup, keyboard/mobile/
  screen-reader/browser interaction QA, resource measurement and owner review.
  Host builds plus PostGIS containers do not prove full application-image builds.
- **Partial:** validated observations and incident evidence remain the existing
  synthetic replay and seeded case design; this change does not implement
  automatic observation-to-incident creation/correlation.
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
