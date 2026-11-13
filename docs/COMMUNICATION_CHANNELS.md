# Communication channels

How AEGIS reaches its own staff (operators, department desks, response teams), what an
administrator can set up today, and what is still locked.

Public warnings are a different subject. AEGIS never sends them; an authorised officer hands the
approved CAP draft to the alerting authority (NDMA / SDMA through SACHET). Nothing on this page
changes that.

## Owner decision (12 November 2026)

Asked "Do you want real sending for staff messages? If yes, say so explicitly, because it lifts the
no-dispatch rule", the owner answered "yes please proceed". The no-dispatch rule is lifted for **one
thing only: email notices to AEGIS's own signed-in staff who have opted in.**

Still forbidden: SMS, WhatsApp, push, public warnings, messages to outside agencies, any transport in
the team response loop (docs/RESPONSE_LOOP.md), and any free text or case content in a message.

## What exists today

| Channel | State | Who it reaches | Leaves this server? |
|---|---|---|---|
| In-app alerts | In use | People signed in to AEGIS: counts on the menu, the Department Inbox, My Team, Approvals | No |
| Email (Twilio SendGrid) | Can send, off by default (two switches) | AEGIS staff in the same agency who turned on **Email notices**, at their verified sign-in address | Yes, when both switches are on |
| SMS (Twilio) | Credentials only, sending locked | Nobody | Only the credential check |
| WhatsApp (Meta Cloud API) | Credentials only, sending locked | Nobody | Only the credential check |
| Mobile app push | Not built | Nobody | No |

"Sending locked" means there is no code in AEGIS that calls that provider's send endpoint.

## Email notices

### Two switches, both default off

1. **Host switch** `AEGIS_STAFF_EMAIL=1`, set only by `compose.staff-email.yaml`, which
   `scripts/start-windows.ps1 -Proactive -StaffEmail` adds. `-StaffEmail` refuses to start without
   `-Proactive`, because the SendGrid key lives in the encrypted connector vault. Without the host
   switch every `/v1/staff-messages/*` route answers 404 and nothing is read, sent or logged.
2. **Email connector switch** on **Administration → Connectors → Email provider**. A platform
   administrator can switch it on only once the API key and sender address are saved
   (`422 required_secret_missing` / `required_setting_missing` otherwise). Switching it off is the
   kill switch: it is read before every send and stops sending at the next attempt.

### Consent and the contact register

- Each person turns notices on or off under **Email notices** on the Help page. The address is never
  typed: the API takes it only from the verified sign-in token (`email` claim with `email_verified`
  exactly `true`). Without such a claim, turning notices on is refused with `verified_email_required`.
  Reserved test domains (`.invalid`, `.test`, `.example`, `.localhost`, `.local`; the local demo accounts
  use `example.invalid`) are refused with `undeliverable_address`.
- Turning notices off is always possible, needs no address, removes the stored address and stops
  sending immediately.
- Roles, agency and the verified address in the register are refreshed from the token whenever the
  person reads or changes the preference, sends a test, reads the approvals list or changes a proposal
  (the last two after the response, best effort, never affecting the route). If a later token carries no
  verified address, a reserved one, or a different address, the opt-in is ended and the person must opt
  in again; an address is never silently replaced.
- A register row not refreshed in the last 24 hours never receives: it is suppressed with
  `stale_contact` and logged.
- Tables (db/migrations/018_staff_messages.sql, additive and idempotent): `staff_contacts` (one row per
  subject; an address only while opted in) and `staff_message_log` (append-only, enforced by a trigger;
  never an address, provider body, exception text or key). A send writes two rows with the same
  `attempt_id`: `queued` before the provider call and the outcome after it. A suppressed attempt writes
  one row. The admin view shows one line per attempt; a lone `queued` line means the outcome could not
  be recorded and the email may have gone.

### What is sent

Only fixed English templates in `services/api/app/staff_messages.py` (Telugu and Hindi need native
review first). Placeholders may only be integers or closed codes; both current templates take none.
Every subject starts `[AEGIS exercise]`, every body says it is a rehearsal notice, carries no incident,
proposal, rationale or personal content, and at most one fixed AEGIS page link under `APP_ORIGIN`.

| Template | When | To |
|---|---|---|
| `test_notice` | A person presses **Send a test to my address** | Only that person's own registered address |
| `approval_waiting` | A proposal is submitted for review | Opted-in contacts in the same agency whose role snapshot includes `incident_checker`, never the maker |

The submit hook runs as a background task after the workflow transaction has committed and after the
response is sent. It is best effort: a provider or database failure never fails, delays or changes the
submission, and approval rules are untouched. Approvals, rejections, tasks, the response loop,
proactive runs, drills and learning send nothing.

### Checks before every send, in order

1. Host switch on (otherwise nothing at all happens and nothing is logged).
2. Email connector enabled (`channel_disabled`; `channel_unavailable` if the setting cannot be read).
3. Recipient has consent and no opt-out (`no_consent`).
4. Register row refreshed within 24 hours (`stale_contact`).
5. The contact's agency equals the agency of the event, as passed in by the caller (`agency_mismatch`).
6. In a short transaction under a per-agency lock (given up after 2 s: `send_lock_unavailable`):
   per-recipient limit, 5 attempts an hour (`recipient_cap`), and per-agency limit, 200 attempts a day
   (`agency_cap`), both counting `queued` rows; then the `queued` row is committed. The provider call
   happens afterwards with no lock or transaction open.

Also: one self-test per person in flight at a time (`test_in_flight`, per API process), and one maker
triggers at most 10 `approval_waiting` events an hour (per API process; further submissions send nothing).

Then the key and sender are read (`secret_missing`, `setting_missing`, `connector_key_missing`,
`connector_secret_unreadable`) and one `POST https://api.sendgrid.com/v3/mail/send` is made through
`connectors.bounded_request` (fixed host, no redirects, no proxy, bounded size and time), one recipient
per call, open and click tracking off. Outcomes: `sent`, or `failed` with `provider_rejected`,
`provider_status`, `timeout`, `network_error`, `invalid_response` or `send_failed`. Every attempt past
the host switch writes one log row; the provider body is discarded.

### Routes

| Route | Who | What |
|---|---|---|
| `GET/PUT /v1/staff-messages/preference` | Any staff role, exercise agency | Read or change my own opt-in (`{ "opted_in": true/false }` only) |
| `POST /v1/staff-messages/test` | Any staff role, exercise agency | Send `test_notice` to my own registered address |
| `GET /v1/staff-messages/log` | `platform_admin`, exercise agency | Last 100 attempts for the agency, addresses masked (`a***@domain`) |

The web app forwards these through `/api/staff-messages/*` (lib/staff-email-proxy.ts), which accepts
only the opt-in flag and never an address.

## Identity provider requirements

The address is trusted because the identity provider says it is verified. So the provider must mark an
address verified only after confirming it (for example a confirmation link), and must reset that flag
when a user changes the address.

In the local Keycloak realm, `scripts/update-local-idp.ps1` (step 8, run on 13 November 2026) makes the
email address editable by an administrator only, so a person cannot replace their own address and keep
it marked verified. **Still open:** the realm does not send confirmation links (`verifyEmail` is off,
and turning it on needs a mail server in the provider), so an address is only as good as the
administrator who entered it. The demo accounts carry `example.invalid` addresses, which AEGIS
refuses as undeliverable. An agency's own provider must confirm addresses before real use.

## Setting up a provider (administrator)

1. Start AEGIS with `-Proactive` and make sure `AEGIS_CONNECTOR_KEY` is set
   (`scripts/new-connector-key.ps1`). The key encrypts every stored credential. Add `-StaffEmail` to
   allow email notices.
2. Sign in as a platform administrator and open **Administration → Connectors**. The providers are
   under **Communication channels**.
3. Enter the values below, press **Save**, then **Check credentials**. For email, switch it on and save
   when you want notices to go out; the card also has **Send a test to my address** and the message log.

| Provider | Enter | Where to get it | What the check does |
|---|---|---|---|
| Email | API key (secret), sender email address | SendGrid → Settings → API Keys (Mail Send permission); verify the sender address or domain first | `GET api.sendgrid.com/v3/scopes` |
| SMS | Account SID, auth token (secret), sender number or sender ID | Twilio console. For Indian numbers the sender header and every template must be registered on an operator's DLT portal | `GET api.twilio.com/2010-04-01/Accounts/{SID}.json` |
| WhatsApp | Access token (secret), phone number ID | Meta WhatsApp Business account: a permanent system-user token and a registered number; message templates need Meta approval | `GET graph.facebook.com/{phone number ID}?fields=id` |

Each check is a read of the account itself. It sends no message and records only pass or fail,
the HTTP status and the time taken in the connector audit. The email check also fails a key that
lacks the Mail Send permission. A check made before the last save no longer counts, so check again
after changing a value. Secrets are write-only: the page shows an 8-character fingerprint, never the value.

All three providers are paid services. The owner opens and pays for any account; AEGIS does not need
one to run.

## Rules in the code

- `services/api/app/connectors.py`: `comms_email` has `delivery: "send"` and can be enabled;
  `comms_in_app` (`built_in`), `comms_sms` and `comms_whatsapp` (`locked`) answer
  `409 channel_cannot_be_enabled` and read a tampered row as off.
- `services/api/app/staff_messages.py` is the only module that calls a send endpoint.
  `tests/test_proactive_connectors.py` fails if `mail/send` or the SendGrid host appears in any other
  module (apart from the registry), if the Twilio or Meta hosts appear outside the registry, or if
  `Messages.json`, `/messages`, `smtplib` or `sendmail` appear anywhere.
- `tests/test_staff_messages.py` covers each gate, opt-out, cross-agency refusal, the maker never being
  notified, both limits, provider failures not breaking submission, no key or address leakage, the 404
  with the host switch off, and role and agency checks. The web proxy is covered by
  `apps/web/scripts/tests/staff-email-proxy.test.cjs`.

## Still locked: what SMS or WhatsApp sending would need

1. The owner lifts the no-dispatch rule in writing for that channel, and a security review covers it.
2. A verified phone number per person, tied to the signed-in identity, with recorded consent and an opt-out.
3. Fixed templates with closed codes only, registered with DLT for SMS and approved by Meta for WhatsApp.
   Telugu and Hindi text needs native review first.
4. Delivery status handling and retry rules (email today records the provider's immediate answer only;
   there are no retries and no delivery webhooks).
5. Other providers if the agency prefers them (for example an NIC mail relay or SMS gateway, or
   MSG91). Each is a new registry entry with its own fixed host.
