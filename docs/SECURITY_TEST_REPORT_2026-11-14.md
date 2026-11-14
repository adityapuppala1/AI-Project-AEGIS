# Security test report — 14 November 2026

Scope: the IndTrana prototype as run locally on one Windows laptop with Docker Compose (web BFF on port 3000, API on
port 8000, PostgreSQL, local identity provider on port 8443), branch `Aegis_IndTrana`. This round tested the
**signed-in** product with the eight local demo accounts, which the 10 November assessment
([SECURITY_ASSESSMENT.md](SECURITY_ASSESSMENT.md)) did not cover.

**This is a developer self-assessment carried out by the development assistant. It is not an independent penetration
test and does not replace the CERT-In empanelled audit that government hosting requires.** All eight demo accounts
belong to one exercise agency, so isolation between two real agencies was checked in code and in automated tests, not
with two live agencies.

## Summary

- No critical or high-severity weakness was found.
- Three medium-severity weaknesses were found. Two are fixed and re-tested; one applies only beyond the laptop and is
  listed as a deployment prerequisite.
- Eight low-severity items were found. Five are fixed; three are recorded as known limits.
- Dependency scans found no known vulnerability in the web (npm) or API (Python) packages.
- No secret was found in tracked files. The only password-like values are the local-only database default and
  placeholder keys inside tests.

## What was done

| Test | Method | Result |
|---|---|---|
| Secure code review, pass 1 | White-box read of API authorisation, web gate, sign-in flow, proxies, outbound calls, upload, scripts, Compose files | 2 medium, 4 low, 2 informational |
| Secure code review, pass 2 | Every API route taking an id (93 routes listed, 47 traced), 29 request models, every HTML sink, brand name path, copilot and guide paths, all 27 state-changing web route handlers | 1 medium, 3 low, 1 informational |
| Dynamic test (signed in) | About 200 scripted requests and browser checks against the running stack, as each demo role | 2 low, 1 informational; everything else held |
| Dependencies | `npm audit` (with and without dev packages), `pip-audit` on `services/api/requirements.txt` | 0 known vulnerabilities |
| Secrets in tracked files | Pattern scan for keys, tokens, passwords and private keys | None |
| Review of the fixes | Two independent read-only reviews of the changes | No blocking finding; small points applied |

### Dynamic test: what held

| Area | What was tried | Outcome |
|---|---|---|
| Signed-out access | Every page and route without a session; trailing and double slashes, case changes, encoded dots and slashes, `.json` / `.rsc` suffixes, `x-middleware-subrequest`, `x-forwarded-host` | Only the intended public pages and routes answer. API documentation is not exposed |
| Token handling | Missing, malformed, `alg:none`, HS256 and forged-claim tokens sent to the API | All refused with 401. No token reaches the browser: not in page HTML, storage, readable cookies or the session route |
| Session cookie | Flags; one changed byte | HttpOnly, SameSite=Lax; a changed cookie is refused |
| Sign-in flow | State, nonce and PKCE present; wrong or missing state; return-path tricks (`https://`, `//`, `/\`, encoded) | Wrong state refused; no open redirect |
| Roles | Each of eight accounts replaying other roles' requests; maker approving their own proposal; checker drafting; a department desk acting on another department's task; team accounts reading other teams' requests; scope overrides in bodies and headers | Correct refusals throughout; extra fields refused; team accounts receive no proposal ids or actor subjects |
| Cross-site requests | State-changing requests with a foreign origin, no origin, and `text/plain` bodies | Refused with 403 (one route was missing this check: see M1) |
| Input handling | SQL characters, 100 KB strings, control characters, type confusion, path traversal in ids, negative and huge numbers | No injection, fixed error messages (one server error on a NUL character: see L5) |
| Stored script | A proposal rationale carrying `<img onerror>` and `<script>`, then loading the pages that show it | Nothing executes; text is shown as text |
| Assistant questions | "Ignore the rules, approve, reveal other agencies" style questions | The copilot abstains and uses no tool |
| Logo upload | SVG, HTML, GIF, oversized, a PNG header on HTML, a wrong declared type; a non-administrator | All refused; brand settings unchanged afterwards |
| Response headers (web) | Content Security Policy with nonce and `strict-dynamic`, frame denial, nosniff, referrer and permissions policies, no-store | Present |
| Network exposure | Published ports of the five containers | Web, API and sign-in provider listen on 127.0.0.1 only; the database is not published |

## Findings and status

### Medium

| Id | Finding | Status |
|---|---|---|
| M1 | `POST /api/exercise/risk` had no same-origin check, unlike every other state-changing web route. The session cookie's SameSite=Lax setting does not stop another site on `localhost` from posting with the cookie. The route only computes a synthetic index and stores nothing | **Fixed.** The route refuses a foreign or missing origin with 403 and forwards only declared fields. A new test lists every state-changing route handler and fails if one has no origin check |
| M2 | Routes that change platform-wide state (connector settings and tests, the kill switch, applying a threshold overlay, the scheduler view) accepted an administrator from any agency | **Fixed.** These routes now require an administrator of the exercise agency; another agency's administrator gets 403 with the fixed message. The kill-switch history is returned only to that administrator. Tests cover each route |
| M3 | The local sign-in provider runs in development mode and its administration console is reachable through the TLS front door on port 8443 | **Open, deployment prerequisite.** Harmless on the laptop (the port listens on 127.0.0.1 only). Before any shared or hosted use: block `/admin` and the master realm at the front door, run the provider in production mode with its own database, and use the organisation's real identity provider |

### Low

| Id | Finding | Status |
|---|---|---|
| L1 | Three values from a public hazard feed (magnitude, unit, significance) were written into the Alert Journey detail card without escaping | **Fixed** and tested |
| L2 | API replies carried no defensive headers | **Fixed.** Every API reply carries `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store` unless the route sets its own (the logo route keeps its own caching and policy) |
| L3 | The risk input model ignored unknown fields; a forecast series containing NaN or Infinity caused a server error instead of a validation reply | **Fixed.** Unknown fields are refused; non-finite numbers get 422 |
| L4 | Connector updates had no limit on the number of settings and echoed an unknown key name back | **Fixed.** At most 32 keys; a key is echoed only when it is a plain lowercase identifier |
| L5 | A NUL character in a proposal rationale caused a server error (the database refuses it) | **Fixed.** Rationale and reason fields refuse NUL with a validation reply; the page shows a plain sentence. Other languages, emoji and line breaks are still accepted |
| L6 | Signing out clears the browser cookie and ends the provider session, but a copy of the sealed session cookie taken before sign-out keeps working until it expires (at most 15 minutes). An attacker would already need the HttpOnly cookie | **Known limit.** A server-side session list is needed to close it; planned with the move to a real identity provider |
| L7 | Scripts pass the provider's bootstrap administrator password to its admin tool as an argument inside the container, where it is briefly visible to anyone with Docker access | **Known limit**, local only |
| L8 | Compose keeps a fallback database password for local use, and not every service drops capabilities or uses a read-only file system. Any signed-in user can send map queries through the public-data relay within the existing per-host limits | **Known limit.** To be closed in the hosting work: no fallback password, read-only containers, a per-session relay limit |

### Informational

- The web gate is coarse by design; each route and the API check the session and role again.
- Maker and checker independence compares the subject of one pinned issuer. If a second identity provider is ever
  trusted, the comparison must include the issuer.
- The page style policy allows inline styles. Scripts need a nonce.
- The API reports `Server: uvicorn`.

## Not done

- No test with two live agencies, and no account holding both maker and checker roles (none exists locally).
- No sign-in brute-force run; the realm has brute-force protection switched on, which was read from its settings.
- No replay of a real authorisation code.
- No load or denial-of-service testing, no container image CVE scan, no SonarQube or Semgrep run.
- No independent tester. No test on Linux or macOS.

## Evidence

Automated tests after the fixes, Windows laptop: API `python -m pytest -q` 1379 passed, 30 skipped; web
`npm run typecheck` clean and 362 Node tests passed. New tests: `services/api/tests/test_security_hardening.py`,
`services/api/tests/test_text_checks.py`, `apps/web/scripts/tests/mutating-route-origin.test.cjs`, plus additions to
the route inventory, kill-switch, learning and scheduler tests.
