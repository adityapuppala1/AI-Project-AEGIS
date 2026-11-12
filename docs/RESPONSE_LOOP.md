# Team response loop (rehearsal)

Added 12 November 2026. **Exercise only.** It closes the last gap in the chain: after two officers approve a
proposal and a department desk accepts its task, the desk can request synthetic response teams, the teams answer
inside AEGIS, and every answer is logged against the incident.

## What it is and is not

- An in-app loop between people who are signed in to AEGIS. A team is "alerted" by a request appearing on its
  **My Team** page and by a count on the menu. **Nobody is called, texted, emailed or radioed.** There is no
  transport of any kind in this feature and none may be added without the owner lifting the no-dispatch rule.
- Teams are the five invented teams in `services/api/app/fixtures/synthetic_teams.v1.json`. They are not real units,
  rosters, locations or capacities. Travel times are planning estimates from the same fixture, labelled as such.
- A request can exist only under a proposal that a different checker approved, and only for a task its department
  desk has acknowledged. Software never creates a request: not the scheduler, not the pre-positioning planner, not
  the copilot. A signed-in department desk does.
- Team answers never change a proposal, an approval, a CAP draft or the incident's status. They add lines to the
  incident timeline and to the audit trail.

## Who does what

| Role (signed claim) | Can do | Cannot do |
|---|---|---|
| `department_operator` + `aegis_department_id` | See suggested teams for an acknowledged task of its own desk; request a team; record an answer on a team's behalf (marked "relayed by desk"); stand a team down; mark a flagged request as handled | Touch another desk's tasks or requests |
| `response_team` + `aegis_team_id` (new) | See requests for its own team; accept or decline; report en route, on site, completed; send a situation report; ask for support | See other teams' requests, proposals or audit; request or stand down teams |
| `incident_operator`, `incident_checker`, `incident_auditor` | Read all requests and reports of their agency | Write anything here |
| `platform_admin` | Nothing here (same as proposals) | |

Authority always comes from the verified token (`aegis_roles`, `aegis_agency_id`, `aegis_department_id`,
`aegis_team_id`). The browser never supplies a team, a department or an actor. `aegis_team_id` must be one of the
fixture team ids; a token with the `response_team` role and no valid team id is refused.

## Lifecycle

```
requested ──► accepted ──► en_route ──► on_site ──► completed
    │             │            │            │
    ├──► declined │            │            │
    └─────────────┴────────────┴────────────┴──► stood_down   (desk only)
```

Terminal states: `declined`, `completed`, `stood_down`.

Report kinds and who may record them:

| Kind | Changes state to | Allowed from | Team | Desk (relay) | `code` (closed list) |
|---|---|---|---|---|---|
| `accepted` | accepted | requested | yes | yes | none |
| `declined` | declined | requested | yes | yes | required: `already_committed`, `out_of_area`, `not_equipped`, `off_shift`, `other` |
| `en_route` | en_route | accepted | yes | yes | none |
| `on_site` | on_site | en_route | yes | yes | required: situation list below |
| `completed` | completed | on_site | yes | yes | required: situation list below |
| `situation_report` | (none) | accepted, en_route, on_site | yes | yes | required: `as_expected`, `worse_than_expected`, `better_than_expected`, `access_blocked`, `nothing_found` |
| `needs_support` | (none), sets the attention flag | accepted, en_route, on_site | yes | yes | required: `more_people`, `equipment`, `medical`, `transport`, `other` |
| `stood_down` | stood_down | requested, accepted, en_route, on_site | no | yes | none |
| `desk_handled` | (none), clears the attention flag | any state while the flag is set | no | yes | none |

Every report carries a note of 10 to 1000 characters (no control characters), the expected `version` of the request,
and the authority it was recorded under: `team`, `department_relay` (desk on a team's behalf) or `department`.
`declined` and `needs_support` set `needs_attention`; `desk_handled` and `stood_down` clear it.

Retry protection: a write whose expected version is one behind and whose kind, actor, note and code equal the last
report returns the current request unchanged. Any other version mismatch is a 409 "changed; refresh".

## Choosing the right team

`GET /teams` returns every fixture team with the facts behind the suggestion; the desk decides.

1. The incident's hazard label maps through a fixed table to a fixture hazard key (`Heavy rainfall` → `heavy_rain`;
   `Urban waterlogging`, `Road inundation`, `Water-level observation`, `Drainage obstruction` → `flood_gauge`). An
   unknown label gives `capability_basis: "not_assessed"` and no suggestion; it is never guessed.
2. `matched_capabilities` = team capabilities ∩ the hazard's required capabilities.
3. `free_capacity` = fixture capacity − the team's active requests (requested, accepted, en_route, on_site).
4. `available_now` from the fixture's daily window (UTC).
5. `estimated_travel_minutes` from the team base to the incident point with the fixture travel model. Planning
   estimate only.
6. Order: more matched capabilities, then free capacity, then available now, then shorter estimate, then id.
   `suggested` is true for teams with a match, free capacity and availability.

A request is refused (409) when the team has no free capacity, is outside its window, or (when the hazard was
assessed) has no matching capability. One active request per proposal, task and team.

## API (`/v1/exercise/response`, bearer token required on every route)

| Route | Who | Body / query | Notes |
|---|---|---|---|
| `GET /teams?proposal_id=&task_id=` | desk | | Task must be the desk's own and `acknowledged` |
| `GET /requests?incident_id=` | team, desk, readers | optional incident filter | Team sees its own team only; desk its own department only; readers the agency |
| `POST /requests` | desk | `proposal_id`, `task_id`, `team_id`, `expected_assignment_version`, `note` | 201. Creates the `requested` report |
| `POST /requests/{id}/reports` | team, desk | `kind`, `expected_version`, `note`, `code?` | Unknown fields are refused |
| `GET /alerts` | any signed-in role | | `{count}`: team = requests awaiting its answer; desk = its prepared tasks + flagged requests; others 0 |

Request shape returned to callers: `id`, `incident {id, hazard_label}`, `task {id, summary, department}`,
`team {id, label, kind}`, `state`, `version`, `needs_attention`, `requested_at`, `updated_at`,
`reports [{kind, occurred_at, authority, code, note, mine}]`, `exercise_only: true`,
`outbound_messages_sent: false`. Actor subjects are never returned by these routes; they live in the audit trail.
A team caller does not receive the proposal id.

Errors are fixed strings; raw exceptions and connection details never leave the API.

## Storage (migration `017_response_loop.sql`, additive)

- `exercise_team_requests`: id, proposal_id → `action_proposals`, incident_id → `incidents`, agency_id, task_id,
  department_id, team_id, team_label, state, version, needs_attention, requested_by, requested_at, updated_at,
  `synthetic` (must be true), `outbound_messages_sent` (must be false). Partial unique index on
  (proposal_id, task_id, team_id) for active states.
- `exercise_team_reports`: append-only. id, request_id, kind, code, note, authority, actor_subject, occurred_at,
  `synthetic` (must be true).

One transaction per write: lock the proposal row (create) or the request row (report), check scope and state, write
the request, the report, the incident timeline line and the audit event together. Team capacity is serialised with a
per-team advisory lock.

`close_task` in `workflow_store.transition` refuses while the task still has active team requests.

## What reaches the incident and the audit trail

- **Incident timeline** (`exercise_incident_events`, visible to the whole exercise agency): one line per
  state-changing report, situation report and support request, built only from fixed templates, the fixture team
  label and the closed codes, always starting with `SIMULATION:`. Type `coordination`; `resolution` when the last
  active request on the incident ends and at least one was completed. **Notes are never copied here.**
- **Audit** (`audit_events`, resource `exercise_proposal`): `team_requested` and `team_report_recorded` with agency,
  request, team, task, department, kind, state, version, authority, code, note, `exercise_only: true`,
  `outbound_messages_sent: false`.

## Web

- **My Team** (`/my-team`, response teams, phone first): requests for the signed team with the next action as one
  large button, a note box, the report history.
- **Department Inbox**: on an acknowledged task, "Request a team" with the suggestion facts, the task's requests,
  "Record for the team", "Stand down", "Mark handled".
- **Incident page** and **Response Teams**: read-only view of requests and reports.
- **Menu count** for teams and desks, refreshed every 30 seconds while the tab is visible. No sound, no browser
  notification, no push.
- Browser routes: `/api/response/teams`, `/api/response/requests`, `/api/response/requests/[id]/reports`,
  `/api/response/alerts` through `lib/response-proxy.ts` (session, role, Origin on writes, field allowlist, size
  and id checks). All behind the sign-in gate.

## Local accounts

`scripts/update-local-idp.ps1` adds the `response_team` role, the `aegis_team_id` account attribute (administrators
only) and its access-token mapper. `scripts/new-demo-accounts.ps1` adds `demo-team-rescue`
(`syn-team-rescue-01`) and `demo-team-medical` (`syn-team-health-01`).

## Checks to run for changes here

API: `tests/test_response_loop.py`, `tests/test_department_tasks.py`, `tests/test_task_reassignment.py`,
`tests/test_exercise_workflows.py`; opt-in PostGIS `tests/test_postgis_response_loop.py`.
Web: `scripts/tests/response-proxy.test.cjs`, `scripts/tests/shell-uniformity.test.cjs`, the gate tests in
`scripts/tests/alert-journey.test.cjs`.

## As built (12 November 2026)

- Code: `services/api/app/response_loop.py` (pure rules), `response_store.py` (transactions), `response_routes.py`
  (routes); `apps/web/lib/response-proxy.ts`, `lib/response-teams.ts`. The opt-in PostGIS test lives in
  `services/api/integration_tests/test_postgis_response_loop.py`, like the other opt-in PostGIS tests.
- Free capacity counts active requests **within the caller's agency** (no cross-agency information is read).
- An exact repeat of `POST /requests` (same desk, task, team and note while the request is active) returns the
  existing request with 200 instead of a second 201; any other duplicate is 409.
- Tokens holding `platform_admin`, or both `response_team` and `department_operator`, are refused on every route
  except `/alerts`, which answers `{count: 0}` for administrators and readers.
- Desk and reader views include `proposal_id`; team views never do. Every response also carries `label`
  ("Exercise only. Nobody was called, texted, emailed or radioed.") and the list carries `view`.
- Notes are trimmed and refused if they contain control, format or line/paragraph-separator characters.
- `desk_handled` adds no timeline line (it changes nothing a reader of the timeline needs).

## Not included

Real delivery to responders (SMS, calls, push, radio gateways), real rosters and live locations, photos or
attachments, a mobile app, and automatic changes to an incident's status. Each needs an owner decision first.
