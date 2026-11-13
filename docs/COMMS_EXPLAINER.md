# Alert Journey (in-app, one page) — current state, 10 November 2026

**Supersedes the standalone files described below.** The explainer now lives inside the Next.js app as one route,
`/alert-journey` (nav: Overview → Alert Journey), with two modes switched in place:
`/alert-journey` = synthetic exercise, `/alert-journey?mode=live` = Live Earth (opt-in public data).
`apps/web/public/explainer/` was removed; file names in the older sections map to
`apps/web/components/alert-journey/engine/`.

- `app/alert-journey/page.tsx` → `components/alert-journey/alert-journey.tsx` (React client component: page shell, mode
  state, navigation) → `engine-loader.ts` (mounts/disposes one engine per mode) → `engine/*.js` (the three.js scene and
  HUD code, unchanged in behaviour, now ES-module installers) + `alert-journey.css` (same styles, scoped under
  `.aj-root` with `aj-` keyframes so no other page is affected).
- Dependencies added (exact pins): `three@0.128.0`, `satellite.js@4.1.4` (both MIT). No vendored scripts remain.
- Nav label "Alert Journey" has Telugu/Hindi entries in `lib/translations.ts` (machine-drafted; native review pending).
- The page is immersive (full screen, no app rail); the IndTrana brand link returns to the Command Center.
- **Design note:** the engine is imperative three.js mounted by React, not a JSX rewrite of every panel. That kept the
  visuals and motion identical; converting individual panels to React components can follow incrementally.
- **Decision taken (owner delegated it, 10 Nov 2026):** Live mode needs both the viewer's consent and the deployment
  switch (`AEGIS_PUBLIC_EARTH_FEEDS` / `-PublicEarth`); the page checks `/api/earth-watch/status` before any external call.
- **Round 2 (same day):** satellite orbits now come through a server relay (`/api/alert-journey/tle`, 3 h shared cache,
  20 min back-off, gated by the same switch) so browsers can no longer trip CelesTrak's rate limit; real satellite ground
  view (Sentinel-2 cloudless by EOX) for region and city, switchable with the street map and yesterday's MODIS image;
  31-member ensemble (Open-Meteo) drawn as a 10–90 % band with the share of members reaching IMD heavy rain;
  plain-language situation brief; every real request logged in Sources and drawn as a pulse on the globe plus a ticker;
  Motion control (Full / Calm / Still) and gentle idle globe rotation; city terrain exaggeration capped at 3×.
- **Round 3 (11 Nov 2026):** site-wide Content-Security-Policy (`next.config.ts`) matching the client allow-list, tested
  for zero violations on every route; `https:`-only feed links; no third-party call in exercise mode unless the public
  switch is on; performance governor (adaptive resolution, power saver, hidden-tab throttle); elevation contours, compass,
  scale bar and keyboard camera (arrows / WASD orbit, + − zoom) in live mode; tests in
  `scripts/tests/alert-journey.test.cjs`. Government gap list: `docs/GOVT_DEPLOYMENT_READINESS.md`.
- **Round 5 (10–11 Nov 2026):** Home button in the Alert Journey top bar (both modes); new `/sign-in` page (3D
  backdrop, no password field, starts the OIDC flow only); page CSP moved to a per-request nonce (`middleware.ts`,
  `lib/csp.ts`) with `connect-src 'self'`; all maps load tiles through the relay; orbit relay falls back to SatNOGS DB
  when CelesTrak refuses the server; three axe findings fixed. Narrated demo videos: `docs/media/01`–`05` (see `docs/media/NARRATION.md`).
- **Go-Live Setup page:** `/admin/go-live` (nav: Govern) lists every external API, key, secret, switch and agreement,
  where each is set, how to obtain it, and what the page can detect (OIDC configured, public feeds, public intake). It is
  read-only and never shows or accepts a secret; keys are entered on `/admin/connectors` by a signed-in platform admin.
- **Running check (Compose with local IdP + PublicEarth + Proactive overlays):** Go-Live page detected OIDC and public
  feeds as configured; live mode passed the gate; ensemble (31 members), Sentinel-2 city and region views and the
  transmissions log worked; no page errors. The orbit relay returned 502 because CelesTrak's temporary block on this
  laptop's address was still active, so satellites stay empty until it lifts.
- **Verified (Windows laptop, under the single-operation lease, no Compose services running):** `npm run typecheck`,
  `npm run build`, `node --test scripts/tests/*.test.cjs` (169 pass), and a headless-Chromium run against the built
  app: exercise mode, switch to live, consent, real data for Hyderabad, city scene, switch back, exit to `/` with the
  engine fully disposed and the Command Center styles intact. No page errors.
- **Not verified / known:** real-GPU performance, other browsers, accessibility audit. CelesTrak answered HTTP 403 at the
  end of testing: repeated test runs from this laptop tripped its rate limit (temporary block), so satellites show
  "error" until it lifts; the page caches orbits for 6 h in normal use.

# Alert Journey explainer (interactive, synthetic mock-up)

Static page, no build step: `apps/web/public/explainer/comms-explainer.html`
(served by the web app at `/explainer/comms-explainer.html`, or open the file directly).

A scrubbable 96-hour story (T−72 h to T+24 h) of a **synthetic** cyclone-flood exercise. It shows how a hazard is
sensed from space, predicted, human-approved, handed to the official alert channel, delivered, and answered by field
teams. Everything on screen is a deterministic function of one simulated clock, so the timeline can be scrubbed.

## What it shows

- **Orbit → ground:** globe with India, the cyclone, five satellite classes and ground links; "Dive to region" descends
  into a three.js world: mountains, hills, river, coast, farmland, a city (instanced buildings that light up at night),
  roads, traffic, 540 residents, 12 cell towers, 12 response teams, day/night, rain, wind, lightning, a cyclone cloud
  structure, forecast ensemble and cone, predicted-flood overlay, and a flood plane that rises with the model.
- **Comms streams:** satellites → ground station → IndTrana Ops Desk → human gate → NDMA/SACHET → operator Cell Broadcast
  Centres → towers → phones; satellite fallback (NavIC / direct-to-cell class) when towers fail; team telemetry.
- **Human-in-the-loop:** three decision gates pause playback (staging plan, maker≠checker CAP approval with required
  rationale, escalation to emergency mode). Plan A (central yard) vs Plan B (AI high-ground sites) changes the outcome.
- **Controls:** orbit/pan/zoom, mouse parallax, hover names, click to inspect, double-click to fly, cinematic director,
  layer toggles, 18 camera presets, minimap, "who acts when" swim-lanes, keyboard shortcuts (press **H**).
- **AI copilot:** cited insights with confidence and "why this?", explicit abstentions, grounded "Ask IndTrana" questions
  (anything outside the fixed intents is refused, not guessed).

## Boundaries (unchanged project rules)

- Synthetic exercise only. No live data, warning, dispatch or message exists; IndTrana still exports a private Draft CAP
  only (level L4 "send" = never). The CAP preview keeps urgency/severity/certainty **Unknown** and sets no area.
- Terrain, geography, timings and the flood shape are schematic. No accuracy or forecasting claim. Prediction numbers
  are rehearsal statistics on this one scenario.
- Operator names (Airtel, Jio, BSNL, Vi, ACT-style backhaul) describe the real ecosystem only. No affiliation or
  integration. Towers are drawn as shared infrastructure.
- Teams are agency-tasked; IndTrana recommends and records. Hindi/Telugu text is illustrative and pending native review
  (`docs/NATIVE_LANGUAGE_REVIEW.csv`).
- Open-data statements come from `research/real-data/LICENCES.md` (checked 2026-11-02). The patent note is general
  information, not legal advice; no patent search was run.

## Files (all under `apps/web/public/explainer/`)

| File | Role |
|---|---|
| `comms-explainer.html`, `explainer.css` | shell and styling |
| `explainer-core.js` | terrain, river, cyclone, rain, flood, forecast maths (pure, Node-testable) |
| `explainer-story.js` | phases, events, decisions, insights, towers, teams, hubs, presets, reality-check text |
| `explainer-gfx.js`, `explainer-env.js`, `explainer-places.js`, `explainer-actors.js`, `explainer-space.js` | three.js world |
| `explainer-ui.js`, `explainer-main.js` | HUD, panels, timeline, camera rig, picking, loop |
| `vendor/three.min.js` | three.js r128 (MIT), vendored so the demo works offline; no `package.json` change |

The Earth texture is fetched from threejs.org when online; offline it falls back to a plain globe.
Query parameters for deep links and tests: `t=-12` `cam=city` `dir=0|1` `play=1` `q=low|med|high` `tab=copilot`
`sel=T04` `dec=B,approve,go` `layers=water,towers` `em=1` `rm=1`.

## Verification (executed 10 November 2026, Windows laptop)

- `node --check` on every module; Node tests of terrain heights and the flood timeline (peak ≈2.28 at T+1.9 h).
- Headless Chromium (Playwright core, SwiftShader WebGL) via `file://`: no console errors across the orbit view, region,
  city bird's-eye, night broadcast, daytime and peak flood, street follow, all five side tabs, the checker gate, the
  dive transition, a 4× play-through to the first gates, and a sweep that described all 69 entities at 8 moments and
  scrubbed the whole timeline with both staging plans.
- **Not done:** real-GPU frame rates, Firefox/Safari, mobile devices, axe/accessibility audit, automated tests in the
  repo, screen-reader pass. Treat the visuals as reviewed on one renderer only.

# Live Earth (opt-in real public data)

`/alert-journey?mode=live` (served at `/explainer/live-earth.html`; linked from the synthetic page's top
bar and back). Same files folder, no build step, no `package.json` change. **Off until the user consents**; deep link
`?live=1`. Read-only; nothing is sent, drafted or written. Licence facts: `research/real-data/LICENCES.md` rows 13–19.

## What it does

- **Real Earth:** NASA GIBS imagery (MODIS true colour of the previous day, Blue Marble gap-fill, VIIRS night lights, optional
  IMERG rain rate, MODIS snow cover, MUR sea temperature) with the real day/night terminator; real satellites propagated
  in the browser from CelesTrak TLEs (SGP4, ~270 objects, orbit line, footprint, next passes over the chosen place);
  USGS earthquakes (7 days); NASA EONET open events (storms with tracks, fires, ice, floods…).
- **Tsunami explainer:** screens a selected earthquake (magnitude, depth, offshore epicentre via a terrain lookup) and
  replays real USGS records (2004 Sumatra–Andaman, 2011 Tōhoku) with an upper-bound wavefront and arrival times.
- **Real place (Place / Flood tabs):** Open-Meteo forecast, ERA5 history, GloFAS-derived river discharge, CMIP6 projection.
  Screening board with fixed thresholds (IMD rain classes, Beaufort, heat/cold/snow/visibility) and **return periods**:
  Gumbel fit (L-moments) to 34 annual rainfall maxima / 15 annual discharge maxima, with a bootstrap 90% range, a return-
  period dial, 2/5/20-year discharge thresholds and climate trends with r² shown. It abstains when there is no river cell.
- **Region / city scenes:** real terrain (AWS Terrain Tiles, SRTM) textured with NASA MODIS (≈120 km) or OpenStreetMap
  (≈4.7 km), driven by the real hourly forecast (sky, sun position, cloud, rain, snow, wind, lightning, fog); scrub −48 h to
  +168 h or press "Midday". Optional OSM buildings (3D), hospitals, schools, mapped masts (Overpass, user-triggered).
- **Impact:** terrain-based flood scenario (height above nearest drainage, or coastal level) with counts of exposed
  buildings, hospitals, schools and towers. It is a "what if" height, not derived from rainfall or discharge.
- **Mock alert drill:** authority → operator CBCs → towers → phones → assembly points over the real map. Simulated phones
  and people; real towers only if OSM maps any, otherwise clearly labelled illustrative sites. Nothing is sent.

## Boundaries and honest limits

- Public reference only, never an IndTrana assessment, never feeds proposals/CAP/alerts (AGENTS.md rules unchanged).
- The map is OpenStreetMap, not Google Maps (Google's tiles need a billed key and forbid scraping; the project forbids paid
  infrastructure). IMD and India-WRIS stay excluded; GDACS is not used.
- OSM mapped masts are patchy: none were found in the central-Hyderabad square on 10 Nov 2026. Real tower coverage needs
  operator data or OpenCelliD (free key, not started).
- Screening statistics are small-sample and approximate (see the bootstrap range); thresholds are fixed and illustrative.
- Open-Meteo counts each coordinate as an API call: terrain therefore comes from tiles, not the elevation API.
- Overpass is a shared public service and is often busy: the page retries with backoff, then reports plainly.

## Files

`live-earth.html`, `live.css` (+ shared `explainer.css`, `explainer-core.js`, `explainer-gfx.js`) · `live-model.js` (statistics,
screening, geodesy, sun, hydrology; pure, Node-tested) · `live-data.js` (allow-listed clients, cache, status) ·
`live-globe.js` · `live-place.js` · `live-panels.js` · `live-ui.js` · `live-main.js` · `vendor/satellite.min.js`
(satellite.js 4.1.4, MIT, SRI-verified against cdnjs). Deep links: `?live=1&place=lat,lon,Name&scale=region|city&tab=place`.

## Verification (executed 10 November 2026, Windows laptop, real network)

- Node: model tests (Gumbel round trip and bootstrap, IMD/Beaufort classes, sun position on the solstices, tile maths,
  HAND hydrology on a synthetic valley, hazard board) all pass; data smoke test against the live APIs passes (forecast,
  flood fit, ERA5, CMIP6, marine, USGS, EONET, TLE, 2004 event).
- Headless Chromium (SwiftShader), page served from a request-intercepted origin and from `file://`: opt-in dialog,
  real Earth with 274 satellites, 84 quakes, 64 events; tsunami replay; Hyderabad region and city scenes with OSM tiles,
  3,500 OSM buildings, 171 facilities, flood scenario counts, mock drill; Flood/Orbit/Comms tabs; Chennai statistics.
  No page errors. Overpass returned HTTP 502 at times (handled by retry, mirror and a plain message).
- **Not done:** real-GPU frame rates, other browsers/devices, an accessibility audit, in-repo automated tests. Terrain
  exaggeration (shown in the scene info) is large on purpose.
