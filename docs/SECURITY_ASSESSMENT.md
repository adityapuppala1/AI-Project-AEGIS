# Security assessment — 10 November 2026

Scope: the AEGIS prototype as run locally on one Windows laptop with Docker Compose (web BFF, API, PostgreSQL, local
identity provider), branch `feat/landing-ux-security-hardening`. Tested by the development assistant, white-box, as an
unauthenticated attacker on the same machine. **This is a developer self-assessment. It is not an independent
penetration test and does not replace the CERT-In empanelled audit that government hosting requires.**

## Executive summary

- No critical or high-severity weakness was found in the code paths reviewed.
- Four medium-severity weaknesses were found, all in the public-data relay (`/api/alert-journey/relay`). They allowed
  abuse and denial of service, not data theft. **All four are fixed and re-tested.**
- Dependency scans found no known vulnerability in the web (npm) or API (Python) packages.
- 87 dynamic probes and an OWASP ZAP passive scan found no exploitable issue after the fixes. ZAP's five remaining
  warnings are low or informational and are listed below.
- Several kinds of testing asked for could **not** be done here; see "Not done". Signed-in screens were not tested.

## What was tested, and the result

| Test type | Tool / method | Result |
|---|---|---|
| Secure code review | Manual white-box review of BFF routes, sign-in, relay, CSP, API authorisation, SQL, Docker files | 4 medium, 3 low, 2 informational; details below |
| SAST (Python) | Bandit 1.9 on `services/api/app` (8,226 lines) | 0 high. 12 medium + 6 low, all reviewed: 10 SQL-string flags are fixed column names chosen by code, XML parsing already rejects DOCTYPE/ENTITY; one `assert` used as a safety check was replaced with a real check |
| SAST (TypeScript) | `tsc --noEmit` strict type check | Clean |
| SAST (Semgrep) | Tried natively and in a container | **Did not run**: the scanner never finished on this machine (cause not confirmed; possibly it could not download its rules) |
| SonarQube | — | **Not run**: no SonarQube server is available. Editor warnings in the files touched were reviewed |
| SCA (dependencies) | `npm audit` (web), `pip-audit` (API) | 0 known vulnerabilities in both |
| Secrets in the repository | Pattern scan of the committed diff and review of tracked files | None found; identity-provider passwords are environment placeholders |
| DAST | 87 scripted probes (headers, sign-in flow, CSRF, methods, SSRF, injection, path traversal, input validation, XSS in a real browser) | 83 pass. The 4 non-passes are not defects (see notes) |
| DAST | OWASP ZAP baseline (spider + passive rules) | 0 fail, 63 pass, 5 warnings |
| Container / Docker review | Manual review of Dockerfiles and Compose files | Hardening added (below). Image CVE scan **not run** |
| Automated tests | 191 web tests, 769 API tests | All pass |
| Accessibility (not security) | axe WCAG 2.1 A/AA on five pages; layout audit of 26 signed-out pages at six screen sizes | 0 violations; no overflow or clipped controls |

Notes on the four DAST non-passes: the citizen-intake route answered "disabled" (correct, it is switched off); two
routes answer without a session by design (the read-only review preview, and sign-out); the HTTP client refused to
send a TRACE request; and port 5432 on this laptop is open, but it belongs to **another program on the laptop, not to
AEGIS** (the AEGIS database port is not published). The owner may want to check that other program, because it
listens on all network interfaces.

## Findings and what was done

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Medium | Relay rate limit trusted a caller-supplied address header, and could be reset for everyone | **Fixed.** The header is used only when `AEGIS_TRUSTED_PROXY=1`; otherwise one shared limit applies. Counters are evicted oldest-first. A per-source cap (900 new fetches a minute) and a cap on simultaneous fetches (96) were added |
| 2 | Medium | Relay read a whole POST body into memory before checking its size | **Fixed.** Bodies are read in pieces and refused past 8,000 bytes (HTTP 413) |
| 3 | Medium | Relay could be driven from another website and its cache defeated with made-up addresses | **Fixed.** Cross-site requests are refused (HTTP 403). Tile sources accept only an exact path shape and no query string |
| 4 | Medium | Relay held a whole upstream reply in memory before checking its size | **Fixed.** Replies are read in pieces and dropped past 6 MB |
| 5 | Low | Relay accepted look-alike content types (for example `image/pngx`) | **Fixed.** Exact types only |
| 6 | Low | Containers ran with default privileges | **Fixed** for web and API: no new privileges, all Linux capabilities dropped, process limit. Read-only file systems are still to do |
| 7 | Low | Satellite names from the public feed were stored unsanitised; the page's escape function did not cover the single quote | **Fixed** on both sides |
| 8 | Low | Citizen-intake limit is shared by all callers (one script could fill the daily quota) | **Open.** The feature is off by default and already needs a security review before it is enabled |
| 9 | Low | Database password has a built-in fallback value in `compose.yaml` if the variable is unset | **Open.** The database is not reachable from outside Docker. Make the variable mandatory before any shared deployment |
| 10 | Info | API interactive documentation was reachable on the API port | **Fixed.** Off unless `AEGIS_API_DOCS=1` |
| 11 | Info | Some read routes answer without sign-in | **Closed 12 November 2026** (see the addendum below): every API data route needs a verified operator token, an explicit role list and the exercise-agency check |
| 12 | Info | Malformed input to the risk calculator returned "unavailable" (503) instead of "bad request" | **Fixed** (400) |

ZAP warnings left as they are: `style-src 'unsafe-inline'` (needed by the map and 3D libraries; scripts are strict);
no Cross-Origin-Embedder-Policy header (would block map tiles as built today); "user-controllable attribute" on
`?mode=live` (the value is matched against two fixed words and never written into the page); two informational notes.

Controls reviewed and found sound: OpenID Connect sign-in with PKCE, state and nonce; RS256-only token checks with
issuer, audience and expiry; encrypted HTTP-only session cookie capped at 15 minutes; exact-Origin checks on every
state-changing route; maker and checker must differ, enforced on the server with a row lock; parameterised SQL;
AES-256-GCM connector vault; relay allow-list (HTTPS only, fixed hosts, no redirects); per-request nonce CSP.

## Not done, and why

| Asked for | State |
|---|---|
| Signed-in testing (authorisation between agencies and roles in the running app) | Not done. The demo accounts' current passwords are not on file, and creating test accounts was not permitted in this session. Server-side rules are covered by the 769 API tests only |
| Active attack scan (ZAP full scan, Burp) | Not run. It would have pushed junk requests through the relay to third-party public services |
| Semgrep, SonarQube, container image CVE scan (Trivy) | Not run on this machine. Run them in CI or on the audit machine |
| Network testing, cloud (AWS/GCP/Azure) testing, Kubernetes testing | Not applicable yet: there is no network, cloud account or cluster, only one laptop |
| Desktop application testing | Not applicable: AEGIS is a web application |
| Social engineering, red team / blue team exercise, agentic exposure validation | Not done. These test an organisation and its people and need written authorisation, a real deployment and an independent team |
| Debrief session | To be held with the owner; this document is the written part |

## Recommended next steps

1. Give the test team working demo sign-ins, then repeat the dynamic tests signed in as maker, checker, department
   operator and administrator, including cross-agency access attempts.
2. Put a reverse proxy in front of the web container (TLS, request size limits, real client addresses) and set
   `AEGIS_TRUSTED_PROXY=1` only then.
3. Add Semgrep or SonarQube, `npm audit`, `pip-audit` and an image scan to CI, failing the build on high findings.
4. Make the database password mandatory, run containers with read-only file systems, and move secrets to a vault.
5. Commission the CERT-In empanelled audit before any hosting decision (see `docs/GOVT_DEPLOYMENT_READINESS.md`).

## Addendum, 12 November 2026

- **Team response loop** (`docs/RESPONSE_LOOP.md`): independent review of the backend commit found no critical or
  high issue. Fixed: the kill-switch read now has an explicit role list (a response-team token gets 403); a missing
  row returns the fixed 404; a test keeps the browser and API team lists equal. Browser checks confirmed team
  isolation (other team sees nothing, 404 on write), role refusals and stale-version refusal.
- **Container images (Trivy, high and critical):** web image 18 findings before, 0 after patching the Dockerfile; API
  image 7 fixable before, 0 fixable after; 47 high remain in Debian packages with no published fix.
- **Semgrep** (289 rules, 229 files of API and server-side web code): 3 `use-defused-xml` findings, assessed as not
  exploitable (generated XML only, or DOCTYPE/ENTITY rejected before parsing).
- Still not run: SonarQube, an active attack scan, signed-in testing across two agencies.

## Addendum, 12 November 2026 (later): sign-in required on the API port

Finding 11 is closed. Before this change 25 API routes answered on `127.0.0.1:8000` with no token at all, so anyone
on the laptop could read the exercise records directly, bypassing the web app's sign-in gate:

| Routes | Now requires |
|---|---|
| `POST /v1/exercise/risk`; `GET /v1/exercise/incidents`, `/incidents/query`, `/incidents/{id}`, `/incidents/{id}/correlation`, `/incidents/{id}/readiness`, `/incidents/{id}/audit`; `POST /incidents/{id}/review-focus`, `/incidents/{id}/grounded-guide`; `GET /v1/exercise/telemetry`, `/sources`, `/sources/{id}/history`, `/ingestion/status`, `/model-lab/report`, `/agency-tasks`, `/agency-tasks/{id}`, `/policy` | Verified operator, explicit role list (all six roles, mirroring `read_exercise_records`), exercise agency only |
| `GET /v1/proactive/watch`, `/watch/history`, `/triggers/config`, `/triggers/impact-config` | Same (mirrors `read_watch`); still 404 unless the proactive switch is on |
| `GET /v1/public-intake/reports` (quarantine queue) | Same |
| `GET /v1/public-reference/earth-watch/status`, `/{feed}`; `GET /v1/public-intake/status` | Verified operator and explicit role list; no agency check (public reference data and a static status, not agency records) |

Rule: a valid token from another agency gets **403** "Exercise records are limited to the exercise agency" (never an
empty result, so "not your agency" cannot be mistaken for "no records"); a token without a listed role gets 403;
no token gets 401. The role lists are explicit in `services/api/app/security.py` (`EXERCISE_RECORD_ROLES`,
`scoped_operator`), so a new role gains nothing by default.

Still open on the API port, by design: `GET /health`, `GET /v1/exercise/system/readiness` (fixed diagnostic codes and
fixture counts, used by the start and verify scripts), the `POST /v1/live/public-warning` 403 stub, and the opt-in
public intake submission (`POST /v1/public-intake/reports`, off unless `-PublicIntake`; its own controls in
`docs/PUBLIC_INTAKE_SECURITY.md`). `services/api/tests/test_route_auth_inventory.py` walks every registered route and
fails if any other route lacks the operator dependency.

Remaining risks: the API port is still published on loopback, so a process on the laptop that obtains a valid
token (for example from a browser session it can read) can call the API directly; the readiness diagnostic reveals
fixture counts; the web BFF and the API share one exercise agency, so cross-agency isolation is tested with test
doubles only; the inventory test checks that the dependency is present, not that each role list is the right one.
