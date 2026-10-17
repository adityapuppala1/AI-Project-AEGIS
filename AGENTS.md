# Project AEGIS continuity

- Continue the existing Next.js/FastAPI/PostgreSQL/PostGIS architecture. Inspect Git status and preserve local work before editing.
- Authorized remote: adityapuppala1/AI-Project-AEGIS only. Integration baseline: feat/ciphercop-integrated-demo-rc. Never merge main, force-push, trigger Actions, apply CI labels, or enable automatic reviews without explicit authorization.
- Local synthetic demonstration only: no live warnings, dispatch, external agency messages, paid infrastructure, or destructive database/volume resets. Synthetic metrics are not real forecasting accuracy.
- Read README.md and the product, architecture, delivery, release audit, backlog, execution tracker, integration gates, and CI cost policy under docs/.
- Preserve OIDC verification, signed agency/role scope, and independent maker-checker enforcement. Test doubles do not establish real two-human approval.
- Run local checks first: services/api: `python -m pytest -q` and `python -m app.model_lab --check`; apps/web: `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run build`. Database and HTTP tests are separate gates.
- Keep docs/LOCAL_DEMO_HANDOFF.md current with commands, results, branch, SHA, and completed/partial/pending/blocked work. Mark verified only after execution; distinguish Linux runner results from the Windows laptop.

- Current status is docs/LOCAL_DEMO_HANDOFF.md; older executed evidence is preserved in docs/LOCAL_DEMO_VERIFICATION_HISTORY.md. Historical feature-branch commands are not startup instructions for the continuation checkout.
