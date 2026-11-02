# Demonstration runbook — 30 Nov to 1 Dec 2026

Operational checklist for the day. Engineering status is in [LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md); the human
acceptance record is [DEMO_REHEARSAL.md](DEMO_REHEARSAL.md); decisions behind this runbook are in
[DELIVERY_COMPLETION_PLAN.md](DELIVERY_COMPLETION_PLAN.md) (D4, D5, D6).

Rules that never change: this is a synthetic exercise. No live warning, dispatch or agency message exists. Do not
claim forecasting accuracy. Public NASA and USGS data is labelled reference context, not an AEGIS assessment.

## 1. Profiles (decide before leaving the desk)

| Profile | Command | When |
|---|---|---|
| **Default synthetic (recommended)** | `scripts/start-windows.ps1 -NoBuild` | Always safe; needs no internet for the core story |
| + Earth Watch | add `-PublicEarth` | Only if the venue network passed the preflight; otherwise skip |
| + Public intake | add `-PublicIntake` | **Not shown to an audience unless asked** (decision D4); loopback only |

Never run two stacks, native dev servers beside Compose, or overlapping builds (single-instance rule).

## 2. Timeline

**T-3 days (or earlier): freeze check**
1. `powershell -ExecutionPolicy Bypass -File scripts\check-local-runtime.ps1 -RequireRunning`
2. Run the recovery drill: `powershell -ExecutionPolicy Bypass -File scripts\verify-backup-restore.ps1` (expect `RECOVERY DRILL PASSED`).
3. Run the P0 smoke: `powershell -ExecutionPolicy Bypass -File scripts\verify-windows.ps1`.
4. Commit everything; the preflight warns about uncommitted changes. Record branch and SHA in the handoff.
5. Copy the newest `.git/backups/aegis-*.dump` and the repository to a second disk or USB stick.

**T-1 hour: at the venue**
1. Laptop on mains power, sleep and screen-saver off, notifications off, display scaling at 100%.
2. Start the chosen profile (section 1) and wait for the three services.
3. `powershell -ExecutionPolicy Bypass -File scripts\verify-demo-ready.ps1 -Browser`
4. Read the verdict:

| Verdict | Meaning | Action |
|---|---|---|
| `GO` | Everything passed | Proceed |
| `GO (with warnings)` | Read each warning (uncommitted changes, intake on) | Fix or accept knowingly |
| `GO-WITH-DEGRADED-ONLINE` | Core works; some live public services are unreachable | Restart **without** `-PublicEarth`; demo the synthetic story; skip live imagery |
| `NO-GO` | A core check failed | Use section 4 |

5. Open the demo in a fresh browser profile at 100% zoom: `http://localhost:3000/demo`. Keep a second tab on `/`.

## 3. Suggested route (about 12 minutes)

1. `/` Command Center: synthetic banner, incident queue, source freshness. Say "exercise only".
2. `/demo` guided walkthrough: evidence, uncertainty, independent approval.
3. `/incidents/<case>`: cited readiness, spatial candidates, **Download situation brief** (template only).
4. `/approvals` and `/department-tasks`: maker-checker and scripted tasks (anonymous view is locked by design; say so).
5. `/response-teams` and `/audit`: fictional team load and the audit export.
6. Optional, only if the preflight said online: `/earth-watch` and the radar on the case page, described as "public reference context, not evidence".

## 4. If something goes wrong

| Symptom | Do this |
|---|---|
| Map tiles blank | Expected offline. Markers and lists remain; the page shows a warning. **Do not pre-cache OSM tiles** (policy: offline use is not allowed) |
| Earth Watch shows stale or unavailable | That is the designed behaviour; say so and move on |
| Page error or stack not responding | `powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -NoBuild` (guarded; safe to repeat) |
| Data looks wrong or database damaged | Restore the newest backup into a **separate** database and inspect before touching the live one (see `verify-backup-restore.ps1`). Never reset the volume |
| Port 3000 or 8000 busy | `scripts\check-local-runtime.ps1` first; stop only the inspected AEGIS duplicate. Never kill all node, python or docker processes |
| Judges ask for live data or real alerts | "This is a rehearsal environment. It cannot send warnings or dispatch anyone; real feeds and agency integration are a separate, authorised programme." |

## 5. Safe answers

- **Is it accurate?** "The model lab and any retrospective results describe synthetic or reanalysis data. We make no
  forecasting accuracy claim; a real evaluation needs reviewed labels and expert review."
- **Is public data used?** "Only as optional, labelled reference context from NASA and USGS. It is never stored with a case
  and cannot change an assessment or approval."
- **What about public reports?** "A quarantine-only intake was built and security-reviewed for a single laptop. It is off
  for this demo and would need reviewer login, per-client limits and a retention policy before any exposure."
- **Is the approval real?** "The independent-approval logic is enforced and tested; a two-person identity rehearsal is a
  separate human gate." Use the actual rehearsal record status; do not overstate it.

## 6. After the demo

1. Stop with `scripts\stop-windows.ps1` (guarded). Do not remove volumes.
2. Record what happened, any surprises and the preflight verdict in the handoff, with branch and SHA.
3. Keep the last backup file.
