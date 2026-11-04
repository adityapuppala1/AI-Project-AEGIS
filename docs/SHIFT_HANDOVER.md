# Shift-handover brief (roadmap A7)

A deterministic, cited, read-only brief of what changed for the operator's verified agency since a
time window began. It's exercise-only: no writes, no persistence, no model text. It's not a forecast,
warning, approval or dispatch.

## Surfaces

- API: `GET /v1/exercise/handover?hours=N`. `N` runs from 1 to 72 and defaults to 12. Roles:
  `incident_operator`, `incident_checker`, `incident_auditor` or `platform_admin`. The agency comes
  only from the verified OIDC token. No agency parameter exists. Code: `services/api/app/handover.py`.
- BFF: `GET /api/handover?hours=N` (`apps/web/lib/assist-proxy.ts`). Signed session, bounded hours,
  server-side bearer and re-validated output (`cleanHandover` in `lib/operator-assist.ts`).
- Page: `/handover` (`components/shift-handover.tsx`). Uses the UI kit, has en/te/hi labels and
  offers Markdown download, JSON download and browser print. Downloads are built in the browser from
  the cleaned response and are never uploaded.

## Sections (each reports `status` = `ok`, `disabled` or `unavailable` with a fixed code)

| Section | Source (read-only) | Copied fields |
|---|---|---|
| `watch` | `proactive_store.list_triggers` | trigger event id, trigger id, hazard, state (`watch`/`candidate`), score, fired_at, evidence ids |
| `runs` | `list_runs(agency)` | run id, status, origin, next step, trigger event id, `awaiting_handoff` (scheduler run stopped before `hand_to_human`) |
| `evidence_changes` | sentinel flags inside runs | run id, flag, at, trigger event id, evidence ids |
| `approvals` | `workflow_store.list_proposals(agency)` | counts per status; ids of `submitted` proposals (the checker queue) |
| `sla` | approved proposals' simulation v3 tasks | proposal id, task id, due_at, `synthetic_target_elapsed_unacknowledged` / `acknowledged_after_synthetic_target` |
| `scheduler` | `get_pause`, `list_ticks(agency)` | paused flag and time, tick id/outcome/counts/allowlisted error codes |
| `failures` | tick errors (`proactive_scheduler.ERROR_CODES`) and connector last-test results | source, ref (tick id or registry connector id), fixed code, at |

The proactive sections report `disabled`/`proactive_disabled` unless `AEGIS_PROACTIVE=1`. A store
failure only marks its own section `unavailable`. It never exposes the exception or connection details.

The brief never contains free text such as pause reasons, cancellation rationales, proposal bodies,
operator subjects or raw tick errors. `lines[]` are fixed templates, and each one carries at least
one cited id. SLA values are synthetic rehearsal targets (`aegis.exercise.department-sla.v1`), not
contractual SLAs.

## Tests

`services/api/tests/test_operator_copilot.py` (handover cases cover scoping, free-text exclusion,
window bounds, the disabled feature and store failure). `apps/web/scripts/tests/operator-assist.test.cjs`
covers the BFF and Markdown.
