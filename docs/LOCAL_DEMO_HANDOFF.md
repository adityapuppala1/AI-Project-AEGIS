# Current local synthetic demo handoff

Updated: 17 October 2026 (IST). Repository: `adityapuppala1/AI-Project-AEGIS`.
Branch: `feat/aegis-local-demo-continuation`; integration baseline `b71172c`.
Laptop: `C:\xampp\htdocs\AI-Project-AEGIS`; Linux mirror:
`/workspace/AI-Project-AEGIS`. No push, CI, main merge or destructive reset.

## Current implementation

The existing Next.js/FastAPI/PostgreSQL/PostGIS architecture is retained.
Accepted replay observations attach idempotently to synthetic case evidence and
chronology, preserving provenance/quality/timestamps. Drafts capture assessment,
playbook and citations. Signed agency/role checks and independent maker-checker
approval gate a private scripted task/acknowledgement receipt and audit.
Public AgencySync/Audit360 screens remain separate seeded examples; use the
proposal's authenticated audit link for its actual rehearsal history.

## Verification and source

Previous verified laptop application source: `481a9f27cc599d007eee487425b4108027b46cdf`;
previous clean handoff commit `c57fd8850f3506b9a9174ac501fc1cddca56cb9a`.
New implementation: `b4f5f4b` adds non-root standalone web image;
`65167dddc535193bd7612a7e6f63cbe2f2e8763f` upgrades Tailwind/PostCSS integration
and preserves theme configuration, small rounding and focus utility semantics.
Final laptop frontend/container acceptance for this upgrade is pending below.

| Gate | Executed evidence |
|---|---|
| Latest API/model | Windows and Linux: `python -m pytest -q` **220 passed, 3 skipped**; `python -m app.model_lab --check` PASS. One upstream Starlette/httpx deprecation warning |
| Real database | Prior laptop run: **3 integration tests passed**, separate `aegis_verification_57878ac` DB; no API behavior changed by frontend hardening |
| Latest frontend in Linux | `npm install --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm run build`: PASS on Tailwind 4.3.3; full `npm audit --json`: **zero vulnerabilities**, no suppression |
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
- **Blocked on owner authorization:** activating local IdP containers and adding
  their CA to Windows CurrentUser Root trust. No credentials or trust changes
  have been made. Do not paste secrets or tokens into chat.
- **Pending human acceptance:** two different people in separate browser profiles
  rehearse the maker/checker denial cases, approved simulation and private audit;
  manual screen-reader/operator review and owner release decision.
- **Pending current verification:** final Windows frontend build/container/browser
  regression on the Tailwind/standalone upgrade, then record exact results below.
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
