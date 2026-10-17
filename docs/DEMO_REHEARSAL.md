# Local synthetic demo rehearsal and remaining human acceptance

Use the existing continuation checkout. Keep the IdP **inactive** and Windows
certificate trust unchanged, per the owner's 17 October 2026 decision. The
complete authenticated two-person rehearsal is deferred, not passed. No live
messages, warning issuance, deployment or CI are part of this runbook.

## Five-minute walkthrough with the current locked identity gate

1. Open `http://localhost:3000/demo`. Explain that all incidents, sources and
   model measurements are fictional. The readiness cards report local fixture
   availability, not real emergency readiness. Missing/stale context is valid
   and must remain visible.
2. Inspect `/ingestion` and `/sources`: accepted versus quarantined events,
   observed/ingested timestamps, delayed/stale/missing sources and quality.
   For provenance, open sample case `22222222-2222-4222-8222-222222222222` and
   inspect accepted replay evidence and chronology. Do not reset the database.
3. Inspect the case assessment and URB playbook. Point out that proximity is
   not exposure and the index is not a calibrated forecast. Model Lab reports
   are reproducible synthetic holdout measurements only.
4. Open `/approvals`. Show that unconfigured identity fails closed. Explain
   the implemented captured-draft → independent-checker → scripted receipt
   workflow, citing test evidence, **mention the approved-only local CAP XML draft download (also locked here),
   without presenting it as a completed
   two-human browser demonstration**. Do not fabricate a session or approval.
5. Open `/agency-sync` and `/audit`: these are separate seeded examples.
   Export the public JSON/checksum. Private decisions and proposal receipts
   belong to the signed-agency proposal audit, which remains locked here.

Replaying/refreshing sources is optional and writes synthetic history. If that
is intentionally part of a rehearsal, use the documented confirmed replay or
scenario helper with a recorded run ID; never delete volumes to refresh data.

## Manual accessibility/operator acceptance — not yet executed

Record tester, date, branch/commit, browser and assistive technology, each
pass/failure and reproduction steps. Automated axe is supporting evidence.

- Use keyboard only to reach navigation, global search, incident search,
  filters/sort, case links, guided stages and audit export. Check visible focus,
  logical order, Escape behavior and absence of keyboard traps.
- With Narrator or another screen reader, check page titles/headings, landmarks,
  input labels, announced loading/error/empty states, table headers, filter/sort
  feedback and locked identity guidance. Use text/table alternatives to charts
  and map markers; do not require geographic color alone to understand a case.
- At 200% zoom and a narrow mobile viewport, inspect text and controls for
  clipping or overlap. A registry table may scroll within its own container;
  primary navigation and actions must remain reachable.
- Check light/dark themes and reduced motion. Simulate tile transport failure
  in an isolated test browser; confirm the visible warning, incident-list
  fallback and explicit retry. Never disrupt the laptop network or firewall.
- Have an operator explain evidence quality, stale observations, uncertainty,
  illustrative playbooks, scripted acknowledgements and public versus private
  audit. Any confusion is a usability finding, not a successful acceptance.

## Owner release record — pending

Review [current handoff](LOCAL_DEMO_HANDOFF.md), known deferrals and recorded
checks. Decide whether the locked-identity walkthrough is acceptable for a
presentation. The original full observation-to-independent-human-approval demo
cannot be called accepted while the IdP/two-person rehearsal is deferred.
A release decision does not authorize a main merge, push, CI or deployment.
