# Proposal context revalidation

Demo-agency proposals now capture a `context_fingerprint` with their existing
deterministic readiness snapshot. Submission and independent approval compare
it with a fresh checked context. A changed or missing snapshot returns 409:
create a new draft and review the current references. A context-read failure
returns the existing sanitized 503 stage code. Neither failure changes the
proposal, inserts a decision, nor appends a successful transition audit event.
Rejection remains possible when context has changed or cannot be read.

The SHA-256 change detector covers the bounded inputs actually reviewed:
incident metadata, up to 50 evidence records, up to 20 geographic source
candidates and 20 fictional assets, source values/units/timestamps/quality and
freshness configuration/class, radius/center, assessment and checklist/playbook
versions. Candidate/evidence order and retrieval clock changes alone do not
invalidate it. Crossing a freshness window does. It does not claim independent
corroboration, hazard prediction, integrity attestation or a digital signature.

The existing signed agency, role, maker/checker and proposal-row lock checks
remain authoritative. Successful submit/approve audit details record the checked
fingerprint. The captured snapshot and human rationale are never silently
refreshed. Older pending demo proposals without a fingerprint require a new
draft. Approved historical receipts, CAP bytes and task transitions are retained.
Other agencies retain their existing scoped workflow; they never read public
demo context through this guard.

This is optimistic revalidation at the time of the check. Existing context
readers use separate database reads; the check is not an atomic snapshot of
every upstream table and cannot prevent a new observation arriving after it.
Records outside the bounded candidate/evidence windows are not claimed covered.
A global ingestion/version barrier would be a separate design change.

This closes the saved deterministic-context revalidation gap. Local model focus
remains an ephemeral read-only selection preview; it is not captured by this
change and does not become a durable agent, author or approval authority.

Acceptance commands and environment-specific results are in
[the current handoff](LOCAL_DEMO_HANDOFF.md). The PostGIS regression creates a
new labelled synthetic incident and appends evidence in the separate verification
database; it does not alter the main demonstration case or reset any database.
