const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
  return mod.exports;
}
const lib = load('lib/proactive.ts');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';

test('decision band labels and policy are defined and unknown bands are not trusted', () => {
  assert.equal(lib.decisionBandLabel('recommended'), 'Recommended');
  assert.equal(lib.decisionBandLabel('needs_review'), 'Needs review');
  assert.equal(lib.decisionBandLabel('blocked'), 'Blocked');
  assert.equal(lib.decisionBandLabel('approved'), 'Unknown');
  assert.equal(lib.decisionBandLabel('__proto__'), 'Unknown');
  for (const band of ['recommended', 'needs_review', 'blocked']) assert.ok(lib.BAND_POLICY[band].length > 20 && lib.BAND_STYLE[band]);
});

test('hazard style lookup is safe for prototype keys and unknown hazards', () => {
  assert.equal(lib.hazardStyle('flood').label, 'Flood');
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope', 42, null, undefined]) assert.equal(lib.hazardStyle(key).label, 'Other');
});

test('stale check, cap filename and helpers', () => {
  const now = Date.parse('2026-01-10T00:00:00Z');
  assert.equal(lib.isStale({ stale: true, observed_at: '2026-01-09T23:00:00Z' }, now), true);
  assert.equal(lib.isStale({ stale: false, observed_at: '2026-01-09T23:00:00Z' }, now), false);
  assert.equal(lib.isStale({ stale: false, observed_at: '2026-01-01T00:00:00Z' }, now), true);
  assert.equal(lib.isStale({ observed_at: null }, now), true);
  assert.equal(lib.capFilename(A), 'indtrana-exercise-cap-' + A + '.xml');
  assert.equal(lib.capFilename('../../etc'), 'indtrana-exercise-cap-run.xml');
  assert.equal(lib.previewLines('a\nb\nc', 2), 'a\nb');
  assert.equal(lib.barWidth(2), '100%'); assert.equal(lib.barWidth(-1), '0%');
  assert.equal(lib.safeCategory('__proto__'), 'other'); assert.equal(lib.safeCategory('flood'), 'flood'); assert.equal(lib.safeCategory('a b'), 'other');
});

test('cleanWatch drops malformed, duplicate and out-of-range records and keeps good ones', () => {
  const good = { id: A, connector_id: 'open_meteo', hazard: 'flood', observed_at: '2026-01-01T00:00:00Z', lat: 17.4, lon: 78.4, value: 12.5, unit: 'mm', stale: false };
  const payload = lib.cleanWatch({
    generated_at: 'not a date', config_version: 'v1',
    evidence: [good, good, { ...good, id: 'nope' }, { ...good, id: B, lat: 99 }, { ...good, id: B, lat: 'x' }, null, 'x', { ...good, id: B, hazard: '__proto__', value: Infinity }],
    triggers: [
      { id: A, trigger_id: 'flood_rain', hazard: 'flood', state: 'candidate', fired_at: '2026-01-01T00:00:00Z', lat: 17, lon: 78, score: 4, threshold: { rain_mm: 80 }, evidence_ids: [A, 'bad'], rationale: JSON.parse('{"rain":90,"__proto__":"x","nested":{"a":1}}') },
      { id: B, trigger_id: 't', hazard: 'flood', state: 'severe', lat: 17, lon: 78, score: 0.5 },
    ],
  });
  assert.equal(payload.generated_at, null);
  assert.equal(payload.evidence.length, 2);
  assert.equal(payload.evidence[1].hazard, 'other'); assert.equal(payload.evidence[1].value, null);
  assert.equal(payload.triggers.length, 1);
  assert.equal(payload.triggers[0].score, 1);
  assert.deepEqual(payload.triggers[0].evidence_ids, [A]);
  assert.deepEqual(Object.keys(payload.triggers[0].rationale), ['rain']);
  assert.throws(() => lib.cleanWatch({ evidence: 'x' }));
});

test('cleanConnectors never carries secret values and enforces the connector allowlist', () => {
  const payload = lib.cleanConnectors({ master_key_configured: 1, connectors: [
    { id: 'nasa_firms', name: 'FIRMS', enabled: true, version: 3, settings: { days: 2, area: 'india', extra: { deep: 1 }, list: [1] },
      fields: [{ name: 'map_key', label: 'Map key', secret: true, required: true, set: true, fingerprint: 'ab12cd34', value: 'SUPERSECRET', ciphertext: 'x' }, { name: 'bad', label: 'x', secret: true, set: true, fingerprint: '<script>' }] },
    { id: 'evil_connector', name: 'x' }, { id: '__proto__' }, null,
  ] });
  assert.equal(payload.master_key_configured, false);
  assert.equal(payload.connectors.length, 1);
  assert.deepEqual(payload.connectors[0].settings, { days: 2, area: 'india' });
  assert.equal(payload.connectors[0].fields[0].fingerprint, 'ab12cd34');
  assert.equal(payload.connectors[0].fields[1].fingerprint, null);
  assert.ok(!JSON.stringify(payload).includes('SUPERSECRET'));
});

test('cleanRun validates ids, bands and steps', () => {
  const run = lib.cleanRun({ id: A, status: 'weird', trigger_event_id: B, evidence_ids: [A, 'x'], completed_steps: ['gather_evidence', 'hack'], next_step: 'judge',
    variants: [{ id: 'v1', label: 'Loose', threshold_delta: -0.1, resulting_state: 'watch', score: 0.4 }, { id: 'v2', resulting_state: 'bad' }],
    judgment: { provider: 'other', model: 'jev', decision_band: 'blocked', playbook_option: { choice: 'c', confidence: 0.4, probabilities: { c: 0.4, d: 'x' } }, citation_clean: { probabilities: { yes: 0.95 } } },
    cap: { sha256: 'zz' } });
  assert.equal(run.status, 'running'); assert.deepEqual(run.completed_steps, ['gather_evidence']);
  assert.equal(run.variants.length, 1); assert.equal(run.cap, null);
  assert.equal(run.judgment.provider, 'test_double'); assert.deepEqual(run.judgment.playbook_option.probabilities, { c: 0.4 });
  assert.equal(lib.cleanRun({ id: A, trigger_event_id: B, judgment: { decision_band: 'approved' } }).judgment, null);
  assert.throws(() => lib.cleanRun({ id: 'x', trigger_event_id: B }));
});

test('dayBuckets and cleanHistory', () => {
  const rows = lib.cleanHistory({ days: 7, rows: [{ day: '2026-01-10', hazard: 'flood', state: 'watch', count: 2 }, { day: 'bad', hazard: 'flood', state: 'watch', count: 1 }, { day: '2026-01-10', hazard: 'flood', state: 'x', count: 1 }] });
  assert.equal(rows.rows.length, 1);
  const buckets = lib.dayBuckets(rows.rows, 7, Date.parse('2026-01-10T12:00:00Z'));
  assert.equal(buckets.length, 7); assert.equal(buckets[6].watch, 2);
});

test('A3 impact block is cleaned defensively and labelled synthetic vs licensed', () => {
  const good = { status: 'evaluated', config_version: 'aegis.impact-triggers.v2', state: 'candidate', hazard_state: 'candidate',
    data_basis: 'synthetic', people_exposed: 35000, critical_facilities: 4, road_segments: 1, footprint_radius_km: 5,
    exposure_feature_ids: [A, 'not-a-uuid', B] };
  const clean = lib.cleanImpact(good);
  assert.equal(clean.people_exposed, 35000);
  assert.deepEqual(clean.exposure_feature_ids, [A, B]);
  assert.equal(lib.impactLabel(clean), 'impact-based (synthetic exposure)');
  assert.equal(lib.impactLabel({ ...clean, data_basis: 'licensed' }), 'impact-based (licensed exposure)');
  assert.equal(lib.impactLabel(lib.cleanImpact({ status: 'exposure_layer_empty' })), 'hazard-only (no exposure layer)');
  assert.equal(lib.impactLabel(null), 'hazard-only (no exposure layer)');
  assert.equal(lib.cleanImpact({ status: 'approved' }), null);
  assert.equal(lib.cleanImpact('x'), null);
  const hostile = lib.cleanImpact({ ...good, people_exposed: -1, critical_facilities: 1.5, data_basis: '<b>', config_version: '<script>', footprint_radius_km: 1e9 });
  assert.equal(hostile.people_exposed, null); assert.equal(hostile.critical_facilities, null);
  assert.equal(hostile.data_basis, null); assert.equal(hostile.config_version, 'unknown'); assert.equal(hostile.footprint_radius_km, null);
});

test('watch and run payloads carry the cleaned impact block; new connectors are known', () => {
  const impact = { status: 'evaluated', config_version: 'aegis.impact-triggers.v2', data_basis: 'synthetic', people_exposed: 7, critical_facilities: 0, road_segments: 0, exposure_feature_ids: [A] };
  const watch = lib.cleanWatch({ evidence: [], triggers: [{ id: A, trigger_id: 'heavy_rain:hyd', hazard: 'heavy_rain', state: 'watch', lat: 17.4, lon: 78.47, score: 0.5, evidence_ids: [], rationale: {}, impact }] });
  assert.equal(watch.triggers[0].impact.people_exposed, 7);
  const run = lib.cleanRun({ id: A, trigger_event_id: B, status: 'running', impact });
  assert.equal(run.impact.data_basis, 'synthetic');
  assert.equal(lib.cleanRun({ id: A, trigger_event_id: B }).impact, null);
  assert.ok(lib.isConnectorId('gdacs') && lib.isConnectorId('google_flood_forecasting'));
  assert.equal(lib.hazardStyle('gdacs_alert').label, 'GDACS event');
  assert.equal(lib.hazardStyle('flood_gauge').label, 'Flood gauge forecast');
});
