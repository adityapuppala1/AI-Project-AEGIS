# Exercise drills and coach (roadmap A9)

Update 12 November 2026: a drill was run to the coach report in the browser on the Windows laptop with the local
demo accounts (maker acknowledges, takes hand-off and submits; checker approves). See Round 14 in
[LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md). The status paragraph below is the 4 November record.

Status 4 November 2026: **implemented on `feat/agentic-proactive-l3`, pending runtime, browser and IdP
verification** (unit, golden, Node, typecheck pass on the Windows laptop; migration 016 not applied; PostGIS test
not run). Signed-in flows are verified by unit tests only because the local identity provider is off.

- **Scenarios**: `services/api/app/fixtures/exercise_scenarios.v1.json`. Two cite catalogue dates
  (`known_events:2000-08-24`, `known_events:2020-10-13`); one is purely synthetic. Injected values are synthetic
  rehearsal values shaped around the date, not historical measurements.
- **Simulated clock**: a drill starts at T+00:00 and only moves when an operator calls
  `POST /v1/proactive/drills/{id}/clock {expected_minute, minutes 1-240}`; a stale `expected_minute` is 409
  `clock_stale`. Nothing follows wall time; nothing is sent.
- **Injection** uses the existing pure evaluation path (`hazard_watch.evaluate` with the effective thresholds)
  on exercise-labelled rows (`connector_id: exercise_drill`, deterministic uuid5 ids) that live **only inside the
  drill state** in `exercise_drills` (`exercise` CHECK true). No hazard evidence, trigger events, runs,
  proposals, tasks, approvals or CAP are written.
- **Responses** (`/respond`): `acknowledge_watch` (after the first watch), `take_handoff` (after a candidate),
  `submit`, `approve` (a different person with `incident_checker`). Retries never re-stamp; `system:` subjects
  are refused.
- **Coach report** (`/report`): elapsed simulated minutes per step against synthetic SLA v3 targets
  (`proposal_simulation.TASK_SLA_MINUTES`: acknowledge 15 control_room, hand-off 30 infrastructure, submit 45
  communications, approve 15 control_room), fixed coach notes and cited event/injection ids. Rehearsal
  timeliness, not contractual SLAs and not forecasting accuracy.
- **Kill switch**: create, clock and respond return 409 `proactive_paused`; reads and reports stay available.
- Agency-scoped (other agency 404); UI `/drills`; BFF `/api/drills/...`.

Migration steps: see [POST_EVENT_LEARNING.md](POST_EVENT_LEARNING.md#apply-migration-016-owner-laptop).
