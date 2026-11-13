# Proactive multi-hazard watch, prediction and alerting — research findings and plan

**Status:** proposal, 2026-11-02. Nothing in this document is built or approved.
**Owner decisions needed before any phase starts:** see section 8.
**Build contract:** [PROACTIVE_IMPLEMENTATION_CONTRACT.md](PROACTIVE_IMPLEMENTATION_CONTRACT.md)
(owner approved building the framework on 2026-11-02; keys to be entered by a platform admin later).

## 1. What was asked

Make IndTrana proactive: watch many live sources (weather, water levels, wind, satellite imagery,
fire detections, landslide risk, cyclone tracks), learn from historical patterns, predict where
natural hazards will hurt people, show live and predicted side by side on a 3D map, simulate
options, recommend a decision quickly, and get warnings to the public and to local authorities
even when mobile towers are down (satellite). The user's hard requirement: **never hallucinate,
because lives depend on the decisions.**

## 2. What the research found (verified, with sources)

### 2.1 Mass communication in India is a government channel, not an app feature

- India's public alert system is **SACHET**, built by C-DOT on the ITU **Common Alerting Protocol
  (CAP)**, operational in all 36 states/UTs, delivering geo-targeted SMS. **Cell Broadcast** was
  added on top; NDMA ran a nationwide test on 2 May 2026. One outlet reported a temporary suspension
  of cell-broadcast notifications on an unspecified date; current status must be checked with NDMA.
  Sources: [ETV Bharat](https://www.etvbharat.com/en/bharat/ndma-tests-cell-broadcast-message-to-alert-citizens-on-severe-disaster-enn26050201915),
  [News Arena](https://newsarenaindia.com/nation/what-is-sachet-india-s-new-emergency-alert-system-explained/76207),
  [Zee Business](https://www.zeebiz.com/india/news-emergency-alerts-suspended-for-the-time-being-ndma-issues-advisory-397223).
- **Satellite paths exist but are operator-side, not callable APIs:**
  - **NavIC Messaging Service** (ISRO): one-way broadcast used by INCOIS for cyclone/high-wave
    alerts to fishermen with NavIC receivers; ISRO was integrating CAP uploads from IMD/CWC (in
    testing as of 2022). Sources: [ISRO ICD](https://new1.isro.gov.in/media_isro/pdf/Missions/1a_messgingicd_receiver_incois_approved_ver_1.2.pdf),
    [UNOOSA ICG16](https://www.unoosa.org/documents/pdf/icg/2022/ICG16/wgc-04.pdf),
    [Telangana Today](https://telanganatoday.com/navic-tracks-10400-trains-40000-fishing-vessels-disaster-alerts-operational).
  - **Starlink direct-to-cell + MediaTek**: satellite delivery of WEA/CMAS/ETWS alerts announced
    March 2026; depends on compatible chipsets and the mobile operator. Source:
    [MediaTek press room](https://www.mediatek.com/press-room/mediatek-demonstrates-emergency-satellite-services-for-mobile-devices-with-starlink-mobile).
  - **Galileo EWSS** (Europe): satellite emergency warning service, initial service planned 2026;
    not applicable to India. Source: [Xataka Móvil](https://www.xatakamovil.com/conectividad/dana-dejo-claro-problema-alert-depende-antenas-que-pueden-caerse-solucion-llega-via-satelite).
- **Conclusion:** the only lawful, reachable route is **IndTrana → CAP message → the authority's
  SACHET/NavIC uplink**. IndTrana can prepare, validate and hand over a CAP-compliant alert; it must
  never broadcast. This also satisfies the existing repository rule (no live warnings).

### 2.2 Prediction: use authoritative open models first; train only inside the registered protocol

- **ECMWF AIFS** (ML weather model) output is open under CC-BY 4.0, 0.25°, 4 runs/day, 15 days,
  GRIB2 via the ECMWF Open Data API. Known limit: reduced intensity of tropical cyclones.
  Sources: [ECMWF](https://www.ecmwf.int/en/forecasts/datasets/aifs-machine-learning-data),
  [Hugging Face model card](https://huggingface.co/ecmwf/aifs-single).
- **Google Flood Hub** covers India with the Central Water Commission; there is **no public API**;
  agencies integrate through government channels. Claimed skill (5-day lead ≈ prior 0-day) comes
  from a 2024 Nature paper cited second-hand; no 2026 India-specific evaluation was found.
  Sources: [Google blog](https://blog.google/technology/ai/expanding-our-ml-based-flood-forecasting/),
  [IndiaAI](https://indiaai.gov.in/case-study/using-ai-to-predict-floods-and-save-lives).
- **NASA LHASA 2** gives ~1 km daily landslide probability from GPM rainfall + SMAP soil moisture;
  best-effort server with frequent downtime; NASA recommends running it yourself.
  Source: [github.com/nasa/lhasa](https://github.com/nasa/lhasa).
- **NASA FIRMS** active-fire data (VIIRS), ~3 h latency worldwide, free MAP_KEY, 5,000
  transactions / 10 min. Source: [NASA FIRMS Q&A 2025](https://appliedsciences.nasa.gov/sites/default/files/2025-05/Part%203%20FIRMS%202025%20Q&A%20Session.docx.pdf).
- **Sentinel-1 flood extent** via Copernicus Data Space **openEO** (UN-SPIDER change-detection
  recipe; needs an account/OIDC). Source: [CDSE openEO example](https://documentation.dataspace.copernicus.eu/APIs/openEO/openeo-community-examples/python/FloodSAR/flood_sar_udf.html).
- **IMD district warnings** have no documented API; the map is an undocumented GeoServer WMS/WFS.
  Using it needs IMD's terms first. Source: [Simple IMD Alerts](https://thejeshgn.com/2024/09/11/simple-imd-alerts/).
- **Trigger design** in practice (IFRC Early Action Protocols) uses pre-agreed thresholds on an
  official forecast (e.g., 5-year return period, 4–8 days before peak), monitored daily, with the
  forecast's skill assessed against observations before the trigger is trusted.
  Sources: [Anticipation Hub](https://www.anticipation-hub.org/news/sudan-how-to-develop-a-trigger-for-flooding),
  [IFRC Mali EAP](https://go-api.ifrc.org/api/DownloadFile/90689/MDRML021_EAP%20Summary).

### 2.3 AI governance: humans stay the issuing authority

WMO's position: AI works inside the forecasting system; human experts evaluate AI output, judge
uncertainty and weigh local vulnerability; national services remain the authoritative source of
warnings; rigorous verification precedes any operational use; gaps remain for local high-impact
weather. Sources: [WMO, AI in Disaster Resilience](https://wmo.int/secretariat/celeste-saulo/ai-disaster-resilience-bridging-science-standards-and-innovation),
[WMO AI action plan](https://wmo.int/node/31112).

### 2.4 "Never hallucinate" — what is and is not achievable

No language model can be guaranteed never to hallucinate. What **can** be guaranteed by design:

1. **LLMs never originate facts.** Every number, place, time and threshold shown comes from a
   stored, checksummed source record with a UUID; the model only **selects, classifies or ranks**
   over those records (IndTrana already does this for guide questions and review focus).
2. **LLMs never issue, send or approve.** Warnings are drafted from templates filled by code,
   checked by a human, and handed to the authority as CAP.
3. **Every judgment carries a probability and a confidence band; below threshold → human.**
   TypeSafe/Jev fits this: it returns typed answers with probabilities instead of free text,
   with guidance to route low confidence to a person and require >0.9 before high-stakes
   automation. Confidence "is not permission to act". Source: [TypeSafe confidence](https://docs.typesafe.ai/confidence.md).
4. **Forecast skill is measured, not assumed**, on a held-out period used once (the registered
   Phase 2 protocol already does this; its stop rule is <5 test events).
5. **Synthetic results are labelled synthetic everywhere** (existing rule).

### 2.5 What should not be done

- **Web scraping, social media and public webcams as inputs:** unverifiable, legally fraught
  (personal data, terms of service), and the main source of false alarms. Use structured official
  feeds only. Unverified public reports already have a quarantined path (public intake).
- **Training a bespoke multi-hazard forecaster now:** too few labelled local events; AIFS, GloFAS,
  LHASA and IMD outperform anything trainable here. IndTrana adds value as the **trigger, fusion,
  explanation and decision-support layer**, not as a new weather model.
- **Any direct public broadcast from IndTrana.**

## 3. Target architecture (extends the existing stack, no rewrite)

```
 Official feeds ──► Source adapters (allowlisted HTTPS, TTL cache, checksums, provenance UUIDs)
 (AIFS, Open-Meteo,      │
  FIRMS, LHASA,          ▼
  Sentinel-1, IMD*)   Evidence store (PostGIS; immutable snapshots; stale labels)
                         │
                         ▼
                 Trigger engine (code, pre-agreed thresholds per hazard; IFRC-style; versioned)
                         │  fires "watch" / "alert candidate" with cited evidence
                         ▼
                 Orchestrator (bounded run: fixed steps, audit per step, cancellable)
                   ├─ Simulation (scenario variants from existing synthetic index + thresholds)
                   ├─ Jev judgments: which pre-agreed playbook option does the evidence support?
                   │   does the draft cite only verified records? (probabilities + confidence)
                   └─ Draft: CAP 1.2 message + playbook recommendation (template-filled by code)
                         │
                         ▼
                 Human maker → independent checker (existing two-person approval)
                         │
                         ▼
                 Hand-over: CAP file/feed for SACHET / NavIC uplink by the authority  ← never sent by IndTrana
                 Authority notification: email/API only when the authority has enrolled (owner decision)

 UI: Command Center 3D (existing MapLibre + schematic locators) + hazard surfaces (deck.gl or
     Three.js layer), "Live | Predicted" split view on click, evidence drawer, trigger timeline,
     orchestrator run visualised as a step graph. Display-only; reduced-motion and 2D fallback kept.
```

`*` IMD only after its terms are confirmed.

## 4. Phased plan, effort and gates

Effort is in person-days for one engineer with AI assistance; verification is extra and listed.
All phases keep the base Compose stack unchanged and default-off (overlay files), as Earth Watch does.

| Phase | Scope | Effort | Gate to pass |
|---|---|---|---|
| **P1 Sources** | Adapters for AIFS open data (CC-BY), FIRMS (MAP_KEY), LHASA nowcast (or local run), Open-Meteo flood (exists); Sentinel-1 openEO and IMD WFS behind owner-provided accounts/terms. Provenance UUIDs, checksums, stale labels, attribution. | 8–10 d | Unit + adapter tests with recorded fixtures; allowlist/no-redirect/XML guards as Earth Watch; licence register updated |
| **P2 Trigger engine** | Per-hazard thresholds (flood, heavy rain, landslide, fire, wind/cyclone, heat) as versioned config; daily evaluation; "watch / candidate" states with cited evidence; false-alarm bookkeeping. | 6–8 d | Replay against the 2000–2025 Open-Meteo pilot + known events; hit/miss/false-alarm table; stop rule honoured |
| **P3 Orchestrator + Jev** | Bounded run: evidence bundle → scenario variants → Jev questions (playbook option, citation check, severity band) → template-filled CAP 1.2 draft + recommendation; confidence bands; audit per step; cancel. Jev calls server-side, key never in browser. | 8–10 d | Test doubles offline; live Jev only with owner key; threshold calibration on labelled cases; no write path to approval |
| **P4 3D and explain** | Hazard surface layer (deck.gl/Three.js) on Command Center; Live \| Predicted split panel; evidence drawer; trigger timeline; orchestrator step graph with motion that respects reduced-motion; 2D fallback. | 8–10 d | axe both themes/viewports, keyboard, Web Vitals budgets, theme gate |
| **P5 Hand-over** | CAP 1.2 export (schema-validated) for authority uplink; authority enrolment model; opt-in notification adapter stubbed, send disabled by default. | 4–5 d | CAP XSD validation; proof that no send path exists in base config |
| **P6 Evaluation and docs** | Skill tables per hazard with CIs; limitations; runbook; handoff; human rehearsal. | 4–5 d | Second-person review; no accuracy claim without the table |

**Total: ~40–48 engineer-days** plus owner/reviewer time. Nothing here is a production certification.

## 5. Jev question design (draft, to validate on labelled cases)

State per question: the evidence bundle (cited records only), the active trigger, the pre-agreed
playbook options, and the draft text.

| ID (code only) | Primitive | Question |
|---|---|---|
| playbook_option | Choice | Which of the listed pre-agreed options does this evidence best support? Include "none/escalate". |
| citation_clean | Noul | Does every factual claim in the draft map to a cited record in the bundle? |
| severity_band | Score | Position on the defined impact levels (each level described concretely). |
| staleness_risk | Noul | Has the situation likely changed since the newest evidence timestamp? |

Policy in code: act-free. ≥0.9 confidence shows "recommended"; 0.5–0.9 shows "needs review";
<0.5 or any `citation_clean` < 0.9 blocks the draft. All thresholds are starting points.

## 6. Data and account register (owner action)

| Source | Licence | Account | Cost | Status |
|---|---|---|---|---|
| ECMWF AIFS open data | CC-BY 4.0 | none | free | cleared to use with attribution |
| Open-Meteo | non-commercial | none | free | in use (Phase 1) |
| NASA FIRMS | NASA open | free MAP_KEY | free | owner to register |
| NASA LHASA | open | none (Earthdata for archive) | free | nowcast server unreliable; local run possible |
| Copernicus Data Space (Sentinel-1) | open | CDSE account | free tier | owner to register |
| IMD district warnings | undocumented | — | — | terms needed before use |
| TypeSafe Jev | commercial API | key | paid | owner decision; repository rule bars paid infra until authorised |
| SACHET / NavIC uplink | government | enrolment | — | authority-side only |

## 7. What stays true throughout

- IndTrana is decision support. The national/state authority issues warnings.
- No live broadcast, dispatch or external message from IndTrana. CAP is handed over, not sent.
- Real data results are reported with the registered protocol; synthetic results stay labelled.
- Two-person approval, immutable snapshots, agency scope and audit are preserved.
- No scraping, no social media, no webcams.

## 8. Decisions needed from the owner

1. Approve this plan and the phase order (P1→P6) or reorder.
2. Register FIRMS MAP_KEY and a Copernicus Data Space account; confirm non-commercial use.
3. Decide on a TypeSafe/Jev key (paid) and a monthly budget, or keep Jev as test doubles.
4. Confirm whether IMD/India-WRIS terms can be obtained; until then IMD is excluded.
5. Confirm that hand-over to authorities is a file/feed export only for the demo window.
6. Name the hydrology reviewer and second reviewer for trigger calibration.
