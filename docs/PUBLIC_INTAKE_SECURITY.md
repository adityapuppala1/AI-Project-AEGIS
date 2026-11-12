# Public report intake — design, review and limits

Status: implemented locally on 2026-11-02 as plan item E5
([EARTH_WATCH_ENHANCEMENT_PLAN.md](EARTH_WATCH_ENHANCEMENT_PLAN.md)). **Opt-in, loopback-only, quarantine only.**
It is not approved for any network-exposed deployment; see "Required before exposure".

## What it is

An optional form (`/public-intake`) and read-only queue for **unverified** reports. Enable with
`scripts/start-windows.ps1 -PublicIntake` (adds `compose.public-intake.yaml`, which sets
`AEGIS_PUBLIC_INTAKE=1`). The base stack is unchanged and the API answers `503` until enabled.

Reports go to one isolated table, `public_intake_reports` (migration `011`). They never create or
change a case, evidence, assessment, proposal, approval, task, notification, warning or CAP, and no
code reads that table for any workflow. A trigger blocks `UPDATE`, so a row cannot be promoted in
place. The table has no name, phone, email, IP or user columns.

## Controls

| Control | Where |
|---|---|
| Default off; exact `AEGIS_PUBLIC_INTAKE=1` required | `public_intake.py` `enabled()` |
| Strict schema: five fields only, `extra=forbid`, length and range limits, India bounding box | `IntakeReport`, SQL `CHECK`s |
| Contact-detail screens after NFKC normalisation and removal of invisible characters: emails (including `[at]`/`[dot]`), links and bare domains, 8+ digit runs with any separators, spelled-out digit runs | `normalise`, `_EMAIL`, `_URL`, `_DIGITS`, `_DIGIT_WORDS`; mirrored in `lib/public-intake.ts` |
| `application/json` only (blocks cross-site "simple" POSTs); body capped at 4 KB while streaming; non-numeric `Content-Length` refused | API `submit_report`, web proxy `readCapped` |
| Same-origin check on the web POST (exact `APP_ORIGIN` match; missing, `null` and case variants fail) | `app/api/public-intake/route.ts` |
| Proxy forwards only the five fields and re-validates every field it returns; only allowlisted error text passes through | web route |
| Rolling limits: 5 per minute, 30 per hour, 200 per rolling day (never a permanent lock) | `_within_rate_limit`, `recent_count` |
| Exact duplicates are idempotent, use no rate-limit slot and return a generic receipt (no id or time of the original) | `already_received`, `generic_duplicate` |
| Reports are rendered as React text only; no HTML, Markdown or links | `public-intake.tsx` |
| Errors are fixed strings; storage failures never echo internals | API and proxy |
| Emergency notice (call 112) and "not monitored" wording on the page | UI |

## Independent review (2026-11-02, Opus security reviewer, read-only)

No critical or high findings for the loopback demo. Fixed the same day: contact-filter bypasses
(fullwidth and zero-width characters, `,` and `/` separators, `[at]`/`[dot]`, short-link domains,
CJK full stop, spelled-out digits), cross-site `text/plain` POST directly to the API, unbounded
buffering of chunked bodies, malformed `Content-Length`, and the duplicate-probe leak.

Accepted limits of this local demo (each needs an owner decision before any exposure):

1. **Shared rate limiter.** The limit is process-wide, and every request arrives through the web
   container, so one noisy client can exhaust it and deny others (also the daily cap). It is also
   per process, so several API workers would multiply it.
2. **Queue read (closed 12 November 2026).** `GET /v1/public-intake/reports` and `/v1/public-intake/status` now need
   a verified operator token (every AEGIS role), and the queue only for the exercise agency; the web route forwards
   the session token server-side. Submission (`POST /v1/public-intake/reports`) is unchanged: still public, opt-in,
   quarantine-only, with the controls above. Since 12 November 2026 the queue read is limited to the incident
   desk and administrators (`INTAKE_QUEUE_ROLES`; the web GET checks the same roles and answers 403 otherwise).
3. **`DELETE` and `TRUNCATE` are not blocked.** Only `UPDATE` is. A reviewed operator may purge test
   rows with explicit SQL; this is deliberate so a demo database can be cleaned without a volume reset.
4. **Filters are best-effort.** They cannot detect every obfuscation (for example other languages
   written as words). A human reviewer must read every report, and the form tells people not to include
   contact details. Normal numbers such as long dates or coordinates typed into the text can trigger a
   false positive; the form has separate location fields.

## Required before any exposure (not implemented)

- Verified reviewer access (OIDC and agency scope) for the queue; show the public only their receipt.
- Per-client limiting using a trusted proxy header or signed session, in shared storage, with a
  separate global ceiling and abuse monitoring.
- A reviewed `DELETE`/`TRUNCATE` policy, retention period and privacy notice.
- A defined, human-run triage procedure and an owner decision on how (and whether) a reviewed report
  may ever be turned into an exercise observation. Nothing in this implementation does that.
- Re-run of the security review and an external penetration test.

## Verification

`services/api/tests/test_public_intake.py` (store mocked) and
`apps/web/scripts/tests/public-intake-route.test.cjs`. Results are recorded in
[the handoff](LOCAL_DEMO_HANDOFF.md). No test here establishes safety for real public use.
