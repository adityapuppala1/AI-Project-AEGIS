# Patent and the Resilient Sensor Link rehearsal

## Facts (single source: `apps/web/lib/patent.ts`)

- Indian Patent No. 598835, Application No. 201741007139.
- Filed 28 February 2017; granted 12 August 2026; term 20 years from 28 February 2017.
- Title: "Dynamic Bandwidth System for IoT Networks via Satellite and Internet Infrastructure".
- Patentee: Bharath Bejjarapu, a co-owner of IndTrana. Issued by The Patent Office, Government of India, under the Patents Act, 1970.

- Published description (taken from a public listing of the publication notice; not verified against the Patent Office record, and not from the specification): "The published application describes an aggregated IoT platform with dedicated IoT networks connected by satellite and internet infrastructure, for providing bandwidth on demand." Stored as `PATENT.publishedDescription` and shown on the Resilient Sensor Link page only.

Certificate (title page): [05_Patent_Grant_In_Satellite_Internet.pdf](05_Patent_Grant_In_Satellite_Internet.pdf). A copy at `apps/web/public/patent/patent-598835-certificate.pdf` is served to signed-in users only (the sign-in gate covers it; it is not in the public path list).

## What the page shows

`/sensor-link` ("Resilient Sensor Link", signed-in only, under Observe next to Source Freshness) is a browser-only, deterministic simulation. Twelve synthetic sensors around Hyderabad, in four priority classes, ask for bandwidth. Two link pools (ground internet, satellite) carry them. Five scenarios (Normal, Ground degraded, Ground cut, Satellite reduced, Both down) and a "trigger near" toggle change the allocation. Life-safety gauges are served first (the priority classes and switch-over rules are IndTrana's rehearsal choices, not the patent's claims); routine and housekeeping feeds are reduced or held when capacity is short. A second table shows which link the control room, two desks and four field teams would use, as an illustration of the communication application.

The patent's title names a dynamic bandwidth system for sensor (IoT) networks over satellite and internet infrastructure. IndTrana applies that idea to its Sense step and to control-room, desk and team contact, as a rehearsal. Described here from the patent's title and the public publication notice; the full specification has not been reviewed for this page.

## How it fits IndTrana's alert path

The page opens with a **Storm timeline**: five ordered moments, each selecting one of the existing link scenarios (model: `STORM_STEPS` in `lib/patent.ts`). Previous and Next buttons and the numbered steps move through it; choosing a scenario by hand shows "Custom: chosen by hand". There is no auto-play. Under the schematic, **What stays possible** gives three counts derived from the allocation: life-safety sensors reporting, lower-priority feeds held, and whether control room, desks and teams have a link.

| Storm moment | Link state (scenario) | What the control room keeps |
|---|---|---|
| 72 hours before landfall | All links up (Normal) | Every sensor reports. |
| 12 hours before landfall | Ground degraded | Ground capacity is reduced and the lowest-priority feeds start to wait. |
| Landfall | Ground cut | Life-safety gauges keep reporting over satellite, and lower-priority feeds wait. |
| Peak | Satellite reduced | Satellite capacity is reduced; life-safety gauges are served first and lower-priority feeds wait. |
| Recovery | All links up (Normal) | Held feeds catch up. |

All values are synthetic rehearsal values. The moments and the sentences are IndTrana's illustration, not statements about the patent's claims.

## What a field deployment would need

Open items, not facts about the patent:

- Sensor gateways able to use both link types.
- Satellite terminals and licensed capacity from an authorised provider.
- A bandwidth policy agreed with the agency.
- Security review of the links.
- Testing against real outages.
- Review of the patent specification by its owner.

## Limits

- Nothing is transmitted. No satellite or radio link is used. No network call, no stored data.
- Link states, bandwidth numbers and sensors are synthetic rehearsal values, not measurements.
- A field deployment would need dedicated hardware and licensed satellite capacity.
- The communication application stays an in-app rehearsal: the team response loop sends nothing (see RESPONSE_LOOP.md and COMMUNICATION_CHANNELS.md).

## Not claimed

No performance figures or benefits of any kind are stated. No statement about how the claims work internally. IndTrana itself is not stated to be patented. Only the certificate (title) was available; this mapping is based on the patent title and the public publication notice until the full specification is reviewed.

## Where it appears

Signed-in About page and the Resilient Sensor Link page (`components/patent-credit.tsx`); a text-only section on the public landing page; a one-line link on Source Freshness; a one-line link on the Command Center source monitor; a one-line link on the Team Availability page `/response-teams` (the page desks and coordinators use; it also embeds the field-teams section; the link goes to the `#communication` panel); an optional "Also see" link on the Guided exercise stage "Check source freshness" (still 11 stages). Test: `apps/web/scripts/tests/sensor-link.test.cjs`.
