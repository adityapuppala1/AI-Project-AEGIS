# Communication channels

How AEGIS reaches its own staff (operators, department desks, response teams), what an
administrator can set up today, and what is still locked.

Public warnings are a different subject. AEGIS never sends them; an authorised officer hands the
approved CAP draft to the alerting authority (NDMA / SDMA through SACHET). Nothing on this page
changes that.

## What exists today

| Channel | State | Who it reaches | Leaves this server? |
|---|---|---|---|
| In-app alerts | In use | People signed in to AEGIS: counts on the menu, the Department Inbox, My Team, Approvals | No |
| Email (Twilio SendGrid) | Credentials only, sending locked | Nobody | Only the credential check |
| SMS (Twilio) | Credentials only, sending locked | Nobody | Only the credential check |
| WhatsApp (Meta Cloud API) | Credentials only, sending locked | Nobody | Only the credential check |
| Mobile app push | Not built | Nobody | No |

"Sending locked" means there is no code in AEGIS that calls a provider's send endpoint. The
project rule (AGENTS.md: no live warnings, dispatch or external messages; no transport in the
team response loop) still holds. Storing a key does not turn anything on.

## Setting up a provider (administrator)

1. Start AEGIS with `-Proactive` and make sure `AEGIS_CONNECTOR_KEY` is set
   (`scripts/new-connector-key.ps1`). The key encrypts every stored credential.
2. Sign in as a platform administrator and open **Administration → Connectors**. The providers are
   under **Communication channels**.
3. Enter the values below, press **Save**, then **Check credentials**.

| Provider | Enter | Where to get it | What the check does |
|---|---|---|---|
| Email | API key (secret), sender email address | SendGrid → Settings → API Keys (Mail Send permission); verify the sender address or domain first | `GET api.sendgrid.com/v3/scopes` |
| SMS | Account SID, auth token (secret), sender number or sender ID | Twilio console. For Indian numbers the sender header and every template must be registered on an operator's DLT portal | `GET api.twilio.com/2010-04-01/Accounts/{SID}.json` |
| WhatsApp | Access token (secret), phone number ID | Meta WhatsApp Business account: a permanent system-user token and a registered number; message templates need Meta approval | `GET graph.facebook.com/{phone number ID}?fields=id` |

Each check is a read of the account itself. It sends no message and records only pass or fail,
the HTTP status and the time taken in the connector audit. The email check also fails a key that
lacks the Mail Send permission. A check made before the last save no longer counts, so check again
after changing a value. Saving records the non-secret settings (Account SID, sender, phone number
ID) in the audit. Secrets are write-only: the page shows
an 8-character fingerprint, never the value.

All three providers are paid services. The project's no-paid-infrastructure rule means the owner
opens and pays for any account; AEGIS does not need one to run.

## Rules in the code

- `services/api/app/connectors.py`: the four `comms_*` entries carry a `delivery` marker. The
  API answers `409 channel_cannot_be_enabled` to any attempt to enable one, and reads a tampered
  row as off.
- Hosts are fixed per provider (`api.sendgrid.com`, `api.twilio.com`, `graph.facebook.com`), with
  the same no-redirect, no-proxy, bounded request as every other connector.
- The Account SID and phone number ID are checked against a strict pattern before they are placed
  in a URL.
- `tests/test_proactive_connectors.py` fails if a send endpoint (`mail/send`, `Messages.json`,
  `/messages`, `smtplib`) appears in the module.

## What switching sending on would need

None of this is done. Each item is a decision or a piece of work for the owner.

1. The owner lifts the no-dispatch rule in writing for staff messages (AGENTS.md and
   docs/RESPONSE_LOOP.md), and a security review covers the sending service.
2. A contact register: a verified phone number or address per person, tied to the signed-in
   identity, with recorded consent and an opt-out. AEGIS holds no contact details today.
3. Fixed message templates with closed codes only (no free text, no proposal bodies, no personal
   data), registered with DLT for SMS and approved by Meta for WhatsApp. Telugu and Hindi text
   needs native review first.
4. A sending service with its own audit, rate limits, retry rules, a kill switch, delivery status
   handling and an exercise marker on every message.
5. Other providers if the agency prefers them (for example an NIC mail relay or SMS gateway, or
   MSG91). Each is a new registry entry with its own fixed host.
