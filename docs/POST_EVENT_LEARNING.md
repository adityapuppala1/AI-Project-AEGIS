# Post-event learning (roadmap A8)

Update 12 November 2026: migration 016 is applied and the flow was clicked through in the browser on the Windows
laptop with the local demo accounts (maker replays and proposes, checker approves, administrator is offered Apply).
See Round 14 in [LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md). The status paragraph below is the 4 November record.
Demo accounts are not real two-human approval.

Status 4 November 2026: **implemented on `feat/agentic-proactive-l3`, pending runtime, browser and IdP
verification.** Unit, golden, Node and typecheck gates pass on the Windows laptop. Migration 016 is not yet
applied to the running stack and the opt-in PostGIS test (`services/api/integration_tests/test_postgis_learning_drills.py`)
was not run. The local identity provider is off, so every signed-in flow below is verified by unit tests only.

## What it does

1. **Close an event window.** An `incident_operator` closes a window (`POST /v1/proactive/learning/windows/close`:
   hazard, start, end, observed event days) or replays one (`/windows/replay`): a synthetic scenario from
   `app/fixtures/exercise_scenarios.v1.json`, or catalogue events from `research/real-data/catalogue/known_events.csv`
   against the raw Open-Meteo archive. Catalogue replay is limited to the **training years 2000-2017** so the
   registered final-test years stay unused. Windows are agency-scoped (another agency gets 404) and append-only.
2. **Statistics per trigger rule** (hazard x watch/candidate): hits, misses, false-alarm episodes and lead time
   (a firing up to 3 days before or 1 day after an event day matches it). Detected share and false-alarm share
   carry **Wilson 95% intervals only when n >= 5**; otherwise `ci_reason` is `no_cases` or `n_below_minimum`.
3. **Labels.** `basis` is `synthetic_rehearsal` (operator windows and synthetic replays),
   `known_events_unreviewed` (catalogue rows failing the PHASE2 label rules; all current rows) or
   `registered_protocol_labels` (rows meet the protocol's label rules; still not the registered Phase 2
   analysis). `accuracy_claim` is always false. These numbers are **never forecasting accuracy**.
4. **Proposal.** `POST /proposals {window_id}` derives a versioned config diff from the statistics only: a rule
   with misses lowers its threshold 10%; a rule with more false-alarm episodes than hits raises it 10%;
   otherwise no change. If nothing changes the API abstains (`409 stats_do_not_support_change`). The new
   version id is `<fixture version>-l<sha256 prefix>`.
5. **Maker-checker.** The maker submits. A **different**, non-`system:` `incident_checker` or `platform_admin`
   in the same agency approves or rejects with a 10-2000 character rationale (`governance.review` rules, plus
   SQL CHECKs in 016). Self-approval and system subjects: 409; wrong role: 403; other agency: 404.
6. **Approval never applies.** An approved proposal is only an "approved config candidate"; the engine keeps
   evaluating with the fixture.
7. **Apply** (`POST /proposals/{id}/apply`, `platform_admin` only, rationale required, blocked while the kill
   switch is engaged) writes one append-only `trigger_config_versions` row in one transaction with its audit
   (table-locked against concurrent applies). The proposal's base version must still be the effective version
   (`409 base_version_stale` otherwise). `hazard_watch.effective_config()` overlays the newest applied row on the
   fixture; its version becomes the `config_version` of every new trigger, so the scheduler dedupe key (which
   includes `config_version`) changes. An invalid or unreadable overlay falls back to the fixture
   (`config_source` says which). Rollback = apply a new reviewed proposal; rows are never edited.

Every state change writes a `learning_audit` row (append-only trigger). UI: `/learning` (en/te/hi; translations
AI-written, native review pending). BFF: `/api/learning/...` (Origin-checked writes, allowlisted fields).

## Apply migration 016 (owner, laptop)

Additive and idempotent; no volume reset. Inside the guarded single-instance workflow, with the canonical
`ai-project-aegis` project running:

```powershell
scripts/check-local-runtime.ps1 -RequireRunning
Get-Content db/migrations/016_learning_drills.sql -Raw | docker compose exec -T db psql -U aegis -d aegis -v ON_ERROR_STOP=1
docker compose exec -T api python -m app.migration_audit
```

New volumes get 016 through the initdb mount (`021-learning-drills.sql`) and the `migrate` chain. Rebuild the
API and web images afterwards (guarded helpers) so the new routes exist.

## Not done / owner actions

- Runtime, browser and real two-human (IdP) verification; the opt-in PostGIS test.
- Name threshold reviewers (roadmap owner decision 5). Threshold changes stay rehearsal values.
