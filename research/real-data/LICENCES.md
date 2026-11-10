# Licence and terms register — real historical data (Phase 0)

Checked: **2026-11-02**. Prepared by the assistant from the publishers' own pages under the owner's delegation.
**This is a working record, not legal advice.** "Fact" means read on a fetched official page. "Inference" is the
assistant's reading. "UNCLEAR" means the official page could not be read or does not say; such a source is **not used**
until the owner clarifies it in writing. Re-check before each phase and before any release review.

Project use assumed for every row: non-commercial, local, offline research prototype (hackathon demonstration and a
research report), no redistribution of raw data, results shown with attribution, no operational warning or dispatch use.
The owner should confirm that the project stays non-commercial; several verdicts depend on it.

## Verdicts at a glance

| # | Source | Use here | Verdict |
|---|---|---|---|
| 1 | Open-Meteo Historical Weather and Flood APIs | Phase 1 pilot: daily/hourly rainfall and river discharge for Hyderabad and Musi cells | **PERMITTED-WITH-CONDITIONS** |
| 2 | Copernicus CDS/EWDS (ERA5, GloFAS) | Possible later bulk reanalysis | **PERMITTED-WITH-CONDITIONS** (credentials in the user's environment only) |
| 3 | NASA GPM IMERG (Earthdata) | Possible later satellite rainfall | **PERMITTED-WITH-CONDITIONS** (login and citation text to confirm) |
| 4 | IMD rainfall (gridded or station) | Official reference rainfall | **EXCLUDE-UNTIL-CLARIFIED** |
| 5 | India-WRIS / CWC | River levels, reservoirs | **EXCLUDE-UNTIL-CLARIFIED** for automated access |
| 6 | USGS earthquake feeds | Earth Watch only (not flood data) | **PERMITTED-WITH-CONDITIONS** |
| 7 | NASA EONET v3 and GIBS | Earth Watch only | **PERMITTED-WITH-CONDITIONS** |
| 8 | OpenStreetMap standard tiles | Live map in the web app | **PERMITTED for live online viewing only; EXCLUDED for any offline or pre-cached use** |
| 9 | GDACS event feed (proactive connector `gdacs`, A4) | Third-party multi-hazard event alerts for Hazard Watch | **TERMS TO CONFIRM BY OWNER** (connector default disabled) |
| 10 | Google Flood Forecasting API (`google_flood_forecasting`, A4) | Gauge flood status near Hyderabad | **PERMITTED-WITH-CONDITIONS** (CC BY 4.0; waitlist key pending) |
| 11 | OpenStreetMap data extract (exposure importer, A3) | Hospitals, schools, shelters, roads in `exposure_features` | **PERMITTED-WITH-CONDITIONS** (ODbL 1.0; user-supplied local extract) |
| 12 | WorldPop population grid (exposure importer, A3) | Population cells in `exposure_features` | **PERMITTED-WITH-CONDITIONS** (CC BY 4.0; user-supplied local file) |
| 13 | Open-Meteo Flood, Archive (ERA5), Climate (CMIP6), Marine, Geocoding, Elevation-point APIs (Live Earth page) | Place weather, river-flood statistics, rainfall extremes, climate trends | **PERMITTED-WITH-CONDITIONS** (same terms as row 1: non-commercial, attribution) |
| 14 | AWS Terrain Tiles (`elevation-tiles-prod`, Terrarium PNG) (Live Earth page) | Real terrain for the 3D place scene | **PERMITTED-WITH-CONDITIONS** (attribution; allow-listed to that bucket path only) |
| 15 | NASA GIBS WMS layers beyond row 7: MODIS true colour, VIIRS Black Marble, IMERG rain, MODIS NDSI snow, MUR SST, Blue Marble | Earth imagery and overlays (Live Earth page) | **PERMITTED-WITH-CONDITIONS** (as row 7) |
| 16 | USGS FDSN event query by id (Live Earth page) | Replay of real tsunami-generating earthquakes | **PERMITTED-WITH-CONDITIONS** (as row 6) |
| 17 | CelesTrak GP/TLE (Live Earth page) | Real satellite orbits | **PERMITTED-WITH-CONDITIONS** (FAQ: data refresh only every 2 h; do not poll more often) |
| 18 | Overpass API public instances (OpenStreetMap data) (Live Earth page) | Optional buildings, facilities, mapped masts, one user-triggered query | **PERMITTED-WITH-CONDITIONS** (ODbL 1.0; endpoint states it is for browser-based, human-operated tools; often at capacity) |
| 20 | Sentinel-2 cloudless 2020 tiles by EOX (`tiles.maps.eox.at`) (Alert Journey live mode) | Real satellite ground view for region and city scenes | **PERMITTED-WITH-CONDITIONS — TERMS TO CONFIRM** (inference: CC BY-NC-SA 4.0 for 2018+ mosaics, non-commercial, attribution; the s2maps.eu terms page is script-rendered and could not be read on 2026-11-10) |
| 21 | Open-Meteo Ensemble API (`ensemble-api.open-meteo.com`, GFS 31 members) (Alert Journey live mode) | Forecast-confidence band and share of members with heavy rain | **PERMITTED-WITH-CONDITIONS** (as row 1) |
| 22 | SatNOGS DB orbital elements (`db.satnogs.org/api/tle/`) (Alert Journey live mode, server relay fallback only) | Satellite positions when CelesTrak refuses the server; one download per 6 hours, cached in memory | **PERMITTED-WITH-CONDITIONS — TERMS TO CONFIRM** (inference: SatNOGS DB data is CC BY-SA 4.0, attribution shown in Sources; the terms page was not read by the owner; no key) |
| 23 | TimesFM 2.5 model (`google/timesfm-2.5-200m-pytorch`, Hugging Face) and `timesfm` package (optional statistical forecast) | Pattern forecast of river discharge, display-only, off by default | **PERMITTED** (Apache-2.0 code and 2.5 weights; not an officially supported Google product). **TimesFM 3.0 weights are EXCLUDED**: non-commercial, non-production licence |
| 19 | NOT USED: Google Maps / Earth, IMD, India-WRIS / CWC, GDACS, Esri imagery, OpenCelliD, NASA FIRMS, Copernicus CDS | — | **EXCLUDED / OWNER ACTION NEEDED** (paid, terms not cleared, or key/account required) |

Phase 1 pilot sources approved to start: **row 1 only.** Rows 2 and 3 need the owner to create accounts and keep
credentials in their own environment; they are not started. Rows 4 and 5 stay excluded.

## Live Earth page (rows 13–19) — added 10 November 2026

The owner asked for real free public APIs to be called in the explainer. the in-app page `/alert-journey?mode=live` (`apps/web/components/alert-journey/`) does
this under the same discipline as Earth Watch: **opt-in (off until the user consents), read-only, fixed HTTPS allow-list,
no keys, nothing written to PostgreSQL or any server, labelled "public reference, not an AEGIS assessment"**, and it never
feeds proposals, CAP drafts or alerts. Hosts called: api / flood-api / archive-api / climate-api / marine-api /
geocoding-api `.open-meteo.com`, `earthquake.usgs.gov`, `eonet.gsfc.nasa.gov`, `gibs.earthdata.nasa.gov`,
`tile.openstreetmap.org`, `celestrak.org`, `overpass-api.de` (+ `overpass.kumi.systems` fallback) and
`s3.amazonaws.com/elevation-tiles-prod/` only.

- **Fact (curl, 2026-11-10):** every host above returned HTTP 200 with `Access-Control-Allow-Origin: *` for a normal
  browser request (Overpass was at capacity at times: HTTP 502; an earlier 406 came from a generic `curl` client, which is
  why the page only calls it from the user's browser).
- **Fact:** Open-Meteo counts every coordinate as one call, so 1,296 elevation points in a burst returned HTTP 429. The page
  therefore reads terrain from AWS Terrain Tiles (one PNG tile holds 65,536 samples) and uses the Open-Meteo elevation API
  only for single points (tsunami epicentre check). Calls are cached (memory + localStorage) and limited per host.
- **Fact (AWS Terrain Tiles, `tilezen/joerd/docs/attribution.md`):** attribution required; sources include USGS SRTM and
  GMTED2010 (US public data) and NOAA ETOPO1. The page shows: "Terrain data: SRTM and GMTED2010 courtesy of the U.S.
  Geological Survey; ETOPO1 U.S. NOAA; AWS Terrain Tiles (Tilezen)".
- **Fact (CelesTrak FAQ, updated 2026-03-26):** new GP data is checked only once every 2 hours; abusive polling gets
  temporary HTTP 403 blocks. The page requests at most 5 element sets per fresh browser and caches them for 6 hours.
- **Fact (Overpass):** the public endpoint says it is "intended for browser-based and human-operated tools". The page calls
  it once per button press with backoff and one mirror, never in a loop.
- **Inference:** the USGS `tsunami` flag is `0` even for the 2004 M9.1 event, so tsunami potential is screened from
  magnitude, depth and an offshore epicentre check, not from that flag; results say they are not a warning.
- **OSM masts:** OpenStreetMap's mapped mobile masts are patchy (none inside the central-Hyderabad test square). The page
  says so and uses clearly labelled illustrative tower sites for the mock drill when none are mapped. Real tower coverage
  would need an operator or OpenCelliD data (free key, owner to register; not started).
- **Not used:** Google Maps/Earth (tiles need a billed key and forbid scraping; the project forbids paid infrastructure),
  IMD and India-WRIS (row 4/5 exclusions stand), GDACS (row 9), Esri imagery (terms not read), OpenCelliD, NASA FIRMS
  and Copernicus CDS (keys/accounts).
- Required on-screen credits (shown in the page footer and Sources panel): Open-Meteo.com (CC BY 4.0); NASA GIBS
  acknowledgement text from row 7; "Earthquake data compiled by the U.S. Geological Survey"; NASA EONET; CelesTrak;
  "© OpenStreetMap contributors"; the terrain credit above.

## 1. Open-Meteo (archive-api.open-meteo.com, flood-api.open-meteo.com)

- Pages read: https://open-meteo.com/en/terms and https://open-meteo.com/en/licence (no update date shown).
- Fact: API data is provided under **CC BY 4.0**. The free API is for **non-commercial use only**; research at public
  institutions, education and non-profit use count as non-commercial. No API key for the free tier.
- Fact: limits per IP: 600 per minute, 5,000 per hour, 10,000 per day, 300,000 per month. Open-Meteo may block IPs
  that exceed them without notice.
- Fact: attribution "Weather data by Open-Meteo.com" linked to https://open-meteo.com/, with a link to the licence and
  a note of changes. Citation: Zippenfenig (2023), Zenodo, DOI 10.5281/ZENODO.7970649.
- Fact: some upstream sources carry their own terms (ECMWF/Copernicus; the Flood API is GloFAS-derived).
- Conditions: non-commercial only; show the attribution in any figure or report; stay far below the limits (the plan's
  pilot is a few hundred requests); cache raw responses locally; do not redistribute raw files; keep upstream terms in
  view. The Flood API output is model discharge, **not gauge data**; say so wherever it is shown.

## 2. Copernicus Climate Data Store / Early Warning Data Store (ERA5, GloFAS)

- Pages read: https://cds.climate.copernicus.eu/licences/licence-to-use-copernicus-products (v1.2, Nov 2019) and
  https://ewds.climate.copernicus.eu/how-to-api.
- Fact: free, worldwide, non-exclusive, royalty-free, perpetual; reproduction, distribution and adaptation for any
  lawful purpose with attribution. Third-party data has separate terms (clause 7).
- Fact: attribution "Generated using Copernicus Climate Change Service information [Year]" or, if modified,
  "Contains modified Copernicus Climate Change Service information [Year]", plus a statement that neither the European
  Commission nor ECMWF is responsible for the use made of the information.
- Fact: requires a registered account, a personal access token in `~/.cdsapirc`, the `cdsapi` client, and manual
  acceptance of each dataset's licence on its page.
- UNCLEAR: queue and request-size limits were not on the pages read.
- Conditions: owner creates the account; the token never enters the repository, logs or chat; use the attribution
  above including the disclaimer.

## 3. NASA GPM IMERG (Earthdata / GES DISC)

- Page read: https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance.
- Fact: data from NASA-led missions is CC0 unless marked otherwise. NASA asks that datasets be cited and that NASA's
  endorsement not be implied.
- UNCLEAR on that page: whether a login is needed, the exact IMERG citation text, and rate limits.
  Inference: GES DISC downloads normally need a free Earthdata Login; confirm on disc.gsfc.nasa.gov.
- Conditions: owner creates the login; credentials stay local; cite the IMERG DOI; no endorsement claim.

## 4. IMD (India Meteorological Department) rainfall

- Official pages could not be read: the data supply policy page returned 404 and a procedure PDF could not be
  extracted.
- Secondary only (search snippets, **not confirmed on an official page**): supply is chargeable plus GST, requested by
  email and a letter on institutional letterhead stating the data, period and purpose, and IMD may refuse.
- UNCLEAR: free research use, redistribution, attribution.
- Verdict: **EXCLUDE-UNTIL-CLARIFIED.** To include it, the owner (or the institution) must obtain IMD's current
  written supply terms and use only what IMD supplies in writing.

## 5. India-WRIS / Central Water Commission

- Official terms page could not be read (script-rendered, no text); the india.gov.in policy page returned 403.
- Secondary only (unconfirmed): the 2013 Hydro-Meteorological Data Dissemination Policy reportedly allows free
  download of unclassified data by registered users, with acknowledgement; classified or restricted basins need
  permission. The Government Open Data Licence (GODL-India) reportedly requires attribution naming the provider and
  forbids implied endorsement; whether India-WRIS data is released under it is UNCLEAR.
- UNCLEAR: whether automated access or scraping is permitted; any API; redistribution.
- Verdict: **EXCLUDE-UNTIL-CLARIFIED** for any automated pull. A manual download of unclassified data after
  registering, with acknowledgement, is plausibly acceptable but unconfirmed; ask the portal owner first.

## 6. USGS earthquake feeds (used by Earth Watch)

- Pages read: https://earthquake.usgs.gov/fdsnws/event/1/ (no policy text). The USGS crediting page returned no body.
- Secondary (search snippet of the USGS crediting page, to confirm on the live page): USGS-authored data is in the
  US public domain; acknowledge USGS as the source, for example "(Data name) data compiled by the U.S. Geological
  Survey". Third-party content may have its own terms.
- Fact: automated applications should use the static real-time GeoJSON feeds; no key; no explicit rate limit stated.
- Conditions: credit USGS in the UI and report; poll sparingly (Earth Watch caches 5 minutes server-side); confirm the
  credit wording on the live page before release. This is a hazard feed, not flood data.

## 7. NASA EONET v3 and GIBS (used by Earth Watch)

- Pages read: https://eonet.gsfc.nasa.gov/docs/v3 (no terms or rate limits stated; the About page returned 404),
  https://www.nasa.gov/nasa-brand-center/images-and-media/ and https://www.earthdata.nasa.gov/gibs.
- Fact: NASA content is generally not copyrighted and is fine for educational and informational use; acknowledge NASA
  as the source; do not imply endorsement; NASA logos are protected.
- Fact (GIBS page, with the remainder of the wording from a search snippet to confirm): acknowledgement "We acknowledge
  the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth
  Science Data and Information System (ESDIS)."
- UNCLEAR: EONET and GIBS rate limits, and whether Earthdata Login applies (inference: GIBS tiles are normally keyless).
  EONET events may link third-party sources with their own terms.
- Conditions: use the acknowledgement above; no NASA logo or endorsement; throttle requests; never bulk-mirror tiles.
  Follow-up for the app: show the fuller GIBS acknowledgement on the Earth Watch source card.

## 8. OpenStreetMap standard tile servers (tile.openstreetmap.org)

- Page read: https://operations.osmfoundation.org/policies/tiles/ (no update date shown).
- Fact: HTTPS only; a distinct, stable User-Agent naming the app and a contact (generic library user agents are
  blocked); web clients must send a valid Referer; honour cache headers or cache at least 7 days.
- Fact: prohibited are prefetching, bulk download, tile archives and wide-area scans. **"Offline use is not allowed on
  this service."** Access may be blocked without notice.
- Fact: attribution "© OpenStreetMap contributors", visible on the map and linking to the copyright page.
- Inference: OSM map **data** is ODbL (not re-verified on this run).
- Consequence for AEGIS: live viewing with normal browser caching is within the policy; pre-seeding, bundling or
  caching tiles for an offline demo is not. The app already shows the attribution and degrades to markers and lists
  when tiles fail. For a venue without internet, do **not** pre-cache OSM tiles; use the list and marker fallback,
  or move to a self-hosted or offline-permitted tile source (separate decision and work).

## 9. GDACS — Global Disaster Alert and Coordination System (www.gdacs.org)

- Fetched 4 November 2026: https://www.gdacs.org/About/termofuse.aspx. The page is a **liability disclaimer, not
  a licence**. It does not state attribution requirements, commercial/non-commercial terms, redistribution
  rights, or API/automated-access conditions. What it does say:
  - Information is provided "as is" without warranty of any kind.
  - Earthquake, tsunami and tropical-cyclone notifications are algorithm-generated and not reviewed by a human
    expert before release.
  - GDACS does not replace official local/national authority alerts.
  - Notifications "should not be used for decision making without prior confirmation of their validity."
  - No guarantee of completeness or timeliness; data may change without notice; unspecified downtime possible.
  - GDACS stakeholders assume no liability for damage, injury or loss of life from use of the content.
- **Still UNCLEAR after reading the page:** reuse/redistribution/attribution terms for the event-list API
  specifically. GDACS is a cooperation framework of the United Nations and the European Commission (Joint
  Research Centre); the event list API (`/gdacsapi/api/events/geteventlist/SEARCH`, GeoJSON) is publicly
  reachable without a key, but that alone does not establish a reuse licence. Attribution used in evidence
  payloads regardless: "GDACS (UN / European Commission JRC)".
- **Fetched 4 November 2026, favourable but not GDACS-specific:** gdacs.org's footer "Copyright" link points
  to the European Commission's legal notice (https://commission.europa.eu/legal-notice_en), which states the
  Commission's default reuse policy (Decision 2011/833/EU, CELEX 32011D0833): EU-owned website content is
  licensed **CC BY 4.0 by default** ("reuse is allowed, provided appropriate credit is given and changes are
  indicated"), **unless the site states otherwise**. GDACS's own terms-of-use page (above) does not state
  otherwise — it is a liability disclaimer, silent on reuse — so the EU default plausibly applies to GDACS's
  JRC-owned content, but this has not been confirmed for GDACS specifically and GDACS is a joint UN/EC
  framework, not purely an EC property, so the default may not cleanly apply. Do not treat this as a
  confirmed licence.
- **No API-specific terms or developer contact found.** Checked `feed_reference.aspx` (RSS/feed docs: no
  licence terms) and the site's contact routes. `info@gdacs.org` is stated as cancelled "because of spam
  reasons" — do not use it. The only contact route is the form at
  https://www.gdacs.org/About/contactus.aspx (routes to the Info, Maps or Alert group; the page says it is
  for technical/analytical questions only, so a licensing question may fall outside its stated scope — try
  it anyway and note the reply, or treat the EU-default reasoning above as the basis for a decision if no
  reply arrives).
- **Owner action, ready to send:** a drafted inquiry for the GDACS contact form is in
  `docs/GDACS_INQUIRY_DRAFT.md`. Send it from the owner's own identity; nothing here was sent.
- Conditions already in code, independent of the licence question: fixed host, JSON only, no redirects, India
  bounding box, alert level only; shown as a third-party reference, not an AEGIS assessment or official warning;
  the disclaimer's own "not for decision-making without confirmation" point is already honoured by the maker-
  checker gate before anything derived from it reaches a draft.

## 10. Google Flood Forecasting API (floodforecasting.googleapis.com)

- Fetched 4 November 2026: https://developers.google.com/flood-forecasting. Confirms: public API, **no charge**,
  data licensed **CC BY 4.0** (exact attribution wording not specified beyond the licence itself). Attribution
  used in AEGIS: "Google Flood Forecasting (CC BY 4.0)".
- **Owner's exact next step:** fill the waitlist form —
  https://docs.google.com/forms/d/e/1FAIpQLSfcKhe3CHsncM-_NQ66zLheEfXKnNbDPBtuIT7BSYCqYkmOaA/viewform —
  with a Google account. After approval, Google emails next steps; the page says to reply with the Google
  Cloud Project ID if already approved. Then: create/reuse a Google Cloud project, create an API key, open
  the Flood Forecasting API library page and click Enable (access needs both the key and the API enabled).
  The page links a Colab notebook to verify access once set up.
- Conditions: the key is stored only as an encrypted connector secret (`connector_secrets.py`, AES-256-GCM)
  and sent in the `X-Goog-Api-Key` request header only — never logged, returned or placed in a URL (tested);
  model forecasts, not gauge observations; non-operational display only; coverage limited to the countries
  Google lists on its separate support page (not yet checked for India-specific coverage — confirm after
  approval, before enabling the connector).

## 11. OpenStreetMap data (ODbL 1.0) for the exposure importer

- Licence: Open Database License 1.0, https://www.openstreetmap.org/copyright. Attribution "© OpenStreetMap
  contributors". Each imported row stores licence `ODbL-1.0` and that attribution.
- Conditions: the owner supplies a local extract (for example a Geofabrik or Overpass export made by the owner); the
  assistant downloads nothing. Derived databases shared publicly would trigger ODbL share-alike; AEGIS keeps the table
  local and does not redistribute it. Distinct from row 8 (tile servers).

## 12. WorldPop population grids (CC BY 4.0) for the exposure importer

- Licence: CC BY 4.0 (https://www.worldpop.org/). Attribution "WorldPop (www.worldpop.org), CC BY 4.0" stored per row;
  cite the specific dataset DOI in any report.
- Conditions: owner-supplied local file; GeoTIFF converted to XYZ on the owner's machine; counts are modelled estimates
  and are used only as rehearsal exposure, never as casualty estimates.

## Open items for the owner

1. Confirm the project stays non-commercial (rows 1, 3, 6, 7 depend on it).
2. Decide whether to create Copernicus and Earthdata accounts (rows 2, 3); credentials stay in the local environment.
3. Decide whether to ask IMD and India-WRIS for written terms (rows 4, 5); until then they are excluded.
4. Decide the tile approach for an offline demo (row 8).
5. Confirm GDACS terms (row 9), apply for the Google Flood Forecasting key (row 10) and choose the OSM extract and WorldPop dataset (rows 11, 12).
