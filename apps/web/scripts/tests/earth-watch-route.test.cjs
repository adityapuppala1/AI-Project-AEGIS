const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

function load(file, requireMap = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => requireMap[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
const route = load('app/api/earth-watch/[feed]/route.ts', { 'next/server': { NextResponse } });
const lib = load('lib/earth-watch.ts');

const quakeFeed = (records, extra = {}) => ({
  classification: 'public_reference', feed: 'earthquakes', fetched_at: '2026-11-02T00:00:00+00:00', stale: false,
  warning: null, attribution: 'USGS', cache_seconds: 300, limitations: ['x'], records, ...extra,
});
const rec = (over = {}) => ({ id: 'usgs-1', source: 'USGS', category: 'earthquakes', kind: 'Earthquake', title: 'M4 test',
  observed_at: '2026-11-01T00:00:00+00:00', updated_at: null, lat: 17.4, lon: 78.5, magnitude: 4, status: 'reviewed',
  url: 'https://example.test/x', ...over });

async function call(feed, upstream, status = 200) {
  const before = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(upstream), { status }); };
  try {
    const response = await route.GET(new Request('http://localhost:3000/api/earth-watch/' + feed), { params: Promise.resolve({ feed }) });
    return { response, body: await response.json(), calls };
  } finally { global.fetch = before; }
}

test('unknown feeds are rejected without any upstream request', async () => {
  for (const feed of ['internal', 'https%3A%2F%2Fexample.com', '..']) {
    const { response, calls } = await call(feed, {});
    assert.equal(response.status, 404); assert.equal(calls.length, 0);
  }
});

test('forwards only to the fixed public-reference API path', async () => {
  const { calls } = await call('earthquakes', quakeFeed([rec()]));
  assert.match(calls[0].url, /\/v1\/public-reference\/earth-watch\/earthquakes$/);
});

test('drops invalid records and non-HTTPS links', async () => {
  const { body } = await call('earthquakes', quakeFeed([
    rec(), rec({ id: 'bad-lat', lat: 120 }), rec({ id: 'bad-lon', lon: 'x' }), rec({ id: 'http', url: 'http://insecure.test' }), 'junk', null,
  ]));
  assert.deepEqual(body.records.map(r => r.id), ['usgs-1', 'http']);
  assert.equal(body.records[1].url, null);
});

test('rejects wrong classification, feed mismatch and missing freshness', async () => {
  for (const upstream of [quakeFeed([], { classification: 'synthetic_exercise' }), quakeFeed([], { feed: 'events' }),
    quakeFeed([], { fetched_at: 'not a date' }), quakeFeed([], { stale: 'no' }), { classification: 'public_reference' }]) {
    const { response } = await call('earthquakes', upstream);
    assert.equal(response.status, 502);
  }
});

test('maps API disabled state and failures without leaking details', async () => {
  const disabled = await call('events', { detail: 'secret internal text' }, 503);
  assert.equal(disabled.response.status, 503); assert.deepEqual(disabled.body, { error: 'disabled' });
  const failed = await call('events', { detail: 'stack trace' }, 502);
  assert.equal(failed.response.status, 502); assert.doesNotMatch(JSON.stringify(failed.body), /stack|secret/);
});

test('status exposes only the safe flags', async () => {
  const { body } = await call('status', { classification: 'public_reference', enabled: true, display_only: true,
    writes_to_database: false, feeds: ['x'], notice: 'n', internal: 'hidden' });
  assert.deepEqual(body, { classification: 'public_reference', enabled: true, display_only: true, writes_to_database: false });
  const bad = await call('status', { classification: 'public_reference', enabled: true, display_only: true, writes_to_database: true });
  assert.equal(bad.response.status, 502);
});

test('imagery layers are validated', async () => {
  const layer = { id: 'MODIS_Terra', title: 'T', latest: '2026-11-01', start: '2000-02-24', ranges: ['2000-02-24/2026-11-01/P1D'], matrix: 'GoogleMapsCompatible_Level9' };
  const imagery = (layers) => ({ ...quakeFeed([]), feed: 'imagery', records: undefined, layers });
  const ok = await call('imagery', imagery([layer]));
  assert.equal(ok.response.status, 200); assert.equal(ok.body.layers[0].matrix, 'GoogleMapsCompatible_Level9');
  for (const layers of [[], [{ ...layer, latest: 'yesterday' }], [{ ...layer, ranges: [] }], 'x']) {
    assert.equal((await call('imagery', imagery(layers))).response.status, 502);
  }
});

test('date availability follows published GIBS ranges', () => {
  const ranges = ['2000-02-24/2026-11-01/P1D'];
  assert.equal(lib.dateAvailable('2026-11-01', ranges), true);
  assert.equal(lib.dateAvailable('2026-11-02', ranges), false);
  assert.equal(lib.dateAvailable('1999-01-01', ranges), false);
  assert.equal(lib.dateAvailable('not-a-date', ranges), false);
});

test('tile URLs are only built for safe layer, matrix and date values', () => {
  assert.match(lib.gibsTileUrl('MODIS_Terra_CorrectedReflectance_TrueColor', '2026-11-01', 'GoogleMapsCompatible_Level9'),
    /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/MODIS_Terra_CorrectedReflectance_TrueColor\/default\/2026-11-01\/GoogleMapsCompatible_Level9\/\{z\}\/\{y\}\/\{x\}\.jpeg$/);
  for (const args of [['../x', '2026-11-01', 'm'], ['a', '2026-11-01/../', 'm'], ['a', '2026-11-01', 'm/../x'], ['a b', '2026-11-01', 'm']]) {
    assert.equal(lib.gibsTileUrl(...args), null);
  }
});

test('India region is a bounding box and global includes everything', () => {
  assert.equal(lib.inRegion({ lat: 17.4, lon: 78.5 }, 'india'), true);
  assert.equal(lib.inRegion({ lat: 40, lon: 78.5 }, 'india'), false);
  assert.equal(lib.inRegion({ lat: 40, lon: -120 }, 'global'), true);
});

test('signal summary only counts the India region and picks the strongest quake', () => {
  const quake = (id, lat, lon, magnitude) => rec({ id, lat, lon, magnitude, title: 'M' + magnitude });
  const summary = lib.summarizeSignals(
    [quake('a', 17, 78, 4.1), quake('b', 25, 90, 5.4), quake('far', 40, -120, 7.9)],
    [rec({ id: 'e1', category: 'floods', lat: 26, lon: 91, magnitude: null }), rec({ id: 'e2', lat: 60, lon: 10, magnitude: null })]);
  assert.equal(summary.quakeCount, 2); assert.equal(summary.eventCount, 1); assert.equal(summary.strongest.id, 'b');
  assert.deepEqual(lib.summarizeSignals([], []), { quakeCount: 0, eventCount: 0, strongest: null });
});

test('great-circle distance and bearing match known references', () => {
  const hyderabad = { lat: 17.385, lon: 78.4867 }, delhi = { lat: 28.6139, lon: 77.209 };
  const km = lib.haversineKm(hyderabad, delhi);
  assert.ok(km > 1250 && km < 1280, 'Hyderabad–Delhi is about 1,260 km, got ' + km);
  assert.equal(Math.round(lib.haversineKm(hyderabad, hyderabad)), 0);
  const bearing = lib.bearingDeg(hyderabad, delhi);
  assert.ok(bearing > 350 || bearing < 5, 'Delhi is almost due north of Hyderabad, got ' + bearing);
  assert.equal(lib.compassLabel(0), 'N'); assert.equal(lib.compassLabel(90), 'E');
  assert.equal(lib.compassLabel(359), 'N'); assert.equal(lib.compassLabel(225), 'SW');
});

test('nearby signals are filtered by radius, nearest first, and reject bad input', () => {
  const origin = { lat: 17.385, lon: 78.4867 };
  const records = [rec({ id: 'far', lat: 28.6, lon: 77.2 }), rec({ id: 'near', lat: 17.5, lon: 78.5 }), rec({ id: 'mid', lat: 18.5, lon: 79 })];
  assert.deepEqual(lib.nearbySignals(records, origin, 300).map(s => s.record.id), ['near', 'mid']);
  assert.deepEqual(lib.nearbySignals(records, origin, 100).map(s => s.record.id), ['near']);
  assert.deepEqual(lib.nearbySignals(records, origin, 2000).map(s => s.record.id), ['near', 'mid', 'far']);
  assert.deepEqual(lib.nearbySignals(records, { lat: NaN, lon: 1 }, 300), []);
  assert.deepEqual(lib.nearbySignals(records, origin, 0), []);
});

test('team summary groups scripted tasks per agency without inventing capacity data', () => {
  const teamLib = load('lib/team-availability.ts');
  const task = (agency, state, over = {}) => ({ id: agency + state + Math.random(), agency_label: agency, state,
    due_at: '2026-11-03T06:00:00+00:00', demo_due_window_elapsed: false, ...over });
  const teams = teamLib.summarizeTeams([
    task('Hyderabad Traffic Police', 'prepared'), task('Hyderabad Traffic Police', 'acknowledged'),
    task('Hyderabad Traffic Police', 'prepared', { demo_due_window_elapsed: true, due_at: '2026-11-02T06:00:00+00:00' }),
    task('GHMC Drainage', 'closed'), task('Fire & Rescue', 'prepared')]);
  assert.deepEqual(teams.map(t => t.label), ['Hyderabad Traffic Police', 'Fire & Rescue', 'GHMC Drainage']);
  const police = teams[0];
  assert.equal(police.open, 3); assert.equal(police.status, 'at_capacity'); assert.equal(police.load, 1);
  assert.equal(police.overdue, 1); assert.equal(police.nextDueAt, '2026-11-02T06:00:00+00:00'); assert.equal(police.kind, 'police');
  assert.equal(teams[1].status, 'engaged'); assert.equal(teams[1].kind, 'rescue');
  assert.equal(teams[2].status, 'available'); assert.equal(teams[2].open, 0); assert.equal(teams[2].nextDueAt, null);
  assert.deepEqual(['Fictional transport desk', 'Fictional public guidance desk', 'Fictional infrastructure desk', 'Fictional drainage liaison', 'Fictional exercise verifier']
    .map(teamLib.teamKind), ['transport', 'comms', 'municipal', 'municipal', 'general']);
  assert.deepEqual(teamLib.summarizeTeams([]), []);
  assert.equal(teamLib.summarizeTeams([task('X', 'prepared')], 0)[0].load, 1);
});

test('situation brief is template-only, escaped, cited and excludes public data', () => {
  const brief = load('lib/situation-brief.ts');
  const id = '22222222-2222-4222-8222-222222222222';
  const workspace = {
    incident: { id, hazard_type: 'Urban | waterlogging', status: 'review', lat: 17.407, lon: 78.448, created_at: '2026-11-01T10:00:00Z' },
    evidence: [{ id, source_label: 'Gauge\nA | B', source_kind: 'exercise_sensor', observed_at: '2026-11-01T10:05:00Z', quality_status: 'synthetic_curated' }],
    timeline: [{ occurred_at: '2026-11-01T10:10:00Z', event_type: 'observation', summary: 'Water rising\u0000 near the junction' }],
  };
  const readiness = { context_state: 'simulated_context_for_human_review', unknowns: ['Real risk unknown'], next_review_step: 'Review.',
    source_freshness_counts: { fresh: 2 }, review_brief: { findings: [{ text: 'Finding one', evidence_ids: [id, 'not-a-uuid'], source_ids: [] }],
      review_options: [{ playbook_step: 'URB-01', text: 'Check drains' }], limitations: ['Synthetic only'] } };
  const text = brief.buildSituationBrief(workspace, readiness, new Date('2026-11-02T00:00:00Z'));
  assert.match(text, /EXERCISE ONLY/); assert.match(text, /no AI model wrote any text/);
  assert.match(text, /Urban \\\| waterlogging/); assert.doesNotMatch(text, /\u0000/);
  assert.match(text, new RegExp('Evidence: `' + id + '`')); assert.doesNotMatch(text, /not-a-uuid/);
  assert.match(text, /Public NASA\/USGS reference data .*\*\*not\*\* included/);
  assert.doesNotMatch(text, /Gauge\nA/);
  const partial = brief.buildSituationBrief(workspace, null, new Date('2026-11-02T00:00:00Z'));
  assert.match(partial, /could not be loaded/); assert.doesNotMatch(partial, /Cited findings/);
  assert.equal(brief.briefFileName(id), 'aegis-situation-brief-22222222.md');
  assert.equal(brief.briefFileName('../../x'), 'aegis-situation-brief-case.md');
});

test('feed freshness is based on fetch time and stale flag', () => {
  const feed = { fetched_at: '2026-11-02T00:00:00+00:00', stale: false, cache_seconds: 300 };
  const t = Date.parse(feed.fetched_at);
  assert.equal(lib.feedFreshness(feed, t + 60_000), 'fresh');
  assert.equal(lib.feedFreshness(feed, t + 600_000), 'aging');
  assert.equal(lib.feedFreshness({ ...feed, stale: true }, t), 'stale');
  assert.equal(lib.countdownLabel(65_000), '1:05');
});
