# Bounded durable assistance run

An authenticated proposal maker may start an optional three-step run while a
proposal remains a draft. Each step requires a separate operator request and is
stored inside the existing proposal JSON under `assistance_run`:

1. gather the captured evidence references;
2. expose recorded context quality, limitations and unknowns;
3. validate that a response draft and playbook snapshot exist.

The run then stops in `review_ready`. It never submits the proposal, approves
it, acknowledges a department task, sends a message or invokes an operational
endpoint. The existing independent checker remains mandatory.

The server assigns the run ID, version, maker, input fingerprint, fixed
three-step budget and tool allowlist. Advance requests include the expected
step. The proposal row lock serializes concurrent calls; retrying an already
completed expected step is idempotent, while skipped or stale steps fail. Each
committed change has a proposal audit event. Database transactions make a
crash before commit leave no partial step.

Every start and advance revalidates the current bounded context fingerprint.
Changed or unavailable evidence refuses progress. Cancellation remains available
during a context outage or change, requires rationale and is terminal. Only the
signed proposal maker can operate a run, and only while the proposal is a draft.
Starting again creates a new run and preserves earlier audit events.

This is durable workflow orchestration, not a background worker or autonomous
model loop. It resumes through explicit API calls after interruption and has no
long-running process to recover. Its permitted reads are captured proposal
data only. It adds no free-form model facts and does not establish forecasting
accuracy, semantic usefulness or actual human acceptance.

Exact environment-specific validation is recorded in LOCAL_DEMO_HANDOFF.md.
