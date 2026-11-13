# Brand settings and the IndTrana name

## The rename

On 13 November 2026, on branch `Aegis_IndTrana`, the product was renamed from AEGIS to **IndTrana**. Everything a
person reads now says IndTrana: web pages and page titles, the sign-in provider theme text, staff email notice
templates, script console messages, README, docs and comments that name the product.

**Everything sent out says IndTrana** (owner instruction, 13 November 2026):

- **Alert drafts (CAP).** New drafts use CAP template version `aegis.cap-templates.v2`
  (`services/api/app/fixtures/cap_templates.v2.json`): the sender name is "IndTrana proactive exercise desk" (and its
  Telugu and Hindi forms, where only the Latin-script name changed) and "Fictional IndTrana exercise desk" for approval
  drafts. The markers a recipient sees changed with it: identifiers `indtrana-proactive-exercise-...` /
  `indtrana-exercise-draft-...`, sender and addresses `@indtrana.invalid`, codes `INDTRANA-EXERCISE-NOT-FOR-TRANSMISSION`,
  `INDTRANA-DRAFT-NOT-FOR-TRANSMISSION` and `INDTRANA-SYNTHETIC-EXERCISE`. Version 1 stays on disk unchanged and loadable
  (`cap_templates.load_template_version`), and drafts made before keep the XML they were stored with, so before and
  after are told apart by their `aegis.cap_template_version` parameter. The Telugu and Hindi rows in
  `docs/NATIVE_LANGUAGE_REVIEW.csv` now carry IndTrana and stay pending native sign-off; translated blocks still come
  only from fixed templates and stay pending. The CAP parameter keys keep their documented `aegis.*` namespace (for
  example `aegis.run_id`), because they are a machine schema a recipient parses, not a name.
- **Staff email notices:** subject, body, link text and the sender display name (`IndTrana`).
- **Downloads:** `indtrana-exercise-...xml`, `indtrana-exercise-audit-...json`, `indtrana-shift-handover-...`,
  `indtrana-situation-brief-...md`, `indtrana-sample-exercise-cap.xml`.
- **Outbound HTTP identification:** `IndTrana-Proactive/1.0`, `IndTrana-EarthWatch/1.0`,
  `IndTrana-exercise-prototype/0.2` and `IndTrana-research-pilot/1.0`. No provider used here registers an exact agent
  string; OpenStreetMap asks only for a stable agent naming the app.
- **The local sign-in provider's own pages.** Keycloak reads `ops/local-idp/realm.json` only when the realm is first
  created, so a provider set up before the rename kept "AEGIS" until step 9 of `scripts/update-local-idp.ps1` set the
  realm display names and the web client name to IndTrana (fresh installs get them from `realm.json`). The address bar
  still shows the hostname `aegis-idp.localhost` and the realm `aegis-exercise` in the path: those are technical
  identifiers that sign-in depends on and stay as they are.

What was **not** renamed, on purpose, because changing it would break the existing database, sign-in or installs:

| Kept as is | Examples |
| --- | --- |
| Environment variables | `AEGIS_STAFF_EMAIL`, `AEGIS_PROACTIVE`, `AEGIS_WEB_PORT` |
| Token claims | `aegis_roles`, `aegis_agency_id`, `aegis_department_id`, `aegis_team_id` |
| Compose, containers, volume, database | project `ai-project-aegis`, volume `ai-project-aegis_pgdata`, database and user `aegis` |
| Local identity provider | realm `aegis-exercise`, clients `aegis-local-web` / `aegis-resource-server`, host `aegis-idp.localhost` |
| Private folders, cookies, storage keys | `%LOCALAPPDATA%\AEGIS`, `aegis-session`, `aegis-language` |
| Versioned ids used as data | `aegis.exercise.policy.v1`, `aegis.cap-templates.v2`, CAP parameter keys `aegis.*`, playbook `AEGIS-URBAN-FLOOD-EXERCISE-v0.1`, source id `AEGIS-EXERCISE-ONLY` |
| File, script and function names | `aegis.cmd`, `aegis.sh`, `scripts/aegis.ps1`, `Invoke-AegisLocalOperation` |
| Repository and history | `adityapuppala1/AI-Project-AEGIS`, branch names, CI workflow file, applied migrations, seed rows already in the database, versioned fixtures |

The two historical records, `docs/LOCAL_DEMO_HANDOFF.md` and `docs/LOCAL_DEMO_VERIFICATION_HISTORY.md`, keep the old
name in past rounds and carry a one-line note about the rename. `indtrana.cmd` and `indtrana.sh` are thin wrappers that
call `aegis.cmd` and `aegis.sh` with the same commands.

## Changing the name or logo

Sign in as a platform administrator and open **Administration > Brand** (`/admin/brand`).

- **Name:** 2 to 40 characters after trimming; letters, digits, single spaces and `. - & '` only; no control or hidden
  characters. It is stored and shown as plain text, never as HTML.
- **Logo:** PNG, JPEG or WebP only, at most 256 KB and 4096 x 4096 pixels. The type is decided by the file's own bytes
  (not its name or the type the browser declares) plus a structural check (PNG signature, IHDR and IEND; JPEG start and
  end markers and a frame header; RIFF/WEBP with a valid size). SVG, GIF, ICO, HTML and anything else is refused. The
  page shows a live preview before you save. Any shape is fitted inside a fixed box, so a tall or wide logo never shifts
  the layout.
- **Restore defaults** puts back the name IndTrana and the built-in mark.

Every change needs the current version (a second administrator's earlier save is never silently overwritten: the page
says so and shows the latest settings) and writes one row to the append-only `brand_audit` table with the actor, the
action and, for a logo, its media type, size and SHA-256. The audit never holds the logo bytes.

## What the configured name affects, and what it does not

The name is an administrator-trust setting: whoever holds `platform_admin` decides it. It must not imitate a
government body, an agency or another organisation, and it is not a statement of who operates the system.

A custom name appears in:
- the app shell (product name, logo slot and the link label beside it, the phone header and the print line);
- the landing, welcome and sign-in pages (their visible text, the logo slot, its link label and page descriptions);
- page and tab titles, and the browser icon when a logo is set;
- reviewed interface strings shown through the translation hook (English, Telugu and Hindi). Only strings in the
  translation table or the pending-review register are changed, in one pass; anything else passed to the hook is
  shown unchanged.

It does **not** appear in (these keep the built-in text):
- record content: cases, proposals, operator notes, audit lines, CAP previews and anything else fetched from the API;
- tooltips and other attributes, except the three logo-link labels named above;
- the sign-in provider's own pages (the local Keycloak theme), staff email notices, CAP blocks, exports and audit
  records' fixed text, or anything else that leaves the browser.

Nothing rewrites the page as a whole. A failed brand read falls back to the defaults silently, so sign-in never breaks.

## How it works

- Database: `db/migrations/019_brand_settings.sql` (additive, idempotent; wired into `compose.yaml` after the staff
  email migration) adds the one-row `brand_settings` table (name, logo bytes, logo media type, version, updated at,
  updated by) and the append-only `brand_audit` table.
- API (`services/api/app/brand.py`): `GET /v1/brand` and `GET /v1/brand/logo` are deliberately open (the signed-out
  pages need them) and return only the name, the logo version and the image. The image is served with its stored type
  from a fixed allowlist, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`,
  `Content-Disposition: inline` with a fixed file name, a five-minute cache and an ETag derived from the version
  (`If-None-Match` gets 304). Both open reads use a five-second in-process cache that every write clears; the web
  layout reads the brand once per render. `brand_audit` refuses UPDATE, DELETE and TRUNCATE. `GET /v1/brand/settings`,
  `PUT /v1/brand/name`, `PUT /v1/brand/logo`, `POST /v1/brand/reset` and `GET /v1/brand/audit` need `platform_admin`
  in the exercise agency. Errors use fixed codes (`brand_name_length`, `brand_logo_unsupported_type`,
  `brand_version_conflict`, ...).
- Web: `apps/web/lib/brand.ts` holds the defaults and the rules; `components/brand-provider.tsx` supplies the current
  brand; `lib/brand-proxy.ts` and `app/api/brand/**` are the browser routes. `/api/brand` and `/api/brand/logo` are listed
  as public in `lib/session-gate.ts`; `/api/brand/admin/*` stays behind sign-in, checks the same origin for writes,
  enforces the 256 KB cap itself before forwarding and forwards the session bearer server-side.
- Tests: `services/api/tests/test_brand.py`, `apps/web/scripts/tests/brand-proxy.test.cjs`.
