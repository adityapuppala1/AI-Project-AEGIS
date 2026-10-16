# Delivery plan — 30 Nov–1 Dec 2026

| Window | Milestone | Exit check |
|---|---|---|
| 16–20 Oct | Scope, UX and architecture | End-to-end scenario and acceptance criteria signed off |
| 21–27 Oct | API + console foundation | Local demo starts and health checks work |
| 28 Oct–3 Nov | GIS + events + cases | Incident replay drives map and case state |
| 4–10 Nov | Baseline forecasting | Honest holdout metrics, calibration and provenance |
| 11–17 Nov | Maker-checker + agency tasks | Reviewer cannot approve own submission |
| 18–23 Nov | Integrated exercise | Full demo reproducible offline |
| 24–29 Nov | Load/security and demo polish | Runbook, recovery path and judge presentation |

## Definition of done

All demo measurements labeled synthetic if synthetic; API contract tests pass; no operational warning or dispatch endpoints enabled; logs retain actors, rationale, source provenance and model version.

## Actual implementation reconciliation — October 2026

The complete original ten-module delivery is now mapped in
[CIPHERCOP_2026_RELEASE_AUDIT.md](CIPHERCOP_2026_RELEASE_AUDIT.md).
The integrated **synthetic exercise code** is in
`feat/ciphercop-integrated-demo-rc`; status remains draft and unmerged.

Earlier dated milestones describe *planned exit checks*, not acceptance that
can be inferred from Git commits. Foundations, synthetic GIS, versioned
offline model evaluation and a tabletop task/history workflow have code in
feature branches. The integrated Docker/browser E2E, real OIDC checker test,
accessibility, security and judge rehearsal gates are **still pending**.
Only after those gates pass can the synthetic hackathon demo be called done.
Real emergency source and warning capabilities are not part of this release.
