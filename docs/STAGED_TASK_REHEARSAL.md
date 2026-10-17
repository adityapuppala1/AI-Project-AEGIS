# Staged scripted department tasks

This extends the existing approved-proposal workflow. It records an operator's
**simulation**, not a real department acknowledgement, message or dispatch.
The owner chose to keep the IdP inactive; signed-in human UI acceptance remains
deferred. No auth bypass, new role, database migration or transport is added.

## Workbench sequence after verified independent approval

1. On an approved, evidence-linked proposal, select **Prepare scripted department
   tasks**. Three fictional desk tasks start in `prepared` state.
2. Expand **Scripted task progress**. Enter a task rationale (10–2000 characters)
   and record its scripted acknowledgement. That task becomes `acknowledged`.
3. Enter the closure rationale and close the acknowledged task. Other tasks
   retain their own state. The timeline displays timestamps, signed operator
   subject and rationale. Labels identify each department for assistive tools.
4. Inspect the private proposal audit. Preparation, acknowledgement and closure
   are persisted with the actor and signed agency; no public fixture is changed.

The existing `POST /v1/exercise/proposals/{id}/transition` and same-origin BFF
accept `prepare_tasks`, `acknowledge_task`, and `close_task`. Only acknowledgement
and closure take `task_id` (`control_room`, `infrastructure`, `communications`).
The server derives actor and agency from verified claims; client identity,
unknown fields, unknown tasks and coerced array identifiers are rejected.
Checker-only/auditor-only sessions cannot write task progress.

## Persistence, retries and compatibility

- Every write requires an approved proposal in the signed agency and a synthetic
  fixture case. Closure before acknowledgement fails; no history is changed.
- Task JSON and its audit event commit together under the existing proposal row
  lock. Concurrent retries produce one event. Retrying after later closure does
  not revert state, replace the first actor/rationale, or add an audit duplicate.
- New staged receipts are `aegis.proposal.simulation.v2`.
- Existing `v1` one-shot receipts remain closed and unchanged. The legacy
  `simulate` API still works for old clients/new legacy rehearsals. Neither it
  nor `prepare_tasks` can overwrite an existing receipt or skip staged progress.
- Legacy receipts cannot be reopened through task operations; create a new
  independently approved proposal for a new rehearsal. No volume reset needed.
- CAP draft bytes remain stable as tasks advance. Public AgencySync/Audit360
  continue to show separate seeded examples; private progress is in `/approvals`.

This does not implement agency-owned sessions, task SLAs/escalation, inbound
responder messages, resource allocation or real execution. Those remain future
roadmap items with their own authority and operational acceptance requirements.

## Executed verification

On the Windows laptop, native helper passed 254 API tests (six DB skips), model
reproduction and TypeScript checks. Nine isolated Node proxy tests passed.
All six real PostGIS tests passed in the designated test DB, including the
signed TEST-key approval/task/CAP chain, wrong agency/role denials, duplicate
requests, illegal order, legacy preservation and concurrent acknowledgement.
The production API/web build, sampled browser/axe and HTTP checks passed.
Subsequent strict-type proxy and accessible-control-label follow-ups have their
actual results and SHAs recorded in the current handoff. No actual signed-in
human rehearsal is inferred from test sessions or static labels.
