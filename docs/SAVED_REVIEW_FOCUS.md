# Saved synthetic review focus

An operator can opt in when creating a draft in the existing approval workbench.
The API accepts only a strict boolean `include_review_focus`; it never accepts
caller-generated findings or model settings. Default creation is unchanged.
The named synthetic demo agency is the only supported context source.

The server selects from the captured checklist through the existing bounded
local selector. It saves the checked finding, citations, playbook option,
limitations, model/status/fallback reason and context fingerprint in proposal
JSON. The creation audit records selection provenance under the signed maker.
The queue and private audit retain this result for independent checker review.
No migration or new service is needed. Public incident previews remain read-only.

After selection, the server rechecks the context fingerprint before inserting
the draft and creation audit in one transaction. Changed inputs or unavailable
context refuse the save. Submit/approve retain their existing revalidation;
self-approval remains prohibited. Saved results are never regenerated on read.
Other agencies cannot use the public demo context for this feature.

Model-disabled/unavailable/busy/invalid responses retain labelled template
fallbacks. The existing model I/O timeout is 20 seconds; opted-in BFF creation
allows 30 seconds. These are not hard inference-compute deadlines. If a request
loses its response, refresh the queue before retrying: creation has no client
idempotency key and a disconnected request may still commit. This is a captured
selection, not a durable cancellable agent runner or free-form generated advice.
No claims of model usefulness or forecast accuracy follow from persistence tests.

Validation status and exact commands are in LOCAL_DEMO_HANDOFF.md. Human IdP
activation/two-person browser acceptance remain deferred by owner decision.
