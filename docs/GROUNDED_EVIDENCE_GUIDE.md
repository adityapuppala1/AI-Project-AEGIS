# Grounded evidence guide

The Incident Intelligence page accepts a bounded free-form question about the selected synthetic case. The API classifies the question into summary, evidence, unknowns or review-options and assembles an answer only from the validated readiness contract. Unsupported questions abstain.

This first slice is deterministic and local. It does not call a hosted model, accept model configuration from the browser, retrieve arbitrary text, or provide tools. Every factual claim carries the existing evidence/source UUID arrays. Review options are copied from allowlisted playbook steps. The guide preserves unknowns, limitations, context fingerprint and accountable-human-review requirement. It cannot create or mutate a proposal, approve work, acknowledge a task, notify anyone or dispatch responders.

The route rejects cross-origin requests, unexpected fields, oversized questions and malformed/fabricated output. The UI cancels stale requests when cases change, exposes a cancel button and clears prior answers. Usefulness still needs a human scenario evaluation; automated correctness tests do not establish operational value or forecasting accuracy.
