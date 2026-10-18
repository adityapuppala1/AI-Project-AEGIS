# Grounded evidence guide

The Incident Intelligence page accepts a bounded free-form question about the selected synthetic case. The API classifies the question into summary, evidence, unknowns or review-options and assembles an answer only from the validated readiness contract. Unsupported questions abstain.

This first slice is deterministic and local. It does not call a hosted model, accept model configuration from the browser, retrieve arbitrary text, or provide tools. Every factual claim carries the existing evidence/source UUID arrays. Review options are copied from allowlisted playbook steps. The guide preserves unknowns, limitations, context fingerprint and accountable-human-review requirement. It cannot create or mutate a proposal, approve work, acknowledge a task, notify anyone or dispatch responders.

The route rejects cross-origin requests, unexpected fields, oversized questions and malformed/fabricated output. The UI cancels stale requests when cases change, exposes a cancel button and clears prior answers. Usefulness still needs a human scenario evaluation; automated correctness tests do not establish operational value or forecasting accuracy.

Laptop verification entry point: `scripts/verify-grounded-guide.ps1`. It uses the shared single-operation lease, existing local browser installation, production Compose build/start, real synthetic fixture context, general browser smoke and HTTP refusal/checksum checks. It does not activate an identity provider, download a model or reset data.

Final laptop application checkpoint `37caad2df6c1a62b4566173cf82a42d309ad6da7` passed the complete guarded gate (PID 95040, exit 0, 117.80 seconds): TypeScript and production build/start, real browser guide checks at 390px and 1440px, 21 general browser checks with no page errors or sampled accessibility violations, HTTP/refusal/live-warning/checksum checks, exactly one API/web/database and a clean Git tree. Automated correctness does not replace the still-required human usefulness review.
