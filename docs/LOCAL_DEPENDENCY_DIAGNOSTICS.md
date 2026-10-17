# Local Dependency Diagnostics

`GET /v1/exercise/system/readiness` exposes a bounded diagnostic contract for
the synthetic local stack. Version `aegis.exercise.dependencies.v1` reports:

- local exercise database query access;
- schema and additive migration completeness;
- incident, timeline and evidence fixtures;
- source registry and observation fixtures;
- fictional spatial fixtures; and
- scripted AgencySync task and event fixtures.

Each dependency has a fixed identifier, status, reason code and safe next step.
Statuses are `ready`, `not_ready`, `blocked` or `unavailable`. A schema failure
blocks fixture conclusions. A fixture gap marks only its owning dependency.
Database connection failures return a structured 503 without a hostname,
connection string, credentials or exception text.

The `/demo` page renders the same contract. The guidance uses only the reviewed
additive migration and idempotent synthetic seed paths and explicitly prohibits
volume resets. These checks do not test real sensors, external providers, OIDC
accounts, agency communications, forecast validity or public-safety readiness.
