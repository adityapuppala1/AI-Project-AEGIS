# Bhuvan connectors (ISRO / NRSC)

IndTrana can show live reference data from ISRO's Bhuvan geoportal (operated by NRSC) for the location of an
exercise case. The case stays synthetic; the Bhuvan data next to it is real and is labelled **Live · Bhuvan** with the
time it was fetched. Research notes and the build tracker: [specs/BHUVAN_CONNECTORS.md](specs/BHUVAN_CONNECTORS.md).

## What each API gives and where it shows

| Portal theme (token) | Endpoint on `bhuvan-app1.nrsc.gov.in` | What IndTrana shows | Limits |
|---|---|---|---|
| Village Reverse Geocoding | `/api/api_proximity/curl_reverse_village.php?lat&lon` | Village and district at the case point (incident page) | Census 2001 villages, Andhra Pradesh and Karnataka |
| LULC AOI Wise | `/api/lulc/curl_aoi.php?geom=<WKT>` | Land-use areas in a square of about 2 km around the case | LULC 50k |
| Routing | `/api/routing/curl_routing_state.php?lat1&lon1&lat2&lon2` | Reference road path and its length from a synthetic team base (button) | Within one state; reference only, not navigation |
| Postal and Hospital (Only AP) | `/api/api_proximity/curl_hos_pos_prox.php?theme=hospital&lat&lon&buffer` | Hospitals within 3 km (button) | Andhra Pradesh only; refused outside an AP box |
| Village Geocoding | `/api/api_proximity/curl_village_geocode.php?village` | API route only (`/v1/reference/bhuvan/village`); no screen yet | Census 2001, AP and Karnataka |
| LULC Statistics | `/api/lulc/curljson.php?statcode|distcode&year` | Token test only | 2005-06 and 2011-12 |
| Geoid | `/api/geoid/curl_gdal_api.php` | Not called: it downloads a CartoDEM tile zip (bulk), not a point correction | Stored and shown for expiry only |

The token goes in the `token` query parameter; the portal asks for `Content-Type: application/x-www-form-urlencoded`.
"No data" answers are `false` or `null`; a bad token answers HTTP 200 with `{"error":"invalid_token",...}`, which IndTrana
shows as "Bhuvan refused the saved token".

## Set up (administrator)

1. Start IndTrana with the proactive option (the default for `aegis.cmd start`) and a connector master key.
2. Sign in on <https://bhuvan-app1.nrsc.gov.in/api/> with your own Bhuvan account (the sign-in page has a CAPTCHA),
   open **Access Token** and generate a token for each theme you need.
3. In IndTrana open **Administration → Connectors → ISRO Bhuvan API (NRSC)**, paste each token into its field, Save,
   press **Test this token** for each, switch the connector on and Save again.
4. Each token is valid for one day. The card shows when each token was saved, when it expires and "Expired, renew"
   afterwards. Expiry is counted from when you saved it, so paste a token soon after generating it.

## Renewal

**No automated renewal is built.** The portal sign-in uses an image CAPTCHA, and the Bhuvan terms of service forbid
access "through any technology or means other than those provided by the Bhuvan portal". IndTrana does not try to
get around either. Tokens are pasted by hand each day; IndTrana never stores the portal user name or password.

## Terms and attribution

Bhuvan terms of service: <https://bhuvan.nrsc.gov.in/home/terms.php>. In short: content is for viewing purposes only;
no copying, redistribution or derivative works; no mass downloads or bulk feeds (including coordinates); no use for
real-time navigation or route guidance; notices must not be removed. Some content belongs to Survey of India, Census
and others. The portal footer reads "Copyright © 2018 Bhuvan". IndTrana shows "Data: Bhuvan, NRSC/ISRO" and a link to
the terms under every Bhuvan view, uses no ISRO or Bhuvan logo or emblem, keeps answers in memory for at most an hour
and never stores or exports them. The owner is responsible for using the Bhuvan account within its terms.

## What it never does

- Never writes Bhuvan data to PostgreSQL, and never lets it create or change cases, assessments, proposals, approvals,
  tasks, warnings or CAP drafts.
- Never sends free text: coordinates are numbers checked inside India's bounding box on the server, the place search
  accepts only a short plain name, and the land-use square is built on the server.
- Never returns or logs a token; only an 8-character fingerprint, the save time and the expiry are shown.
- Never presents the reference route as dispatch or navigation.

## Checks

API: `tests/test_bhuvan.py`, `tests/test_proactive_connectors.py`, `tests/test_route_auth_inventory.py`.
Web: `node --test scripts/tests/bhuvan.test.cjs`.

## Checked with real tokens (15 November 2026, version 0.5.1)

On the Windows laptop, with the owner's tokens pasted on the Connectors page: the incident page showed the village and
district, land use as shares per class, a reference route length, and hospitals for a Vijayawada point. Three display
problems found in that check were fixed in 0.5.1 (see `CHANGELOG.md`). Still open: the LULC Statistics token fails its
test and is not used on any screen; the land-use class names come from the NRSC legend, not from the API; the Bhuvan
code has not had a security review. Details: [specs/BHUVAN_CONNECTORS.md](specs/BHUVAN_CONNECTORS.md).
