# Network Identifier Master: phase 1 research and build spec

Written 15 November 2026 (Asia/Kolkata). Phase 1 only: nothing in the repository was changed.
Binds to AGENTS.md (Earth Watch, Communication channels, Patent, Brand, Request boundary, API port,
Sign-in gate, UI kit, Release process, Single-instance rules).

Status: built and live-checked on Windows for 0.4.0 on 15 November 2026. Tracker: [README.md](README.md).
Built differences from this design (owner decisions relayed on 15 November 2026 and build choices):
- Real logo marks are shown where Simple Icons 15.22.0 (CC0) has one (SpaceX on Starlink, Airtel, Jio), bundled offline in
  `apps/web/lib/network-logos.ts`; everyone else keeps the kind icon and monogram (decision 6 changed accordingly).
- Asset locations are latitude/longitude numbers inside India, not PostGIS points; provider NORAD ranges were dropped
  (NORAD number is per asset). Delete and restore are POST routes (`.../delete`, `.../restore`); there is no DELETE.
- The CelesTrak adapter and a credential input on the page are not built (API credential routes exist and are tested).
- The Sensor Link page now makes one in-app read (`/api/network-lanes`); the simulation in `lib/patent.ts` is unchanged.

---------------------------------------------------------------------------------------------------
## 0. Owner-facing summary

**What can be real today (no contract, no account):**
- Public orbital elements from CelesTrak (no key, no login) for whole constellations: Starlink,
  OneWeb, Iridium NEXT, Globalstar, Orbcomm, Intelsat, SES, GNSS (includes NavIC), GEO belt.
  IndTrana can show "N element sets, newest epoch X, orbit class LEO/GEO" per configured satellite
  provider, display-only, cached, opt-in, in the Earth Watch style. This is the one honest live adapter.
- The SACHET all-India CAP RSS feed (`copyright: public domain`) is publicly readable, but showing
  official public warnings inside IndTrana touches the "public warnings never go through IndTrana"
  rule, so it is built as a redirect card now and listed under "needs owner approval" for a live read.

**Redirect-only (official docs or partner portal exists, but access needs an account, contract or NDA):**
Starlink (enterprise account manager), Inmarsat/Viasat IsatData Pro (developer registration),
Iridium (NDA / service provider), Globalstar SPOT (account feed ID; commercial API licence),
OpenCelliD (free API key, CC BY-SA 4.0 share-alike), Space-Track (free account, user agreement),
Airtel IQ (business account), Skylo (device certification), ISRO NavIC messaging (WIMS portal for
authorised broadcasters), TRAI MySpeed / analytics portal (web portal, no API found).

**No public API found:** Eutelsat OneWeb (India), Jio / Jio-SES JioSpaceFiber, BSNL, Vi, ACT Fibernet,
Hughes India, Indus Towers, Sanchar Saathi, C-DOT Cell Broadcast. These get an
"official website" card only, or no link at all if no official page was verified.

**Needs owner approval or a commercial agreement:** any live terminal/link telemetry (Starlink,
IDP, Iridium, SPOT), any messaging through a satellite or mobile network (all forbidden today:
it is new transport), SACHET live read, OpenCelliD tower import (share-alike licence obligations),
Space-Track account, adding an SGP4 dependency for live positions, adding new hosts to the
outbound allowlist, any operator partnership wording.

**What "use their data to sense, predict, reach, learn" means inside the rules (section 5):**
configured providers become the named lanes and availability scenarios of the Resilient Sensor
Link rehearsal and a labelled "path availability (rehearsal)" reference on existing screens; public
orbital data is reference display only; nothing creates or enriches a case, and nothing is sent.

---------------------------------------------------------------------------------------------------
## 1. Research table (all read 15 November 2026)

Legend: **Adapter now** = buildable now under the rules (opt-in, default off, display-only).
**Redirect** = card linking to an official page with an external-link notice. "Not verified" means
a search found nothing official; no URL is given rather than a guessed one.

### 1a. Satellite / non-terrestrial

| Provider | Official public API docs | Official SDK (licence) | What it exposes | Access | Call without account? | Decision |
|---|---|---|---|---|---|---|
| SpaceX Starlink | Docs on readme.io (starlink.readme.io), password from account manager. Source: https://starlink.com/support/article/90109cc2-c7ec-31ff-d160-0a87f16ef759 | None official found | Management API (service lines, terminals, accounts) and Telemetry API ("similar data to Network Statistics" in the portal) | Enterprise account with account manager | No | Redirect (support article) |
| Eutelsat OneWeb (Bharti Airtel, India) | No public API found | None found | n/a. Market access from IN-SPACe (TechCrunch, 21 Nov 2023, https://techcrunch.com/2023/11/21/starlink-oneweb-satellite-broadband-india); commercial launch awaiting approvals (newkerala, Oct 2026) | B2B contract | No | Redirect to provider website only (orbital data via CelesTrak `oneweb` group) |
| ISRO / NSIL: NavIC messaging | No public API. Broadcasters use the WIMS web portal; INCOIS messaging ICD is public: https://www.isro.gov.in/media_isro/pdf/SateliteNavigation/1a_messgingicd_receiver_incois_approved_ver_1.2.pdf ; overview https://www.unoosa.org/documents/pdf/icg/2022/ICG16/wgc-04.pdf | None (ICD for receivers) | One-way broadcast short messages, used for fishermen warnings | Authorised broadcaster | No | Redirect (ICD document). Orbit data: CelesTrak `gnss` group |
| ISRO GSAT (comm satellites) | No public API found | None | n/a | NSIL commercial | No | Reference entry only |
| Jio-SES / JioSpaceFiber | No public API found (RCR Wireless, 27 Oct 2023, https://www.rcrwireless.com/20231027/5g/reliance-jio-demos-satellite-based-fiber-services-remote-regions) | None | n/a | Commercial | No | Reference entry; SES orbits via CelesTrak `ses` group |
| Hughes Communications India | No public API found | None | n/a (VSAT operator, JV with Airtel) | Commercial | No | Reference entry |
| Inmarsat / Viasat IsatData Pro | Yes: https://developer.inmarsat.com/technology/idp/ (API reference behind registration) | `isatdatapro-api` Node.js, Apache-2.0, https://github.com/Inmarsat/isatdatapro-api ; `isatdatapro-azure`, Apache-2.0 | Short binary messages to/from terminals | Developer registration + service contract | No | Redirect (developer portal). SDK listed, not vendored |
| Iridium (SBD / CloudConnect) | No public CloudConnect API docs: https://iridium.com/services/iridium-cloudconnect ("contact us"); Iridium GO! docs after NDA: https://www.iridium.com/iridium-go-application-developer-form | None public | SBD messages delivered to the customer's AWS SQS | Service provider + NDA | No | Redirect. Orbits: CelesTrak `iridium-NEXT` |
| Globalstar (SPOT) | Public feed doc: https://www.globalstar.com/en-us/support-center/spot-for-business/spot-gen4/get-help/general/public-api-and-xml-feed | None | Latest device messages (XML/JSON) for a shared feed ID; Commercial API licence for push | Device account feed ID; commercial licence | Only with someone's feed ID | Redirect. Orbits: CelesTrak `globalstar` |
| Skylo (NB-NTN, direct-to-device IoT) | Certification guidance only: https://www.skylo.tech/certified-devices | None (module vendors give AT commands) | 3GPP NB-IoT over satellite for certified modems | Device certification + carrier | No | Redirect |
| 3GPP NTN (Rel-17 NB-IoT/NR NTN) | Standard, not an API | n/a | n/a | n/a | n/a | Explanatory card, no link verified this round |
| CelesTrak (neutral orbital data) | Yes: https://celestrak.org/NORAD/documentation/gp-data-formats.php ; usage policy https://celestrak.org/usage-policy.php | n/a (plain HTTPS; OMM JSON) | GP elements per GROUP (`starlink`, `oneweb`, `iridium-NEXT`, `globalstar`, `orbcomm`, `intelsat`, `ses`, `gnss`, `geo`) | Free, no key. Policy: download once per update (GP every 2 h), stop on non-200, use a caching proxy, limits enforced on large sets such as Starlink. No redistribution/attribution clause stated | **Yes** | **Adapter now** (opt-in, default off) |
| Space-Track.org | API exists, account and User Agreement required (rate limits reported 30/min, 300/h by third-party docs, not verified on the official page) | Third-party `spacetrack` (Python) only | Full catalogue | Free account + agreement; redistribution limits reported (unverified) | No | Redirect; needs owner approval |

### 1b. Terrestrial and towers

| Provider | Official public API docs | SDK | Exposes | Access | No-account call? | Decision |
|---|---|---|---|---|---|---|
| Bharti Airtel | Airtel IQ CPaaS docs reported by third-party catalog (https://apis.io/providers/bharti-airtel/); not verified on an Airtel page this round | None verified | Messaging (SMS) CPaaS; no network-status/coverage API found | Business account | No | Redirect only to official website; messaging is forbidden transport |
| Reliance Jio | No public network API found (partner-gated per third-party catalog https://providers.apievangelist.com/providers/reliance-jio/) | None | n/a | Partner | No | Reference entry |
| Vi (Vodafone Idea) | No public API found | None | n/a | n/a | No | Reference entry |
| BSNL | No public API found | None | n/a | n/a | No | Reference entry |
| ACT Fibernet | No public API found | None | n/a | n/a | No | Reference entry |
| GSMA Open Gateway / CAMARA (Airtel, Jio, Vi joint SIM-swap/anti-fraud) | Press release: https://www.gsma.com/newsroom/press-release/indian-mobile-operators-help-online-businesses-combat-scams-and-identity-theft-through-new-federated-network-services-supported-by-gsma-open-gateway/ | CAMARA specs (Linux Foundation) | Fraud APIs, not coverage or outages | Commercial via aggregators | No | Explanatory card; not relevant to sensing |
| Indus Towers | No public API found | None | n/a | n/a | No | Reference entry (tower_operator) |
| OpenCelliD | Yes: https://docs.opencellid.org/docs/api/overview ; licence https://docs.opencellid.org/docs/attribution | None official | Estimated cell locations by MCC/MNC/LAC/CID or area | API key (registration); CC BY-SA 4.0, attribution "Cell tower data from OpenCellID, licensed under CC BY-SA 4.0", share-alike | No | Redirect; tower import needs owner approval (share-alike) |
| Mozilla Location Service | Retired: downloads deleted 10 Apr 2024, third-party keys removed 12 Jun 2024 (https://discourse.mozilla.org/t/retiring-the-mozilla-location-service/128693) | n/a | n/a | n/a | n/a | Not listed (retired) |
| beaconDB | Geolocate endpoint `https://api.beacondb.net/v1/geolocate` per distro docs; self-described experimental | n/a | Location from Wi-Fi/cell observations | User agent, no key | Yes, but it geolocates a caller's radio scan, not useful here | Not built |
| TRAI MySpeed / Analytics portal | No API found. Portal https://analytics.trai.gov.in ; data.gov.in catalog https://data.gov.in/catalog/myspeed-crowdsourced-mobile-data-speeds (showed no resources when searched) | TRAI MySpeed SDK mentioned in TRAI PR 149/2026 (https://trai.gov.in/sites/default/files/2026-11/PR_No149of2026.pdf) for app makers; terms not read | Crowdsourced speeds, coverage view | Web portal | Portal only | Redirect |
| DoT Sanchar Saathi | No public API found | None | n/a (citizen services) | n/a | No | Not listed (not a network data source) |
| NDMA SACHET (CAP) + C-DOT Cell Broadcast | SACHET portal https://sachet.ndma.gov.in/ ; public RSS https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml (RSS 2.0, `copyright` "public domain", items link to `FetchXMLFile?identifier=`). C-DOT CAP product sheet https://cdot.in/cdotweb/assets/docs/products/dms/cap.pdf . Cell Broadcast launched with DoT/NDMA, nationwide test 2 May 2026 (NIC eGov update, https://informatics.nic.in/files/websites/april-2026/india-launches-nationwide-cell-broadcast-system-for-disaster-alerts.php) | None | Official public alerts | Read: open. Publish: authorised alerting authorities only | Read yes | Redirect now; live read needs owner approval |

Limits of this research: several items rest on third-party catalogs or news; they are marked.
No SDK was downloaded. Endpoints not seen on an official page are not used in the build.

---------------------------------------------------------------------------------------------------
## 2. Key design decisions

1. **One admin page** `/admin/networks` ("Network Identifier Master") as a new tab under
   Administration in `lib/navigation.ts`, platform_admin only for writes; reads also platform_admin
   (it holds credential references). Sign-in gate unchanged (not public).
2. **Registry, not integration.** Providers and assets are records an admin curates. Only one
   adapter talks to the internet (CelesTrak), opt-in via host switch `AEGIS_NETWORK_REFERENCE=1`
   (`compose.network-reference.yaml`, `-NetworkReference`), default off, plus a per-provider enable.
3. **Credentials reuse `connector_secrets`** (AES-GCM, AAD bound to id + key name): stored as a
   reference + fingerprint, never returned, never logged. No adapter in phase 2 uses a credential
   (CelesTrak needs none); the field exists so a future approved adapter does not change the schema.
   The UI shows "Credential stored (fingerprint …)" or "None".
4. **API base comes from a code allowlist**, never typed: `ADAPTERS` dict in `network_adapters.py`
   (`celestrak_gp` -> `https://celestrak.org/NORAD/elements/gp.php`, GROUP from a closed set).
   The admin picks an adapter id and a group code; free URLs are refused (422 `adapter_unknown`).
5. **Documentation links come from a code catalogue** (`network_catalogue.py`): the verified URLs in
   section 1, each with `kind` (`api_docs`, `partner_portal`, `official_site`, `spec_document`,
   `none`) and `verified_on` date. Admins cannot enter arbitrary links in phase 2 (avoids phishing
   links in a government demo); they may choose "no link".
6. **Neutral artwork.** No logos or trademarks. Icon by kind (Lucide: `Satellite`, `RadioTower`,
   `Cable`, `Building2`) plus a two-letter monogram chip, colour from a fixed 8-colour token palette
   chosen by the admin. Footer note: "Names belong to their owners. Listing a provider is not a
   partnership, endorsement or live connection." No emblems.
7. **Seed = reference entries.** `is_reference = true`, badge "Reference entry, not a partnership".
   Identifiers seeded only where public and stable: MCC 404/405 (India) shown as the country code
   only; no per-operator MNC list is seeded (it varies by circle; not verified this round), admins
   may add MNCs. CelesTrak group codes seeded for constellations. ASNs not seeded (not verified).
8. **Soft delete** (`deleted_at`), restore allowed, hard delete never via API. Optimistic version on
   every row; one append-only audit row per write in the same transaction.
9. **Rehearsal link states are synthetic and per provider** (`rehearsal_state`: up | degraded | down,
   `rehearsal_capacity_kbps` int 0..100000), edited by the admin, labelled "rehearsal value".
10. **3D is a separate client component** reusing the Three.js r128 already in the app
    (pattern of `components/globe/india-globe.ts`: one renderer, disposal list, context-loss handler).
    Default view is 2D (SVG schematic); "Show 3D" is a button. Reduced motion: still frame, no camera
    move. WebGL failure: SVG fallback with a sentence.

---------------------------------------------------------------------------------------------------
## 3. Data model (migration `0NN_network_registry.sql`, number = next free after the user-admin work)

Additive only. `CREATE TABLE IF NOT EXISTS`, no drops, no volume reset.

```sql
CREATE TABLE IF NOT EXISTS network_provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('satellite','terrestrial_mobile','terrestrial_fixed','tower_operator','public_reference')),
  orbit_class text CHECK (orbit_class IN ('leo','meo','geo','mixed') ),          -- satellite only
  constellation_group text CHECK (constellation_group IN ('starlink','oneweb','iridium-NEXT','globalstar','orbcomm','intelsat','ses','gnss','geo')),
  mcc_mnc text[] NOT NULL DEFAULT '{}',          -- each '^[0-9]{3}-[0-9]{2,3}$'
  asn int[] NOT NULL DEFAULT '{}',               -- 1..4294967295
  norad_ranges int4range[] NOT NULL DEFAULT '{}',
  bands text[] NOT NULL DEFAULT '{}',            -- closed set: L,S,C,Ku,Ka,UHF,700,800,900,1800,2100,2300,2500,3300,26000,fibre
  monogram text NOT NULL CHECK (monogram ~ '^[A-Z0-9]{1,3}$'),
  colour_token text NOT NULL CHECK (colour_token IN ('c1','c2','c3','c4','c5','c6','c7','c8')),
  notes text CHECK (char_length(notes) <= 500),  -- NoNul in pydantic
  enabled boolean NOT NULL DEFAULT false,
  is_reference boolean NOT NULL DEFAULT false,
  doc_link_id text,                               -- key into code catalogue, or NULL
  adapter_id text CHECK (adapter_id IN ('celestrak_gp')),
  adapter_enabled boolean NOT NULL DEFAULT false,
  credential_fingerprint text,                    -- display only; secret in connector_secret store
  rehearsal_state text NOT NULL DEFAULT 'up' CHECK (rehearsal_state IN ('up','degraded','down')),
  rehearsal_capacity_kbps int NOT NULL DEFAULT 400 CHECK (rehearsal_capacity_kbps BETWEEN 0 AND 100000),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (adapter_id IS NULL OR kind = 'satellite')
);

CREATE TABLE IF NOT EXISTS network_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES network_provider(id),
  asset_type text NOT NULL CHECK (asset_type IN ('constellation','satellite','gateway','tower','cell','fibre_node')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  norad_id int CHECK (norad_id BETWEEN 1 AND 999999999),
  cell_ref text CHECK (cell_ref ~ '^[0-9]{3}-[0-9]{2,3}-[0-9]{1,6}-[0-9]{1,10}$'), -- MCC-MNC-LAC/TAC-CID, synthetic
  location geography(Point,4326),                 -- synthetic, inside India bbox 68,6,98,38
  synthetic boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS network_asset_provider_idx ON network_asset(provider_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS network_registry_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_subject text NOT NULL,
  agency_id text NOT NULL,
  entity text NOT NULL CHECK (entity IN ('provider','asset')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','enable','disable','delete','restore','credential_set','credential_clear','rehearsal_state')),
  from_version int, to_version int,
  changed_fields text[] NOT NULL DEFAULT '{}'     -- names only, never values of credentials
);
-- append-only: REVOKE UPDATE, DELETE on network_registry_audit from the app role (as brand_audit does)
```

Registry is platform-wide (one catalogue), like brand. Writes still record the operator's agency.
Seed: `db/seeds/network_registry_seed.sql` (or the store's idempotent `ensure_seed()`),
`INSERT ... ON CONFLICT (code) DO NOTHING`, all `is_reference = true`, `enabled = false`:
starlink, eutelsat_oneweb, isro_navic, isro_gsat, jio_ses, hughes_india, inmarsat_viasat, iridium,
globalstar, skylo; airtel, jio, vi, bsnl, act_fibernet; indus_towers; celestrak, opencellid,
space_track, trai_myspeed, ndma_sachet (public_reference). Assets: one `constellation` per satellite
provider; six synthetic towers and two gateways around Hyderabad with `synthetic = true` and
labels "Synthetic tower 1..6, Hyderabad rehearsal" (no real site names, no real cell ids).

---------------------------------------------------------------------------------------------------
## 4. API (`services/api/app/network_registry.py` + `network_registry_store.py` + `network_adapters.py` + `network_catalogue.py`)

Router prefix `/v1/admin/networks`, all routes `Depends(scoped_operator(frozenset({"platform_admin"})))`.
Exercise-agency check as other admin modules. Fixed error codes. Pydantic `extra="forbid"`, `StrictInt`,
`NoNul` on free text.

| Method | Path | Body / effect |
|---|---|---|
| GET | `` | providers (not deleted unless `?include_deleted=true`), assets count, catalogue cards, adapter switch state |
| POST | `/providers` | create; 409 `code_taken` |
| PUT | `/providers/{id}` | update with `expected_version`; 409 `network_version_conflict` |
| POST | `/providers/{id}/enable` / `/disable` | `expected_version` |
| DELETE | `/providers/{id}` | soft delete, `expected_version`; disables adapter |
| POST | `/providers/{id}/restore` | |
| PUT | `/providers/{id}/rehearsal` | `{state, capacity_kbps, expected_version}` |
| PUT | `/providers/{id}/credential` | `{value}` -> encrypt via connector_secrets with AAD `network:{id}`; returns fingerprint only; 503 `master_key_missing` |
| DELETE | `/providers/{id}/credential` | clear |
| GET/POST/PUT/DELETE | `/assets…` | same pattern; location must be inside India bbox; `synthetic` forced true in phase 2 |
| GET | `/providers/{id}/reference` | adapter read: 404 when host switch off; 409 `adapter_disabled`; returns `{group, element_count, newest_epoch, orbit_class_counts, fetched_at, stale}`; never stores |
| GET | `/audit` | last 200 rows |
| GET | `/rehearsal-lanes` | read for the Sensor Link page (any signed-in role allowed to view that page): enabled providers' code, display_name, kind, monogram, colour, rehearsal state/capacity only. No ids of credentials, no notes |

Adapter rules (copy of `earth_watch.py` fetcher): HTTPS only, host `celestrak.org` only, no redirects
(`HTTPRedirectHandler` refusing), `ProxyHandler({})`, 10 s timeout, 25 s deadline, 8 MB cap
(Starlink group is large; else use `oneweb` etc.; if the cap is hit return `reference_too_large`),
User-Agent `IndTrana-NetworkReference/1.0 (local exercise demo)`, in-memory cache 2 h per group
(policy: once per update), on any non-200 stop and back off 6 h with fixed code `reference_unavailable`
(policy: stop on non-200). Parse OMM JSON fields `EPOCH`, `MEAN_MOTION` only; orbit class from mean
motion (>11 rev/day LEO, ~1 GEO, else MEO). Never written to PostgreSQL; never reaches cases.

Register router in `main.py`; route-inventory test sees the operator dependency; `/rehearsal-lanes`
uses `get_operator` + role list of the Sensor Link page roles.

---------------------------------------------------------------------------------------------------
## 5. Sense, predict, reach, learn: what "use their data" means here

| Stage | Built now (inside rules) | Needs owner approval (not built) |
|---|---|---|
| Sense | Resilient Sensor Link reads `/rehearsal-lanes`: the two link pools are labelled with enabled providers ("Ground: Airtel (reference)", "Satellite: OneWeb (reference)") and the admin's rehearsal state preselects a scenario (`down` ground -> `ground_cut`, etc.). `lib/patent.ts` simulation unchanged, still pure; lanes are labels plus a starting scenario. Earth-Watch-style "orbital reference" panel on the admin Overview: element counts and epoch freshness | Live terminal telemetry; tower data import; any sensor actually riding a provider |
| Predict | "Path availability (rehearsal)" line: for the configured lanes, which priority classes would still be served in each Storm timeline moment (derived from existing `allocate`). Labelled rehearsal, not a forecast | Any outage forecasting from operator data |
| Reach | Communication panel on Sensor Link names the configured lane per control room/desk/team (existing table). Text: "Nothing is transmitted." | SMS, satellite messaging (IDP/SBD/NavIC), cell broadcast, any operator API send: all new transport, forbidden |
| Learn | Activity tab statistics from audit only: count of rehearsal state changes per provider, time each provider spent "down" in rehearsals. Labelled "rehearsal statistics, not accuracy" | Learning from real outage data |

No registry value creates, enriches or ranks a case, assessment, proposal, task, warning or CAP.

---------------------------------------------------------------------------------------------------
## 6. Patent wording (only from `lib/patent.ts`)

Overview tab shows the existing `PatentCredit` component (number 598835, title, patentee Bharath
Bejjarapu) and `PATENT.howItApplies` + `titleOnlyNote`, plus one sentence: "Providers configured here
name the links in the Resilient Sensor Link rehearsal." No claims, no figures, IndTrana not called
patented. Add the page to "Where it appears" in docs/PATENT_SENSOR_LINK.md.

---------------------------------------------------------------------------------------------------
## 7. UX

Page `apps/web/app/admin/networks/page.tsx` (server wrapper) + `components/network-master/*`.
Tabs (kit `Panel`, `DataTable`, `PermissionState`, `RecordRef`, `Button`; labels in `lib/labels.ts`;
help in `lib/page-help.ts`; strings in `lib/translations-pending.ts`):

1. **Overview**: focal point = schematic scene (2D SVG default; "Show 3D" button). Left: scene;
   right: four counts (providers enabled, satellite, terrestrial, assets) and the selected provider
   card. Banner: "Registry and rehearsal only. No live connection to any provider."
2. **Satellite networks**: DataTable (chip, name, orbit class, group, bands, state, enabled, docs
   card kind). Row select highlights the scene. Add / Edit drawer, Enable/Disable, Delete (confirm
   with name), Restore filter.
3. **Terrestrial networks**: mobile + fixed; MCC-MNC, ASN, bands.
4. **Towers and assets**: assets table + small synthetic map (existing map component if one exists in
   the app, else list) with "Synthetic location" labels.
5. **Integrations**: one card per provider: "Reference adapter (public orbital data)" with switch state,
   or "Official documentation" / "Partner portal" / "No public API found" with external-link notice
   ("You are leaving IndTrana. The link opens the provider's own page in a new tab.";
   `rel="noopener noreferrer"`, `target=_blank`). SDK line (name + licence + "not included").
   Credential field (write-only).
6. **Activity**: audit table + rehearsal statistics.

3D scene (`components/network-master/network-scene.ts`, Three.js r128): low-poly Earth sphere
(no texture, palette colour), orbit ring with one satellite (box body + two panels) moving, a lattice
tower (line segments) on the surface with three expanding ring pulses, dashed link line when the
selected provider's rehearsal state is `up`, amber when `degraded`, absent when `down`. Pause button,
`prefers-reduced-motion` -> static frame, `webglcontextlost` -> SVG fallback, render only when visible
(IntersectionObserver), dispose on unmount. Satellite kind selected -> satellite highlighted; tower /
terrestrial -> tower highlighted. Caption under the scene: "Schematic. Not a real orbit, position or
coverage." At 390 px: 2D only, tables become stacked rows.

Seven ground rules: focal point (scene + selected card), spacing (existing 8 px scale), typography
(existing scale), colour (8 tokens, state colours from existing status tokens, light/dark), real content
(seeded reference entries and verified links, no lorem), details (empty, loading, error, conflict states
via `apiFailureText`), motion (pulses only, pausable, reduced-motion).

Tour `admin-networks` in `lib/tours.ts` with `data-tour` hooks: `nm-scene`, `nm-tabs`, `nm-add`,
`nm-integrations`, `nm-activity`. Copy: no live, dispatch or accuracy claim.

---------------------------------------------------------------------------------------------------
## 8. File-by-file build list (phase 2)

API
- `db/migrations/0NN_network_registry.sql` (new; number after user-admin's 020)
- `services/api/app/network_catalogue.py` (verified links/SDK lines, constants)
- `services/api/app/network_adapters.py` (CelesTrak fetcher)
- `services/api/app/network_registry_store.py` (SQL, version checks, audit in same txn, seed)
- `services/api/app/network_registry.py` (router)
- `services/api/app/main.py` (include router)
- `services/api/tests/test_network_registry.py`, `tests/test_network_adapters.py`
- `compose.network-reference.yaml`; `scripts/start-windows.ps1` / `aegis.ps1` / `aegis.sh` `-NetworkReference` flag

Web
- `apps/web/app/admin/networks/page.tsx`
- `apps/web/app/api/admin/networks/[...path]/route.ts` (or explicit routes) through a proxy helper `lib/network-registry-proxy.ts` that checks origin and forwards the bearer via `lib/api-auth.ts`
- `apps/web/components/network-master/{network-master.tsx, provider-table.tsx, provider-form.tsx, asset-table.tsx, integration-card.tsx, activity.tsx, network-scene.ts, network-scene-2d.tsx, monogram-chip.tsx}`
- `apps/web/lib/network-registry.ts` (types, colour tokens, state -> scenario map)
- `apps/web/components/sensor-link.tsx` (lanes from `/rehearsal-lanes`, fallback to current labels)
- `lib/navigation.ts`, `lib/page-help.ts`, `lib/labels.ts`, `lib/tours.ts`, `lib/translations-pending.ts`, `lib/release-notes.ts`, `apps/web/package.json` version bump (next minor after 0.4.0)
- Tests: `scripts/tests/network-master.test.cjs` (origin checks, proxy rejects free URL, no secret fields in client types, labels coverage), update `mutating-route-origin.test.cjs` if it enumerates, `tours.test.cjs`, `release-notes.test.cjs`, `sensor-link.test.cjs` (lanes fallback)

Docs
- `docs/NETWORK_IDENTIFIER_MASTER.md` (this spec trimmed + research table)
- `AGENTS.md` rule paragraph (below), `README.md` feature line, `CHANGELOG.md`, `docs/LOCAL_DEMO_HANDOFF.md` round, `docs/PATENT_SENSOR_LINK.md` "Where it appears", `docs/BRANDING.md` note on third-party names

AGENTS.md paragraph (draft):
> Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md) is a platform_admin registry of satellite, mobile, fixed and tower providers and synthetic assets, with version checks, soft delete and append-only `network_registry_audit`. Seeded rows are reference entries, not partnerships; no third-party logos or emblems. Documentation links and adapter hosts come only from the code catalogue; the only live adapter is CelesTrak GP (opt-in `-NetworkReference`, no redirects, in-memory cache, stop on non-200, display-only, never stored). Credentials go through `connector_secrets` and are never returned or logged. Rehearsal link states only label and preselect the Resilient Sensor Link simulation; nothing creates or enriches cases and nothing is transmitted through any provider. Run `test_network_registry.py`, `test_network_adapters.py` and `network-master.test.cjs`.

Release note / CHANGELOG entry (draft): "Network Identifier Master: administrators can list satellite,
mobile, fixed-line and tower providers as reference entries, enable or disable them, set rehearsal
link states that name the Resilient Sensor Link lanes, and see official documentation links. Optional
public orbital reference from CelesTrak. Nothing connects to or sends through any provider."

---------------------------------------------------------------------------------------------------
## 9. Test plan (phase 2)

API pytest
- every route: 401 without operator, 403 for each non-admin role, 403 other agency (fixed message)
- create/update/enable/disable/delete/restore happy paths; audit row per write in same txn (force a failure after write -> no audit, no change)
- version conflict 409 on stale `expected_version`
- soft delete hides row, restore brings back; deleted provider's adapter refused
- credential: set returns fingerprint only; GET never contains value or ciphertext; logs (caplog) contain neither; missing master key -> 503 fixed code
- validation: code regex, MCC-MNC regex, bbox, colour tokens, NoNul, extra fields forbidden, unknown adapter / free URL refused
- adapter: host switch off -> 404; non-https / other host refused; redirect refused; non-200 -> `reference_unavailable` + backoff; size cap; cache hit no second fetch (monkeypatched opener); nothing written to DB
- `/rehearsal-lanes`: only allowed fields
- `test_route_auth_inventory.py`, `test_security_hardening.py` still pass
- `python -m pytest -q`, `python -m app.model_lab --check`

Node
- `network-master.test.cjs`, `mutating-route-origin.test.cjs`, `tours.test.cjs`, `release-notes.test.cjs`, `sensor-link.test.cjs`, `ui-defects.test.cjs`
- `npm run typecheck`, `npm run build`

Browser (under the single-instance lease, after the other engineer's stack work is finished)
- demo-admin: add provider, edit, conflict in two tabs, disable, delete, restore; credential set shows fingerprint only; Integrations links open new tab with notice; 3D toggle, pause, reduced-motion emulation, WebGL disabled fallback, 390 px layout; tour runs
- non-admin (operator): `/admin/networks` shows PermissionState; API proxy 403; Sensor Link shows lane names read-only
- `-NetworkReference` off: Integrations shows "Public orbital reference is switched off on this server"

---------------------------------------------------------------------------------------------------
## 10. Open questions for the owner

1. May IndTrana contact `celestrak.org` at all (new outbound host, opt-in, display-only)? If no, the build ships redirect-only.
2. Show the public SACHET CAP feed as read-only reference, or keep it as a link? (AGENTS: public warnings never go through IndTrana.)
3. Are there actual commercial agreements (Starlink enterprise, Airtel/OneWeb, IDP) whose sandboxes we may use? Without them every telemetry adapter stays redirect-only.
4. Accept OpenCelliD's CC BY-SA 4.0 share-alike for any tower import, or keep towers synthetic? (Spec: synthetic.)
5. May we add an SGP4 library (e.g. Python `sgp4`, MIT, or `satellite.js`, MIT; licences to be re-checked) to plot real current positions? Spec: no; counts and epochs only.
6. Should non-admin roles see provider names on Sensor Link (spec: yes, names + rehearsal state only)?
7. Confirm wording "reference entry, not a partnership" is acceptable to reviewers, and whether any provider should be omitted from the seed.
