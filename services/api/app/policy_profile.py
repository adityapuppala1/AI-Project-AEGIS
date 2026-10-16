"""Published, immutable PolicyStudio *exercise* policy manifest.

All controls describe the prototype's implemented boundaries. This is not
an authorization policy editor and cannot change backend permissions.
"""
from app.governance import may_execute_live_action

PROFILE_VERSION = "aegis.exercise.policy.v1"


def exercise_policy_profile() -> dict:
    return {
        "policy_version": PROFILE_VERSION,
        "source": "synthetic_exercise",
        "effective_mode": "exercise_observe_and_human_review_only",
        "policy_editor_enabled": False,
        "issuer_configured_in_profile": False,
        "oidc_required_for_proposals": True,
        "independent_checker_required": True,
        "agency_scoped_proposals": True,
        "exercise_fixture_only_proposals": True,
        "public_read_only_exercise_data": True,
        "real_source_integrations_enabled": False,
        "real_world_model_calibrated": False,
        "live_public_warning_enabled": False,
        "live_dispatch_enabled": may_execute_live_action(),
        "executing_suggested_actions_enabled": False,
        "policy_change_requires_redeployment_and_review": True,
        "notes": [
            "This manifest is versioned documentation, not a live admin settings API.",
            "OIDC/MFA configuration and real agency authorization require a separately approved identity provider.",
            "Public demo cases and private approval workflows must remain isolated.",
        ],
    }
