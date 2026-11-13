"""Everything that leaves IndTrana names IndTrana (docs/BRANDING.md): CAP template version 2, staff email text and the
User-Agent sent to outside services. Earlier CAP template text stays loadable for drafts made before the rename."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from app import cap_templates, connectors, earth_watch, proactive_cap, staff_messages
from tests.test_cap_multilingual import NS, params, run_and_trigger

ROOT = Path(__file__).resolve().parents[3]


def test_new_cap_drafts_use_template_version_3_and_carry_indtrana():
    xml = proactive_cap.exercise_cap_xml(*run_and_trigger()).decode()
    # Keys and version id carry the product name too; only stored config-id values keep the old prefix.
    assert "AEGIS" not in xml and "<valueName>aegis." not in xml
    root = ET.fromstring(xml)
    assert root.findtext("cap:identifier", namespaces=NS).startswith("indtrana-proactive-exercise-")
    assert root.findtext("cap:sender", namespaces=NS) == "proactive-exercise@indtrana.invalid"
    assert root.findtext("cap:code", namespaces=NS) == "INDTRANA-EXERCISE-NOT-FOR-TRANSMISSION"
    infos = root.findall("cap:info", NS)
    assert [i.findtext("cap:senderName", namespaces=NS) for i in infos] == [
        "IndTrana proactive exercise desk", "IndTrana ముందస్తు అభ్యాస డెస్క్", "IndTrana सक्रिय अभ्यास डेस्क"]
    for info in infos[1:]:
        assert params(info)["indtrana.cap_template_version"] == "indtrana.cap-templates.v3"
        assert params(info)["indtrana.language_review_status"] == "pending"
        assert params(info)["indtrana.run_id"]


def test_translated_blocks_stay_pending_until_native_sign_off():
    assert cap_templates.review_status("te") == "pending"
    assert cap_templates.review_status("hi") == "pending"
    rows = (ROOT / "docs/NATIVE_LANGUAGE_REVIEW.csv").read_text(encoding="utf-8").splitlines()
    row = next(line for line in rows if line.startswith("IndTrana proactive exercise desk,"))
    assert row == "IndTrana proactive exercise desk,IndTrana ముందస్తు అభ్యాస డెస్క్,,,IndTrana सक्रिय अभ्यास डेस्क,,,,"


def test_version_1_templates_still_load_for_earlier_drafts():
    v1 = cap_templates.load_template_version("aegis.cap-templates.v1")
    v2 = cap_templates.load_template_version("aegis.cap-templates.v2")
    assert v1["templates"]["sender_name"]["en"] == "AEGIS proactive exercise desk"
    assert v2["templates"]["sender_name"]["en"] == "IndTrana proactive exercise desk"
    # Only the product name differs between the two versions.
    for key, variants in v1["templates"].items():
        for lang, text in variants.items():
            assert v2["templates"][key][lang] == text.replace("AEGIS ", "IndTrana ", 1)
    assert v1["closed_lists"] == v2["closed_lists"] and v1["placeholders"] == v2["placeholders"]
    v3 = cap_templates.load_template_version("indtrana.cap-templates.v3")
    assert v3["templates"] == v2["templates"] and v3["closed_lists"] == v2["closed_lists"]
    assert cap_templates.load_templates()["version"] == cap_templates.CURRENT_VERSION == "indtrana.cap-templates.v3"


def test_unknown_template_version_is_refused():
    import pytest
    with pytest.raises(cap_templates.TemplateError):
        cap_templates.load_template_version("aegis.cap-templates.v9")


def test_staff_email_templates_name_indtrana_only():
    assert staff_messages.SENDER_NAME == "IndTrana"
    for template_id in staff_messages.TEMPLATES:
        subject, body = staff_messages.render(template_id, {})
        assert "IndTrana" in subject + body and "AEGIS" not in subject + body and "Aegis" not in subject + body


def test_outbound_user_agents_name_indtrana():
    assert connectors.USER_AGENT.startswith("IndTrana-Proactive/")
    source = Path(earth_watch.__file__).read_text(encoding="utf-8")
    assert '"User-Agent": "IndTrana-EarthWatch/1.0"' in source and "AEGIS-EarthWatch" not in source
    web = ROOT / "apps/web/app/api/alert-journey"
    for route in ("tle/route.ts", "relay/route.ts"):
        text = (web / route).read_text(encoding="utf-8")
        assert "IndTrana-exercise-prototype/0.2" in text and "AEGIS-exercise-prototype" not in text


def test_local_provider_display_names_match_the_update_script():
    realm = json.loads((ROOT / "ops/local-idp/realm.json").read_text(encoding="utf-8"))
    assert realm["realm"] == "indtrana-exercise"  # technical id unchanged
    assert realm["displayName"] == "IndTrana LOCAL SYNTHETIC EXERCISE" and realm["displayNameHtml"] == "IndTrana"
    web = next(c for c in realm["clients"] if c["clientId"] == "indtrana-local-web")
    assert web["name"] == "IndTrana"
    script = (ROOT / "scripts/update-local-idp.ps1").read_text(encoding="utf-8")
    assert "$IdpDisplayName = 'IndTrana LOCAL SYNTHETIC EXERCISE'" in script
    assert "$IdpDisplayNameHtml = 'IndTrana'" in script and "$IdpClientName = 'IndTrana'" in script


def test_every_template_version_passes_the_same_markup_and_placeholder_checks(tmp_path, monkeypatch):
    import pytest
    bad = json.loads(cap_templates.TEMPLATE_FILES["aegis.cap-templates.v1"].read_text(encoding="utf-8"))
    bad["templates"]["headline"]["en"] = "<b>EXERCISE</b>"
    path = tmp_path / "cap_templates.v1.json"
    path.write_text(json.dumps(bad), encoding="utf-8")
    monkeypatch.setitem(cap_templates.TEMPLATE_FILES, "aegis.cap-templates.v1", path)
    with pytest.raises(cap_templates.TemplateError):
        cap_templates.load_template_version("aegis.cap-templates.v1")
