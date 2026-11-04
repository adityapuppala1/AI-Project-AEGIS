# Current local synthetic demo handoff

Updated: 18 October 2026 (IST). Repository: `adityapuppala1/AI-Project-AEGIS`.
Branch: `feat/aegis-local-demo-continuation`; integration baseline `b71172c`.
Latest continuation scripts: `e10ebeeb03a786953449998049c5072361b7d6d2`
(single-operation guard `c60f123`, redirected startup follow-up `e10ebee`).
API context-revalidation source: `3b85285b4badd7003a22058f27991356e1f70c02`.
Laptop import and runtime follow-up passed on `e10ebee`; native API/Node
verification on `c60f123` passed (API/web source unchanged in `e10ebee`).
Exact environment-specific results are recorded at the end. Prior model-preview source:
`258a1572b1dfad2ba727e0eadef24cb2049260a2`
(local review focus implementation `597a603`, route boundaries `258a157`).
Prior workbench source `0c7c788`; latency harness `79086bd`;
prior context-diagnostics source `eb4624e`;
prior review-brief source `6b2211c`;
context-panel source `061e35a`; prior staged-task source `413dd97`, proxy
follow-up `4ce96a2` and labels `cb9650b`. Exact acceptance is recorded below.
Laptop: `C:\xampp\htdocs\AI-Project-AEGIS`; Linux mirror:
`/workspace/AI-Project-AEGIS`. No push, CI, main merge or destructive reset.

## Sign-out did not end the provider SSO session — found and fixed, 4 November 2026 (Windows laptop)

Owner reported "sign out is not working" after a successful real sign-in (exercise-maker, password
changed, TOTP enrolled).

- **Reproduced with a throwaway test account**, not the owner's real one: created `ops-selfcheck2`
  (incident_operator role, self-generated one-time password, deleted afterward), drove it through a
  real browser with Chrome DevTools automation.
- **The sign-out button itself worked correctly:** `POST /api/auth/logout` returned 200, both AEGIS
  session cookies were cleared, the UI correctly showed "Operator sign in" again. That was never broken.
- **The actual gap:** `/api/auth/logout` only ever cleared AEGIS's own session cookie — it never told
  Keycloak to end its browser SSO session. So immediately after "signing out," clicking "Operator sign
  in" again silently re-authenticated with **no login prompt at all**, because Keycloak still saw an
  active session. Confirmed live: clicking sign-in after sign-out landed straight back on `/approvals`
  signed in, with no login form. From the owner's side this looks exactly like sign-out doing nothing.
- **Fix (`apps/web/lib/auth-server.ts`, `app/api/auth/logout/route.ts`, `components/operator-auth.tsx`,
  `ops/local-idp/realm.json`):** capture `end_session_endpoint` from OIDC discovery; the logout route
  now returns a `logoutUrl` built from it (`client_id` + `post_logout_redirect_uri`, no id_token needed
  to be stored anywhere — kept the existing minimal-token-footprint design); the client now navigates
  there instead of to `/` after the local cookies clear. Added `post.logout.redirect.uris` to the
  Keycloak client config (repo template) so the redirect target is accepted. Local sign-out stays the
  primary, always-successful step — ending the provider session is layered on top, fail-open if OIDC
  discovery is briefly unreachable (verified: a thrown discovery error still clears cookies and returns
  200 with no `logoutUrl`, never blocking local sign-out).
- **One known UX trade-off, by design:** since no `id_token_hint` is stored, Keycloak shows its own
  "Do you want to log out?" confirmation page before completing RP-initiated logout (its documented
  default when no hint is supplied). One extra click, but now explicit and correct instead of silently
  doing nothing. A fully silent one-click logout would need storing the ID token (its own cookie,
  within the ~4KB per-cookie limit the session cookie is already sized against) — not done, flagged for
  the owner to decide if wanted.
- **Verified end-to-end with a real browser, not just unit tests:** signed in as `ops-selfcheck2`,
  clicked "Sign out" → redirected to Keycloak's confirm-logout page → clicked "Logout" → landed back on
  `/` → clicked "Operator sign in" again → **a real username/password form appeared**, not a silent
  re-auth. Deleted the throwaway account afterward.
- **New test coverage:** `apps/web/scripts/tests/auth-logout-route.test.cjs` (5 cases: not-configured
  503, cross-origin 403, logoutUrl built correctly when discovery succeeds, cookies still clear when no
  `end_session_endpoint` is offered, cookies still clear when discovery throws). Full suite: 160 passed
  (was 155), `npm run typecheck` clean.
- **Owner's real accounts and sessions were not touched** by any of this diagnosis or fix — only the
  throwaway `ops-selfcheck`/`ops-selfcheck2` test accounts were created and deleted.

## Local IdP login bug found and fixed — 4 November 2026 (Windows laptop)

Owner reported "unable to login with any credentials" against the just-activated local IdP.

- **First attempt looked like a mix-up, not a bug:** Keycloak logs showed every failed attempt was for
  `aegis-local-bootstrap` (`error="user_not_found"` in realm `aegis-exercise`). That account only exists in
  Keycloak's internal `master` realm (the Keycloak admin console login), not in the AEGIS app realm.
  Confirmed via the admin API that `exercise-maker`/`exercise-checker`/`exercise-admin` all exist, enabled,
  with `requiredActions: [CONFIGURE_TOTP, UPDATE_PASSWORD]` as expected on first login. Explained the
  distinction and the correct accounts to the owner.
- **Real bug found on retry:** owner reported errors again. Container logs showed a live
  `java.lang.NullPointerException: ... OTPPolicy.getAlgorithm() is null` on every attempt, right at the
  required-actions step. `ops/local-idp/realm.json` had `otpPolicyType`/`otpPolicyDigits`/`otpPolicyPeriod`
  but was missing `otpPolicyAlgorithm`, which this Keycloak version needs populated (no safe default) for
  both the TOTP-enrollment page and — confirmed separately — for building the realm's admin REST
  representation at all (`GET /admin/realms/aegis-exercise` itself 500'd with the same NPE before the fix).
- **Fix:** added `otpPolicyAlgorithm: HmacSHA1` plus `otpPolicyInitialCounter`, `otpPolicyLookAheadWindow`,
  `otpPolicyCodeReusable`, `otpSupportedApplications` to `ops/local-idp/realm.json` (repo template) and to
  the already-rendered private copy (`%LOCALAPPDATA%\AEGIS\local-idp\realm.json`), preserving the three
  existing generated passwords so the owner's credentials file stayed valid — no need to regenerate secrets.
- **Applied without touching AEGIS data:** stopped `local-idp`, removed only the isolated
  `ai-project-aegis_local_idp_data` volume (Keycloak's own dev-mode store — confirmed separate from the
  AEGIS application database per this doc's own design; held nothing yet since no login had completed past
  required actions), restarted so `--import-realm` re-imported the corrected realm with the same users.
- **Verified the fix, not just the config:** `GET /admin/realms/aegis-exercise` now succeeds
  (`otpPolicyAlgorithm: HmacSHA1`). Beyond that, drove a real headless-browser login through the exact
  crashing page: created a throwaway admin-API test user (`ops-selfcheck`, a self-generated one-time
  password never reused, never the owner's real credentials), signed in via Chrome DevTools automation,
  reached the Mobile Authenticator Setup / QR code page with **no error** — the exact screen that
  previously crashed — then deleted the throwaway user and its temp password file.
- **Owner's three app accounts and passwords are untouched and still valid** — same `provider.env`, no
  regeneration needed. They can retry `exercise-maker`/`exercise-checker`/`exercise-admin` now.

## Local IdP activated for signed-in verification — 4 November 2026 (Windows laptop)

Owner explicitly approved (two separate confirmations: general activation, then the specific certificate
thumbprint before trusting it), superseding the 17 October "keep inactive" decision. Full detail in
`docs/LOCAL_IDP_REVIEW.md` (header + Validation status, both updated). Summary:

- Ran the documented activation sequence under `Invoke-AegisLocalOperation`: `prepare-local-idp.ps1
  -GenerateLocalSecrets` (private files outside the repo, nothing printed) → started `local-idp` +
  `local-idp-tls` → exported the root cert → **presented the exact thumbprint to the owner and got explicit
  approval before importing it** → imported via .NET `X509Store` (the `Import-Certificate` cmdlet's UI
  prompt is blocked in this non-interactive shell) → built the combined CA bundle preserving existing public
  roots → restarted `api`/`web` with the full overlay (base + proactive + scheduler + local-idp).
- **Verified live:** `Assert-AegisSingleRuntime -RequireRunning` passed throughout (no duplicate stack). OIDC
  discovery resolves over trusted HTTPS. `/api/auth/session` now reports `{"authenticated":false,
  "configured":true}` (previously locked/unconfigured). `/api/auth/login` redirects (307) to Keycloak's real
  authorization endpoint with PKCE S256, state and nonce.
- **Automated negative-path checks, all unauthenticated, all correct:** tampered callback state/code → 400;
  cross-origin write with no session → 401 (session check precedes Origin check, which is stricter); a
  forged bearer token on a protected route (`/api/proposals/{id}/audit`) → 401, identical to the no-token
  case, confirming the BFF never trusts a client-supplied Authorization header; the one genuinely public
  route (`/api/incidents/{id}/audit`, the documented Audit360 fixture export) correctly stayed public — an
  initial test against it looked like a gap but was the wrong endpoint for the check.
- **Not done — needs the owner in person, not an agent:** signing in as `exercise-maker`/`exercise-checker`/
  `exercise-admin` (password change + TOTP enrollment is a human/authenticator-app step), the actual
  maker→checker proposal rehearsal, and click-through of `/handover`, `/copilot`, `/learning`, `/drills`,
  the pause switch and per-agency run scope while signed in. Credentials are in
  `%LOCALAPPDATA%\AEGIS\local-idp\provider.env` on this machine only; not read or printed by the agent.
- IdP services remain running; stop with `docker compose --project-name ai-project-aegis --profile local-idp
  stop local-idp local-idp-tls` to return to the locked default gate without losing data (keeps named
  volumes, per the reversal section in `docs/LOCAL_IDP_REVIEW.md`).

## Runtime verification pass on the agentic roadmap — 4 November 2026 (Windows laptop)

Branch `feat/agentic-proactive-l3`, head `2e0ec5c` (commits `967024e`..`2e0ec5c`: per-agency proactive runs +
kill switch, scheduler + sentinel, impact triggers + exposure + GDACS/Google Flood adapters, handover brief +
read-only copilot, pre-positioning planner + run observability, post-event learning + drills + multilingual
CAP — the full roadmap feature set). This pass verifies all of it together against the real stack, which the
per-feature entries below could not do while code was still uncommitted.

- **Fixed:** `services/api/integration_tests/test_postgis_proactive.py` — the `database` fixture's test-connector
  marker `'it_' + uuid4().hex[:8]` almost always contains a digit, violating `connector_config`'s
  `^[a-z_]{3,40}$` check constraint; confirmed by a live failure, then changed to filter to alpha hex characters
  only. Pre-existing bug, not introduced by this branch's features; a 2-line test-only fix.
- **Migrations 013–016 applied to the real running database** (`ai-project-aegis` stack, existing `pgdata`
  volume, no reset) via the registered `migrate` service: `migration_audit` reports `status: ready`.
- **All 28 opt-in PostGIS integration tests pass** against a disposable verification database
  (`aegis_verification_agentic_l3`, same Postgres instance, created/migrated/seeded/dropped via
  `docker compose run --rm --no-deps`, never touching the demo database) — covers every new feature's real-DB
  path plus the pre-existing suites (public intake, assistance run, context revalidation, department tasks,
  saved focus, local demo chain).
- **`npm run build`** (standalone, not just the Docker image build): clean; all 7 new pages
  (`/learning`, `/drills`, `/handover`, `/copilot`, plus the earlier `/watch`, `/admin/connectors` additions)
  compile into the route manifest with no errors.
- **Browser pass** (Chrome DevTools, signed out — IdP stays off): `/learning`, `/drills`, `/handover`,
  `/copilot`, `/watch` all render correctly with no identity provider — honest "sign-in required" or a clear
  retry-able error, no broken layout, no stray console errors (one page's single console entry was the expected
  503 from its client-side data fetch; `/favicon.ico` 404 is unrelated/benign). Mobile width (390×844) on
  `/learning`: no horizontal scroll, nav collapses correctly. Light/dark and full click-through of signed-in
  flows still need the local IdP, which the owner has deferred.
- **Re-ran the full unit suite** after the test fix: `services/api/.venv` `pytest -q` — 770 passed, 25 skipped
  (one less skip than the 28 reported in step 6, because the opt-in PostGIS tests now have a usable fixture and
  are exercised separately above); `python -m app.model_lab --check` PASS; `npm run typecheck` clean;
  `node --test scripts/tests/*.test.cjs` 155 passed.
- **Committed and pushed:** `967024e`, `e4d3c13`, `b100783`, `05bef11`, `96462fb`, `2e0ec5c` — every roadmap
  commit from this session is now on `origin/feat/agentic-proactive-l3`.
- **Still pending, all owner-only:** Google Flood Forecasting waitlist key; GDACS terms confirmation; native
  Telugu/Hindi review of CAP + UI strings; naming threshold-proposal reviewers; the local IdP two-person
  approval rehearsal for every signed-in flow built this session (pause switch, per-agency runs, handover,
  copilot, planner, learning, drills).

## Proactive step 6 (A8 post-event learning, A9 drills, A10 multilingual CAP) - 4 November 2026 (Windows laptop, committed as 2e0ec5c)

Branch `feat/agentic-proactive-l3`, base SHA `96462fb`, now committed as `2e0ec5c` and pushed. Windows laptop,
local checks only at the time of this entry; migration 016 and runtime/browser checks are recorded in the
verification-pass entry above.

- Completed: migration 016 (learning windows, threshold proposals, trigger config versions, learning audit,
  exercise drills + audit) wired into compose initdb/migrate and `migration_audit`; `app/learning.py`,
  `app/learning_store.py`, `app/drills.py`, `app/cap_templates.py`; engine overlay `hazard_watch.effective_config()`;
  te-IN/hi-IN CAP blocks; `/learning` and `/drills` pages and BFF; tests and golden cases; docs.
- Results (verified, laptop): `services/api/.venv/Scripts/python -m pytest -q` 769 passed, 28 skipped;
  `python -m app.model_lab --check` PASS; `apps/web npm run typecheck` clean; `node --test scripts/tests/*.test.cjs` 155 passed.
- Pending: apply migration 016 to the running stack; opt-in PostGIS test `integration_tests/test_postgis_learning_drills.py`
  (not run); browser checks of `/learning`, `/drills` and CAP language pills; real IdP two-human approval (IdP is
  off, signed-in flows unit-tested only); native Telugu/Hindi review of the 25 CAP template rows; `npm run build`
  not run in this step.

## Proactive step 5 (A5 pre-positioning planner, run observability) — 4 November 2026 (Windows laptop, uncommitted)

Branch `feat/agentic-proactive-l3`, base `05bef11`. Roadmap A5 and the cross-cutting run-observability item.

- **Completed (code + unit gates):**
  - API:
    - `app/prepositioning.py`: a deterministic planner, with exact search up to `EXACT_BOUND=4096` and a greedy fallback (no OR-Tools).
    - `app/fixtures/synthetic_teams.v1.json`: synthetic teams.
    - `app/run_observability.py`.
    - `proactive_store.exposure_points`: a read-only query.
    - `proactive_run`: the new run step `plan_prepositioning`; new runs are v2 with 6 steps and budget 6, and legacy v1 runs keep 5 steps.
    - `proactive_scheduler.AUTO_STEPS`: now includes the plan step and still stops at `hand_to_human`.
    - Routes `GET /v1/proactive/runs/{id}/plan` and `/observability`.
    - Scheduler ticks now carry `duration_ms`.
  - Web:
    - BFF routes `run_plan` and `run_observability`, with cleaners in `lib/proactive.ts`.
    - `components/proactive-plan.tsx`: the plan panel plus a step graph with a table toggle.
    - A six-step stepper.
    - en/te/hi strings in `lib/translations-extra/plan.ts`.
    - A fix to a pre-existing defect: `cleanRun` dropped the API's `{step, ...}` completed-step objects.
  - Docs: `docs/PREPOSITIONING_PLANNER.md`, runbook section 11, roadmap status, and an AGENTS.md rule.
  - No migration. No new dependency.
- **Executed (Windows laptop):**
  - `services/api/.venv` `pytest -q`: 730 passed / 25 skipped (`tests/test_prepositioning.py` is new; golden cases extended).
  - `python -m app.model_lab --check`: PASS.
  - `npm run typecheck`: PASS.
  - `node --test scripts/tests/*.test.cjs`: 149 passed (5 new in `prepositioning-route.test.cjs`).
  - No Docker, build, dev server or external host was used.
- **Pending:**
  - Restart `api` and rebuild `web` under the operation lease, then run `npm run build`.
  - Browser check of the plan panel and the timeline, including reduced motion and te/hi.
  - Runtime check with migration 015 and the seed applied, so the plan is `planned` rather than `no_exposure`.
  - The opt-in PostGIS check of `exposure_points`.

## Proactive step 4 (A7 shift-handover brief, A6 read-only operator copilot) — 4 November 2026 (Windows laptop, uncommitted)

Branch `feat/agentic-proactive-l3`, base `b100783`. Roadmap section 2, items A7 and A6.

- **Completed (code + unit gates):**
  - API: `app/handover.py` (`GET /v1/exercise/handover?hours=1-72`) and `app/operator_copilot.py`
    (`POST /v1/copilot/ask`), both wired in `app/main.py`. Each is agency-scoped by the verified
    token, read-only and template-only.
  - The copilot uses 8 fixed intents (or abstains) and a 6-tool read-only registry. An optional
    local-model rephrase is validated against the cited UUIDs.
  - Web: BFF `lib/assist-proxy.ts` with routes `app/api/handover`, `app/api/copilot` (Origin-checked
    POST) and `lib/operator-assist.ts`. Pages `/handover` and `/copilot` have nav entries and en/te/hi
    labels (`lib/translations-extra/assist.ts`).
  - Docs: `docs/SHIFT_HANDOVER.md`, `docs/OPERATOR_COPILOT.md` and AGENTS.md rules.
  - No migration and no new Python or Node dependency.
- **Executed (Windows laptop):** `services/api/.venv` `pytest -q` 707 passed / 25 skipped (42 new in
  `tests/test_operator_copilot.py`). `python -m app.model_lab --check` PASS. `npm run typecheck` PASS.
  `node --test scripts/tests/*.test.cjs` 144 passed (6 new in `operator-assist.test.cjs`). No Docker,
  build, dev server or external host was used.
- **Pending:** restart `api` and rebuild `web` under the operation lease, `npm run build`, and a
  browser check of `/handover` and `/copilot` with a signed local operator. The handover approvals/SLA
  sections and copilot incident tools have been exercised only with doubles, not against PostgreSQL.

## Proactive step 3 (A3 impact triggers, A4 GDACS + Google Flood Forecasting) — 4 November 2026 (Windows laptop, uncommitted)

Branch `feat/agentic-proactive-l3`, base `e4d3c13`. Roadmap section 2, items A3 and A4.

- **Completed (code + unit gates):** migration `015_exposure.sql` (`exposure_features`; unique
  `exposure_features_provenance_idx`, GIST `exposure_features_geography_idx` registered in
  `migration_audit.EXPECTED_INDEXES`) wired into Compose init (`019-exposure.sql`) and the `migrate`
  chain; synthetic seed `db/seed_exposure.sql` (init `020-exposure-seed.sql`, `seed` chain).
  `app/impact.py` + `fixtures/impact_triggers.v2.json` (v1 hazard config unchanged), applied after
  every refresh, carried into the run evidence bundle, variants and Exercise CAP area/instruction;
  scheduler dedupe key includes impact version/status and cited exposure ids. Offline importer
  `app/exposure_import.py` (not run). Connectors `gdacs` and `google_flood_forecasting` with
  adapters, test procedures and `fixtures/feed_triggers.v1.json`; hand-authored offline fixtures in
  `services/api/tests/fixtures/`. Hazard Watch cards, trigger detail and run panel show exposure
  counts and the "impact-based (synthetic exposure)" label (en/te/hi); admin page lists both
  connectors. No new Python or Node dependency.
- **Executed (Windows laptop):** `services/api/.venv` `pytest -q` 665 passed / 25 skipped;
  `python -m app.model_lab --check` PASS; `npm run typecheck` PASS; `node --test scripts/tests/*.test.cjs`
  138 passed. No Docker, build, dev server or external host was used.
- **Pending:** apply 015 and the exposure seed to the existing volume without a reset
  (`docker compose run --rm migrate` then `docker compose run --rm seed`, under the operation lease),
  restart `api`, rebuild `web` for the UI changes, opt-in PostGIS `test_postgis_proactive.py`
  (now includes 015 and the seed), `npm run build`. Security preflight reports `not_ready` until
  015 is applied (one new index check).
- **Blocked on owner:** GDACS terms confirmation, Google Flood Forecasting waitlist key, choice of
  real OSM/WorldPop extracts, review of the synthetic impact thresholds.

## Proactive step 2 (A1 scheduler, A2 sentinel) — 4 November 2026 (Windows laptop, uncommitted)

Branch `feat/agentic-proactive-l3`, base `967024e`. Roadmap section 2, items A1 and A2.

- **Completed (code + unit gates):** migration `014_proactive_scheduler.sql` (`proactive_runs.dedupe_key`
  + partial unique index `proactive_runs_dedupe_idx`; append-only `proactive_scheduler_ticks`), wired
  into Compose init (`018-proactive-scheduler.sql`) and the `migrate` chain and into
  `migration_audit.EXPECTED_INDEXES`. `app/proactive_scheduler.py` (in-process loop, default off,
  overlay `compose.proactive-scheduler.yaml`, `start-windows.ps1 -ProactiveScheduler`, advisory lock
  per tick, pause skip, draft-only runs stopping before `hand_to_human`, `GET /v1/proactive/scheduler`
  + BFF `/api/proactive/scheduler`). `app/proactive_sentinel.py` (flags appended with audit after
  manual and scheduled refresh). `system:` subjects rejected by OIDC decode, governance maker/checker
  and the hand-off step. Hazard Watch scheduler strip, run-panel flags and resume of open runs, en/te/hi.
- **Executed (Windows laptop):** `services/api/.venv` `pytest -q` 611 passed / 24 skipped;
  `python -m app.model_lab --check` PASS; `npm run typecheck` PASS; `node --test scripts/tests/*.test.cjs`
  136 passed.
- **Pending:** apply 014 to the existing volume (`docker compose run --rm migrate`, no reset), runtime
  enable/verify per `docs/PROACTIVE_ADMIN_RUNBOOK.md` section 7, opt-in PostGIS
  `test_postgis_proactive.py` (now includes 014), `npm run build` under the operation lease. Security
  preflight reports `not_ready` until 014 is applied (two new index checks).

## Proactive cross-cutting step 1 — 4 November 2026 (Windows laptop, uncommitted)

Branch `feat/agentic-proactive-l3`, base `2337e78`. Roadmap section 3: run agency scope, kill
switch, agent golden cases.

- **Completed (code + unit gates):** migration `013_proactive_run_agency.sql` (nullable
  `proactive_runs.agency_id` + index; `proactive_pause` single row; append-only
  `proactive_pause_audit`), wired into Compose init and the `migrate` service and into
  `migration_audit.EXPECTED_INDEXES`. Runs are scoped by verified agency (404 across agencies,
  legacy NULL rows invisible). platform_admin kill switch (`GET/PUT /v1/proactive/pause`, BFF
  `/api/proactive/pause`) returns 409 `proactive_paused` for run start/advance and watch refresh.
  Admin panel on `/admin/connectors`, paused banner on `/watch`, en/te/hi strings.
- **Executed:** `services/api/.venv` `pytest -q` 570 passed / 23 skipped; `python -m app.model_lab
  --check` PASS; `npm run typecheck` PASS; `node --test scripts/tests/*.test.cjs` 134 passed.
- **Pending:** apply 013 to the running stack's existing volume (`docker compose run --rm migrate`,
  no reset), runtime check, opt-in PostGIS `test_postgis_proactive.py`, `npm run build` under the
  operation lease. Security preflight reports `not_ready` until 013 is applied (new index check).

## Security review, README and roadmap — 4 November 2026 (Windows laptop)

Branch `feat/aegis-local-demo-continuation`, base `1d2fa69`.

- **Completed:** read-only security review of auth/OIDC/session, workflow authz and maker-checker,
  public intake/Earth Watch, proactive connectors/runs, compose/CI, and BFF write-route Origin checks.
  No confirmed exploitable issue; no code changed. Open design question: proactive runs are not
  agency-scoped (shared-desk) — owner decision.
- **Executed:** `npm audit --omit=dev` 0 vulnerabilities; `pip-audit -r requirements.txt` none;
  `services/api/.venv` `pytest -q` 530 passed / 22 skipped (host Python 3.14 lacks `psycopg`; use
  the venv); `python -m app.model_lab --check` PASS; `npm run typecheck` PASS. `npm run build` not
  re-run (docs-only change).
- **Runtime:** `start-windows.ps1 -Proactive` → single-instance PASS; README screenshots captured from it.
- **Docs:** README overview, architecture, design rationale, install steps and screenshots
  (`docs/screenshots/`); [agentic roadmap](AGENTIC_PROACTIVE_ROADMAP.md) (proposal).
- **Pending:** dynamic VAPT against the running stack, responsive UI checks, HTML report.

## Latest continuation status

Latest laptop application checkpoint: `dae1a696f655b6c3f7a78aed9e513b1c30d0e12c`
(navigation drawer keyboard fix; see
[Navigation drawer keyboard and 200% zoom](#navigation-drawer-keyboard-and-200-zoom--laptop-acceptance-complete)).
It exists on the Windows laptop only; the Linux mirror has not received or run it.

Previous laptop and mirror application checkpoint:
`b31b6d1bbb26e151cfe7a4b9e40cf595b2f9f453`. The original complete guarded acceptance
run finished with exit 0 in 117.80 seconds. The local synthetic demonstration
now covers observation -> validation -> incident/evidence -> assessment ->
grounded evidence guidance and playbook-based response draft -> independent
approval policy -> department tasks/reassignment/acknowledgements -> audit.
Exactly one API, web and database service remained running and the laptop Git
tree was clean.

The signed department inbox and coordinator reassignment passed their complete
laptop gate at `d341c6ee23e3adbd0508277cea75f1f6eecfb466` (PID 1860, exit 0,
162.64 seconds). The grounded evidence guide then passed native, production,
database, real browser, HTTP/refusal/checksum and single-runtime checks at the
current application checkpoint. Exact results are recorded near the end.

IdP/trust activation stays deferred by the owner.

## Earth Watch E1/E2 — local implementation, 2 November 2026

Plan: [EARTH_WATCH_ENHANCEMENT_PLAN.md](EARTH_WATCH_ENHANCEMENT_PLAN.md).
Branch `feat/aegis-local-demo-continuation`, base commit `00e7220`. Committed locally on the Windows laptop
as `9d514c9` (API and database), `3063ab6` (web) and `9f176ae` (docs); **nothing is pushed**.

Implemented: opt-in, display-only USGS earthquake, NASA EONET and NASA GIBS
imagery adapters (`services/api/app/earth_watch.py`), strict web proxy
(`/api/earth-watch/[feed]`), the `/earth-watch` page (satellite imagery with UTC
date, hazard markers, per-feed freshness, five-minute visible-tab refresh with
countdown, "new since last refresh"), `compose.public-earth.yaml` and
`start-windows.ps1 -PublicEarth`. Default stack remains synthetic and the
public feeds return 503 until the override is used. Nothing is written to
PostgreSQL or reaches cases, approvals, tasks, warnings or CAP.

Executed on the Windows laptop under the shared operation lease:

| Gate | Result |
|---|---|
| `python -m pytest -q` (services/api) | 367 passed, 15 skipped (includes 18 new Earth Watch tests, mocked upstreams) |
| `python -m app.model_lab --check` | PASS |
| Web Node tests (all `scripts/tests/*.test.cjs`) | 77 passed, 0 failed (includes 11 new) |
| `npm.cmd run typecheck`, `npm.cmd run build` | PASS; `/earth-watch` and `/api/earth-watch/[feed]` built |
| Live HTTP through the web proxy with `-PublicEarth` | status 200; earthquakes 346 records, events 41, imagery 3 layers; unknown feed 404; live public-warning endpoint still 403 |
| Browser (Chrome DevTools, 1440 px) | page rendered with NASA imagery, markers, freshness chips and countdown; one cold-start imagery 502 was diagnosed as a transient first fetch and fixed with one server retry and client retry |

Later the same day on the laptop: 390 px layout had no horizontal overflow;
Lighthouse snapshot on mobile scored Accessibility 100, Best Practices 100,
SEO 100 (34 audits passed, 0 failed); with the API container stopped, a manual
refresh failed within about one second, kept the 10 existing reports and showed
"fetched 3m ago · refresh failed" (API restored with the guarded start script
afterwards). E3 added a Command Center "Public signals · reference only" strip
(`components/public-signals-strip.tsx`, rendered only when the opt-in profile is
enabled); web Node tests are now 78 passed and the production build passed.

Not yet run: keyboard-only pass, tile-blocked scenario, a manual sampled axe
pass (Lighthouse's accessibility audit is not the repo's axe gate), PostGIS
suites, the guarded full acceptance script, Linux mirror. Treat E1–E3 as
**implemented, partially verified** until those run. Upstream terms (USGS, NASA EONET, GIBS) must be re-checked before any
release review. Currently running stack uses `-PublicEarth`; restart without it
(`scripts/start-windows.ps1 -NoBuild`) to return to the default synthetic profile.

## Earth Watch E3–E8 — completed locally, 2 November 2026

Plan and effort: [EARTH_WATCH_ENHANCEMENT_PLAN.md](EARTH_WATCH_ENHANCEMENT_PLAN.md). Same branch and base commit
(`00e7220`); committed locally as `9d514c9`, `3063ab6` and `9f176ae` (the acceptance evidence below was
gathered on that tree; this section was written after, in a fourth docs commit). Nothing is pushed, and the Linux mirror has not received these commits.

Implemented, all opt-in or read-only and off in the base stack:
- **E3** Command Center "Public signals · reference only" strip (only when feeds are enabled), plus the live freshness
  countdown and "new since last refresh" markers on Earth Watch.
- **E4** "Public signals near this case" radar and table on the incident page (great-circle distance, 100/300/1000 km,
  display-only, never stored, labelled "Not evidence").
- **E6** `/response-teams` team availability board from the seeded fictional task table (3-slot capacity is a labelled
  synthetic planning parameter).
- **E7** "Download situation brief" (template-only Markdown from the case record and the existing cited readiness brief; excludes public data).
- **E5** opt-in quarantine-only public intake: migration `011`, `/v1/public-intake/*`, `/public-intake`,
  `compose.public-intake.yaml`, `start-windows.ps1 -PublicIntake`. Design, independent security review and accepted
  limits are in [PUBLIC_INTAKE_SECURITY.md](PUBLIC_INTAKE_SECURITY.md). Not approved for network exposure.
- **E8** stale-documentation corrections (see the plan status log) and regression guards that fail if either public
  feature is ever enabled in base Compose.

Executed on the Windows laptop under the shared operation lease:

| Gate | Result |
|---|---|
| `python -m pytest -q` (services/api) | 425 passed, 15 skipped (includes 35 intake tests, 18 Earth Watch tests, release-contract and default-off compose guards; storage and upstreams mocked) |
| `python -m app.model_lab --check` | PASS |
| Web Node tests (`scripts/tests/*.test.cjs`) | 95 passed, 0 failed |
| `npm.cmd run typecheck`, `npm.cmd run build` | PASS |
| Migration `011` on the existing database volume (no reset) | table, constraints and UPDATE-blocking trigger present; `UPDATE` rejected by the trigger; case and task tables unchanged (5 incidents, 7 tasks) |
| Live intake through the web proxy with both profiles | valid report 201 stored; identical report returns a generic duplicate receipt; phone number and `[at]/[dot]` email 422; out-of-range 422; wrong Origin 403; direct `text/plain` to the API 415; queue and status respond; my own test rows were deleted afterwards |
| Real browser UI (Chrome DevTools) | empty submit and contact-number input are caught client-side; a valid report shows the animated success check and appears in the queue labelled "Quarantined · not a case"; situation brief download built from the live case (8 sections, 5 evidence records, 6 timeline events, no public data) |
| Lighthouse mobile snapshot (390 px) | Accessibility, Best Practices and SEO all 100 on `/earth-watch`, `/public-intake` and `/response-teams`; zero horizontal overflow on those pages and the case page |
| **Default profile restart (no opt-ins)** | both status endpoints `enabled:false`; earth feed, intake queue, proxy POST and direct API POST all 503; live public-warning endpoint 403; Command Center shows no public strip; intake table 0 rows |

### Acceptance run for E3–E8 (same day, Windows laptop, shared operation lease)

| Gate | Result |
|---|---|
| `scripts/verify-windows.ps1` (read-only P0 smoke) | PASSED, exit 0, with the new features present: fixture counts, "No external ingestion route", "Live public warning blocked [403]", "Anonymous governance workflow stays locked [503]", all 13 page checks 200 |
| `.git/browser-qa/smoke.cjs` (21 functional desktop/mobile/keyboard checks + sampled axe, light and dark, on `/demo`, `/approvals` and the incident page that now carries the radar and brief button) | PASS, `errors: []`, `violations: []` |
| `scripts/browser/theme-system.cjs` (390 and 1440 px) | PASS |
| `.git/browser-qa/offline-map.cjs` (tile failure, retry, worker, missing WebGL) | PASS, 5 checks |
| `scripts/verify-local-http.py` | PASS, including all 503/403 refusals and the public audit checksum |
| **New** `scripts/browser/public-pages.cjs` | PASS, 7 checks: axe WCAG 2.1 AA (light and dark) with no overflow or page errors on `/earth-watch`, `/public-intake`, `/response-teams` at 390 and 1440 px; keyboard-only intake (empty submit blocked, visible focus on options, arrow-key selection, Enter submits; POST mocked); Earth Watch controls by keyboard; radar renders a mocked nearby quake (about 60 km north) in plot and table and the radius buttons filter; `prefers-reduced-motion: reduce` stops the radar sweep, radar ping and pulse dot while `no-preference` animates them |
| PostGIS integration suite, separate `aegis_verification_57878ac` database, ephemeral container with `db/` mounted read-only | **20 passed** (15 retained regression tests plus 5 new in `integration_tests/test_postgis_public_intake.py`: insert, duplicate, list and count; rows cannot be updated or promoted; database constraints hold without the API validator; no identity columns, no foreign keys, case and task counts unchanged; migration idempotent). The app database kept 0 intake rows and the verification database kept 0 leftover rows |
| `docker compose config --quiet` | PASS for the base file and for the base plus both overlays |

Still not run: the Linux mirror, the repo's `verify-visual-theme.ps1` wrapper (it rebuilds and restarts the stack with
`-LocalCopilot`, so its component scripts were run directly instead), manual screen-reader review, and everything in the
owner and human gates. Lighthouse accessibility scores and the intake behaviour above were observed in Chrome; none of
this establishes accessibility conformance or safety for real public use. E3–E8 are now **implemented and locally accepted
by the automated gates**; human acceptance remains pending.
The stack was left running with `-PublicEarth -PublicIntake` unless stated otherwise below.

## Completion-plan work done in parallel with the data download — 2 November 2026

Plan: [DELIVERY_COMPLETION_PLAN.md](DELIVERY_COMPLETION_PLAN.md). Real-data Phase 1 is **not finished**: the pilot
toolchain is committed (`1bacb98`) but Open-Meteo answered "The service is overloaded" (HTTP 503) on the first run, so
a patient background retry is in progress and **no real data had been downloaded when this was written**.

| Item | Result |
|---|---|
| Phase 2 protocol and code, registered **before any real data was read** (commit `ddcb7b6`, 2026-11-02 20:22 IST) | 48 research tests pass (25 pilot + 23 protocol, all synthetic); fixed split train 2000–2017 and test 2018–2025 evaluated once; baseline `rain_1d >= 64.5 mm` as a convention; stop rule under 5 test events; allowed and forbidden wording; amendments log. Built by an Opus agent, then independently re-run and reviewed here. Open decision noted: a catalogue row with two reviewers but `needs_second_person_review=true` is counted and reported as a flag inconsistency, not excluded |
| Attribution wording (licence register follow-up) | Earth Watch now serves the USGS credit, the NASA EONET credit and the fuller NASA GIBS acknowledgement, each with "No ... endorsement is implied"; covered by a new API test; API suite 426 passed, 20 skipped |
| `scripts/verify-demo-ready.ps1` (new, read-only preflight) | Run on the laptop: GO with 2 warnings (uncommitted changes at the time; public intake on). All core pages, health, readiness and the live-warning 403 passed; NASA GIBS, NASA EONET, USGS and one OSM tile were reachable from this network |
| `scripts/verify-backup-restore.ps1` (new, repeatable recovery drill) | RECOVERY DRILL PASSED: `pg_dump` of the running database, restore into a separate throwaway database, `doctor` and `migration_audit` pass on the copy, row counts equal (5 incidents, 5 sources, 7 tasks, 13 task events), only the throwaway database dropped; the application database was only read. Backup kept under `.git/backups/` (untracked) |
| `docs/DEMO_RUNBOOK.md` (new) | Profiles, T-3 days and T-1 hour checklists, route, failure table, safe answers; references the preflight and recovery scripts |

### Independent security review of Earth Watch and the resulting fixes (same day)

An Opus reviewer (read-only) found no critical issue. It found that goals "bounded time" and "isolation from other
endpoints" did not hold: a slow or failing upstream could tie up the shared API worker pool (a blocking per-feed lock,
no total deadline, no backoff, proxy environment variables honoured), the XML DOCTYPE guard could be bypassed with
UTF-16, and several fields were unbounded. All findings were fixed:

| Finding | Fix |
|---|---|
| Waiters queue behind a 20 s fetch; failures retried by every request | Non-blocking lock (answer from retained data or fail fast), 60 s failure backoff, retained data never older than 24 h |
| No total time limit (slow-drip upstream) | Streaming read with a 25 s overall deadline (`read1`) and 10 s per read |
| Proxy variables honoured | Opener built with `ProxyHandler({})`; direct connections only |
| XML guard bypass via UTF-16 | Only plain UTF-8 or ASCII accepted (no NULs, BOMs or other declared encodings) plus the DTD and entity rejection |
| Unbounded string fields, duplicate ids | Every string truncated at the API; duplicates removed at the API and the proxy; over-long links dropped, not cut |
| Prototype-style category keys (`__proto__`, `constructor`) | Own-key lookup in the UI and a category allowlist in the proxy |
| Duplicate imagery layer ids satisfied the layer count | Exact set comparison |

New tests prove each one with the hostile input (slow drip, proxy variable set, UTF-16 and NUL payloads, backoff,
in-flight lock, 24 h limit, prototype keys, duplicates). Results after the fixes: API 443 passed and 20 skipped, web 97
passed, model-lab check PASS, build PASS, browser script 8 checks PASS, 21-check smoke with axe PASS, theme gate PASS.

### Accessibility additions and a pre-existing defect found

- The Command Center telemetry chart now has a keyboard-operable data-table equivalent ("Show data table" / "Show chart").
- The new browser script axe-checks the Command Center itself in both themes, which the repo's smoke test did not.
  It found **two pre-existing light-theme contrast failures** in the incident status badges ("In progress" 3.9:1 and
  "New" 3.6:1) and one defect in the new table (a scrollable region with no keyboard focus). All three are fixed
  (darker badge text colours; the table container is focusable with a label).

### Real-data download status (written 20:45 IST)

All five Musi discharge files (Open-Meteo Flood API) are downloaded and recorded in the manifest. The nine rainfall
archive files are **not**: that endpoint kept answering HTTP 503 "service is overloaded"; the background job is still
retrying every five minutes. No data values have been analysed. The Phase 2 protocol was committed first.

Not done: completing the rainfall download, any real result, the expert review, the two-person rehearsal and the other
human and owner gates.

## Current closure and remaining work

| Status | Scope |
|---|---|
| Verified automated | Original synthetic observation/evidence/assessment/draft/approval-policy/task/audit chain; private CAP draft; recovery and anonymous/live-action boundaries |
| Verified on laptop | Saved review focus, bounded explicit-step assistance, source comparison, local dependency diagnostics, page-memory draft recovery and bounded warm HTTP latency |
| Verified on laptop | Synthetic department SLA v3: prior 321 API tests/model/type checks, production build/start, 13 PostGIS tests, HTTP, targeted v2/v3 browser fixtures and 21 browser smoke checks |
| Verified on laptop | Signed department inbox and auditable coordinator reassignment: native/proxy/build, 15 retained PostGIS tests, targeted mobile/desktop browser, 21 smoke/axe checks, HTTP/refusal/checksum and single-runtime inventory |
| Verified on laptop | Bounded free-form grounded evidence guide: deterministic cited answers/abstention, strict BFF, production builds, real 390/1440 browser checks and complete regression gate |
| Verified on laptop | Operations graphite visual system: cool white/graphite foundations, electric-blue controls, cyan data signals, compact decision deck, semantic chart/map tokens, AA contrast and real 390/1440 browser acceptance |
| Verified on laptop | Navigation drawer keyboard behavior and 640/720 px 200%-zoom reflow proxy across 14 routes; supports, but does not fill, manual A1/A2/A5 |
| Engineering closure | No remaining implementation item is required for the authorized local synthetic hackathon chain; further real-world capability depends on the human/external gates below |
| Verified bounded recovery | Opt-in same-tab reload/navigation recovery; cross-device/server backup and guaranteed browser-restart recovery are outside this slice |
| Deferred by owner | Local IdP/trust activation and real two-person MFA/browser approval acceptance; do not reactivate or bypass |
| Pending human acceptance | Manual screen-reader/operator rehearsal and owner release review |
| Needs external validation | Authorized historical datasets/domain evaluation before real forecast claims or operational integrations |

### Next execution order

1. Before each operation inspect laptop Git state and the single-runtime guard;
   use the shared lease for custom jobs and preserve local changes.
2. Keep owner-deferred identity and manual acceptance gates explicit. Automated
   fixtures cannot close these gates or establish real forecasting accuracy.
3. If the owner later activates the local IdP, execute the documented two-person
   PKCE/MFA rehearsal with separate identities. Do not activate trust silently.
4. Treat real feeds, forecasting, cross-device drafts and operational messaging
   as separately authorized future programs requiring data, domain and safety review.

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
| Latest API/model | Windows: `python -m pytest -q` **299 passed, 7 skipped**; `python -m app.model_lab --check` PASS. Prior Linux CAP suite: 239 passed, 4 skipped. One upstream Starlette/httpx deprecation warning |
| Real database | Latest laptop run: **7 integration tests passed**, separate `aegis_verification_57878ac` DB, including concurrent checker/audit and task retry regressions |
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
`powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1`; use
`-NoBuild` for existing images and `-LocalCopilot` to retain the optional model
profile. See [single-instance restrictions](SINGLE_INSTANCE_LOCAL_RUNTIME.md). API docs `http://localhost:8000/docs`, guided demo
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

See [remaining original roadmap](RELEASE_AUDIT.md#remaining-from-the-broader-original-roadmap)
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

## Next plan expansion — 17 October 2026

See [operator assistance and prediction roadmap](AI_ASSISTANCE_ROADMAP.md).
Planning is based on source `9c9b67c`; no AI model, agent worker or new forecast
was enabled. The outstanding laptop confirmation/documentation sync and deferred
human acceptance above remain open. Documentation saved in the Linux mirror;
no laptop sync or new runtime tests claimed. Branch unchanged.

## Laptop continuity closure — 17 October 2026

The previously pending `cb9650b` final label rebuild was confirmed on the laptop:
`.git/staged-labels-result.txt` reports typecheck, production web build and HTTP
PASS. Startup inspection found a clean continuation branch and running loopback
API/web plus healthy database. Documentation commits `9c9b67c` and `aee1c97`
were fast-forwarded locally together with context source `405c6dd`, then clock
semantics correction `061e35a`. No pull/push or remote branch change was needed.
This supersedes the historical connector-blocked status immediately above.

## Incident context extension — 17 October 2026

Source `061e35a103f2722d6ee07399ad37ed9cc34eb875` extends the incident panel
with freshness evaluation time/version, separate browser retrieval time, all
freshness counts, explicit unknowns and a next human-review step. See
[scope and clock semantics](INCIDENT_CONTEXT_PANEL.md). No generative model,
conflict detector, per-dependency diagnosis or live inference is claimed.

Executed on Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
scripts/verify-code-local.ps1 -Suite all`: **256 passed, 6 DB skips**, model
reproduction and native typecheck PASS. Nine proxy tests passed before the
clock-label follow-up; no proxy source changed. `docker compose up --build -d
api web`: production API/web rebuild PASS. Initial HTTP invocation used a
wrong Python path, corrected to `services/api/.venv/Scripts/python.exe`. The
first post-restart HTTP run then hit a connection closure; after confirming
startup, all routes/checksum/refusal checks passed. A browser assertion that
incorrectly expected an immutable scenario clock failed; the actual adapter
uses server evaluation time. Labels and the assertion were corrected; neither
failed command is acceptance evidence. Latest acceptance results follow below.

### Current acceptance / connector blocker

The final Windows HTTP smoke passed explicitly in process 88056 after startup;
production logs confirm API/web ready. Corrected-clock native/build logs are
`.git/context-clock-{native,build}.log`; initial API/proxy/browser evidence is
in `.git/context-{native,proxy,browser}.log`. Full initial browser smoke was
completed before the clock-label correction; do not claim that as final source
browser acceptance. The earlier six real PostGIS tests remain prior evidence.

Final remaining commands (not yet verified on `061e35a`):
- `node .git/browser-qa/smoke.cjs`
- `node .git/browser-qa/context-final.cjs` (mobile counts, timestamp semantics,
  failed refresh removes conclusion, retry recovery, no page errors)
- The six-test separate-DB command in the staged-workflow section above.

The prepared `.git/verify-context-acceptance.ps1` write request
`946e8a04-cfb0-4611-967e-f4512fb854d1` timed out without a device response;
its subsequent start request also timed out. Do not assume it ran, and do not
blindly rerun it: inspect the script, any running process and
`.git/context-clock-progress.txt` and
`.git/context-clock-{panel,browser,http-final}.log` first.
Source was synced through `061e35a` before the connector failed; this final
documentation commit is saved only in the Linux mirror pending safe sync.
No unverified test is marked passed and no reset or external action occurred.

## Resumed context acceptance — 17 October 2026

The connector recovered. Startup inspection found clean branch/source
`061e35a`, running API/web and healthy retained database; no old acceptance
script or test process was present. The missing script was written and run
once as process 102576. **All six real PostGIS tests passed**, the 21-check
browser smoke had zero page errors/sampled axe violations, and the targeted
context test passed mobile layout, all freshness labels, refresh-failure
removal of the old conclusion, recovery and advancing evaluation clock.
HTTP/checksum/refusal smoke also passed. Logs:
`.git/context-clock-{browser,panel,http-final}.log`;
`.git/context-clock-progress.txt` now records PASS. This supersedes the prior
connector blocker for context acceptance. No IdP/trust or live operation changed.
The previously unsynced documentation commit `7626e72` subsequently reached
the laptop in the local review-brief bundle; no GitHub push was performed.

## Cited deterministic review brief — 17 October 2026

Implementation `396d531`; malformed-collection UI guard `f06ab89`;
incident render wiring correction `6b2211c`.
[Brief scope](CITED_REVIEW_BRIEF.md) describes the template, original checked
UUID references, illustrative playbook options and retained limitations. New
demo-agency proposals capture the brief in the existing response snapshot;
the queue displays it without rewriting older proposals. No model calls, raw
source-instruction interpretation, new roles, automatic submission or actions.

Windows native `powershell -NoProfile -ExecutionPolicy Bypass -File
scripts/verify-code-local.ps1 -Suite all`: **259 passed, 6 DB skips**, model
reproduction and typecheck PASS. New tests cover exact citation sets, empty
context/abstention and malicious source text not changing template authority.
The real-DB chain additionally asserts the captured brief citations and flags.
Latest runtime results are recorded below after their commands complete.

The first targeted brief browser check on `f06ab89` failed because the
incident panel imported the component but did not render it. The API brief
and captured-proposal component were present. `6b2211c` adds the missing render
call. The failure is retained in `.git/brief-panel.log`; final frontend
acceptance must use the corrected source, not the earlier successful API tests.

### Final executed brief acceptance

On application source `6b2211ccfcdb0f2b6826dd516487e94d9aa1dc94`, Windows
`npm.cmd run typecheck` and the corrected production web rebuild passed.
The backend is unchanged from the **259-pass** native/API build above.
`node .git/browser-qa/review-brief.cjs` passed original evidence UUID display,
review options/limitations, narrow mobile layout and rejection of a malformed
brief without page errors. `node .git/browser-qa/smoke.cjs` passed with zero
page errors/sampled axe violations. HTTP routes, public audit checksum,
anonymous private-route refusal and blocked live warning passed.
The six-test real PostGIS command above passed **6 tests** (2.93 s), including
persisted brief citations, independent signed TEST-key decisions, CAP stability,
legacy receipts and concurrent retry regressions. Process 54072 exited 0.

Logs: `.git/brief-native.log`, `.git/brief-build.log`,
`.git/brief-render-{types,build,panel,browser,http}.log` and
`.git/brief-progress.txt` (PASS). Verification waited for loopback startup
before HTTP checks. Existing app/verification DBs and volumes retained.
One upstream Starlette/httpx warning remains. No proxy source changed; the
previous nine isolated proxy passes remain the relevant evidence.

Documentation-only checks: `git diff --check` and changed Markdown local-link
targets PASS. Final documentation is imported via a local Git bundle with
clean-tree/branch guards, and laptop/mirror HEAD/status checked afterward.
No GitHub push, CI, review automation, paid service, IdP activation, trust
change, real agency acknowledgement or live dispatch occurred.

Next pending engineering: source agreement/dependency diagnostics, model/provider
evaluation and a genuinely model-backed copilot, bounded durable agent runs,
validated forecasting research and measured responsiveness extensions. The
current brief is a deterministic fallback, not those completed capabilities.
Two-human IdP/MFA and manual accessibility/operator acceptance remain deferred
as previously recorded.

## Stage-specific assessment failures — 17 October 2026

Source `29138a3`; API/BFF/proposal refusal regressions `eb4624e`. The existing
context adapter identifies failures while reading case evidence, reading
geographic candidates or validating combined context. Existing endpoints
return safe 503 codes; BFF/client allowlist fixed guidance and suppress unknown
raw details. Normal context/snapshot fields, maker-checker and agency checks
are unchanged. See [diagnostic scope](CONTEXT_FAILURE_DIAGNOSTICS.md).

Source comparison remains not evaluated: the registry lacks comparable
measurement windows and sensor-group semantics, so no disagreement/forecast
was inferred from nearby raw values. No model, new service, migration, trust
change or IdP activation was introduced.

Executed on Windows `eb4624e`:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all`:
  **264 passed, 6 skipped**, model reproduction and TypeScript PASS.
- `cd apps/web; node --test scripts/tests/proposal-proxy.test.cjs scripts/tests/context-route.test.cjs`:
  **17 passed** (nine existing proposal tests plus eight context-route tests).
  Isolated fetch replacement never modifies deployed auth/fetch behavior.

Runtime build/browser/DB acceptance is recorded below after completion.

Final runtime acceptance on `eb4624e` passed:
- `docker compose up --build -d api web`: production API/web build/start PASS;
  loopback API/web readiness confirmed before browser/HTTP checks.
- `node .git/browser-qa/context-errors.cjs`: PASS three distinct stage messages,
  unknown-code sanitization, removal of old conclusions, healthy recovery,
  mobile overflow and zero page errors.
- `node .git/browser-qa/smoke.cjs`: browser smoke PASS, zero page errors and
  sampled axe violations; exact check count confirmed on final sync.
- `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: all
  routes/checksum, anonymous private-route refusal and live-warning block PASS.
- The separate-DB six-test Compose command in the staged workflow section:
  **6 passed** in 1.89 s; no app DB/volume reset. Signed TEST-key approvals,
  captured briefs, CAP stability and concurrent retry/audit checks remain valid.

Process 85556 completed exit 0. Logs:
`.git/context-errors-{native,node,build,panel,browser,http}.log`;
`.git/context-errors-progress.txt` reports PASS. One pre-existing upstream
Starlette/httpx deprecation warning remains. No Linux runtime tests were
claimed for this slice. Documentation `git diff --check` and changed Markdown
local target validation passed; final docs use a guarded local bundle sync.
No push, CI, external model/provider, trust change, IdP activation or live
operation. Remaining: comparable-source metadata/agreement rules, deeper
dependency diagnosis, model-backed copilot and durable runner, validated
prediction research, responsiveness extensions and deferred human acceptance.

## Unsaved workbench text and measured responsiveness — 17 October 2026

Sources `c22780a` / `0c7c788` add [bounded page-memory notes](UNSAVED_EXERCISE_DRAFTS.md).
The chosen incident/action is retained across failed workbench refreshes;
creation remains disabled until its authorized case list is loaded. Notes are
not browser-storage or server auto-saves. Session failures hide private text
and expose retry; identity/agency/access loss clears it. Successful saves clear
only that incident/action. Hard reload/page exit still destroys unsaved memory.

Actual Windows verification on final UI source `0c7c788`:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite web`:
  native TypeScript PASS. `docker compose up --build --no-deps -d web`: PASS.
- `cd apps/web; node --test scripts/tests/exercise-draft-buffer.test.cjs scripts/tests/proposal-proxy.test.cjs scripts/tests/context-route.test.cjs`:
  **23 passed** (six buffer + seventeen existing route/proxy regressions).
- `node .git/browser-qa/draft-scope.cjs`: PASS case/action isolation, failed
  refresh recovery, failed-save retention, successful-save clearing, session
  outage hiding/recovery, role-loss clearing, identity/agency clearing and
  anonymous lock. Browser-only fixtures; **zero real proposal writes** and no
  actual IdP/two-human acceptance claim.
- `node .git/browser-qa/smoke.cjs`: PASS, zero page errors/sampled axe violations.
  `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: PASS
  routes/checksum/private refusal/live-warning block.
- API/model/PostGIS source was unchanged: prior **264 native API tests and six
  real DB tests** remain relevant evidence; they were not rerun for a frontend
  buffer or host-only benchmark change. No dependency or migration changed.

### Latency failures, diagnosis and corrected method

Both original verification drivers exited 1 **only at the final v1 latency
check**, after their functional checks passed. Keep
`.git/draft-memory-benchmark.{json,log}` and
`.git/draft-scope-benchmark.{json,log}`. The first reported health p95 17,931.71
ms; the second health 304.81 ms and registry 992.38 ms exceeded their unchanged
250/750 ms targets. These are failed samples, not acceptance evidence.

Narrow probes then measured container-loopback health p95 **21.5 ms** (20
requests/four workers) and ten host curl requests **3.782–25.020 ms**. A five-
request Windows Python probe separately measured client construction
**21.63–27.73 ms**, before HTTP request time. The old benchmark rebuilt
`build_opener` inside each timed request, mixing client initialization with
service timing. This confounds interpretation; it does not prove the cause
of every initial outlier or establish an application speedup.

`79086bd` initializes one nonshared opener per worker outside request timing.
Report version is `aegis.local.http-latency.v2`; warm-up/client setup excluded,
new HTTP connections still included. Route thresholds were not changed.
`services/api/.venv/Scripts/python.exe -m py_compile scripts/benchmark-local.py`
and `services/api/.venv/Scripts/python.exe scripts/benchmark-local.py --output .git/draft-latency-v2.json`
passed on Windows (process 146032 exit 0). **100 requests, concurrency four,
zero errors, all local targets passed**:

| Route | Median ms | p95 ms | Target p95 ms |
|---|---:|---:|---:|
| Health | 5.99 | 52.22 | 250 |
| Incident registry | 45.70 | 98.26 | 750 |
| Assessment | 99.78 | 227.65 | 1000 |
| Case audit | 141.22 | 242.45 | 1500 |
| Guided demo | 195.44 | 262.21 | 2000 |

This closes the bounded warm HTTP measurement gate under the revised method,
not cold-start, sustained load, real operator latency or production capacity.
Do not directly compare v1/v2 as a software performance improvement. Further
manual/in-use acceptance and prediction/AI/agent work remain pending above.

Logs: `.git/draft-scope-{types,node,build,panel,browser,http}.log`,
`.git/draft-latency-v2.{json,log}`, `.git/draft-latency-internal.log`,
`.git/draft-latency-host-curl.log`; probe source stays under .git. The initial
driver progress files do not report all-PASS because their v1 latency failed.
Final documented acceptance combines the functional stages with the separate
v2 benchmark; no original failure is erased or relabeled as passing. Final
docs use a guarded local bundle transfer and clean HEAD/status confirmation.
No push, CI, IdP activation, trust changes, model service or live operations.

## Real local-model review focus — 17 October 2026

Source `597a603` / `258a157`. The existing incident panel now offers an on-
demand, read-only [local model selection preview](LOCAL_REVIEW_FOCUS.md).
The model returns only two bounded selectors; application code maps them
to existing cited finding/step text and retains limitations. No new facts,
free-form generated advice, proposal writes, approvals, forecasts or task
acknowledgements are produced. This is partial copilot work, not a durable
autonomous agent or completed grounding/forecasting programme.

The laptop already had Ollama 0.40.5 and tinyllama:1.1b (manifest hash recorded
in the scope document). No package/model download occurred. A new local
serving process was started with loopback-only binding and cloud disabled
(remote process 128584). Docker Desktop reachability to the loopback runtime
was confirmed. First default-GPU probe timed out after 30 seconds and is not
marked passed. CPU-only/four-thread probe completed in **1835 ms**, 29 output
tokens, valid JSON selectors. It is a small engineering probe, not selection
quality or flood accuracy evidence. No raw runtime environment log was shared.

Actual Windows acceptance on application `258a157` (process 72632 exit 0):
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all`:
  **280 passed, 6 skipped**, model reproduction and native TypeScript PASS.
- `cd apps/web; node --test scripts/tests/exercise-draft-buffer.test.cjs scripts/tests/proposal-proxy.test.cjs scripts/tests/context-route.test.cjs scripts/tests/review-focus-route.test.cjs`:
  **31 passed**. Model route rejects cross-origin requests, caller prompts/
  configuration, wrong-case/operational/cloud classifications and raw network
  errors. API tests cover selector validity, injected action/reference fields,
  boolean/float indexes, missing evidence, busy locking and fallback recovery.
- `docker compose -f compose.yaml -f compose.local-copilot.yaml config --quiet`:
  PASS; `docker compose up --build -d api web`: production API/web builds PASS.
  The base API's preview was explicitly verified as template fallback/disabled.
- `docker compose -f compose.yaml -f compose.local-copilot.yaml up --no-deps -d api`:
  optional local selection enabled after readiness passed. **This is the
  current laptop state**; plain base API startup disables it again. IdP stays
  inactive; model inference uses no hosted account or API key.
- `services/api/.venv/Scripts/python.exe .git/verify-local-model-live.py`:
  real local model API preview **3381.26 ms**, BFF preview **3232.15 ms**. Both
  returned model-assisted selectors mapped to the checked original references.
  Three health requests while the preview request was pending completed in
  **6.83 / 6.71 / 25.23 ms**. These limited observations are not a p95 capacity
  benchmark or proof of health latency throughout every inference phase.
  Active app proposal counts **0 before / 0 after**: no proposal writes.
- `node .git/browser-qa/local-copilot.cjs`: real model/browser selection and
  mobile layout PASS. Test-only busy fallback, unsafe classification and client
  cancellation cleared stale preview state; zero page errors. Cancellation
  stops the browser wait, not necessarily an existing model computation.
- `node .git/browser-qa/smoke.cjs`: public functional/browser/axe PASS, zero
  page errors and sampled violations. Exact count confirmed at final sync.
  `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: routes,
  audit checksum and existing private/live-action refusal checks PASS.
- The designated verification-DB Compose command in the staged task section:
  **6 PostGIS tests passed**, 2.86 s; independent signed TEST-key decisions,
  captured deterministic briefs, CAP stability and concurrent retries intact.
  Existing app and verification DBs/volumes retained.

Logs: `.git/copilot-{native,node,build,enable,live,panel,browser,http}.log`,
`.git/copilot-progress.txt` (PASS), `.git/local-model-cpu-probe.json`. Helpers
and runtime log remain under .git. One upstream Starlette/httpx warning.
No Linux runtime verification claimed for this slice. Markdown local targets
and `git diff --check` passed; final handoff uses a guarded bundle sync with
HEAD/clean-tree checks. No push, Actions, paid infrastructure, IdP activation,
Windows trust change, public warning or dispatch. No real human acceptance
or scientific model-selection/forecasting accuracy is inferred from these tests.

Remaining: semantic usefulness evaluation, free-form grounded Q&A/drafting,
captured/revalidated model-assisted proposal context, a durable bounded runner,
source comparison metadata/rules, deeper diagnostics, department-owned exercise
permissions/SLAs, forecasting research and the deferred human acceptance gates.


## Saved context revalidation — 17 October 2026

Source `3b85285b4badd7003a22058f27991356e1f70c02` on
`feat/aegis-local-demo-continuation`. See
[change detector scope and compatibility](PROPOSAL_CONTEXT_REVALIDATION.md).
New demo drafts capture checked-input fingerprints. Submit/approve refuse changed
evidence, readings, quality, thresholds, freshness class or checklist/playbook
versions. Successful transitions retain the fingerprint in audit; blocked
transitions leave status, decision and successful-event history unchanged.
Rejection remains possible during context outages. Existing approved receipts
are retained; older pending snapshots require a newly reviewed draft.

**Laptop gate blocked:** Desktop Commander `start_process` for read-only
status/branch/SHA/remote inspection timed out. Device listing reported Online
with last-seen age four minutes, which does not prove commands execute. No
laptop writes, import, build or tests were performed this pass. The earlier
laptop evidence above remains historical; this change is not claimed verified
on Windows. After the laptop-first attempt could not execute, development
checks continued in the Linux mirror only. Do not overwrite laptop work or
assume its tree still matches the last confirmed `cfb8029`. Reinspect before a
guarded bundle fast-forward and run its native/database/HTTP gates.

Actual Linux commands/results on the new source:

- From `services/api`: `/workspace/scratch/aegis-venv/bin/python -m pytest -q`:
  **299 passed, 7 skipped**, one pre-existing Starlette/httpx warning. The first
  collection failed because two new files shared a module basename; the
  integration file was renamed and the full suite rerun successfully.
- `/workspace/scratch/aegis-venv/bin/python -m app.model_lab --check`: PASS.
- `docker compose build api`: failed proxy certificate verification.
  `AEGIS_BUILD_CA_FILE=/etc/ssl/certs/ca-certificates.crt docker compose -f compose.yaml -f compose.proxy-ca.yaml build api`:
  PASS using the existing build-only CA option, TLS verification enabled.
- `docker compose run --rm --no-deps -T -v "$PWD/services/api/integration_tests:/integration_tests:ro" api sh -c 'export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verify_audit_20261017; python -m pytest -q -p no:cacheprovider /integration_tests'`:
  **7 real PostGIS tests passed**, 2.70 s. Changed inputs, atomic refusal,
  outage rollback, rejection and fresh-draft approval are exercised alongside
  the existing signed TEST-key/agency/independent-review/CAP/concurrency checks.
- `docker compose up --no-deps -d api`: updated mirror API only; retained DB.
  Initial HTTP probe raced startup and reset. After health returned 200, API
  routes passed; the old mirror web image returned 404 for the CAP BFF route.
  Rebuilding web from the current checkout is required; final result below.

Logs under `.git`: `revalidation-build.log`, `revalidation-build-ca.log`,
`revalidation-postgis.log`, `revalidation-http.log`, `revalidation-web-build.log`.
No laptop IdP/trust activation, push, Actions, paid deployment, reset or live
operation. The model preview remains separate from proposal persistence.

Still partial/pending: captured model-assisted context, durable bounded agent
runs, usefulness evaluation/free-form grounded assistance, source-comparison
semantics, department-owned permissions/SLAs and durable unsaved-note recovery.
Real forecasts require authorized historical data and domain evaluation. Human
OIDC/MFA, manual accessibility/operator acceptance and owner release remain
deferred/pending; none are closed by these engineering tests.

Final Linux runtime checks on `3b85285`:

- `AEGIS_BUILD_CA_FILE=/etc/ssl/certs/ca-certificates.crt docker compose -f compose.yaml -f compose.proxy-ca.yaml build web`:
  PASS, production compilation, type validation and static generation. Existing
  benign Tailwind TS module-type warning retained. No frontend source changed.
- `docker compose up --no-deps -d web`: PASS, current source replaces the stale
  mirror web image without touching the DB. After `/demo` readiness returned
  200, `/workspace/scratch/aegis-venv/bin/python scripts/verify-local-http.py`:
  PASS, including CAP BFF route, public checksum, private anonymous refusals and
  blocked live warning. Final log `.git/revalidation-http-final.log`. Initial
  startup-race/stale-image failures above are retained as failures.
- `git diff --check` and changed Markdown local-target validation: PASS.

The Linux mirror now runs the current API/web source with base-disabled local
model selection; laptop serving/profile state has not been changed or verified
this pass. A local bundle is prepared at
`/workspace/scratch/aegis-context-revalidation.bundle` from `cfb8029` for a
future guarded laptop transfer. This is not a push or proof of Windows sync.


## Single-instance restrictions and laptop reconnection — 17 October 2026

Branch `feat/aegis-local-demo-continuation`; guard source `c60f123`, startup
follow-up `e10ebeeb03a786953449998049c5072361b7d6d2`.
[Single-instance runbook](SINGLE_INSTANCE_LOCAL_RUNTIME.md). The previous
connector blockage is historical: a new clean-tree/branch/SHA guarded bundle
import succeeded. The initial Windows inventory and Linux inventory both had
one API, one web and one database, no confirmed AEGIS native server duplicates.
Other laptop projects were left running; no broad process/container kill was
performed. Completed migrate/seed containers were not mistaken for duplicates.

`compose.yaml` pins the existing `ai-project-aegis` name. Supplied Windows
startup/stop/verification/replay helpers now share an exclusive OS file-handle
lease. Competing managed jobs fail immediately; preflight rejects recognized
duplicate AEGIS services, other checkout/project ownership, active one-off jobs,
repo-owned native servers and conflicting port owners. Follow-up adds recognition
of leftover AEGIS Compose operations with explicit project arguments. Stop now
retains containers/volumes. Direct CLI commands can bypass these helpers; this
is a same-Windows-account workflow guard, not an OS-wide supervisor.

Actual laptop commands/evidence:

- All repository PowerShell scripts parsed successfully on Windows.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/test-local-runtime.ps1`:
  PASS on `c60f123`: real cross-process exclusion, exception release/reacquisition,
  healthy/duplicate/missing/project/checkout/one-off inventory cases.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-local-runtime.ps1 -RequireRunning`:
  PASS, exactly one API/web/DB and no detected conflicting managed job.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all`:
  **299 passed, 7 skipped**, model report reproduction and TypeScript PASS. One
  existing Starlette/httpx warning. Native API source is `3b85285`; guard `c60f123`.
- `cd apps/web; node --test scripts/tests/exercise-draft-buffer.test.cjs scripts/tests/proposal-proxy.test.cjs scripts/tests/context-route.test.cjs scripts/tests/review-focus-route.test.cjs`:
  **31 passed**. No frontend/API dependency change.
- One guarded `docker compose build api web`: both production images built.
- Initial driver `.git/verify-single-instance.ps1` (process 149780) exited 1
  at startup: PS 5.1 all-stream redirection treated Docker's normal
  `Container ai-project-aegis-web-1 Running` stderr as `NativeCommandError`.
  This was a failure, not a passed runtime gate. Native/Node/build stages above
  had completed; no PostGIS/browser/HTTP stage ran in that attempt.
- Inspected potential remaining Compose clients; by the follow-up check none
  remained, so no client/process termination was needed. `e10ebee` merges
  fixed-argument startup/stop progress stderr inside CMD, preserving native exit
  codes, and uses explicit canonical project arguments. Retry driver records
  remaining acceptance below. API/frontend code is unchanged by this follow-up.

Logs under `.git`: `single-instance-{lock,inventory,native,node,build,start}.log`;
initial progress file records completed stages. Retry logs use `-retry` suffix
for lock/inventory/start. No GitHub push/CI, destructive reset, IdP activation,
trust-store change, model download or real emergency action.


Final Windows follow-up on `e10ebeeb03a786953449998049c5072361b7d6d2`:

- `.git/resume-single-instance.ps1`: progress **PASS**. Guarded clean-tree/branch/
  SHA import, then one sequential verification batch. No duplicate batch started.
- `scripts/tests/test-local-runtime.ps1`: PASS, prior inventory/real cross-process
  lock cases plus recognition of an owned mutating Compose client, exclusion
  of unrelated projects and read-only inspection.
- `scripts/check-local-runtime.ps1 -RequireRunning`: PASS before retry.
  `scripts/start-windows.ps1 -NoBuild -LocalCopilot`: PASS under redirected
  logging; post-start inventory exactly one API/web/DB. Existing database
  container ID before/after matched; no volume/reset operation. Optional local
  model API profile retained, no model runtime started or inference claim.
- Loopback health and `/demo` readiness: PASS before HTTP checks.
- One leased command:
  `docker compose --project-name ai-project-aegis run --rm --no-deps -T -v "%CD%/services/api/integration_tests:/integration_tests:ro" api sh -c "export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verification_57878ac; python -m pytest -q -p no:cacheprovider /integration_tests"`:
  **7 PostGIS tests passed**, 2.23 s. Separate retained verification DB only;
  signed TEST-key authorization/independence, context-change refusal/rollback,
  CAP stability, audit consistency and task retry regressions. Not real human
  sign-in acceptance. Ephemeral pytest container removed normally.
- `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: PASS,
  public routes/checksum, private anonymous refusals and blocked live warning.
- `node .git/browser-qa/smoke.cjs`: PASS, desktop/mobile/keyboard/anonymous gate,
  zero page errors and sampled axe violations. No human accessibility claim.
- Final leased inventory: PASS, one API/web/database and no detected conflicting
  Compose client, native AEGIS server or one-off job. No confirmed duplicate
  required stopping; unrelated Docker projects/processes were preserved.

Runtime logs: `.git/single-instance-{lock,inventory,start}-retry.log`,
`.git/single-instance-{postgis,http,browser}.log`, progress **PASS**. The initial
process 149780 failure is retained above and not relabelled as success.
Stop/replay helpers were syntax-checked; they were not executed just to test
cleanup or write more fixture data. Guarded startup was tested against the
existing stack. No paid resource, push/CI, IdP/trust or live operation changed.

Documentation/Compose validation: Linux `docker compose config --quiet`,
`git diff --check` and changed Markdown local targets PASS. Final documentation
is transferred by a guarded local bundle and branch/SHA/clean-tree checks,
with Windows script parsing and runtime inventory checked again. Future agents
must follow the single-instance instructions in root AGENTS.md. Remaining
agent/copilot/forecasting and human acceptance gates above stay open.

## Saved review focus continuation — historical in-progress snapshot; later closed

Starting source `9423c22f81ab5267ba459be1e5a43cd747558af6`, branch
`feat/aegis-local-demo-continuation`. Laptop inventory process 133392 exited 0:
one API/web/DB, no detected conflicting managed job, clean expected branch/SHA.
Opt-in server-generated review focus is being attached atomically to new drafts
and their creation audits; see [scope](SAVED_REVIEW_FOCUS.md). Default creation
and public read-only preview remain unchanged. Verification pending; do not
mark this slice accepted until laptop tests/build/database checks run.

### Saved-focus verification and connection interruption

Application source: `6611465f67a5d1d8e2b467f6ea1b4bef8d44570c`.
Actual laptop guarded import process 46360 exited 0 at `afd443f`, with clean
expected branch and exactly one API/web/database. The subsequent driver write
(call `502a1526-323a-44cd-a7c5-1fd802a2bcef`) failed with no-device-response
timeout; its start request also timed out. A read of its progress file (call
`38fdff8b-5a63-4e1a-97c6-1ab8b27bcb3e`) likewise timed out. No Windows test,
build, runtime replacement or final source sync is confirmed for this slice.
Inspect pending/finished processes and `.git/saved-focus-progress.txt` before
starting another batch. Do not rebuild the laptop's `afd443f` source: import
corrected source first. Previous runtime acceptance is historical.

After the laptop-first attempt failed, actual Linux checks:

- From `services/api`, `/workspace/scratch/aegis-venv/bin/python -m pytest -q`:
  initial source `afd443f` had **4 failures**, caused by a creation-only option
  accidentally referenced in the transition handler. Fixed in `6611465`;
  rerun **300 passed, 10 skipped**, one existing Starlette/httpx warning.
  A retry from repository root failed collection (`app` not importable);
  the passing rerun used the documented API working directory.
- From `apps/web`, `npm run typecheck` and
  `node --test scripts/tests/exercise-draft-buffer.test.cjs scripts/tests/proposal-proxy.test.cjs scripts/tests/context-route.test.cjs scripts/tests/review-focus-route.test.cjs`:
  PASS, **32 Node tests**. Strict boolean opt-in and forged-content refusal
  are covered; signed sessions remain test-loader-only fixtures.
- `AEGIS_BUILD_CA_FILE=/etc/ssl/certs/ca-certificates.crt docker compose -f compose.yaml -f compose.proxy-ca.yaml build api web`:
  API image passed. Web compilation/typecheck/static generation passed, but
  final image packaging failed **no space left on device**. Not a passed build.
  `docker builder prune --force --keep-storage 512MB` removed unused build
  cache only (1.312 GB reported, free filesystem space rose to 3.8 GB).
  No database volume, container or source reset. Web build retry is separate.

The prepared corrective bundle `/workspace/scratch/aegis-saved-focus-fix.bundle`
was verified locally; it requires laptop `afd443f`. Transfer/import is pending,
not a push. Latest docs will be included in a final local bundle. No IdP/trust,
model runtime, real warning/dispatch, paid service, GitHub Actions or main merge.

Final Linux acceptance on application `6611465`:

- `AEGIS_BUILD_CA_FILE=/etc/ssl/certs/ca-certificates.crt docker compose -f compose.yaml -f compose.proxy-ca.yaml build web` retry:
  PASS including production image packaging; no TLS bypass. Existing benign
  Tailwind module-type warning remains. Log `.git/saved-focus-linux-build-retry.log`.
- `docker compose run --rm --no-deps -T -v "$PWD/services/api/integration_tests:/integration_tests:ro" api sh -c 'export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verify_audit_20261017; python -m pytest -q -p no:cacheprovider /integration_tests'`:
  **10 passed, 3.71 s**, one existing warning. Includes captured selector and
  disabled fallback preservation, attribution, independent-review/self-review
  policy, changed-input refusal with no draft/audit insert, and prior real DB
  regression cases. New cases are append-only labelled synthetic fixtures.
  The selector is stubbed in the persistence test; no new real-inference claim.
- `docker compose up --no-deps -d api web`: PASS, replaces existing mirror
  services only. `/workspace/scratch/aegis-venv/bin/python scripts/verify-local-http.py`:
  PASS, public routes/checksum and private/live-action refusals. Logs
  `.git/saved-focus-linux-postgis.log`, `.git/saved-focus-linux-http.log`.
- `docker compose ps --services --status running`: api/db/web, one each.
  No new service or second stack. `git diff --check`: PASS.

Completed: implementation and Linux automated acceptance of captured selections.
Partial: broader grounded copilot (selection only, no free-form advice).
Pending: targeted signed-in browser fixture interaction for the new checkbox
and captured panel, durable runs/retries/cancel, semantic usefulness evaluation,
source comparison, department permissions, durable note recovery, human review.
Blocked: laptop corrective sync/build/tests due connector response failures.
Deferred by owner: IdP/CA trust activation and real two-person sign-in. Forecasting
requires authorized real data and domain evaluation. Do not describe this slice
or its test counts as completion of the whole assistance roadmap.

## Windows saved-focus acceptance recovery — 17 October 2026

Checkout `5c9bc0e758df7b0c9626ddc46667c47375747525`, application source
`6611465f67a5d1d8e2b467f6ea1b4bef8d44570c`, branch
`feat/aegis-local-demo-continuation`. Reconnected read-only inspection and
corrective local-bundle fast-forward succeeded (PIDs 93728 / 115588, exit 0).
No local edits were overwritten. No duplicate AEGIS service or conflicting job
was detected; unrelated projects were preserved. The prior connection blocker
and initial regression remain recorded above as historical failures.

Driver `.git/verify-saved-focus-resume.ps1` runs sequentially with shared leases:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all`:
  **300 passed, 10 skipped**, synthetic model reproduction and TypeScript PASS;
  one existing Starlette/httpx warning. Database tests run separately below.
- From `apps/web`,
  `node --test scripts/tests/exercise-draft-buffer.test.cjs scripts/tests/proposal-proxy.test.cjs scripts/tests/context-route.test.cjs scripts/tests/review-focus-route.test.cjs`:
  **32 passed**.
- `docker compose --project-name ai-project-aegis build api web`: production
  API/web images PASS, including compilation/types/static generation. Existing
  benign Tailwind module-type warning retained. No package/model download added.

Runtime/database/browser stages follow; only executed results are recorded.

Windows runtime batch completed: PID 55660 exit **0**, 303.74 seconds.

- `scripts/start-windows.ps1 -NoBuild -LocalCopilot`: PASS. Existing database
  retained; idempotent migrate/seed exited normally. One API/web/DB afterward.
  Optional local-model API configuration retained; no model runtime started.
- Leased command:
  `docker compose --project-name ai-project-aegis run --rm --no-deps -T -v "%CD%/services/api/integration_tests:/integration_tests:ro" api sh -c "export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/aegis_verification_57878ac; python -m pytest -q -p no:cacheprovider /integration_tests"`:
  **10 passed, 4.07 s**. Retained separate verification DB, appended labelled
  synthetic cases; no reset. Selection persistence tests use deterministic
  selectors, not a new real-model inference/quality measurement.
- `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: PASS,
  including public routes/audit checksum, private refusals and blocked live action.
- `node .git/browser-qa/smoke.cjs`: PASS desktop/mobile/keyboard/anonymous checks,
  zero page errors and sampled axe violations. Final runtime inventory PASS,
  exactly one API/web/DB and no conflicting AEGIS job/native server detected.

Logs: `.git/saved-focus-{native,node,build,start,postgis,http,browser}.log`;
`.git/saved-focus-progress.txt` records the batch stages. No CI/push/merge,
IdP/trust activation, paid resource, broad process kill or real operation.

Targeted laptop browser fixture: PID 143308 exit **0**, 11.12 seconds.
`node .git/browser-qa/saved-focus.cjs` under the shared lease passed mobile
opt-in/reset, changed-context failed-save retention, successful-save clearing,
saved model/fallback labels and citations, checker read-only creation controls,
audit link and horizontal-overflow checks. Zero page errors and zero real
proposal writes. Identity/model responses were intercepted only in that test
browser; no deployed auth bypass or actual two-human acceptance is implied.
Log `.git/saved-focus-panel.log`. Final inventory and clean expected source
checks passed. Final docs are synced via a guarded local bundle.

Current remaining work: free-form grounded assistance and usefulness evaluation,
department permissions/SLAs, durable note recovery and human acceptance.
Saved-selection capture and its laptop automated acceptance are now closed.
IdP activation and trust remain deferred by owner; no forecast validation claim.

## Bounded assistance run — historical implementation snapshot; later closed

Starting branch/source `feat/aegis-local-demo-continuation` / `06527e5` was
clean in both checkouts. Laptop inventory PID 113888 exited 0 with exactly one
API/web/DB and no conflicting AEGIS job. The existing architecture is retained.

The next slice adds a proposal-linked, maker-only, draft-only three-step state
machine; see [contract](BOUNDED_ASSISTANCE_RUN.md). It persists one explicit
step per request under the proposal row lock, revalidates before progress, handles
same-step retries idempotently, supports audited cancellation and stops at
human review. No background service, schema migration, automatic submission,
approval, task acknowledgement, model claim or live action.

Initial Linux implementation checks:

- From `services/api`, `/workspace/scratch/aegis-venv/bin/python -m pytest -q`:
  **308 passed, 13 skipped**, one existing Starlette/httpx warning.
- From `apps/web`, `npm run typecheck` and the four established Node files:
  PASS, **37 tests**.

These are not laptop/database/browser acceptance. Source transfer and the real
PostGIS concurrency/context-change tests remain pending at this checkpoint.

### Bounded assistance laptop acceptance

Final application source `e01cb4df5527c0b7c20861a3a761a5e1a908eb7c`.
The initial `15ed29d` laptop batch passed, then review identified that cancellation
should remain available during changed/unavailable context. The follow-up source
makes cancellation available while retaining context checks for start/advance
and exposes restart after cancellation. The final guarded batch PID 71936 exited
0 in 120.96 seconds; the earlier result is retained as intermediate evidence.

- `scripts/verify-code-local.ps1 -Suite all`: **308 passed, 13 skipped**,
  reproducible synthetic model report and TypeScript PASS; one existing warning.
- Four established Node files: **37 passed**. Strict roles/payloads, required
  expected-step token and cancellation rationale are covered.
- `docker compose --project-name ai-project-aegis build api web`: PASS,
  production API/web images. `scripts/start-windows.ps1 -NoBuild -LocalCopilot`:
  PASS against the retained DB; no model runtime/inference claim.
- Retained verification-DB Compose suite: **13 passed, 4.34 s**. Real row locks
  cover concurrent same-step retries, ordered resume, terminal cancellation,
  cancellation after context change, changed-context progress refusal with
  unchanged prior state/audit, maker scope and hard stop before submission.
- `scripts/verify-local-http.py`: PASS. Browser-only fixture
  `.git/browser-qa/bounded-assistance.cjs`: PASS mobile start, expected-step
  advance, cancel, restart and `review_ready` stop; no submit/approve/real writes.
  The previous full public browser/axe smoke passed on `15ed29d`; final UI delta
  was the targeted cancelled-run restart button and passed its fixture check.
- Final inventory: exactly one API/web/DB, no detected conflicting AEGIS job.

Logs `.git/bounded-final-{native,node,build,start,postgis,http,panel}.log` and
progress `PASS`. No database reset, CI/push/merge, IdP/trust change, model
download, paid service or real operation. This closes the bounded durable
explicit-step runner slice. It does not add a background worker, free-form
model loop, semantic evaluation, human identity acceptance or prediction.

## Explicit source comparison accepted locally — 17 October 2026

Application source `272d029ccb0325d0743ebe174761286870eae24b` on branch
`feat/aegis-local-demo-continuation` adds explicit comparison group/window/
tolerance metadata, a second fictional rain gauge, deterministic
`agreement`/`disagreement`/`not_comparable` output with cited source UUIDs,
context-v2 UI rendering and a stable Audit360 checksum across Python/JavaScript
numeric round trips. Agreement remains a synthetic threshold result, not
corroboration, accuracy, hazard prediction or authority to act.

Laptop acceptance used the shared single-operation lease throughout:

- Initial native run retained: **3 failed, 314 passed, 13 skipped**; it caught
  a retired assertion and incomplete spatial mocks. Corrected final run:
  `scripts/verify-code-local.ps1 -Suite all`, **318 passed, 13 skipped**,
  reproducible synthetic model check and TypeScript PASS.
- Additive migration 010 and idempotent seeds ran against retained volumes;
  no reset. Production API/web build and guarded startup passed. Doctor and
  migration audit both reported ready; main fixtures: 5 sources and 38 samples.
- Four Node suites passed **37 tests**. Retained verification PostGIS suite:
  **13 passed** and proves the explicit rainfall pair `agreement` path with
  exact source citations. An initial retry command expanded its shell variable
  incorrectly and failed all 13 before database connections; the corrected
  command passed and the failure is not relabelled.
- HTTP routes, private refusals, blocked live warning and Audit360 checksum
  passed. The first HTTP run exposed the `5.0`/`5` checksum instability; the
  canonical-number fix was added and the final run passed.
- The retained main A1 reading had naturally aged, so runtime truthfully returned
  `not_comparable`; the group remained visible and no reading was refreshed to
  manufacture agreement. Full desktop/mobile/keyboard browser smoke passed 21
  checks with zero page errors or sampled axe violations.
- Final inventory: exactly one API, web and database container, no detected
  conflicting managed job. Laptop and mirror application HEAD matched at
  `272d029`; no push, CI, IdP/trust activation, volume reset, paid service,
  live action or forecast claim occurred.

This closes explicit source comparison. Pending work is deeper dependency
diagnostics, free-form grounded assistance and usefulness evaluation,
department-owned permissions/SLAs, durable draft-note recovery, and manual
two-human/accessibility/operator acceptance. The owner-deferred IdP remains off.

## Local dependency diagnostics accepted — 17 October 2026

Application source `0210aabfe9cceb7edc4583028f70bbdc62391703` adds
`aegis.exercise.dependencies.v1` to the existing read-only system readiness
endpoint and renders it on `/demo`. Six fixed components cover database query
access, schema/migrations, incident evidence, source observations, fictional
spatial context and scripted AgencySync. Schema failure blocks downstream
fixture conclusions; a fixture gap affects only its owning component. The
database-unavailable 503 contains a fixed code and safe guarded retry guidance,
without a host, connection string, secret or raw exception.

Laptop acceptance:

- `scripts/verify-code-local.ps1 -Suite all`: **319 passed, 13 skipped**,
  reproducible synthetic model check and TypeScript PASS.
- Guarded production API/web build and `start-windows.ps1 -NoBuild
  -LocalCopilot`: PASS against the retained database, with no reset.
- Runtime endpoint reported all six local dependencies ready. Server-rendered
  `/demo` contained the diagnostic heading and component labels.
- `scripts/verify-local-http.py`: PASS including Audit360 checksum, private
  refusals and blocked live warning. Full browser smoke: 21 desktop/mobile/
  keyboard checks, zero page errors and zero sampled axe violations.
- The initial retained verification-DB run returned **1 failed, 12 passed**:
  the earlier comparison test assumed seeded readings stayed fresh forever.
  Test-only source `0e69256d9645dc4624477d29ee5c53c8a91ac12a`
  now refreshes only the two explicitly synthetic readings in the isolated
  verification database before its agreement assertion. Retry: **13 passed**.
  The application had correctly returned `not_comparable`; no main/demo reading
  was changed and the failure remains recorded.
- Every command held the shared operation lease. Final inventory retained one
  API/web/database and no conflicting managed job. No GitHub action, push,
  merge, IdP/trust activation, paid resource, live action or forecast claim.

This closes the planned bounded local dependency map. External provider health,
real OIDC accounts, field sensors and agencies remain intentionally unconnected
and cannot be inferred from it. Remaining engineering: free-form grounded
assistance/usefulness evaluation, department permissions/SLAs and durable draft
recovery; manual two-person identity, accessibility and operator acceptance
remain release gates.

## Synthetic SLA targets — implementation pending final acceptance

Application commit `574503dc1489c3d6b53beae7f4957598bf198162` is on
both mirror and laptop. It adds v3 staged receipts with 15/30/45-minute
synthetic review targets, due times and acknowledgement-time classifications;
v2 receipts remain compatible. Audit events carry the target policy, due time
and classification. The approvals UI labels these as rehearsal targets with no
operational SLA, escalation, notification or department participation.

Laptop `scripts/verify-code-local.ps1 -Suite all` passed **321 tests, 13
skipped**, model reproducibility and TypeScript. Mirror test-only follow-up
`44d4693` adds real PostGIS receipt/audit assertions, but its bundle transfer
timed out when Desktop Commander stopped answering. The dashboard still showed
Adys_ROG online with a stale last-seen time; both the write and a subsequent
read-only file-info call queued. Therefore production build/start, PostGIS,
HTTP and browser acceptance for this slice are **pending**, and this section is
not marked accepted. No duplicate operation was launched.

Department-owned authorization remains pending: acknowledgement still requires
the existing verified incident-operator role. A future slice must add an
IdP-issued department role/scope across API and BFF; it must not trust a browser
department field. No IdP/trust, database, CI, push or live-operation change was
made here.

## Continuation connection check — 17 October 2026

Mirror inspected on `feat/aegis-local-demo-continuation` at
`282a82690f4b234b125de8e3062564cab5308611`; working tree was clean before
this documentation correction. Authorized Git remote matches the repository.
Desktop Commander listed Adys_ROG online (last seen 22 seconds), but the prior
file-info call `9665ee98-9750-4904-806e-ca5ba0810d83` had failed with
`Timeout - no response from device`. A fresh read-only PowerShell inspection
(Get-Location, Git remote/branch/SHA/status, and
`scripts/check-local-runtime.ps1 -RequireRunning`) returned
`MCP request timed out` without process output. Laptop state and duplicate
inventory therefore remain unverified; no repeated command, service change,
import, build or test was launched.

Corrected the handoff's stale opening summary, the backlog's already-delivered
runner status and the CI guide's historical branch-switch example in the mirror.
`git diff --check`: PASS. No application test was run for these documentation
changes. These corrections have not been transferred to the laptop. Resume at
the execution order above after remote command results are available.

## Synthetic SLA acceptance recovered — 17 October 2026

Laptop and mirror branch: `feat/aegis-local-demo-continuation`.
Verified source/test SHA: `c245a66407ff032bedda45bacc1525ffca5b99b8`
(application `574503d`, database assertions `44d4693`). Device re-registration
changed the remote device ID; the old ID was rejected. Fresh inspection found
expected origin, branch/SHA and clean working tree. Guard found exactly one
API/web/database and no conflicting job.

Executed on Windows, sequentially under the shared operation lease:

- `.git/sla-resume-build.ps1`: clean-state guarded bundle fast-forward, then
  `docker compose --project-name ai-project-aegis build api web`; PID 127068,
  exit 0. Production build passed with an existing Tailwind module-type warning.
- `scripts/start-windows.ps1 -NoBuild -LocalCopilot`: PID 162300, exit 0.
  Existing-volume migration/seed and API/web recreation passed. The first
  remote startup request timed out; agent history had no execution record and
  no active session before the guarded retry. No duplicate job was launched.
- `.git/sla-accept.ps1`: retained verification database
  `aegis_verification_57878ac`, `python -m pytest -q -p no:cacheprovider
  /integration_tests` via an ephemeral `docker compose run --rm --no-deps`
  API test job: **13 passed**, one existing Starlette deprecation warning.
  Includes v3 SLA receipt/policy and acknowledged-event/audit classification.
  No database/volume reset.
- `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: PASS,
  including page/readiness routes, private unauthenticated refusals, blocked
  live warning and Audit360 checksum.
- Initial `.git/browser-qa/synthetic-sla.cjs` failed waiting for a visible
  Close button: the fixture assumed details remained expanded across session
  revalidation. The corrected fixture explicitly reopens the remounted details.
  Database/HTTP passes remain valid; the initial wrapper exited 1 at this test.
- `.git/sla-browser-retry.ps1`, PID 79812, exit 0: corrected targeted mobile
  **v3 and legacy v2** acknowledgement/close flows, required rationale, target
  classification/disclaimer and no horizontal overflow passed. Fixtures exist
  only in the test browser; no IdP activation or real proposal write.
- `node .git/browser-qa/smoke.cjs`: **21 checks**, zero page errors, zero sampled
  axe violations. Final guard: one API/web/database, no conflicting managed
  job; clean working tree at the verified SHA.

The synthetic timing slice is accepted. Department identity/ownership/inbox and
reassignment remain pending; timings classify scripted acknowledgements and
never send escalation or claim operational SLAs. Prior native evidence remains
321 passed/13 skipped plus reproducible model and TypeScript; it was not rerun
for test/documentation-only imports. No push, CI, paid service, trust change,
IdP activation or live operations occurred. Manual human acceptance remains open.

Documentation sync note: acceptance record commit `3d503fa` is in the mirror.
Its laptop bundle write is queued as Remote MCP call
`49cc2a4e-c1d4-4677-ac6a-25dc9aaa8d7b`; do not retry while pending. The last
verified laptop HEAD remains `c245a66`. This affects documentation sync only;
all application acceptance results above completed before this interruption.

## Operator experience extension — 17 October 2026

Research and decisions: [OPERATOR_EXPERIENCE_DESIGN.md](OPERATOR_EXPERIENCE_DESIGN.md).
Source `896c7bf` added the mission header, explicit selected-case reuse of the
existing bounded AI focus and optional MapLibre 3D schematic locators. Follow-up
`92f057c49a7cdf69f6ba7621708ad498a1e1663c` improves heading hierarchy and
side-by-side map/queue at laptop widths. No renderer/model dependency added.
Existing human approval and inactive IdP remain unchanged.

Executed on Windows under the shared operation lease:

- `.git/operator-build.ps1`, PID 153024 exit 0: guarded clean fast-forward,
  `npm.cmd run typecheck`, `node --test scripts/tests/review-focus-route.test.cjs`
  (**8 passed**), `docker compose --project-name ai-project-aegis build web`.
- `scripts/start-windows.ps1 -NoBuild -LocalCopilot`, PID 62980 exit 0;
  one API/web/database with retained data.
- `.git/operator-accept.ps1`, PID 158208 exit 0 on `896c7bf`: explicit AI/fallback,
  case reset, 3D/2D controls and no overflow at 1440/390 widths with reduced
  motion preference; 21 browser smoke checks with zero page errors/axe violations;
  HTTP, private refusal, blocked live action and audit checksum all passed.
  Desktop screenshot inspected. Browser model response was a test-only fallback
  fixture; this is not a fresh model usefulness evaluation.
- `.git/operator-polish.ps1`, PID 102328 at `92f057c`: final production build and
  guarded startup passed; repeated targeted desktop/mobile tests passed. Full
  browser/HTTP completion output remains pending retrieval after a connector
  interruption. The test wrapper must finish before another guarded operation.
- `.git/browser-qa/operator-fallback.cjs` and its guarded wrapper are prepared
  for explicit no-WebGL/keyboard acceptance. The wrapper start request has not
  returned a PID/result, so execution is unconfirmed; do not blindly retry.

Remote read requests can time out while the laptop job continues; never repeat
an import/start/build on that basis. Retrieve PID state/output and use the
shared lease. Mobile screenshot call
`293b2c7f-281f-43ae-91ef-886045f940c5` failed with no response from device.
This status update currently exists in the mirror only; laptop docs remain at
the last successful source import (`92f057c`).
No GitHub push/CI, paid provider, IdP/trust activation or live operation.
Department authorization, durable draft recovery, grounded free-form Q&A and
usefulness evaluation remain pending; this UI slice does not close that backlog.

## UI acceptance recovered; tab recovery underway — 17 October 2026

Recovered PID 102328 completed with exit 0 at `92f057c`: production web build,
guarded startup, both 1440/390 targeted UI checks, all 21 browser smoke checks
(zero page errors/axe violations), HTTP/refusal/live-action/checksum checks and
final single-instance inventory passed. Explicit WebGL-failure wrapper
`.git/operator-fallback.ps1`, PID 49676, exit 0: disabled 3D control, keyboard
case selection and retained evidence/AI controls passed. This closes the prior
UI acceptance uncertainty. No duplicate build/start was needed.

Tab recovery source `cbb4d43` adds explicit opt-in, eight-hour sessionStorage
recovery for at most ten rationale drafts, verified identity/agency isolation,
expiry and memory fallback, with sign-out clearing. This closes a hard-reload
recovery gap once browser acceptance passes; it does not claim cross-device
backup or durable browser-restart storage. Department scope/inbox and broader
grounded assistance/evaluation remain pending.

Windows `.git/draft-recovery-check.ps1`, PID 117300, has imported the expected
clean branch, passed `npm.cmd run typecheck` and
`node --test scripts/tests/exercise-draft-buffer.test.cjs` (**10 passed**).
At that historical checkpoint, production web build/start remained in progress. Transcript:
`.git/draft-recovery-check.log`. The guarded browser wrapper and fixtures are
prepared; do not count their checks until actual results arrive.

### Tab recovery acceptance complete

Verified Windows source: `cbb4d432ca19d3a04bd92c294fad778840e5e8d9`,
branch `feat/aegis-local-demo-continuation`.
`.git/draft-recovery-check.ps1` PID 117300 exited 0: TypeScript, **10 Node
tests**, production web build and `start-windows.ps1 -NoBuild -LocalCopilot`
passed. `.git/draft-recovery-browser.ps1` PID 50344 exited 0:

- `node .git/browser-qa/draft-recovery.cjs`: mobile default-off behavior, opt-in
  restoration after reload, different-user clearing, disabling recovery,
  no overflow/page errors and zero automatic proposal writes passed.
- `node .git/browser-qa/smoke.cjs`: **21 checks**, no page errors or sampled
  axe violations.
- `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py`: all
  routes, private refusals, blocked live warning and audit checksum passed.
- Final guard: exactly one API/web/database and no conflicting managed job;
  working tree clean. Retained database, no destructive reset.

Both wrapper transcripts remain in `.git/draft-recovery-*.log` on the laptop.
This is bounded same-tab recovery, not cross-device backup. Browser fixtures do
not establish actual IdP or human approval acceptance. No API/storage-schema
change was made; the existing PostGIS suite was not rerun for browser-only
recovery. Remaining engineering is department authority/inbox/reassignment and
free-form grounded assistance/usefulness evaluation. Human identity/accessibility
and owner acceptance remain deferred; no CI/push, paid model, trust activation,
real forecast claim or live action occurred.


## Signed department inbox — 17 October continuation

Source `32016da`; additional BFF-scope/PostGIS tests
`eb5b49eeae07a4087c47ee32afbabb1c92c7fb14`. Both imported on laptop by guarded
clean fast-forwards using local Git bundles; no push or hosted CI.

Implemented `/department-tasks`, strict BFF, signed `department_operator` and
`aegis_department_id` claims, approved-only same-agency task query, fixed task-ID
ownership, audited department/coordinator authority and existing row-locked
acknowledgement/closure. No reassignment or IdP activation. See
[scope and limits](DEPARTMENT_INBOX.md).

Executed on Windows:
- `scripts/check-local-runtime.ps1 -RequireRunning`: PASS (PID 141860), one
  canonical API/web/db and no conflicting managed job.
- `.git/department-check.ps1`, PID **162928**, exit **0**, 23.16 seconds;
  transcript `.git/department-check.log`.
- `scripts/verify-code-local.ps1 -Suite all`: **337 passed, 13 skipped**, one
  existing Starlette/httpx deprecation warning. Skips are opt-in DB tests.
  `python -m app.model_lab --check` PASS; `npm run typecheck` PASS.
- `node --test scripts/tests/department-proxy.test.cjs scripts/tests/proposal-proxy.test.cjs`:
  **23 passed**, zero failures.

Started but **not yet verified**:
- `.git/department-build.ps1`, PID **150860**, transcript
  `.git/department-build.log`. Imported `eb5b49e`, then started shared lease
  `department-build-integration`. Sequence: six BFF-scope tests, production
  `docker compose --project-name ai-project-aegis build api web`, retained
  `aegis_verification_57878ac` PostGIS tests, then
  `scripts/start-windows.ps1 -NoBuild -LocalCopilot`. Final result unknown.
- Browser fixture script write `.git/browser-qa/department-inbox.cjs` returned
  call `64d4bcd0-db24-4ad7-9097-2c1acb254cd3`, subsequently **failed** with
  "Timeout - no response from device"; inspect whether the file exists before
  recreating it. Tests cover inactive IdP, mobile acknowledgement/closure, explicit
  writes without department override, rationale clearing, access-loss clearing
  and overflow/errors. Not executed yet.
- Remote output retrieval functions cell `695` ended with **MCP request timed
  out**. History request `a2504657-9052-497d-b0e5-cd4ffb986278` was still pending.
  Check existing process/lease/log rather than repeating side effects.

Remaining acceptance: successful build/start output, all retained DB tests
(including new department isolation/concurrent retry audit), targeted browser,
21 smoke/axe checks, HTTP/refusal/checksum, final single-runtime and Git status.
Do not equate unit fixtures with real department sign-in or human acceptance.

Documentation checkpoint is mirror-only until the next clean laptop sync;
laptop last confirmed HEAD remains `eb5b49e`. No new verification job was
launched after the connection timeout.

## Department reassignment — laptop acceptance complete

Laptop checkpoint `d341c6ee23e3adbd0508277cea75f1f6eecfb466` passed the guarded
`scripts/verify-task-reassignment.ps1` run, PID **1860**, exit **0**, runtime
**162.64 seconds**. Results: **344 API tests passed, 15 database tests skipped**
in the native phase; reproducible synthetic model and TypeScript passed;
production API/web images built; **15 retained PostGIS tests passed**; guarded
startup passed; targeted inbox checks passed at 390px and 1440px; coordinator
reassignment mobile UI passed; 21 general browser checks passed with zero page
errors and zero sampled accessibility violations; HTTP routes, disabled-private
access, blocked live warning and public audit checksum passed. Final inventory
was exactly one API/web/database and the laptop tree was clean. Transcript:
`.git/reassignment-verification.log` plus `.git/department-acceptance.log`.

This closes fixed department ownership and audited coordinator reassignment in
the automated local demo. It does not establish real department identities or
human acceptance while the IdP remains owner-deferred.

## Grounded evidence guide — laptop acceptance complete

The initial guarded run at `3eda6a3` (feature `bbdecea`), PID **85008**, exited
0 in **138.80 seconds**: **349 API tests passed, 15 opt-in database tests
skipped**, model reproducibility, TypeScript, seven strict BFF route tests,
production API/web builds and startup, browser, smoke, HTTP/refusal/checksum and
single-runtime checks passed.

The guide accepts a bounded free-form question on Incident Intelligence and
returns only validated readiness findings, existing evidence/source UUIDs,
allowlisted playbook review options, explicit unknowns and limitations. Unknown
or instruction-like requests abstain. It has no proposal/task write path and no
approval, notification, dispatch or forecast authority.

Follow-ups `47abf21`, `eca7bae` and `37caad2` align visible "Evidence IDs" /
"Source IDs" labels and scope browser assertions to the guide region. Final
laptop checkpoint `37caad2df6c1a62b4566173cf82a42d309ad6da7`, guarded PID
**95040**, exited 0 in **117.80 seconds**. TypeScript and the production web
build/start passed; real guide checks passed at 390px and 1440px; all 21 general
browser checks passed with zero page errors and zero sampled accessibility
violations; HTTP routes, refusal boundaries, blocked live warning and the
independently recomputed public audit checksum passed. Final inventory was
exactly one API/web/database and the tree was clean. Transcript:
`.git/grounded-guide-final.log`.


## Recovered inbox acceptance and reassignment checkpoint

Recovered PID **150860** completed with exit **0** in **95.11 seconds**:
production API/web build PASS, retained PostGIS **14 passed** (5.89 seconds;
existing Starlette warning), guarded startup PASS with one API/web/db. No
new build was needed to recover this evidence.

Imported browser test checkpoint `2ed809d`; `.git/import-department-acceptance.ps1`
started PID **73960**, running `scripts/verify-department-inbox.ps1`. Confirmed
PASS at **390px and 1440px** for inactive-IdP refusal, explicit fixture task
acknowledgement/closure, rationale clearing, access-loss clearing, no overflow
or page errors. General smoke/HTTP and final guard output still unconfirmed;
process-output request (functions cell 14) timed out. Log-read call
`073bd5e5-e038-4394-8a2d-d6ab5377fa87` is pending.

Mirror source `cf404ad`, browser/test follow-up `d97bb06`: coordinator-only
unacknowledged task reassignment, audited rationale/old/new desk, expected
assignment version, original due time preserved. Inbox now filters assigned
ownership; two tasks assigned to one desk have distinct UI keys and notes.
Department actions bind their signed desk under the proposal row lock and
reject stale ownership/version. Unit, real-DB concurrent retry/isolation and
mobile UI fixtures are prepared, **not executed**. No Linux results substitute
for laptop acceptance.

Bundle write `.git/reassignment.bundle.b64` for `cf404ad` failed with
"Timeout - no response from device" (call
`49ab73ec-c062-44c6-94db-a55c48d5abde`). Do not assume it exists or imported.
Inspect result/file/HEAD before syncing the newer test/docs/check helper commits.
Use committed `scripts/verify-task-reassignment.ps1` after recovery; it runs
native checks, Node scope/proxies, production build, retained integration DB,
guarded startup and browser/HTTP acceptance. Never overlap PID 73960 or any
other managed job. No IdP/trust activation, CI, push, live action or reset.

Final mirror follow-up also clears reassignment selections after a save or
identity change. This UI follow-up remains part of the unverified reassignment
slice. Laptop source is still last confirmed at `2ed809d`.

## Monsoon atlas visual system — laptop acceptance complete

Superseded by the operations graphite redesign below after owner review.

Application checkpoint `2cb6d4f6c854e740d8361adc919d3c70f60bb3aa`
replaces the generic slate/teal appearance with a purpose-built warm
mineral/indigo light theme and ink/plum/saffron dark theme. Shared semantic
tokens now drive panels, command rail, navigation, controls, charts, map
symbols and popovers. Status colors, reduced-motion behavior and safety labels
remain intact.

Guarded PID **138528** exited 0 in **117.71 seconds**. Three theme contract
tests passed, including WCAG AA token contrast; TypeScript and the production
web image passed; guarded startup recreated only the web container; both themes
and their toggle passed at 390px and 1440px with no overflow or page errors;
all 21 general browser checks passed with zero sampled accessibility violations;
HTTP routes, anonymous refusal, blocked live warning and public audit checksum
passed. Final inventory was exactly one web/API/database. Transcript:
`.git/visual-theme-verification.log`.

## Operator workspace structure — laptop acceptance complete

Checkpoint `b31b6d1bbb26e151cfe7a4b9e40cf595b2f9f453` extends the redesign
beyond color. Navigation is grouped into Overview, Observe, Coordinate and
Govern; incident child routes preserve their parent state. The Command Center
uses four data-driven operator actions in place of the isolated AgencySync
banner, and mobile metrics form a two-column scan grid. The exercise snapshot
also uses two columns on mobile, while its eleven stages use a horizontal
selector so the active content is no longer buried below the whole stage list.

Guarded PID **86520** exited 0 in **135.43 seconds**. Theme/contrast tests,
TypeScript, production web build/start, structural browser assertions at 390px
and 1440px, all 21 smoke/axe checks, HTTP/refusal/live-warning boundaries and
the public audit checksum passed. There were no page errors or sampled
accessibility violations. Final inventory was exactly one web/API/database.
Transcript: `.git/visual-theme-verification.log`.

## Operations graphite redesign — laptop acceptance complete

Application source `eb52eb91b9ae801957e1472a06ad80d7de73073d` replaces the
rejected warm treatment with cool white/graphite foundations, electric-blue
actions, cyan data signals, a narrower command rail, tighter page header,
compact metrics and a three-stage decision deck. Contrast correction
`db84241f8f73ac3b5cb7053020681f7a7e0a1200` darkens the light-theme action
color after the first browser gate found five distance-badge failures at 4.48:1.

The corrected guarded PID **170168** exited 0 in **121.34 seconds**. Three
theme/contrast tests, TypeScript and production web build/start passed. Both
themes passed at 390px and 1440px; all 21 general browser checks passed with no
page errors or sampled accessibility violations. HTTP routes, anonymous
refusal, blocked live warning and public audit checksum passed. Final inventory
was exactly one web/API/database. Transcript:
`.git/visual-theme-verification.log`.

## Human acceptance package — prepared, execution pending

At application checkpoint `b31b6d1bbb26e151cfe7a4b9e40cf595b2f9f453`,
the automated Windows acceptance above is complete and the single AEGIS
web/API/database runtime remains the expected topology. The UI specification
has been reconciled to the implemented Tailwind 4.3 Operations Graphite system,
task-oriented navigation, complete route inventory and responsive behavior.

`DEMO_REHEARSAL.md` is now the fillable evidence record for the locked-identity
walkthrough, operator comprehension, keyboard/screen-reader/zoom/theme checks,
findings and owner decision. It separately records the IdP-dependent two-person
steps as deferred. This documentation work does not convert automated axe
results into human accessibility acceptance and does not activate the prepared
IdP or alter Windows trust. Documentation link and whitespace validation passed;
application code and the running stack were unchanged.

### Final read-only laptop recheck — 18 October 2026

On documentation checkpoint `d00886a0332a82bfc3d5e58ee53a5f9097b8b63f`,
PID **99060** completed with exit code 0 in **8.23 seconds**. The
single-instance guard found exactly one web, API and database service and no
conflicting managed job. `python .\scripts\verify-local-http.py` passed every
listed API and web route, anonymous approval/private-audit/CAP refusal,
blocked live-warning boundary and the public audit checksum. The branch was
`feat/aegis-local-demo-continuation` and the checkout was clean. Human browser,
screen-reader, IdP and owner-decision gates remain separate and open.

## Navigation drawer keyboard and 200% zoom — laptop acceptance complete

Gap: the manual record's A5 (200% zoom) had no automated proxy. Existing
browser checks used only 390 px and 1440 px, while a 1280–1440 px window at
200% zoom renders a 640–720 CSS px viewport. A new read-only check,
`scripts/browser/zoom-keyboard.cjs`, found that all 14 routes reflowed without
page-level overflow or off-screen controls. It also found two keyboard defects
below `lg` (1024 px), which also affect mobile:

- the closed off-canvas rail left **15 invisible focusable elements** (brand,
  close control and all 13 navigation links) in the Tab order;
- Escape did not close the open drawer, and focus did not move into it.

Run against the pre-fix image, the check reported 8 failures (both defects at
both zoom viewports). Fix `dae1a69` (`apps/web/components/app-shell.tsx` only)
makes the closed drawer `inert` below `lg` via a `matchMedia` store whose server
snapshot is the persistent desktop rail. It also focuses the close control on
open, and Escape, the close control or the backdrop return focus to the menu
control. Navigating from the drawer closes it without moving focus back. An
interim attempt that toggled CSS `visibility` failed: under reduced motion,
Chrome kept the drawer hidden for two frames during a 0.01 ms visibility
transition, so it rejected the focus move. The check caught this before commit.

Windows laptop, branch `feat/aegis-local-demo-continuation`, tested tree
identical to `dae1a696f655b6c3f7a78aed9e513b1c30d0e12c`. All commands
ran inside the shared operation lease:

| Command | Result |
|---|---|
| `powershell -ExecutionPolicy Bypass -File .\scripts\check-local-runtime.ps1 -RequireRunning` (before work) | PASS: exactly one web/API/db, no conflicting managed job |
| `services/api/.venv/Scripts/python.exe scripts/verify-local-http.py` (before work, on `e9b403d`) | PASS in 7.29 s: 26 routes 200, six protected approval/audit/CAP routes 503, live warning 403, public checksum |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-zoom-keyboard.ps1` | **Exit 0, 154.00 s**. Theme contract tests 3/3; TypeScript; production web image built; guarded `start-windows.ps1 -NoBuild -LocalCopilot` recreated only web (API/db kept running, existing volume); zoom/keyboard **41 checks, 0 failures, 0 page errors**; theme browser 390/1440 PASS; smoke **21 checks, 0 page errors, 0 sampled axe violations**; HTTP routes/refusals/live-warning 403/public checksum PASS; final single-runtime PASS |

Transcript: `.git/zoom-keyboard-verification.log` (console copy
`.git/zoom-keyboard-run.out`). API, database, Python tests and model artifacts
were unchanged, so they were not re-run. The Linux mirror has not run this
check. This is automated proxy evidence only. It does not fill A1, A2 or A5 in
[DEMO_REHEARSAL.md](DEMO_REHEARSAL.md); a named tester must still perform
real keyboard, 200% zoom, reduced-motion and screen-reader review. IdP/trust
activation remains deferred by the owner. Nothing was pushed, merged, sent to
CI, reset or made live.


## Multilingual UI, non-root API image and Core Web Vitals — 2026-11-02 (Windows laptop, local)

Executed on the Windows laptop only; no Linux runner result is claimed.

- **Telugu and Hindi interface.** Language switcher (English, తెలుగు, हिन्दी), dictionary keyed by exact English text with English fallback, choice kept in `localStorage` (`aegis-language`, try/catch), `html lang` follows. Covers the shell, navigation, banners, the full Public Intake form and the main Earth Watch and Command Center labels. Translations are AI-written: **native-speaker review is pending**; do not present them as reviewed. Safety anchors (112, NASA/USGS, "not an AEGIS assessment", quarantine wording) are enforced by `translations.test.cjs`.
- **API image runs non-root** (UID 10001, no compilers in the slim base). P0 smoke, recovery drill and 20 PostGIS integration tests pass on it.
- **Core Web Vitals** (`scripts/browser/web-vitals.cjs`, 9 pages): all within budget at 1x CPU (LCP ≤ 2500 ms, CLS ≤ 0.1, interaction ≤ 200 ms). At 4x CPU (information only) `/incidents` interaction was 224 ms and `/approvals` LCP 2108 ms. Lab numbers, not field data or a capacity claim.
- **Gates this session:** pytest 443 passed / 20 skipped; web node tests 104 passed; typecheck and build pass; `public-pages.cjs` 9 checks pass; 21-check smoke zero violations; theme gate pass; `verify-windows.ps1` PASSED; recovery drill PASSED.
- **Closed by decision** (see `UX_INTERACTION_ROADMAP.md`): notification preferences, bulk actions, realtime events, spatial exposure overlay; saved views, advanced filters and density preferences are future work.
- **Open-Meteo pilot download: complete (attempt 5, after upstream 503s).** 14 files (9 rainfall, 5 discharge). `verify.py`: 14 checked, no problems. `verify.py --refetch 3`: the raw bytes differ from the stored checksums because each response embeds a per-request `generationtime_ms`; `verify.py` now compares the payload without that field and the 3 re-downloaded files are **identical** (spot check of 3 of 14, not all). `candidates.py` wrote 100 rows to `research/real-data/catalogue/candidates.csv` (20 dry baseline, 40 wet comparison, 40 heavy-rain candidates). These are unreviewed candidates, not validated events. Research tests: 48 passed.
- **Still owner/human:** rehearsal participants, push/PR/CI decision, hydrology reviewer, native-language review, screen-reader session, release go/no-go, IdP activation.
- **Not run:** Linux mirror; the `verify-visual-theme.ps1` wrapper (its component checks were run directly).


## Proactive multi-hazard watch and admin connector framework — built 2026-11-02 (Windows laptop, local)

Plan: [PROACTIVE_MULTI_HAZARD_PLAN.md](PROACTIVE_MULTI_HAZARD_PLAN.md); contract: [PROACTIVE_IMPLEMENTATION_CONTRACT.md](PROACTIVE_IMPLEMENTATION_CONTRACT.md); operator steps: [PROACTIVE_ADMIN_RUNBOOK.md](PROACTIVE_ADMIN_RUNBOOK.md).
**Built and tested offline; no real key has been entered and no live source has been called.** The owner enters keys last, then runs the runbook's safe-testing checklist.

- **Default off.** Routes return 404 unless `AEGIS_PROACTIVE=1` (`compose.proactive.yaml`, `start-windows.ps1 -Proactive`, needs `AEGIS_CONNECTOR_KEY` from `scripts/new-connector-key.ps1`).
- **Admin framework** (`platform_admin` from the verified token only): per-connector settings, write-only AES-256-GCM secrets with fingerprints, Test, optimistic versioning, audit; connectors: Open-Meteo, NASA FIRMS, NASA LHASA, Copernicus (token test only), IMD (blocked until terms accepted), TypeSafe Jev, CAP hand-over, authority notification (cannot be enabled).
- **Watch and triggers:** adapters for enabled connectors only, immutable evidence with SHA-256 dedupe, versioned synthetic thresholds (`hazard_triggers.v1.json`), Hazard Watch page (equal-height schematic columns, 2D default, HTML queue fallback), Live | Predicted panel, 5-step bounded run with Jev judgments (labelled test double without a key), decision bands, CAP 1.2 **Exercise** draft download. No send path.
- **Migration 012** applied to the existing volume without a reset (7 tables present). Local IdP review package gained an `exercise-admin` user.
- **Executed here:** API pytest 530 passed / 22 skipped; `model_lab --check` pass; web node tests 118 passed; typecheck and build pass; stack restarted with the proactive overlay (guarded script): public `/v1/proactive/watch` 200, connectors 503 fail-closed with no IdP, `verify-windows.ps1` P0 smoke PASSED; axe WCAG 2.1 AA on `/watch` and `/admin/connectors`, both themes at 390 and 1440 px: 0 violations, no overflow, no page errors.
- **Replay on the real pilot data (train years 2000–2017 only):** watch level (35 mm) 57 days fired, 1 hit, 0 misses, 48 false-alarm episodes; candidate level (64.5 mm) 9 days, 1 hit, 0 misses, 8 false-alarm episodes. Only one labelled flood event exists in the training window, so this is **not** a skill estimate. The final test (2018–2025) has **not** been run and must be run once, after reviewed labels exist.
- **Not verified:** any live source or Jev call; the PostGIS proactive integration tests (2, skipped without a test database); the LHASA service URL/response fields are an unverified guess; Copernicus and IMD adapters are stubs; signed-in admin and operator flows in a browser (no IdP provisioned); screen reader.


## Hazard Watch and Connectors UX polish — 2026-11-02 (Windows laptop, local)

- **New:** "Preview with sample data" on `/watch` and "Preview as admin (sample)" on `/admin/connectors`: client-side only, no API calls, never persisted, every panel carries an amber "SAMPLE DATA — not real evidence" chip. Summary strip, hazard/state filters, roving-tabindex queue (arrows, Home/End, Enter, Escape), guided empty states with a 3-step checklist, SVG fallback map when tiles fail, skeletons, threshold gauges, connected run stepper with probability bars and a plain-language decision sentence, CAP preview with Copy and Download; connector cards with status pills, setup ring and next-action checklist, dirty-state and Discard.
- **Defect found and fixed:** the "how to enable" command block on Earth Watch, Public Intake and Hazard Watch scrolled at 390 px without being keyboard-focusable (axe `scrollable-region-focusable`); it only appeared when the overlay was off. Now focusable and labelled.
- **Executed:** web tests 123 passed; typecheck and build pass; API pytest 530 passed / 22 skipped; axe WCAG 2.1 AA on `/watch` and `/admin/connectors` with the previews on, both themes at 390 and 1440 px: 0 violations, no overflow, no page errors; `public-pages.cjs` 9 checks pass with all three overlays on; Core Web Vitals at 1x CPU all within budget including `/watch` (LCP 172 ms, CLS 0.004) and `/admin/connectors` (LCP 144 ms).
- **Not verified:** the real map with tiles (tiles were blocked in the checks, so the SVG fallback was shown); signed-in admin/operator behaviour; screen reader. Source links on the connector cards other than FIRMS were added from general knowledge and need checking. New Telugu/Hindi text is unreviewed.


## Whole-app UI/UX pass — 2026-11-03 (Windows laptop, local)

- **Shared kit** (`apps/web/components/ui/`): page header, stat tiles with count-up, panels, status pills with icons, data freshness, empty/error/skeleton states, tabs, segmented control, filter chips, search field, sortable headers, responsive table, stepper, copy button, inline help, toasts. App shell gained a skip link, a "Group / Section" label, collapsible nav groups (state in `sessionStorage`, memory fallback), a page-enter transition and a most-specific active highlight. Group translations live in `lib/translations-extra/*.ts`.
- **Pages redone:** incident registry (summary strip, search, status and page-size segmented controls, sortable headers, mobile card list, selected-case panel), incident detail (tabs, case header with copyable ID, provenance cards, timeline, readiness checklist), global search (grouped results, highlights), Command Center (error/empty/skeleton states, keyboard queue, freshness), map legend, public signals and risk panel pills, demo walkthrough (progress, keyboard), Source Freshness, DataFusion Replay (stepper), Model Lab, Response Teams, AgencySync, Audit360 (filterable timeline, copyable checksum), Playbooks (search, cards, prerequisites), Help (search, tabs, accordions, stepper), Approvals (maker→checker→simulate stepper, character counter, reasons for disabled actions), Department Inbox, Administration, operator sign-in.
- **Bugs found by the browser gates and fixed:** React hydration mismatch (#418) from count-up tiles that started at the final value under reduced motion (kit and Hazard Watch); invalid `aria-controls` id from a tab labelled "All topics"; mobile header overflow once signed in (Sign out is icon-only below `sm`, name kept); duplicate "Observed Not available ago" text on Source Freshness.
- **Executed (Windows laptop):** web tests 131 passed; typecheck and build pass; axe WCAG 2.1 AA on all 19 pages, both themes, 390 and 1440 px: 0 violations, no overflow, no page errors; `public-pages.cjs` 9/9; `zoom-keyboard.cjs` 41 checks, 0 failures, 0 page errors; `theme-system.cjs`, `grounded-guide.cjs`, `department-inbox.cjs`, `task-reassignment.cjs` pass; Core Web Vitals within budget at 1x CPU; `verify-windows.ps1` P0 smoke passed.
- **Deliberately not changed (risk to safety behaviour or tests):** the Approvals sticky decision bar and collapsible panels; `exercise-review-brief`, `local-review-focus` and `grounded-evidence-guide` presentation; Command Center metric cards stay as they are (tests depend on them) and have no "freshest telemetry" or "sources degraded" tiles because that data is not loaded there; `spatial-analysis` and `public-signals-near-case` unchanged; the demo walkthrough keeps its button list rather than the Stepper; the 2D/3D map button keeps its single-toggle semantics.
- **Not verified:** signed-in operator, checker and admin flows against a real identity provider; screen reader; the real map with tiles. New Telugu/Hindi strings (several hundred) are AI-written and need native review.
