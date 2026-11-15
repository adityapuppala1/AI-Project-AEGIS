# Bhuvan connectors: research and build spec

Written 15 November 2026 (Asia/Kolkata). Binds to AGENTS.md (Earth Watch / public reference, API port, Request boundary,
UI kit, Release process, Single-instance rules). User doc: [../BHUVAN_CONNECTORS.md](../BHUVAN_CONNECTORS.md).

Status: built (local checks) for 0.5.0 on 15 November 2026. **Live calls with real tokens not yet verified**: no
token existed when this was built and the portal sign-in has a CAPTCHA that was not bypassed, so the owner has to
paste tokens (see "Not built / not verified"). Tracker: [README.md](README.md).

## Research (read 15 November 2026)

Sources: the portal landing page <https://bhuvan-app1.nrsc.gov.in/api/> and its documentation fragments, loaded by the
page's own `page1(name)` function from `https://bhuvan-app1.nrsc.gov.in/api/get/<name>.php` (public, no sign-in):
`posthp`, `vg`, `vrg`, `dist`, `aoi`, `point`, `laoi`, `route`, `geoid`. Terms: <https://bhuvan.nrsc.gov.in/home/terms.php>.
Every documented endpoint is on the one host `bhuvan-app1.nrsc.gov.in`, HTTPS, GET, token in the `token` query parameter
(geoid uses `key`), header `Content-Type: application/x-www-form-urlencoded` required ("otherwise 400").

| Theme | Page | Endpoint | Parameters | Response / coverage |
|---|---|---|---|---|
| Postal and Hospital | `get/posthp.php` | `/api/api_proximity/curl_hos_pos_prox.php` | `theme=hospital|postal|all`, `lat`, `lon`, `buffer` (m), `token` | JSON of hospitals/post offices in the buffer; `False` if none. Andhra Pradesh only |
| Village Geocoding | `get/vg.php` | `/api/api_proximity/curl_village_geocode.php` | `village` (case-insensitive), `token` | Census 2001 village details, AP and Karnataka; `False` if none |
| Village Reverse Geocoding | `get/vrg.php` | `/api/api_proximity/curl_reverse_village.php` | `lat`, `lon`, `token` | Census 2001 village at the point, AP and Karnataka; `False` if none |
| LULC 50k Statistics | `get/dist.php` | `/api/lulc/curljson.php`, `/api/lulc/curlpie.php` | `statcode` or `distcode` (4 digits), `year=0506|1112`, `token` | Area per land-use code for a state/district |
| LULC 50k AOI | `get/aoi.php` | `/api/lulc/curl_aoi.php` | `geom` (WKT polygon), `token` | Area per land-use code in the AOI; `Null` if none |
| LULC 250k point | `get/point.php` | `/api/lulc250k/curl_lulc250k_point.php` | `lon`, `lat`, `year` (`2004_05`, list or `all`), `token` | Land-use description at a point, 2004-05 to 2018-19 (no separate token on the token page; not used) |
| LULC 250k AOI | `get/laoi.php` | `/api/lulc250k/curl_lulc250k.php` | `polygon` (WKT), `year`, `option=json|chart`, `token` | Not used |
| Routing (shortest path) | `get/route.php` | `/api/routing/curl_routing_state.php` | `lat1`, `lon1`, `lat2`, `lon2`, `token` | GeoJSON path with start/end; same state only ("interstate under development"); `Null` if none |
| Geoid | `get/geoid.php` | `/api/geoid/curl_gdal_api.php` | `id` (AOI tile id), `datum=elipsoid|geoid`, `se=CDEM`, `key` | Zipped CartoDEM GeoTIFF download. Not a point elevation correction, so not called |

Observed (one request, no token): `curl_reverse_village.php` with `token=invalid` returns HTTP 200 and
`{"error":"invalid_token","error_description":"The access token provided is invalid"}`.
Rate limits: none stated on any page. Sample responses with a real token: **not captured** (no token available).

Sign-in and tokens: the Login link opens `https://bhuvan-app1.nrsc.gov.in/api/login.php`, a CAS form posting to
`/cas/login` with user name, password, an image CAPTCHA (`captchaImage`, `captchaId`) and reCAPTCHA references. The
token page (`get/api.php`) refuses without sign-in ("You have to login to get the keys"). Tokens are issued per theme
and the page labels them "expires in a day".

Terms (bhuvan.nrsc.gov.in/home/terms.php), relevant points: non-exclusive, non-transferable licence; without written
authorisation you must not access content "through any technology or means other than those provided by the Bhuvan
portal", copy/modify/redistribute content, allow "mass downloads or bulk feeds of any content, including ... numerical
latitude or longitude coordinates", remove notices, or use content for "real time navigation or route guidance";
image and map data "are provided for viewing purposes only". No specific attribution sentence is prescribed; the
portal footer is "Copyright © 2018 Bhuvan".

## Decisions

- **Renewal: not built.** CAPTCHA at sign-in (not defeated) and the "other means" clause. Manual paste with expiry
  countdown instead. The portal user name and password are not stored anywhere by IndTrana.
- One connector `isro_bhuvan` with seven secret fields (one per token-page theme), host fixed to
  `bhuvan-app1.nrsc.gov.in`, existing `bounded_request` (no redirects, no proxy, bounded size/time).
- Expiry is 24 h from the save time (`connector_secrets.updated_at`), shown per field; an expired token is never sent.
- Display-only: in-memory cache one hour (max 200 entries), 60 s back-off after a failure, fixed failure codes, nothing
  written to PostgreSQL. Attribution "Data: Bhuvan, NRSC/ISRO" plus the terms link on every view; no logo.
- Reference reads use `scoped_operator(EXERCISE_RECORD_ROLES)` (explicit roles plus exercise-agency check).
- Route is labelled "reference route, nothing is dispatched. Not for navigation" (terms forbid route guidance).

## Built (0.5.0)

- API: `app/bhuvan.py` (themes, call, sanitiser, cache, admin `GET /v1/proactive/bhuvan/tokens`, `POST
  /v1/proactive/bhuvan/tokens/{theme}/test`, reference `GET /v1/reference/bhuvan/{status,place,landuse,route,hospitals,village}`);
  registry entry and per-field expiry in `app/connectors.py`; secret save time in `app/proactive_store.py`.
- Web: `components/ui/origin.tsx` (`DataOrigin`, `DataOriginLegend`), `lib/bhuvan.ts`, `components/bhuvan-reference.tsx`,
  proxies `app/api/reference/bhuvan/[kind]`, `app/api/proactive/bhuvan/tokens[/[theme]/test]`, connector card token
  expiry and per-token test, Synthetic badges (registry, incident header, Command Center selected case).
- Tests: `services/api/tests/test_bhuvan.py`, `apps/web/scripts/tests/bhuvan.test.cjs`.

## Not built / not verified

- Live responses with real tokens (shape of each answer, land-use code names). The panel shows the returned fields as
  key/value rows; a land-use code legend is not built.
- Automated renewal (blocked: CAPTCHA and terms).
- A "Try it" area on the connector card and a village search screen (the API route exists).
- LULC 250k themes and LULC 50k state/district statistics on a screen (token test only).
- Geoid: not called (bulk tile download).
- Hospitals use a coarse Andhra Pradesh box (it also covers parts of Telangana and Karnataka); Bhuvan answers "no data"
  outside its coverage.
