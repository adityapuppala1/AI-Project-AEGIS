# Government deployment readiness (gap list)

Status: 11 November 2026. **IndTrana is a local synthetic-exercise prototype. It is not ready for government production use.**
This page lists what stands between the current code and such use, so nobody mistakes a working demo for a deployable
system. It is not legal or compliance advice. Requirement summaries below come from secondary sources (law-firm notes,
STQC pages) found by web search on this date; confirm every clause against the official text before relying on it.

Security test results and open findings: `docs/SECURITY_ASSESSMENT.md`.

## What the code already does

- OIDC sign-in with signed agency and role claims; maker and checker must be different people; audit trail on decisions.
- Every API data route needs a verified operator token with an explicit role list and agency check; only health, readiness
  and a refusal stub answer without one (12 November 2026, enforced by a route-inventory test).
- No send path: IndTrana exports a private Draft CAP only. Live warning, dispatch and notification are disabled by design.
- Secrets only in the host `.env` and an encrypted connector vault; no secret is shown in the browser.
- Public data is display-only, off by default (`-PublicEarth`), never written to the database or used by workflows.
- Browser security headers: a per-request nonce Content-Security-Policy for pages (`apps/web/middleware.ts`,
  `apps/web/lib/csp.ts`): scripts need the nonce (`'strict-dynamic'`, no `'unsafe-inline'`, no `'unsafe-eval'` in
  production), and connections and images are limited to this site only, with no third-party origin in the policy. API
  responses get `default-src 'none'`. Also `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, HSTS,
  no-sniff, referrer and permissions policies (`next.config.ts`). Tests cover the policy and the relay allow-list.
- Sign-in page (`/sign-in`): no password field exists in IndTrana; it only starts the OIDC flow (PKCE S256, state, nonce)
  at the agency identity provider. A failed hand-back returns to `/sign-in?error=verify` with a plain message.
- Every map (Command Center, Hazard Watch, Earth Watch) and the Alert Journey load tiles and data through the server
  relay, so the browser contacts no third-party host (checked on 26 routes, 10 Nov 2026 run).
- Alert Journey: feed-supplied text is escaped and links are rendered only for plain `https:` URLs; satellite orbits go
  through a cached server relay; exercise mode makes no third-party request unless the public-feeds switch is on.

## Known weaknesses in the current code

| Area | Gap | Why it matters |
|---|---|---|
| CSP | `style-src` still allows `'unsafe-inline'` (scripts no longer do) | The map library and the 3D page set inline styles. Style injection is a smaller risk than script injection, but removing it needs changes in those libraries' usage. |
| Viewer privacy | Done for all pages: every outside request goes through `/api/alert-journey/relay` (fixed host and path allow-list, no redirects, type and size checks, shared cache, rate limit). OpenStreetMap base tiles are always relayed; every other source stays closed unless `-PublicEarth`. | Sources no longer see viewers, but they see the server's address and the coordinates requested. An India-hosted mirror removes that too. The relay's cache and rate limit are in memory, per process, and the rate limit is keyed on the forwarded address, so it needs a trusted reverse proxy in front. |
| Sign-in strength | Multi-factor sign-in, password rules and lock-out are the identity provider's job; IndTrana cannot enforce or detect them | The agency must switch them on at its provider. The local demo provider is not a production identity service. |
| Availability | Free public APIs with non-commercial terms and no service guarantee | Open-Meteo, EOX Sentinel-2, Overpass and OSM tiles can throttle or block. Government use needs paid plans, agreements or self-hosted mirrors. |
| Rendering code | The 3D engine builds panel HTML as strings | Escaping is applied and tested for links, but a component-by-component React rewrite would remove the class of risk. |
| Scale | Single Compose node, one database, in-memory caches | No high availability, load balancing, backup schedule or disaster-recovery site. |
| Tests | No automated browser or accessibility tests in the repository | Checks so far were scripted headless runs on one software renderer, kept outside the repository. An axe WCAG 2.1 A/AA scan of five pages (10 Nov 2026) found three issues on the Alert Journey, since fixed; an automated scan does not replace a manual screen-reader and keyboard audit. |
| Translations | Telugu and Hindi interface text is machine-drafted | Needs native-speaker review (`docs/NATIVE_LANGUAGE_REVIEW.csv`). |

## Requirements outside the code (owner action)

| Requirement | Summary (to confirm against the official text) | State |
|---|---|---|
| Security audit before hosting | GIGW 3.0 requires a security audit and clearance certificate from NIC, STQC or a CERT-In empanelled auditor before production hosting. | Not started |
| GIGW 3.0 / accessibility | GIGW 3.0 adopts WCAG 2.1 Level AA. STQC issues website quality certification after security and accessibility testing. | Not started. The immersive 3D page needs an equivalent accessible path. |
| CERT-In Directions, 28 April 2022 | Report listed cyber incidents to CERT-In within 6 hours; keep ICT system logs in India for a rolling 180 days; synchronise clocks with NIC/NPL NTP servers; maintain a point of contact. | Not started (operations duty) |
| Hosting | Government workloads are expected on NIC infrastructure or a MeitY-empanelled cloud in India (not verified in this search; confirm with NIC/MeitY). | Not started |
| DPDP Act 2023 and Rules 2025 | Rules notified November 2025 with staggered commencement (data-fiduciary duties reported at 18 months). Breach notice to the Data Protection Board; reasonable security safeguards. | Not applicable while data is synthetic; applies once real operator or citizen data is held |
| Official data sources | IMD, CWC / India-WRIS and NDMA SACHET need written agreements. | Not started; connectors refuse to run without them |
| Alert dissemination | Only through NDMA / state SDMA and SACHET to operator cell-broadcast centres. | Outside IndTrana by design |
| Procurement and IP | Licences of third-party data are non-commercial; a patent or commercial plan needs legal review. | See `research/real-data/LICENCES.md` |

## Sensor link resilience (Patent No. 598835)

What exists: the signed-in Resilient Sensor Link page, a browser-only rehearsal simulation of the idea in the title of Indian Patent No. 598835 (sensor traffic moving between internet and satellite links, with a storm timeline). It uses synthetic sensors and values, sends nothing and uses no satellite or radio link. See `docs/PATENT_SENSOR_LINK.md`.

| Requirement | Summary | State |
|---|---|---|
| Sensor gateways | Gateways able to use both link types. | Not started |
| Satellite capacity | Terminals and licensed capacity from an authorised provider. | Not started |
| Bandwidth policy | A policy agreed with the agency. | Not started |
| Security review | Review of the links. | Not started |
| Outage testing | Testing against real outages. | Not started |
| Specification review | Review of the patent specification by its owner; the page is based on the title and the public publication notice only. | Not started |

## Suggested order

1. Decide the hosting home (NIC or empanelled cloud) and the accountable security owner.
2. Done in code: server relays for every outside request and a nonce-based CSP. Still to do: India-hosted mirrors.
3. Add automated browser, accessibility and load tests; fix findings.
4. Commission the security audit, then GIGW/STQC testing.
5. Sign data agreements (IMD, CWC, NDMA) before any operational use.

## Sources consulted (11 November 2026)

- CERT-In Directions summaries: mondaq.com/india/it-and-internet/1270362, khaitanco.com Ergo 30 April 2022, psalegal.com
- GIGW 3.0 and STQC: stqc.gov.in/website-quality-certification-0, the GIGW 3.0 PDF hosted on s3waas.gov.in
- DPDP Rules 2025: static.pib.gov.in (17 November 2025 release), ey.com DPDP Rules 2025 overview, khaitanco.com Ergo 15 November 2025
