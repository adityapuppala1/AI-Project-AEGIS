"""Safety, integration, and API tests for synthetic readiness."""
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import assessment_adapter
from app.assessment import evaluate_readiness
from app.main import app

INCIDENT_ID = "22222222-2222-4222-8222-222222222222"
client = TestClient(app)


def demo_inputs():
    case = {
        "incident": {"id": INCIDENT_ID, "hazard_type": "Synthetic waterlogging"},
        "source": "synthetic_exercise",
        "operational_actions_enabled": False,
        "evidence": [{"id": "b2000000-0000-4000-8000-000000000001",
                      "synthetic": True, "quality_status": "synthetic_curated"}],
        "assessment": {"status": "not_assessed", "calibrated_probability": None},
    }
    geo = {
        "incident_id": INCIDENT_ID,
        "source": "synthetic_exercise",
        "analysis_kind": "geographic_proximity_only",
        "validated_risk_model": False,
        "actual_asset_impact_known": False,
        "operational_actions_enabled": False,
        "radius_m": 3000,
        "as_of": "2026-10-16T17:00:00+00:00",
        "nearby_sources": [
            {"id": "c3000000-0000-4000-8000-000000000001",
             "synthetic": True, "freshness": "fresh", "quality_status": "synthetic_curated",
             "observed_at": "2026-10-16T16:55:00+00:00",
             "ingested_at": "2026-10-16T16:56:00+00:00",
             "expected_interval_seconds": 900, "warning_multiplier": 1.5, "stale_multiplier": 4.0},
            {"id": "c3000000-0000-4000-8000-000000000003",
             "synthetic": True, "freshness": "stale", "quality_status": "synthetic_unverified",
             "observed_at": "2026-10-15T10:00:00+00:00",
             "ingested_at": "2026-10-15T10:02:00+00:00",
             "expected_interval_seconds": 1800, "warning_multiplier": 1.5, "stale_multiplier": 4.0},
        ],
        "nearby_assets": [{"synthetic": True, "impact_status": "not_assessed"}],
    }
    return case, geo


def test_human_checklist_never_claims_real_risk_or_operation():
    case, geo = demo_inputs()
    result = evaluate_readiness(case, geo)
    assert result["context_state"] == "simulated_context_for_human_review"
    assert result["real_world_risk_probability"] is None
    assert result["validated_risk_model"] is False
    assert result["model_eligible_for_real_forecast"] is False
    assert result["operational_actions_enabled"] is False
    assert result["real_world_asset_impact_known"] is False
    assert result["needs_accountable_human_review"] is True
    assert result["source_freshness_counts"]["stale"] == 1
    assert any(r["code"] == "proximity_is_not_impact" for r in result["reasons"])


def test_no_fresh_sources_requires_more_context():
    case, geo = demo_inputs()
    geo["nearby_sources"][0]["freshness"] = "delayed"
    geo["nearby_sources"][0]["observed_at"] = "2026-10-16T16:30:00+00:00"
    geo["nearby_sources"][0]["ingested_at"] = "2026-10-16T16:32:00+00:00"
    result = evaluate_readiness(case, geo)
    assert result["context_state"] == "insufficient_simulated_context"
    assert any(r["code"] == "no_current_simulated_samples" for r in result["reasons"])


def test_no_sources_or_case_evidence_prevents_demo_context():
    case, geo = demo_inputs()
    geo["nearby_sources"] = []
    assert evaluate_readiness(case, geo)["context_state"] == "insufficient_simulated_context"
    case, geo = demo_inputs()
    case["evidence"] = []
    assert evaluate_readiness(case, geo)["context_state"] == "insufficient_simulated_context"


@pytest.mark.parametrize("change", [
    lambda c, g: c.update(source="untrusted"),
    lambda c, g: c.update(operational_actions_enabled=True),
    lambda c, g: g.update(incident_id="33333333-3333-4333-8333-333333333333"),
    lambda c, g: g.update(source="real_data"),
    lambda c, g: g.update(analysis_kind="verified_flood_impact"),
    lambda c, g: g.update(validated_risk_model=True),
    lambda c, g: g.update(actual_asset_impact_known=True),
    lambda c, g: g.update(radius_m=99999),
    lambda c, g: g["nearby_sources"][0].update(synthetic=False),
    lambda c, g: g["nearby_sources"][0].update(freshness="verified"),
    lambda c, g: g["nearby_sources"][0].update(quality_status="real"),
    lambda c, g: g["nearby_assets"][0].update(impact_status="damaged"),
    lambda c, g: c["assessment"].update(calibrated_probability=0.95),
    lambda c, g: c["evidence"][0].update(synthetic=False),
])
def test_unknown_or_unsafe_sources_fail_closed(change):
    case, geo = demo_inputs()
    change(case, geo)
    with pytest.raises(ValueError):
        evaluate_readiness(case, geo)


def test_adapter_reuses_bounded_readers(monkeypatch):
    case, geo = demo_inputs()
    seen = []
    monkeypatch.setattr(assessment_adapter, "incident_workspace", lambda uid: seen.append(uid) or case)
    monkeypatch.setattr(assessment_adapter, "spatial_candidates", lambda uid, radius_m: geo if radius_m == 3000 else None)
    assert assessment_adapter.exercise_readiness(UUID(INCIDENT_ID))["source"] == "synthetic_exercise"
    assert seen == [UUID(INCIDENT_ID)]
    assert assessment_adapter.exercise_readiness(UUID(INCIDENT_ID), 1000) is None


def test_http_readiness_bounds_and_missing(monkeypatch):
    monkeypatch.setattr(assessment_adapter, "exercise_readiness", lambda *_a, **_kw: None)
    assert client.get(f"/v1/exercise/incidents/{INCIDENT_ID}/readiness").status_code == 404
    assert client.get("/v1/exercise/incidents/not-a-uuid/readiness").status_code == 422
    assert client.get(f"/v1/exercise/incidents/{INCIDENT_ID}/readiness?radius_m=6000").status_code == 422


def test_http_read_only_and_review_required(monkeypatch):
    case, geo = demo_inputs()
    monkeypatch.setattr(assessment_adapter, "exercise_readiness",
                        lambda *_a, **_kw: evaluate_readiness(case, geo))
    response = client.get(f"/v1/exercise/incidents/{INCIDENT_ID}/readiness")
    assert response.status_code == 200
    assert response.json()["needs_accountable_human_review"] is True
    assert response.json()["real_world_risk_probability"] is None
    assert client.post(f"/v1/exercise/incidents/{INCIDENT_ID}/readiness", json={}).status_code == 405
    assert client.post("/v1/live/public-warning").status_code == 403


def test_fresh_but_unverified_source_never_qualifies_demo_context():
    case, geo = demo_inputs()
    geo["nearby_sources"][0]["quality_status"] = "synthetic_unverified"
    result = evaluate_readiness(case, geo)
    assert result["context_state"] == "insufficient_simulated_context"
    assert result["curated_current_sources"] == 0
    assert any(reason["code"] == "no_curated_current_demo_source" for reason in result["reasons"])
    assert result["real_world_risk_probability"] is None


def test_only_unverified_case_evidence_never_qualifies_demo_context():
    case, geo = demo_inputs()
    case["evidence"][0]["quality_status"] = "synthetic_unverified"
    result = evaluate_readiness(case, geo)
    assert result["context_state"] == "insufficient_simulated_context"
    assert result["curated_evidence_records"] == 0
    assert any(reason["code"] == "no_curated_case_evidence" for reason in result["reasons"])


def test_curated_evidence_is_still_not_a_validated_risk_forecast():
    case, geo = demo_inputs()
    result = evaluate_readiness(case, geo)
    assert result["curated_current_sources"] == 1
    assert result["curated_evidence_records"] == 1
    assert result["context_state"] == "simulated_context_for_human_review"
    assert result["validated_risk_model"] is False
    assert result["operational_actions_enabled"] is False


def test_unknown_case_evidence_quality_fails_closed():
    case, geo = demo_inputs()
    case["evidence"][0]["quality_status"] = "official_verified"
    with pytest.raises(ValueError, match="Unknown or non-synthetic evidence"):
        evaluate_readiness(case, geo)


@pytest.mark.parametrize("mutation", [
    lambda c,g: g.pop("as_of"),
    lambda c,g: g.update(as_of="not-a-date"),
    lambda c,g: g.update(as_of="2026-10-16T17:00:00"),
    lambda c,g: g["nearby_sources"][0].pop("observed_at"),
    lambda c,g: g["nearby_sources"][0].update(observed_at="invalid"),
    lambda c,g: g["nearby_sources"][0].update(observed_at="2026-10-16T16:55:00"),
    lambda c,g: g["nearby_sources"][0].update(observed_at="2026-10-16T17:30:00+00:00"),
])
def test_fresh_simulated_sources_require_valid_clock_provenance(mutation):
    case, geo = demo_inputs()
    mutation(case, geo)
    with pytest.raises(ValueError):
        evaluate_readiness(case, geo)


def test_utc_timestamp_offsets_are_normalized_for_comparison():
    case, geo = demo_inputs()
    geo["nearby_sources"][0]["observed_at"] = "2026-10-16T22:25:00+05:30"
    assert evaluate_readiness(case, geo)["curated_current_sources"] == 1


@pytest.mark.parametrize("mutation", [
    lambda g: g["nearby_sources"][0].update(freshness="fresh", observed_at="2026-10-15T16:55:00+00:00"),
    lambda g: g["nearby_sources"][0].update(freshness="stale"),
    lambda g: g["nearby_sources"][0].pop("expected_interval_seconds"),
    lambda g: g["nearby_sources"][0].update(warning_multiplier=100),
    lambda g: g["nearby_sources"][0].update(stale_multiplier=float("nan")),
    lambda g: g["nearby_sources"][0].pop("ingested_at"),
    lambda g: g["nearby_sources"][0].update(ingested_at="2026-10-16T16:54:00+00:00"),
    lambda g: g["nearby_sources"][0].update(ingested_at="2026-10-16T17:45:00+00:00"),
])
def test_claimed_source_freshness_must_match_observation_and_thresholds(mutation):
    case, geographic = demo_inputs()
    mutation(geographic)
    with pytest.raises(ValueError):
        evaluate_readiness(case, geographic)


def test_truthful_delayed_reading_is_insufficient_but_not_malformed():
    case, geographic = demo_inputs()
    geographic["nearby_sources"][0]["freshness"] = "delayed"
    geographic["nearby_sources"][0]["observed_at"] = "2026-10-16T16:30:00+00:00"
    geographic["nearby_sources"][0]["ingested_at"] = "2026-10-16T16:32:00+00:00"
    result = evaluate_readiness(case, geographic)
    assert result["context_state"] == "insufficient_simulated_context"
    assert result["curated_current_sources"] == 0
    assert result["source_freshness_counts"]["delayed"] == 1


def test_playbook_is_cited_to_exact_synthetic_case_and_source_ids():
    case, geographic = demo_inputs()
    result = evaluate_readiness(case, geographic)
    playbook = result["playbook"]
    assert playbook["version"] == "AEGIS-URBAN-FLOOD-EXERCISE-v0.1"
    assert playbook["generated_by"] == "deterministic_exercise_checklist_not_ai_forecast"
    assert playbook["operational_actions_enabled"] is False
    assert playbook["synthetic_evidence_ids"] == ["b2000000-0000-4000-8000-000000000001"]
    assert len(playbook["synthetic_source_ids"]) == 2
    assert len(playbook["step_refs"]) == 5


@pytest.mark.parametrize("invalid", [None, "not-a-uuid", ""]) 
def test_missing_or_malformed_source_provenance_id_fails_closed(invalid):
    case, geographic = demo_inputs()
    geographic["nearby_sources"][0]["id"] = invalid
    with pytest.raises(ValueError, match="synthetic source reference"):
        evaluate_readiness(case, geographic)


def test_missing_evidence_reference_id_fails_closed():
    case, geographic = demo_inputs()
    del case["evidence"][0]["id"]
    with pytest.raises(ValueError, match="synthetic evidence reference"):
        evaluate_readiness(case, geographic)
