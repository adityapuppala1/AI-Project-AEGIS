# Network Identifier Master

Status: built on 15 November 2026 for version 0.4.0, branch `Aegis_IndTrana` (Windows laptop). Design and research:
[specs/NETWORK_IDENTIFIER_MASTER.md](specs/NETWORK_IDENTIFIER_MASTER.md) (tracker: [specs/README.md](specs/README.md)).

Screenshots: [overview with 3D scene](screenshots/network-master-overview-3d.png), [dark](screenshots/network-master-overview-dark.png), [phone](screenshots/network-master-phone.png).

## What it is

`/admin/networks` (Administration > Network Identifier Master) is a `platform_admin` registry of the networks IndTrana's
rehearsals name:

- **providers**: satellite, mobile, fixed-line, tower companies and public reference sources
- **identifiers**: orbit class, CelesTrak group name, MCC-MNC codes, autonomous system numbers and bands
- **synthetic assets**: constellations, gateways and towers
- **a rehearsal link state** for each provider (up, degraded or down), plus a capacity value

The page has six tabs: Overview (schematic scene, counts, how the registry feeds IndTrana, patent credit), Satellite
networks, Terrestrial networks (mobile, fixed-line, towers), Towers and assets, Integrations, and Activity.

**Registry and rehearsal only.** IndTrana has no live connection to any provider and nothing is sent through any
network. No registry value creates, enriches or ranks a case, assessment, proposal, task, warning or CAP draft.

## How the registry feeds the product

| Stage | What happens |
|---|---|
| Sense | The first enabled terrestrial and satellite providers name the two lanes on the Resilient Sensor Link page. Their rehearsal states choose its starting scenario: ground down gives Ground cut, ground down with satellite degraded gives Satellite reduced, both down gives Both down, ground degraded gives Ground degraded. The five scenarios only reduce the satellite after the ground is cut, so a satellite problem while the ground works keeps Normal and the page says the satellite state is not shown. A scenario chosen by hand is never overwritten. |
| Predict | The existing Storm timeline shows which sensor classes stay served. It is a rehearsal, not a forecast. |
| Reach | The existing communication table names the lane each desk and team would use. Nothing is transmitted. |
| Learn | The Activity tab counts rehearsal state changes per provider. These are rehearsal statistics, not accuracy. |

The Sensor Link simulation (`lib/patent.ts`) is unchanged and pure. The page makes one in-app read, `GET
/api/network-lanes`, which returns enabled providers' names, monogram, colour, logo key and rehearsal state only. If
that read fails, the page keeps its built-in labels and starts on Normal.

## Rules

- **Who may do what:** every `/v1/admin/networks` route uses `scoped_operator(frozenset({"platform_admin"}))`, which
  includes the exercise-agency check. `/v1/network-lanes` uses `scoped_operator(EXERCISE_RECORD_ROLES)`. The web
  routes `app/api/networks/[[...path]]` and `app/api/network-lanes` forward only fixed paths, check the origin on
  writes and add the bearer server-side.
- **Every write is one transaction:** an optimistic version check (409 `network_version_conflict`) plus one row in
  the append-only `network_registry_audit`. Triggers refuse UPDATE, DELETE and TRUNCATE on that table. Audit rows hold
  field names only.
- **Deleting is a soft delete:** `deleted_at` is set and the entry is disabled. Restore brings it back, still
  disabled. There is no hard-delete route.
- **Links and logos come from code, never from typing:** documentation links come only from
  `services/api/app/network_catalogue.py`, each one read on 15 November 2026. Administrators choose a link by id; a
  URL can never be typed. The logo key is a closed set.
- **Credentials:** `PUT .../credential` encrypts the value with `app/connector_secrets` (AES-GCM, bound to
  `network:{id}`). Only an 8-hex fingerprint is ever returned. The value is never logged or audited, and the route
  needs `AEGIS_CONNECTOR_KEY`. No adapter uses a credential yet, and the page shows only the stored or none state.
- **Assets are always synthetic:** the database enforces `synthetic = true`, and a location must be inside India
  (latitude 6 to 38, longitude 68 to 98).
- **Seed:** `db/migrations/021_network_registry.sql` seeds 21 providers as reference entries (`is_reference`,
  disabled) and 12 synthetic assets around Hyderabad, with fixed ids and `ON CONFLICT DO NOTHING`. Listing a provider
  is not a partnership. No MNC or ASN values are seeded, because none were verified.

## Logos and names

Logo marks are bundled offline in `apps/web/lib/network-logos.ts`, with no hotlinking and no runtime fetch. They
come from Simple Icons 15.22.0 (CC0 1.0 Universal); only the SVG paths for SpaceX (shown on Starlink), Airtel and Jio
are copied, unchanged, with each brand colour and the source Simple Icons cites. Simple Icons has no mark for the
other providers, so they show a neutral kind icon and a monogram chip. No logo is drawn or approximated, and no
government emblem is used (the Simple Icons ISRO mark is deliberately not included). The page states: "Names and
logos belong to their owners; listing is not a partnership or endorsement."

## Patent

The Overview tab shows the existing `PatentCredit` (Indian Patent No. 598835, patentee Bharath Bejjarapu). It uses
wording from `lib/patent.ts` only: no claims, no performance figures, and IndTrana itself is never described as
patented.

## Not built (honest follow-ups)

- **CelesTrak public orbital reference adapter.** It would be opt-in, default off, a fixed HTTPS host, no redirects,
  an in-memory cache, stop on any error response, display-only. The page says it is not built in this release.
- **A credential input on the page.** The API routes exist and are tested.
- **Real tower data, live telemetry, any messaging through a provider and a live SACHET read.** Each needs an owner
  decision or a commercial agreement (see the spec, section 10).

## Tests

- API: `services/api/tests/test_network_registry.py` (roles, agency, validation, version conflict, soft delete,
  audit, credentials never returned or logged, lanes fields, migration shape) and `tests/test_route_auth_inventory.py`.
- Web: `apps/web/scripts/tests/network-master.test.cjs` (proxy allowlist, origin and role checks, fixed codes, lanes,
  scenario mapping, logos, no live claims), plus `mutating-route-origin`, `tours`, `release-notes`, `sensor-link` and
  `shell-uniformity`.
