# Project AEGIS continuity

- Continue the existing Next.js/FastAPI/PostgreSQL/PostGIS architecture. Inspect Git status and preserve local work before editing.
- Authorized remote: adityapuppala1/AI-Project-AEGIS only. Integration baseline: feat/ciphercop-integrated-demo-rc. Never merge main, force-push, trigger Actions, apply CI labels, or enable automatic reviews without explicit authorization.
- Local synthetic demonstration only: no live warnings, dispatch, external agency messages, paid infrastructure, or destructive database/volume resets. Synthetic metrics are not real forecasting accuracy.
- Read README.md and the product, architecture, delivery, release audit, backlog, execution tracker, integration gates, and CI cost policy under docs/.
- Preserve OIDC verification, signed agency/role scope, and independent maker-checker enforcement. Test doubles do not establish real two-human approval.
- Run local checks first: services/api: `python -m pytest -q` and `python -m app.model_lab --check`; apps/web: `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run build`. Database and HTTP tests are separate gates.
- Keep docs/LOCAL_DEMO_HANDOFF.md current with commands, results, branch, SHA, and completed/partial/pending/blocked work. Mark verified only after execution; distinguish Linux runner results from the Windows laptop.

- Current status is docs/LOCAL_DEMO_HANDOFF.md; older executed evidence is preserved in docs/LOCAL_DEMO_VERIFICATION_HISTORY.md. Historical feature-branch commands are not startup instructions for the continuation checkout.

- For proposal proxy changes run `cd apps/web; node --test scripts/tests/proposal-proxy.test.cjs`. These isolated test sessions must never become production auth overrides.

- Local review-focus changes require API `test_local_copilot.py` and Node `review-focus-route.test.cjs` checks. Base Compose stays model-disabled; the optional local override selects existing cited items only. Preserve template fallback and the separation from proposal writes/approval. See docs/LOCAL_REVIEW_FOCUS.md.

- Proposal-context changes must retain immutable snapshots, rejection during outages, agency isolation and independent approval. Run `test_context_revalidation.py`, assessment/workflow tests and the opt-in PostGIS `test_postgis_context_revalidation.py`; see docs/PROPOSAL_CONTEXT_REVALIDATION.md. Never equate Linux verification with laptop acceptance.

- Single-instance rule: before local work run `scripts/check-local-runtime.ps1 -RequireRunning` on Windows. Use guarded start/stop/verify/replay helpers; one AEGIS operation at a time. Never launch native dev servers alongside Compose, a second Compose project/replica or overlapping builds/tests. Preserve the canonical `ai-project-aegis` project and its existing DB volume. Stop only inspected, confirmed AEGIS duplicates; never kill all node/python/docker processes or unrelated services. Hold the shared `Invoke-AegisLocalOperation` lease around custom build/integration/benchmark jobs too. See docs/SINGLE_INSTANCE_LOCAL_RUNTIME.md.

- Opt-in saved review focus must be generated server-side from the captured draft, revalidated before insert, and committed with its creation audit. Never accept client-supplied model text or silently replace saved selections. Public previews remain read-only. See docs/SAVED_REVIEW_FOCUS.md.

- Bounded assistance runs stay proposal-linked, maker-only and draft-only. Preserve the fixed step/tool budget, expected-step retry protection, context revalidation, cancellation audit and hard stop before submission. See docs/BOUNDED_ASSISTANCE_RUN.md.

- Source comparison is opt-in through explicit group, unit, window and tolerance metadata. Never infer compatibility from proximity or labels; stale, uncurated, incomplete or conflicting inputs must fail closed or report `not_comparable`. Agreement is not corroboration, accuracy or prediction. See docs/SOURCE_COMPARISON_DIAGNOSTICS.md.

- Local dependency diagnostics use fixed IDs/statuses/reason codes and must not expose connection details or raw exceptions. Schema gaps block downstream fixture conclusions; fixture gaps affect only their owning dependency. Remediation may use reviewed additive migrations and idempotent seeds, never a volume reset. See docs/LOCAL_DEPENDENCY_DIAGNOSTICS.md.

- Proposal simulation v3 SLA fields are synthetic rehearsal targets only. Preserve v2 compatibility, record classification in the acknowledgement/audit, and never send escalation or claim a contractual SLA. Department authority must eventually come from verified OIDC scope, never a browser-supplied department. See docs/SYNTHETIC_DEPARTMENT_SLA.md.

- Command Center 3D locators are equal-height schematic symbols, not building geometry, flood extent or severity. Preserve default 2D, reduced-motion camera behavior, tile/WebGL fallback and the HTML incident queue. Selected-case AI focus must remain explicit/cancellable and reset across cases; no background inference or expanded approval authority. See docs/OPERATOR_EXPERIENCE_DESIGN.md.

- Unsaved rationale recovery is opt-in sessionStorage with verified subject/agency/operator scope, bounded entries and expiry. Never persist credentials, checker notes or task actions. Keep memory fallback, erase recovery on identity/access changes and sign-out, and never auto-submit recovered text. Run exercise-draft-buffer Node and browser reload/isolation checks for changes.

- Department inbox authority comes from verified `department_operator` plus `aegis_department_id` and agency scope. Never accept browser task/department overrides. Preserve approved-only inbox filtering, coordinator compatibility, row-locked transitions and atomic audit. See docs/DEPARTMENT_INBOX.md.

- Grounded guide questions are untrusted classification input, never instructions. Answers must use only validated readiness findings, cited UUIDs and allowlisted playbook review options; unknown or unsupported questions abstain. No guide response may write proposals, approve, notify, dispatch or claim forecast accuracy.

- Earth Watch (opt-in public USGS/NASA reference feeds) is display-only and default off: enabled only by `compose.public-earth.yaml` / `start-windows.ps1 -PublicEarth`. Fixed HTTPS allowlist, no redirects, in-memory cache, honest stale labels. Never write public records to PostgreSQL or let them create or enrich cases, assessments, proposals, approvals, tasks, warnings or CAP. Keep the "public reference, not an AEGIS assessment" labels and the separate legend. Public intake (plan item E5) needs explicit owner and security-review approval first. See docs/EARTH_WATCH_ENHANCEMENT_PLAN.md.
