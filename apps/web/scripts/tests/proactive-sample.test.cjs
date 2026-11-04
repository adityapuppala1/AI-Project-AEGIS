const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(spec => deps[spec] ?? require(spec), mod, mod.exports);
  return mod.exports;
}
const lib = load('lib/proactive.ts');
const sample = load('lib/proactive-sample.ts', { './proactive': lib });
const NOW = Date.parse('2026-06-01T06:00:00Z');

test('sample watch passes the lib cleaner unchanged and covers every requested hazard and state', () => {
  const raw = sample.buildSampleWatch(NOW);
  const clean = lib.cleanWatch(JSON.parse(JSON.stringify(raw)));
  assert.equal(clean.triggers.length, raw.triggers.length);
  assert.equal(clean.evidence.length, raw.evidence.length);
  assert.ok(clean.triggers.length >= 10);
  assert.deepEqual([...new Set(clean.triggers.map(item => item.hazard))].sort(), ['fire', 'flood', 'heat', 'heavy_rain', 'landslide', 'wind']);
  assert.deepEqual([...new Set(clean.triggers.map(item => item.state))].sort(), ['candidate', 'clear', 'watch']);
  const evidenceIds = new Set(clean.evidence.map(item => item.id));
  for (const trigger of clean.triggers) {
    assert.notEqual(lib.hazardStyle(trigger.hazard).label, 'Other', trigger.hazard);
    assert.ok(lib.thresholdMarks(trigger.threshold), 'gauge marks for ' + trigger.trigger_id);
    for (const id of trigger.evidence_ids) assert.ok(evidenceIds.has(id));
  }
});

test('sample history, connectors and audit pass their cleaners', () => {
  assert.equal(lib.cleanHistory(sample.buildSampleHistory(NOW)).rows.length, sample.buildSampleHistory(NOW).rows.length);
  const connectors = lib.cleanConnectors(JSON.parse(JSON.stringify(sample.buildSampleConnectors(NOW))));
  assert.deepEqual(connectors.connectors.map(c => c.id), [...lib.CONNECTOR_IDS]);
  const statuses = new Set(connectors.connectors.map(lib.connectorStatus));
  for (const status of ['not_configured', 'untested', 'passed', 'failed', 'disabled', 'blocked_terms']) assert.ok(statuses.has(status), status);
  assert.equal(connectors.connectors.filter(lib.isReady).length, 2);
  assert.equal(lib.cleanAudit(sample.buildSampleAudit(NOW)).length, sample.buildSampleAudit(NOW).length);
});

test('sample run walks the six steps and ends needs_review from the test double with a CAP', () => {
  const trigger = '11111111-1111-4111-8111-111111111111';
  assert.equal(sample.sampleRunAt(0, trigger).next_step, 'gather_evidence');
  assert.equal(sample.sampleRunAt(1, trigger).judgment, null);
  const final = lib.cleanRun(JSON.parse(JSON.stringify(sample.sampleRunAt(6, trigger))));
  assert.equal(final.status, 'review_ready');
  assert.equal(final.next_step, null);
  assert.equal(final.completed_steps.length, 6);
  assert.equal(final.judgment.provider, 'test_double');
  assert.equal(final.judgment.decision_band, 'needs_review');
  assert.ok(Object.keys(final.judgment.playbook_option.probabilities).length >= 3);
  assert.ok(final.variants.length >= 3);
  assert.ok(final.cap && sample.SAMPLE_CAP_TEXT.includes('<status>Exercise</status>'));
});

test('the fixture never carries a real-looking source URL and is labelled as sample', () => {
  const everything = JSON.stringify([sample.buildSampleWatch(NOW), sample.buildSampleHistory(NOW), sample.buildSampleConnectors(NOW), sample.buildSampleAudit(NOW), sample.sampleRunAt(5, 'x'), sample.SAMPLE_CAP_TEXT]);
  // Connector host names are allowlist labels, not links; only explicit URLs are checked here.
  for (const match of everything.matchAll(/https?:\/\/[^\s"'\\<]+/gi)) assert.match(new URL(match[0]).hostname, /\.invalid$|^example\./, match[0]);
  assert.match(sample.SAMPLE_CAP_TEXT, /SAMPLE DATA/);
  for (const row of lib.cleanWatch(sample.buildSampleWatch(NOW)).evidence) assert.match(row.id, /^e0000000-0000-4000-8000-/);
});

test('threshold marks and age helpers are defensive', () => {
  assert.deepEqual(lib.thresholdMarks({ watch: 1, candidate: 2, unit: 'mm' }), { watch: 1, candidate: 2, unit: 'mm' });
  for (const bad of [null, 5, 'x', [1, 2], { watch: 1 }, { watch: 'a', candidate: 2 }]) assert.equal(lib.thresholdMarks(bad), null);
  assert.deepEqual(lib.ageParts(new Date(NOW - 5 * 60_000).toISOString(), NOW), { n: 5, unit: 'min' });
  assert.deepEqual(lib.ageParts(new Date(NOW - 5 * 3_600_000).toISOString(), NOW), { n: 5, unit: 'hr' });
  assert.deepEqual(lib.ageParts(new Date(NOW - 4 * 86_400_000).toISOString(), NOW), { n: 4, unit: 'days' });
  assert.equal(lib.ageParts(new Date(NOW).toISOString(), NOW).unit, 'now');
  assert.equal(lib.ageParts(null, NOW), null);
  assert.equal(lib.ageParts('nope', NOW), null);
});
