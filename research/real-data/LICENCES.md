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

Phase 1 pilot sources approved to start: **row 1 only.** Rows 2 and 3 need the owner to create accounts and keep
credentials in their own environment; they are not started. Rows 4 and 5 stay excluded.

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

## Open items for the owner

1. Confirm the project stays non-commercial (rows 1, 3, 6, 7 depend on it).
2. Decide whether to create Copernicus and Earthdata accounts (rows 2, 3); credentials stay in the local environment.
3. Decide whether to ask IMD and India-WRIS for written terms (rows 4, 5); until then they are excluded.
4. Decide the tile approach for an offline demo (row 8).
