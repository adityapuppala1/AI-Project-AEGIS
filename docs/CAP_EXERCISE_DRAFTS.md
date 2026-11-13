# Private exercise CAP XML drafts

The existing approval workflow can export a **local artifact**, not send an
alert. There is no SMTP, webhook, CAP feed, responder transport or live-warning
connection. The owner chose to keep the local IdP inactive; this feature stays
locked under that configuration. No test creates a production sign-in bypass.

## Workflow

1. A verified operator creates a `prepare_warning` proposal for a signed-agency
   synthetic case. The server captures the illustrative playbook and evidence.
2. Submit and obtain a recorded approval from a different authorized checker.
   Draft, submitted, rejected, self-reviewed, uncited/legacy and other-action
   proposals cannot export. Recorded reviewer rationale is required.
3. On the approved proposal in `/approvals`, use **Download exercise CAP XML
   draft**. API: `GET /v1/exercise/proposals/{id}/cap-draft`; same-origin BFF:
   `/api/proposals/{id}/cap-draft`. Signed operators, checkers and auditors may
   read only their own agency's proposal. Anonymous access remains locked.
4. Review the XML locally. Never transmit it or use it for emergency operations.

## Artifact boundaries

- CAP 1.2 namespace, `status=Draft`, `msgType=Alert`, `scope=Private`.
- Fictional `.invalid` sender/addressee, explicit synthetic-exercise code,
  never-transmit note, headline, description and instruction.
- Urgency, severity and certainty are **Unknown**. No risk probability, inferred
  flood footprint, polygon/circle or claimed real impact is added.
- Captured incident/playbook/evidence/source UUIDs and context limitations are
  preserved. Free text is XML-escaped; invalid XML characters are rejected.
- `sent` uses the recorded approval instant in CAP offset format, to seconds;
  it is not a forecast, current observation, or transmission timestamp.
- Repeated downloads return the same bytes for the same captured approval,
  including after task simulation. Reads do not add decisions or dispatch
  events. The private audit remains the source of approval rationale/history.
- Responses are `no-store`, `nosniff`, and attachments with UUID-derived names.
  Backend denial JSON is not converted into a downloadable XML file.

This is an exercise-only CAP-format prototype, not agency-profile certification,
a signed message, a validated hazard warning or proof of real human acceptance.

## Executed validation

Native Windows: 239 API tests passed (four database tests skipped in that run),
model reproduction and typecheck passed. Four separate real PostGIS tests
passed, including premature-export denial, actual signed TEST-key maker/checker
approval, cross-agency/anonymous denial, deterministic XML and no export side
effects. Ephemeral test keys do not establish real IdP/MFA acceptance.

Five isolated Node proxy tests passed on Windows and Linux:
`cd apps/web; node --test scripts/tests/proposal-proxy.test.cjs`.
They replace auth/fetch only inside a test loader and never enable deployed
sessions. Backend XML bytes, attachment/cache headers, denial JSON, incorrect
content type and locked sessions are checked.

A generated synthetic unit-fixture artifact passed XSD validation using both
Linux lxml and Windows .NET with network/entity resolution disabled. The XSD
was extracted without executing code from the PyPI `capvalidator` 0.1.0.dev4
wheel (SHA-256 `ac803b68402dd8a58793172c62cf76812c43a2b44597e00e9e2088f239c9b580`),
whose embedded schema retains its OASIS copyright notice. Schema SHA-256 in the
Linux extraction: `dd73a2e1f76efa451814b02b127bbf4c86cedc7bb21a77204231c38c84d8fd36`.
This validates that packaged CAP 1.2 schema, not an additional national/agency
profile. Direct retrieval from docs.oasis-open.org was blocked by the managed
network policy; TLS/proxy policy was not bypassed. The package was inspected
through the permitted package registry; its code was not installed or executed.

XSD and sample are local test artifacts under laptop `.git/`, not application
assets or runtime dependencies. lxml is test tooling in the Linux verification
venv only; no API/web dependency was added. Full production rebuild, sampled
browser/axe and HTTP/checksum checks ran on the laptop; see the current handoff
for source SHAs, commands, latest contract follow-up and pending human gates.


## Multilingual info blocks (roadmap A10) - 4 November 2026

Status: implemented on `feat/agentic-proactive-l3` and unit-tested on the Windows laptop; not yet XSD-validated
or browser-checked, and **every Telugu/Hindi string is pending native review**.

- The proactive exercise CAP (`app/proactive_cap.py`) keeps its English `<info>` block unchanged and adds
  `te-IN` and `hi-IN` `<info>` blocks (CAP 1.2 permits several), built with ElementTree as before. Codes
  (category, urgency, severity, certainty, circle) are copied from the English block.
- Text comes only from `app/fixtures/cap_templates.v1.json` (`app/cap_templates.py`). Placeholders accept
  integers (people, facilities, roads), a bounded number (radius) and closed-list codes (hazard, state,
  exposure basis, area). Area is a validated code derived from the trigger point id, never free text. Any other
  value, including injection strings, raises `CapRefused`; the fixture loader rejects templates with other
  placeholders, format specs or markup.
- Each translated block carries `indtrana.language_review_status` and `indtrana.cap_template_version` (drafts made before template version 3 carry the earlier `aegis.*` keys) parameters;
  the alert `<note>` names pending languages. A language is `approved` only when every string has a row in
  `docs/NATIVE_LANGUAGE_REVIEW.csv` whose translation matches exactly, is marked `y` and names a reviewer. If the
  CSV is not reachable (the API container does not mount `docs/`) the status is `pending` (fail closed).
- Run state `cap.languages` exposes the statuses; the run UI shows a "pending native review" pill per language.
- Owner action: a native Telugu and Hindi reviewer fills the 25 template rows appended to
  `NATIVE_LANGUAGE_REVIEW.csv`. A correction needs a template fixture change and re-review.
