# Delivery completion plan and decision log — 2 Nov to 1 Dec 2026

Written 2026-11-02 after the Earth Watch plan (E0–E8) was completed and committed locally
(`9d514c9`, `3063ab6`, `9f176ae`, `0ec123c`). The owner asked the assistant to decide on their behalf
and plan the rest properly. This document records what was decided and why, what was **deliberately not**
decided, who must do what, and a dated schedule to the 30 Nov–1 Dec demonstration.

Delegated decisions are the assistant's judgement under the owner's instruction. They are limited to
reversible, local, free, synthetic-safe actions. Any decision below can be reversed by the owner in one edit.

## 1. Decision log

| # | Decision | Why | Reversal |
|---|---|---|---|
| D1 | **Approve real-data Phase 0** (licence register, documents only) | Free, offline, no data touched, and every later step depends on knowing the terms | Strike the approval row in `REAL_DATA_RESEARCH_PLAN.md`; delete `research/real-data/` |
| D2 | **Approve a bounded Phase 1 pilot, conditional on the register**: Hyderabad grid points and Musi basin cells only, sources whose verdict is PERMITTED or PERMITTED-WITH-CONDITIONS, rate-limited, under 5 GB, raw files outside Git, no database writes, no imports into `services/api` | Smallest step that can produce honest holdout metrics, the one plan milestone still unmet | Delete `research/real-data/raw/` (not tracked) and revert the approval row |
| D3 | **Do not push, open a PR, merge, trigger Actions or apply CI labels** | Repo rule: needs the owner's explicit authorization. A general "decide for me" is not that. Prepared a PR body instead so it is a one-word decision later | n/a (nothing done) |
| D4 | **Public intake stays loopback-only and off by default; never enabled in front of an audience unless asked** | Security review accepted limits that only hold on one laptop | Re-run the review and meet the listed prerequisites first |
| D5 | **Demo-day profile**: default synthetic stack, plus `-PublicEarth` only if the venue network is confirmed good. Rehearse an offline fallback script | Public feeds depend on external networks the judges' venue may block; the product must not depend on them | Flip the flag |
| D6 | **No forecasting accuracy claim, ever, until Phase 2 is expert-reviewed.** Real retrospective results appear only as a separately labelled, read-only "Real historical retrospective" view | Matches AGENTS.md and the research plan | n/a |
| D7 | **Defer multilingual (Telugu/Hindi) and Magic UI polish** to a stretch slot after 23 Nov | Highest visible value now is verified rehearsal and honest data work, not more screens | Move the item up. **Update 2026-11-02: multilingual was brought forward and built (native review pending).** |
| D8 | **Feature freeze 24 Nov.** After that only fixes, acceptance runs and rehearsal | Leaves five days for acceptance, recovery drills and rehearsal | Owner can extend |
| D9 | **Model routing** (below) | Matches the owner's `CLAUDE.md` routing rule | Change the table |

## 2. What the assistant did not and cannot decide

- Pushing, PRs, merges, Actions, labels, review automation (explicit owner authorization required).
- Who the two humans are for the maker/checker rehearsal, and when the screen-reader session happens.
- Owner release review and the final go/no-go.
- Activating the local identity provider and its certificate trust (owner-deferred earlier; stays deferred).
- Domain-expert sign-off of any real-data result.
- Any exposure of public intake or any real feed, warning, dispatch or agency message.

## 3. Work split

**Assistant (can run unattended, in this order)**

| Slot | Work | Output |
|---|---|---|
| 2 Nov | Phase 0 licence register from official terms; mark each source PERMITTED, PERMITTED-WITH-CONDITIONS or EXCLUDE | `research/real-data/LICENCES.md`, approval row filled |
| 2 Nov | PR body and release checklist drafted, not used | `docs/PR_DRAFT_EARTH_WATCH.md` |
| 3–10 Nov | Phase 1 pilot: resumable, checksummed downloaders; event/non-event day catalogue draft (marked "needs second-person review") | `research/real-data/` scripts, manifests, catalogue |
| 11–17 Nov | Phase 2 prototype: rainfall indicators, strict time split, baseline, intervals, written report with every failure shown | evaluation report with commands |
| 18–23 Nov | Expert-review package; optional read-only Model Lab tab for the reviewed report | review pack; UI only after review |
| 24–29 Nov | Freeze; full guarded acceptance run; recovery drill; demo runbook and offline fallback | updated handoff with evidence |

**Owner and team (only people can do these)**

| By | Task |
|---|---|
| 5 Nov | Name the two rehearsal participants and book a 90-minute slot; decide whether to activate the local IdP for it (needed for the independent-approval rehearsal) |
| 8 Nov | Say yes or no to pushing the branch and opening a draft PR; if yes, say whether CI may run |
| 10 Nov | Find one person with hydrology or disaster-management experience to review the Phase 2 report (target review slot 20–23 Nov) |
| 12–16 Nov | Run the two-person rehearsal using `docs/DEMO_REHEARSAL.md`; record it |
| 15–20 Nov | A screen-reader session on the main flows (A1/A2/A5 in the rehearsal record) |
| 26–27 Nov | Release review and go/no-go; confirm the venue network and laptop power plan |

## 4. Calendar (IST)

| Window | Milestone | Exit check |
|---|---|---|
| 2–3 Nov | Plan and decisions recorded; Phase 0 register; PR draft | Register complete, every source has a verdict |
| 4–10 Nov | Phase 1 pilot downloads and catalogue draft | Re-running downloads reproduces identical checksums; at least 30 candidate event and non-event days listed |
| 11–17 Nov | Two-person rehearsal; Phase 2 prototype | Rehearsal recorded; first evaluation numbers with intervals |
| 18–23 Nov | Phase 2 report; expert review; screen-reader session | Report reviewed or clearly marked unreviewed; accessibility findings logged |
| 24–29 Nov | Freeze, acceptance, recovery drill, runbook | All automated gates pass on the laptop; backup restore proven; demo script rehearsed offline and online |
| 30 Nov–1 Dec | Demonstration | Default synthetic stack; optional Earth Watch; no unreviewed real-data claim |

If the human tasks slip, the Phase 2 report is shown as "unreviewed prototype" or omitted. Nothing else blocks the demo.

## 5. Model routing for the remaining work

| Work | Model | Reason |
|---|---|---|
| Real-data scripts, evaluation, any statistics, leakage checks | Opus 5.5 | Accuracy and honesty of results matter most; easy to leak future data |
| Security re-review of anything touching input, auth or the database | Opus 5.5 | Matches the repo rule for security work |
| Threat model for any exposure decision | Fable 5.1 | Highest-cost wrong decision |
| UI, docs, runbooks, rehearsal checklists, polish | Sonnet 5.5 | Low risk, fast iteration |
| Tiny one-file edits | Haiku 5.5 | Mechanical |

## 6. Risks

| Risk | Mitigation |
|---|---|
| Venue network blocks NASA, USGS or map tiles | Default stack is synthetic; offline fallback script; Earth Watch already degrades to labelled stale or unavailable states |
| Real-data results look poor or cannot be reviewed in time | Report failures as prominently as successes; show as unreviewed prototype; never claim accuracy |
| Too few labelled flood events | Include non-event heavy-rain days, report intervals, prefer simple indicators |
| A licence or term forbids a planned use | Exclude that source; the register is the gate |
| People unavailable for the rehearsal or review | Book early (dates above); fall back to the documented "deferred" status |
| OSM standard tiles policy | See the licence register; switch tile source if the policy is not met |
| Scope creep | Feature freeze 24 Nov |

## 7. Findings from the licence register that change the plan (2026-11-02)

Full detail and sources: [`research/real-data/LICENCES.md`](../research/real-data/LICENCES.md). Phase 0 is **done**; the
2 Nov rows in section 3 are complete (the PR draft is [`PR_DRAFT_EARTH_WATCH.md`](PR_DRAFT_EARTH_WATCH.md)).

| Finding | Effect |
|---|---|
| Only Open-Meteo is cleared without the owner creating accounts | Phase 1 pilot uses Open-Meteo archive rainfall and flood-API discharge only. Copernicus and Earthdata wait for the owner's accounts |
| IMD and India-WRIS terms could not be confirmed and secondary evidence says paid or registration-gated | Excluded. Phase 2 therefore has **no official gauge or IMD reference rainfall**; the report must say its inputs are reanalysis or model output, not observations |
| OpenStreetMap policy: "Offline use is not allowed on this service" | Never pre-cache or bundle OSM tiles for the demo. Offline venue means the existing marker and list fallback, or a separate tile-source decision |
| Open-Meteo and Earth Watch sources are non-commercial only | Owner to confirm the project stays non-commercial |
| NASA GIBS acknowledgement wording is fuller than the UI shows | Small UI follow-up: show the full acknowledgement on the Earth Watch source card (scheduled with the next web change) |

Owner actions added: confirm non-commercial status; decide whether to create Copernicus and Earthdata accounts; decide
whether to request written terms from IMD and India-WRIS; decide the offline tile approach.

## 8. Progress log

| Date | Item | State |
|---|---|---|
| 2026-11-02 | Phase 0 licence register | done |
| 2026-11-02 | Phase 1 pilot toolchain (`1bacb98`) | done and tested offline; **real download blocked by an Open-Meteo overload (HTTP 503); retrying patiently** |
| 2026-11-02 | Phase 2 protocol registered before any real data (`ddcb7b6`) | done; 48 offline tests pass |
| 2026-11-02 | Attribution follow-up (GIBS, USGS, EONET wording) | done |
| 2026-11-02 | Demo runbook, demo-readiness preflight, repeatable recovery drill | done; preflight GO with warnings, recovery drill PASSED |
| 2026-11-02 | Second independent security review (Earth Watch adapters) and fixes; telemetry chart-to-table toggle; two pre-existing contrast defects fixed | done; see the handoff |
| 2026-11-02 | Phase 1 downloads: 5 of 14 files (Musi discharge) saved; rainfall archive files still blocked by an upstream 503 | background retry continues |
| 2026-11-02 | Phase 1 downloads completed (14 files); `verify.py` clean; `--refetch 3` checksums differ (likely per-request metadata, unconfirmed); 100 unreviewed candidates generated | done; reproducibility open |
| 2026-11-02 | Telugu/Hindi UI, API non-root image, Core Web Vitals check, remaining UX items closed by decision (`6805d87`) | done; native-language review pending |
| next | Second-person review of candidates, refetch-checksum explanation, human gates | waiting on people |

## 9. Definition of done for the demonstration

- Default stack starts with one guarded command and passes the P0 smoke, browser, axe and PostGIS gates.
- Two-person rehearsal recorded (or honestly marked deferred).
- No forecasting accuracy claim anywhere; every number states its source, period and limits.
- Public intake off; no live warning, dispatch or message path.
- Handoff current with branch, SHAs, commands and results, with Linux and laptop results kept apart.
