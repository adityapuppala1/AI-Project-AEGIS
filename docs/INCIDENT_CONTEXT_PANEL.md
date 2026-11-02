# Incident context and explicit unknowns

This extends the existing incident Human Assessment Readiness panel and its
read-only API. It helps an operator distinguish missing exercise context from
an assessed hazard; it adds no agent privileges, model calls or new services.

## What the panel explains

- Every source freshness state is visible: fresh, delayed, stale, no data and
  clock anomaly, alongside case-evidence and fictional-asset counts.
- `reference_time` is the same timezone-aware instant already used by the
  backend freshness classifier, supplied by geographic context. The actual
  adapter uses server time. It is not an observation timestamp or fixed replay
  clock. Tests may supply a fixed timestamp for deterministic evaluation.
- `reference_clock=source_freshness_evaluation_time` and
  `checklist_version=aegis.exercise.context.v2` identify the calculation basis.
- The separate browser retrieval time says when this browser received the
  checklist. Retrieving it does not make old observations fresh.
- Explicit unknowns state that measurement agreement has not been evaluated,
  real likelihood/depth/impact are unknown, and nearby sources do not establish
  independent corroboration. No conflict-detection algorithm is claimed.
- The next review step requests missing/curated evidence and current readings,
  or directs the operator to review citations and seek independent approval.
  Existing detailed reasons and playbook references remain in the same panel.

A failed refresh clears the prior conclusion, presents an unavailable message
and retains Recheck. Request cancellation prevents a previous radius/case fetch
from replacing the selected context. A successful refresh clears old clipboard
status. Stage-specific [failure guidance](CONTEXT_FAILURE_DIAGNOSTICS.md) now identifies
case loading, geographic loading or validation failures. Generic service errors
remain generic; no database/provider root-cause diagnosis is invented.

## Boundaries and next work

Everything remains synthetic and read-only. Existing fail-closed source,
case, agency, forecast and action restrictions remain. This is a deterministic
context checklist, not a generative copilot or prediction model. Opt-in
source comparison (`services/api/app/source_comparison.py`) and per-dependency
diagnostics (`doctor.py`) have since been implemented; see the handoff and
SOURCE_COMPARISON_DIAGNOSTICS.md. Agreement is not corroboration or accuracy;
absence of an identified conflict does not mean sources agree.

See [current handoff](LOCAL_DEMO_HANDOFF.md) for exact source SHAs, executed
commands and results; [AI assistance roadmap](AI_ASSISTANCE_ROADMAP.md) retains
subsequent copilot, agent, research and human-acceptance work.
