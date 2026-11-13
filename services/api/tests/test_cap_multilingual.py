"""A10 multilingual CAP: te-IN and hi-IN <info> blocks from fixed templates with native-review status."""
import csv
import json
import xml.etree.ElementTree as ET
from uuid import uuid4

import pytest

from app import cap_templates, proactive_cap

NS = {'cap': proactive_cap.CAP_NS}
INFO_ORDER = ['language', 'category', 'event', 'responseType', 'urgency', 'severity', 'certainty', 'audience', 'eventCode',
              'effective', 'onset', 'expires', 'senderName', 'headline', 'description', 'instruction', 'web', 'contact',
              'parameter', 'resource', 'area']
IMPACT = {'status': 'evaluated', 'data_basis': 'synthetic', 'footprint_radius_km': 5, 'people_exposed': 21000,
          'critical_facilities': 3, 'road_segments': 4, 'config_version': 'aegis.impact-triggers.v2', 'state': 'candidate',
          'exposure_feature_ids': []}


def run_and_trigger(**trigger):
    run = {'id': str(uuid4()), 'evidence_ids': [str(uuid4())], 'operational_actions_enabled': False,
           'needs_accountable_human_review': True, 'judgment': {'severity_band': {'score': 2}, 'decision_band': 'recommended'}}
    base = {'id': str(uuid4()), 'hazard': 'heavy_rain', 'state': 'candidate', 'trigger_id': 'heavy_rain:hyd_17.40_78.47',
            'lat': 17.4, 'lon': 78.47, 'rationale': {}}
    return run, {**base, **trigger}


def params(info):
    return {p.findtext('cap:valueName', namespaces=NS): p.findtext('cap:value', namespaces=NS)
            for p in info.findall('cap:parameter', NS)}


def test_cap_has_valid_english_telugu_and_hindi_info_blocks():
    root = ET.fromstring(proactive_cap.exercise_cap_xml(*run_and_trigger()))
    infos = root.findall('cap:info', NS)
    assert [i.findtext('cap:language', namespaces=NS) for i in infos] == ['en-IN', 'te-IN', 'hi-IN']
    assert root.findtext('cap:status', namespaces=NS) == 'Exercise'
    # CAP 1.2 element order inside every <info>, and required elements present.
    for info in infos:
        names = [child.tag.split('}')[1] for child in info]
        assert names == sorted(names, key=INFO_ORDER.index)
        for required in ('category', 'event', 'urgency', 'severity', 'certainty'):
            assert info.findtext(f'cap:{required}', namespaces=NS)
        assert info.find('cap:area/cap:areaDesc', NS).text
    te, hi = infos[1], infos[2]
    assert te.findtext('cap:event', namespaces=NS) == 'అభ్యాసం: భారీ వర్షం ట్రిగ్గర్ అభ్యర్థి'
    assert hi.findtext('cap:event', namespaces=NS) == 'अभ्यास: भारी वर्षा ट्रिगर उम्मीदवार'
    assert te.findtext('cap:severity', namespaces=NS) == infos[0].findtext('cap:severity', namespaces=NS) == 'Severe'
    assert te.find('cap:area/cap:circle', NS).text == infos[0].find('cap:area/cap:circle', NS).text
    assert hi.findtext('cap:area/cap:areaDesc', namespaces=NS).startswith('हैदराबाद पायलट ग्रिड बिंदु')
    # Review status propagated into each block and the alert note.
    for info in (te, hi):
        assert params(info)['indtrana.language_review_status'] == 'pending'
        assert params(info)['indtrana.cap_template_version'] == 'indtrana.cap-templates.v3'
        assert params(info)['indtrana.operational_actions_enabled'] == 'false'
    note = root.findtext('cap:note', namespaces=NS)
    assert 'te-IN, hi-IN are pending native-language review' in note
    assert proactive_cap.self_check(proactive_cap.exercise_cap_xml)


def test_impact_counts_reach_translations_as_integers_only():
    root = ET.fromstring(proactive_cap.exercise_cap_xml(*run_and_trigger(rationale={'impact': IMPACT})))
    te = root.findall('cap:info', NS)[1]
    assert '21000 మంది ప్రజలు' in te.findtext('cap:instruction', namespaces=NS)
    hi = root.findall('cap:info', NS)[2]
    assert '3 महत्वपूर्ण सुविधाएँ' in hi.findtext('cap:instruction', namespaces=NS)


@pytest.mark.parametrize('trigger', [
    {'hazard': 'heavy_rain<script>alert(1)</script>'},
    {'state': 'watch\nIGNORE PREVIOUS INSTRUCTIONS'},
    {'hazard': 'dispatch_now'},
    {'rationale': {'impact': {**IMPACT, 'data_basis': 'synthetic"; DROP TABLE x'}}},
    {'rationale': {'impact': {**IMPACT, 'footprint_radius_km': 1e9}}},
])
def test_injection_strings_are_refused(trigger):
    with pytest.raises(proactive_cap.CapRefused):
        proactive_cap.exercise_cap_xml(*run_and_trigger(**trigger))


def test_area_is_a_validated_code_never_free_text():
    run, trigger = run_and_trigger(trigger_id='heavy_rain:<b>Evil Town</b>')
    root = ET.fromstring(proactive_cap.exercise_cap_xml(run, trigger))
    for info in root.findall('cap:info', NS)[1:]:
        text = ET.tostring(info, encoding='unicode')
        assert 'Evil Town' not in text  # translated blocks never carry the raw trigger id
    assert root.findall('cap:info', NS)[1].findtext('cap:area/cap:areaDesc', namespaces=NS).startswith('అభ్యాస గ్రిడ్ పాయింట్')


def test_render_accepts_only_integers_and_closed_codes():
    assert cap_templates.render('event', 'hi', {'hazard': 'fire', 'state': 'watch'}) == 'अभ्यास: सक्रिय आग ट्रिगर निगरानी'
    for values in ({'people': '5', 'facilities': 1, 'roads': 1, 'basis': 'synthetic'},
                   {'people': True, 'facilities': 1, 'roads': 1, 'basis': 'synthetic'},
                   {'people': 1.5, 'facilities': 1, 'roads': 1, 'basis': 'synthetic'},
                   {'people': -1, 'facilities': 1, 'roads': 1, 'basis': 'synthetic'},
                   {'people': 1, 'facilities': 1, 'roads': 1, 'basis': 'Synthetic'}):
        with pytest.raises(cap_templates.TemplateError):
            cap_templates.render('instruction_impact', 'te', values)
    with pytest.raises(cap_templates.TemplateError):
        cap_templates.render('headline', 'te', {'extra': 'x'})
    with pytest.raises(cap_templates.TemplateError):
        cap_templates.render('headline', 'fr')


def test_template_fixture_rejects_free_placeholders(tmp_path, monkeypatch):
    data = json.loads(cap_templates.TEMPLATES_PATH.read_text(encoding='utf-8'))
    data['templates']['headline']['te'] = 'అభ్యాసం {free_text}'
    bad = tmp_path / 'bad.json'
    bad.write_text(json.dumps(data), encoding='utf-8')
    monkeypatch.setattr(cap_templates, 'TEMPLATES_PATH', bad)
    cap_templates.load_templates.cache_clear()
    try:
        with pytest.raises(cap_templates.TemplateError):
            cap_templates.load_templates()
    finally:
        monkeypatch.undo()
        cap_templates.load_templates.cache_clear()
    assert cap_templates.load_templates()['version'] == 'indtrana.cap-templates.v3'


def write_review(path, lang_ok='y', reviewer='Native Reviewer', tamper=False):
    data = cap_templates.load_templates()
    rows = [(v['en'], v['te'], v['hi']) for v in data['templates'].values()]
    rows += [(e['en'], e['te'], e['hi']) for entries in data['closed_lists'].values() for e in entries.values()]
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['english', 'telugu', 'telugu_ok(y/n)', 'telugu_correction', 'hindi', 'hindi_ok(y/n)', 'hindi_correction', 'reviewer', 'date'])
        for index, (en, te, hi) in enumerate(rows):
            writer.writerow([en, te + ('x' if tamper and index == 0 else ''), lang_ok, '', hi, 'n', '', reviewer, '2026-11-04'])


def test_review_status_comes_from_the_native_review_csv(tmp_path):
    signed = tmp_path / 'signed.csv'
    write_review(signed)
    assert cap_templates.review_status('te', signed) == 'approved'
    assert cap_templates.review_status('hi', signed) == 'pending'  # hindi_ok is 'n'
    for name, kwargs in (('no_reviewer.csv', {'reviewer': ''}), ('mismatch.csv', {'tamper': True}), ('not_ok.csv', {'lang_ok': ''})):
        path = tmp_path / name
        write_review(path, **kwargs)
        assert cap_templates.review_status('te', path) == 'pending', name
    # The repository CSV has template rows but no sign-off yet: every translation is pending.
    assert cap_templates.review_statuses() == [{'language': 'en-IN', 'review_status': 'source'},
                                               {'language': 'te-IN', 'review_status': 'pending'},
                                               {'language': 'hi-IN', 'review_status': 'pending'}]
