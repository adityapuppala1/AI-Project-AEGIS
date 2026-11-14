# Patent and the Resilient Sensor Link rehearsal

## Facts (single source: `apps/web/lib/patent.ts`)

- Indian Patent No. 598835, Application No. 201741007139.
- Filed 28 February 2017; granted 12 August 2026; term 20 years from 28 February 2017.
- Title: "Dynamic Bandwidth System for IoT Networks via Satellite and Internet Infrastructure".
- Patentee: Bharath Bejjarapu, a co-owner of IndTrana. Issued by The Patent Office, Government of India, under the Patents Act, 1970.

Certificate (title page): [05_Patent_Grant_In_Satellite_Internet.pdf](05_Patent_Grant_In_Satellite_Internet.pdf). A copy at `apps/web/public/patent/patent-598835-certificate.pdf` is served to signed-in users only (the sign-in gate covers it; it is not in the public path list).

## What the page shows

`/sensor-link` ("Resilient Sensor Link", signed-in only, under Observe next to Source Freshness) is a browser-only, deterministic simulation. Twelve synthetic sensors around Hyderabad, in four priority classes, ask for bandwidth. Two link pools (ground internet, satellite) carry them. Five scenarios (Normal, Ground degraded, Ground cut, Satellite reduced, Both down) and a "trigger near" toggle change the allocation. Life-safety gauges are served first (the priority classes and switch-over rules are IndTrana's rehearsal choices, not the patent's claims); routine and housekeeping feeds are reduced or held when capacity is short. A second table shows which link the control room, two desks and four field teams would use, as an illustration of the communication application.

The patent's title names a dynamic bandwidth system for sensor (IoT) networks over satellite and internet infrastructure. IndTrana applies that idea to its Sense step and to control-room, desk and team contact, as a rehearsal. Described from the patent's title; the full specification has not been reviewed for this page.

## Limits

- Nothing is transmitted. No satellite or radio link is used. No network call, no stored data.
- Link states, bandwidth numbers and sensors are synthetic rehearsal values, not measurements.
- A field deployment would need dedicated hardware and licensed satellite capacity.
- The communication application stays an in-app rehearsal: the team response loop sends nothing (see RESPONSE_LOOP.md and COMMUNICATION_CHANNELS.md).

## Not claimed

No performance figures or benefits of any kind are stated. No statement about how the claims work internally. IndTrana itself is not stated to be patented. Only the certificate (title) was available; this mapping is based on the patent title until the full specification is reviewed.

## Where it appears

Signed-in About page and the Resilient Sensor Link page (`components/patent-credit.tsx`); a text-only section on the public landing page; a one-line link on Source Freshness. Test: `apps/web/scripts/tests/sensor-link.test.cjs`.
