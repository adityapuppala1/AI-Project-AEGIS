"""Fast, static contract checks for the consolidated exercise release."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_agency_seed_is_bounded_scripted_and_idempotent():
    schema = (ROOT / "db/migrations/009_exercise_agency_sync.sql").read_text()
    seed = (ROOT / "db/seed_agency_sync.sql").read_text()
    assert "synthetic IS TRUE" in schema
    assert "state IN ('prepared','acknowledged','closed')" in schema
    assert "exercise_agency_task_events" in schema
    assert "ON CONFLICT (id) DO NOTHING" in seed
    assert seed.count("f6000000-0000-4000-8000-00000000000") >= 7
    assert seed.count("f7000000-0000-4000-8000-0000000000") >= 13


def test_compose_starts_new_migration_and_seed_on_both_fresh_and_existing_volumes():
    compose = (ROOT / "compose.yaml").read_text()
    assert "/docker-entrypoint-initdb.d/022-exercise-agency-sync.sql" in compose
    assert "/docker-entrypoint-initdb.d/06-agency-sync-seed.sql" in compose
    assert "-f /agency-sync.sql" in compose
    assert "-f /seed-agency-sync.sql" in compose
    assert "down -v" not in compose


def test_all_original_demo_modules_have_explicit_surface():
    for page in ["demo", "agency-sync", "audit", "incidents",
                 "sources", "ingestion", "model-lab", "approvals",
                 "playbooks", "admin"]:
        assert (ROOT / "apps/web/app" / page / "page.tsx").exists(), page
    assert (ROOT / "apps/web/app/api/agency-tasks/route.ts").exists()
    assert (ROOT / "apps/web/app/api/policy/route.ts").exists()
    assert (ROOT / "apps/web/app/api/incidents/[id]/audit/route.ts").exists()


def test_local_release_keeps_governance_and_read_only_agency_tasks():
    main = (ROOT / "services/api/app/main.py").read_text()
    assert '@app.get("/v1/exercise/agency-tasks")' in main
    assert '@app.get("/v1/exercise/incidents/{incident_id}/audit")' in main
    assert '@app.get("/v1/exercise/policy")' in main
    assert '@app.post("/v1/live/public-warning")' in main
    assert "def deny_live_warning" in main
    workflow = (ROOT / ".github/workflows/ci.yml").read_text()
    assert "types: [labeled]" in workflow
    assert "ready_for_review]" not in workflow
