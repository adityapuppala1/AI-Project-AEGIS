# Real historical data research plan (proposed, not authorized)

Status (2026-11-02): **Phase 0 complete; a bounded Phase 1 pilot is approved to start under the conditions in
the approval table** (delegated decision, see below). The licence register is
[`research/real-data/LICENCES.md`](../research/real-data/LICENCES.md). No real data has been downloaded yet and none
is connected to the application. IndTrana remains a local synthetic demonstration. Each phase
below needs explicit owner approval before it starts. Phase 3 also needs a
separate safety and licensing review.

## Goal

Measure honestly how well simple, explainable flood-risk indicators would have
performed on **past Hyderabad events**, using public historical data. The aim
is evidence, not a forecasting product. A good result here does not make IndTrana
an operational warning system.

## Non-goals

- Live or real-time feeds, public warnings or dispatch.
- Claims of forecasting accuracy beyond what the recorded evaluation shows.
- Scraping websites whose terms forbid it, or bypassing logins or rate limits.
- Mixing real records into the synthetic demo fixtures.

## Candidate sources

Licences and terms must be re-checked and recorded at the start of Phase 1.

| Source | Use | Access | Known constraint |
|---|---|---|---|
| Open-Meteo Historical Weather API | Hourly/daily rainfall for Hyderabad grid points | Free JSON API | Non-commercial free tier, under 10,000 calls/day; CC BY 4.0 attribution |
| Open-Meteo Flood API (GloFAS) | Daily river discharge history (Musi basin cells) | Free JSON API | Coarse grid; model output, not gauge data |
| Copernicus ERA5 / GloFAS | Longer reanalysis history, bulk files | Free account, `cdsapi` | Large downloads; Copernicus licence |
| NASA GPM IMERG | 30-minute satellite rainfall, 2000 onward | Free Earthdata login | Satellite estimate; about 10 km grid |
| IMD gridded/station rainfall | Official reference rainfall | Downloads or formal request | Station data may require a request |
| India-WRIS / CWC | River levels, reservoirs (Osman Sagar, Himayat Sagar) | Portal export | No official API; check the terms before automating |
| TSDPS / GHMC rain gauges | Dense urban rainfall | Formal data request | Not publicly available as far as known |
| Flood event records | Ground-truth labels (dates, localities) | News archives, GHMC/NDMA reports | Must be built and reviewed by hand |

## Phases

### Phase 0 — Approval and licence register (1–2 days)

- Owner approves Phase 1 in writing in this document.
- Record each source's licence, attribution text, rate limits and permitted use
  in a licence register (`research/real-data/LICENCES.md`).
- **Exit:** register complete; any source with unclear terms is excluded.

### Phase 1 — Offline download and event catalogue (1–2 weeks)

- Work in a separate `research/real-data/` folder with its own Python
  environment. No imports from or into `services/api`, and no database writes.
- Write small, rate-limited, resumable download scripts that save raw responses
  with source, URL, retrieval time and checksum.
- Cover 2000–2025 for a fixed set of Hyderabad grid points and Musi basin cells.
- Build a flood event catalogue: date, locality, severity and source citation,
  each entry checked by a second person. Include known events such as October
  2020, and **non-event heavy-rain days** as negatives.
- Keep raw downloads out of Git; commit only the scripts, the catalogue and the
  manifests.
- **Exit:** reproducible downloads (re-running gives identical checksums), and
  a catalogue of at least 30 reviewed event and non-event days.

### Phase 2 — Retrospective evaluation (2–4 weeks)

- Define simple, explainable indicators first, such as 1/3/24-hour rainfall
  totals, antecedent 7-day rain and river discharge percentile.
- Split strictly by time (for example, train up to 2017 and test 2018–2025).
  Never use a random split.
- Report hit rate, false-alarm rate, missed events and lead time against a
  baseline such as rainfall above a fixed threshold. Report failures as
  prominently as successes.
- Add uncertainty: confidence intervals, and the small number of events.
- Produce a written evaluation report with reproducible commands, source
  versions and limitations.
- Optional, after review: show the report in Model Lab as a separately labeled
  **"Real historical retrospective"** dataset. Keep it read-only and clearly
  separated from the synthetic results. It must not feed the live workflow or
  approvals.
- **Exit:** report reviewed by someone with hydrology or disaster-management
  expertise.

### Phase 3 — Any live or operational use (separate program)

Out of scope here. It would need licensed live feeds, domain-expert
validation, agency agreements, a security and safety review, production
infrastructure and explicit owner authorization. Treat it as a new project.

## Safety rules that carry over

- Real data stays in `research/real-data/` until a reviewed decision says otherwise.
- Every number shown anywhere states its data source, time period and limitations.
- Agreement between sources is not proof of accuracy; conflicting or
  incomplete data is reported, not hidden.
- No real public warning, notification or dispatch path is created.
- Credentials (Earthdata, Copernicus) live only in the user's local
  environment, never in the repository, logs or chat.

## Effort and cost

| Phase | Effort | Cost |
|---|---|---|
| 0 | 1–2 days | Free |
| 1 | 1–2 weeks | Free (public APIs and free accounts); about 5–20 GB local disk |
| 2 | 2–4 weeks, plus expert review time | Free compute on the laptop |
| 3 | Months | Not estimated |

## Risks

| Risk | Mitigation |
|---|---|
| Too few labelled flood events | Include negative days, report uncertainty, and avoid complex models |
| Coarse grids miss street-level flooding | State the resolution limit; ask for GHMC/TSDPS gauge data |
| Licence or terms change | Licence register re-checked before each phase |
| Results over-interpreted as a forecast | Mandatory limitation text; expert review before any display |
| Leakage from future data into training | Strict time-based split, frozen before results are seen |

## Approval

| Field | Value |
|---|---|
| Phase approved | Phase 0 (licence register) — **complete**. Phase 1 — **bounded pilot approved to start**, conditional (below). Phases 2 and 3 — not approved. |
| Approved by | The assistant (Claude), acting under the owner's written instruction of 2026-11-02, "u take decision behalf of me". **This is a delegated decision, not a human signature.** The owner can revoke it by clearing this table. |
| Date | 2026-11-02 |
| Conditions | Only register rows with a PERMITTED or PERMITTED-WITH-CONDITIONS verdict, and for Phase 1 only row 1 (Open-Meteo). IMD and India-WRIS stay excluded until written terms exist. Hyderabad grid points and Musi basin cells only; rate limits far below the published ones; under 5 GB; raw files outside Git; no database writes; no imports into or from `services/api`. Credentials for Copernicus or Earthdata, if the owner creates accounts, stay in the owner's local environment only. The event catalogue stays "needs second-person review" until a human checks it. No accuracy claim and no display in the app before Phase 2 and an expert review. Register: [`research/real-data/LICENCES.md`](../research/real-data/LICENCES.md). |
