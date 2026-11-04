# Pre-positioning planner (roadmap A5) and run observability

Status 4 November 2026: implemented on `feat/agentic-proactive-l3`. Unit, Node and typecheck gates pass.
Runtime and browser verification are still pending. No migration. No new Python or Node dependency (no OR-Tools).

**Recommendation only: no team is moved or notified.** The plan lives only in the run state and in its
audit row. It never creates department tasks, assignments, messages or notifications. Any later task
still goes through the existing approved-only proposal flow and the independent checker.

## Where it sits in a run

`gather_evidence -> simulate_variants -> judge -> draft_cap -> plan_prepositioning -> hand_to_human`

- New runs (state `aegis.proactive.run.v2`) have the six steps above. They record `steps` and
  `step_budget = 6`, so the budget grows by one.
- Runs created before this change (v1, no `steps` list) keep their five steps and can still be handed off.
- Any other step list fails closed (`run_state_invalid`).
- Expected-step retry protection is unchanged. Repeating `plan_prepositioning` is a no-op with no second
  audit row. `hand_to_human` cannot skip the plan step (409 `step_stale_or_out_of_order`).
- The scheduler (`system:scheduler`) may run `plan_prepositioning` because the step does not submit
  anything. It still stops with `next_step = hand_to_human`, and only a signed-in person takes the hand-off.

## Inputs

- **Exposure:** the cited `exposure_feature_ids` in the run's impact block (A3, migration 015). Only cited
  hospital, school and shelter features are used. `proactive_store.exposure_points` returns one
  representative point per feature (`ST_PointOnSurface`). It is a read-only query.
- **Teams:** `services/api/app/fixtures/synthetic_teams.v1.json`. These are invented, clearly synthetic
  teams. Each has an id (`syn-team-*`), label, kind, capabilities, capacity (the number of critical
  facilities it can cover), a fictional base point and a daily UTC availability window.
  - The web exercise board (`apps/web/lib/team-availability.ts`) is client-side and derived from
    scripted tasks. It has no locations, so the API needs this fixture. The fixture keeps the same
    label/kind/capacity idea.
- **Hazard to capability:** the fixture's `hazard_capabilities` map, for example
  `heavy_rain -> flood_rescue, evacuation, medical`.
- **Time:** the trigger's `fired_at` is used for availability, never the wall clock. This keeps the plan reproducible.

## Algorithm (deterministic)

1. **Critical facilities:** the cited hospitals, schools and shelters, sorted by id (at most 20).
2. **Staging points:** the same features, ordered shelter, then school, then hospital, then id (at most 10).
3. **Eligible teams:** a team is eligible if it has a matching capability, capacity of at least 1, and
   is inside its availability window at `fired_at`. Teams are sorted by id (at most 6).
4. **Travel time (estimated, synthetic):** haversine km × `road_factor` (1.4) ÷ `speed_kmh` (25) × 60,
   rounded to 0.1 min. There is no road network.
5. **Placement:** each eligible team is placed on one staging point. Within a placement, each facility
   is assigned to at most one team, and a team covers at most `capacity` facilities. This uses
   capacitated bipartite matching with augmenting paths, in stable order. A binary search over
   travel-time thresholds finds the smallest maximum time that still achieves the maximum coverage.
6. **Objective (lexicographic):** placements are compared on these keys, in order:
   1. most critical facilities covered;
   2. smallest maximum staging-to-facility time;
   3. smallest total time of the deterministic matching;
   4. smallest maximum base-to-staging time;
   5. staging ids, as a stable tie-break.
7. **Search:**
   - **Exact:** if `staging ** teams <= 4096` (`EXACT_BOUND`), every placement is enumerated and the
     best three are kept.
   - **Greedy fallback:** otherwise teams are placed one at a time, in order of capacity (highest
     first) then id. Each team takes the staging point that gives the best partial objective. Up to
     two alternatives come from re-running the greedy with one team's first choice banned.
8. **Output:**
   - 2–3 ranked options. Each option lists its team-to-staging assignments, the facilities each team
     covers with minutes, any uncovered ids, the cited team ids and cited feature ids.
   - The search method and number of combinations, and an `input_sha256` of the inputs.
   - `team_moved`, `notification_sent` and `tasks_created`, which are always `false`.

The planner uses no clock, no random numbers and no model, so the same inputs give an identical plan.
Rounding the travel times can create ties; the stable ids decide them.

**Abstention.** In these cases the plan has `status: abstained`, no options, and one of these fixed reasons:

| Reason | When |
|---|---|
| `run_blocked` | The judgment's decision band is `blocked`. |
| `no_exposure` | There is no evaluated impact block, or no cited ids. |
| `no_critical_facilities` | No cited hospital, school or shelter. |
| `no_staging_points` | No cited feature can serve as a staging point. |
| `no_available_teams` | No eligible team at `fired_at`. |
| `exposure_unavailable` | The exposure read failed. |
| `teams_unavailable` | The team fixture could not be read. |

## Routes

| Route | Notes |
|---|---|
| `GET /v1/proactive/runs/{id}/plan` | `incident_operator` only, scoped to the verified agency. Returns 404 `run_not_found` across agencies and 409 `plan_not_ready` before the step has run. |
| `GET /v1/proactive/runs/{id}/observability` | Same scope and role. See below. |
| BFF `/api/proactive/runs/{id}/plan` and `/api/proactive/runs/{id}/observability` | Routes `run_plan` and `run_observability` in `lib/proactive-proxy.ts`. See below. |

The BFF routes are GET only and accept only a UUID run id. Their cleaners (`cleanPlan`,
`cleanObservability` in `lib/proactive.ts`) keep only `syn-team-*` ids, UUID feature ids, numbers and
fixed codes. Actor subjects are reduced to `system`/`human`.

**UI.** The run panel (`components/proactive-plan.tsx`) shows:

- a plan panel labelled "Recommendation only — no team is moved or notified", with each option as a
  table and the travel model shown as estimated and synthetic;
- a compact step graph with a table toggle. The graph has no animation, so it is static under reduced motion.

Strings are in en/te/hi (`lib/translations-extra/plan.ts`; AI-written, native review pending).

## Run observability

Run observability is derived from the existing run state and `proactive_run_audit`. There is no new store and no migration.

- **Per audit event** (start, each step, sentinel flag, cancel):
  - step, start time, finish time, actor kind and a fixed outcome code;
  - outcome codes include `drafted`, `skipped_blocked`, `planned`, `abstained`, `handed_to_human`, `flag_stale` and `cancelled`;
  - budget used and remaining;
  - `duration_ms`: step compute time, from `started_at`/`duration_ms`, which `proactive_run.advance` now
    records on each completed step;
  - `wait_ms`: time since the previous event.
  - Runs created before this change report only `wait_ms`.
- **Per node:** status (done, next, pending or blocked), outcome and duration.
- **Run summary:** sentinel flag counts, and the cancellation actor kind and reason (at most 300 characters).
- **Scheduler ticks:** the agency's last 10 ticks, each with `duration_ms`, outcome and runs started.
  `GET /v1/proactive/scheduler` also now returns `duration_ms` per tick.

Timings are local wall-clock measurements, not a performance claim.

## Tests

- `services/api/tests/test_prepositioning.py`:
  - planner determinism and input-order independence;
  - capacity limits and a capacity shortfall;
  - the exact bound and greedy fallback;
  - a zero-bottleneck optimum;
  - each abstention reason;
  - availability windows that wrap midnight;
  - the travel-time formula;
  - an AST scan and a runtime spy (only `exposure_points` is called; department/workflow functions are rigged to fail);
  - route, retry protection and hand-off;
  - cross-agency 404 and role 403;
  - legacy five-step runs;
  - an unknown step list failing closed;
  - the scheduler stopping at `hand_to_human` after planning;
  - observability correctness.
- Golden cases (`test_proactive_agent_golden.py`) now also pin the plan abstention for each bounded-run case.
- Node: `apps/web/scripts/tests/prepositioning-route.test.cjs`.
