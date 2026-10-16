"""Enforce explicit opt-in CI budget constraints without new dependencies."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
SCRIPT = ROOT / "scripts" / "verify-code-local.ps1"


def test_pr_check_trigger_is_label_only():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    head = workflow.split("permissions:", 1)[0]
    assert "types: [labeled]" in head
    assert "ready_for_review" not in head.split("on:", 1)[-1].split("workflow_dispatch:", 1)[0]
    assert "\n  push:" not in head
    assert "ci:api" in workflow and "ci:web" in workflow and "ci:all" in workflow


def test_compose_remains_manual_only():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert "github.event_name == 'workflow_dispatch' && inputs.run_compose == true" in workflow
    assert "jobs:" in workflow and "compose-smoke:" in workflow


def test_local_script_defaults_to_light_api_suite():
    script = SCRIPT.read_text(encoding="utf-8")
    assert '[string]$Suite = "api"' in script
    assert 'if ($ProductionBuild)' in script
    assert "python -m pytest -q" in script
    assert "npm run typecheck" in script
    assert "github workflow run" not in script.lower()
    assert "docker compose down -v" not in script.lower()
