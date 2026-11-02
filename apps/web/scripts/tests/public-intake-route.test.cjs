const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'next/server' ? { NextResponse } : require(name), mod, mod.exports);
  return mod.exports;
}
const route = load('app/api/public-intake/route.ts');
const statusRoute = load('app/api/public-intake/status/route.ts');
const lib = load('lib/public-intake.ts');
const origin = 'http://localhost:3000';
const id = '11111111-1111-4111-8111-111111111111';
const VALID = { title: 'Water rising near the bridge', description: 'Knee-deep water on the road since morning.', hazard_type: 'waterlogging', lat: 17.4, lon: 78.5 };
const ok = (over = {}) => ({ classification: 'public_unverified_intake', status: 'quarantined', id, submitted_at: '2026-11-02T10:00:00+00:00', duplicate: false, ...over });

async function post(body, { requestOrigin = origin, upstream = ok(), status = 201, headers = {}, raw } = {}) {
  const before = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(upstream), { status, headers: { 'content-type': 'application/json', ...headers } }); };
  try {
    const request = new Request(origin + '/api/public-intake', { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) });
    const response = await route.POST(request);
    return { response, body: await response.json(), calls };
  } finally { global.fetch = before; }
}
async function get(upstream, status = 200, handler = route.GET) {
  const before = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(upstream), { status });
  try { const response = await handler(); return { response, body: await response.json() }; } finally { global.fetch = before; }
}

test('POST requires the exact app origin and makes no request otherwise', async () => {
  for (const bad of ['http://evil.example', '', 'http://localhost:3001']) {
    const { response, calls } = await post(VALID, { requestOrigin: bad });
    assert.equal(response.status, 403); assert.equal(calls.length, 0);
  }
});

test('POST forwards only the five report fields', async () => {
  const { response, calls } = await post({ ...VALID, phone: '9876543210', status: 'verified', incident_id: 'x', agency: 'y' });
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)).sort(), ['description', 'hazard_type', 'lat', 'lon', 'title']);
  assert.match(calls[0].url, /\/v1\/public-intake\/reports$/);
});

test('POST rejects oversized and malformed bodies before any upstream call', async () => {
  const big = await post(null, { raw: JSON.stringify({ ...VALID, description: 'x'.repeat(5000) }) });
  assert.equal(big.response.status, 413); assert.equal(big.calls.length, 0);
  for (const raw of ['not json', '[]', '"x"', 'null']) {
    const result = await post(null, { raw }); assert.equal(result.response.status, 422); assert.equal(result.calls.length, 0);
  }
});

test('POST maps upstream failures without leaking details', async () => {
  const disabled = await post(VALID, { status: 503, upstream: { detail: 'secret host db:5432' } });
  assert.equal(disabled.response.status, 503); assert.deepEqual(disabled.body, { error: 'disabled' });
  const broken = await post(VALID, { status: 500, upstream: { detail: 'Traceback password=secret' } });
  assert.equal(broken.response.status, 502); assert.doesNotMatch(JSON.stringify(broken.body), /Traceback|secret/);
  const odd = await post(VALID, { status: 201, upstream: { ...ok(), classification: 'synthetic_exercise' } });
  assert.equal(odd.response.status, 502);
  const badId = await post(VALID, { status: 201, upstream: ok({ id: '../etc/passwd' }) });
  assert.equal(badId.response.status, 502);
});

test('POST passes through only known safe validation and rate-limit messages', async () => {
  const contact = await post(VALID, { status: 422, upstream: { detail: 'Please remove personal contact details and links; reports are reviewed without identifying anyone.' } });
  assert.equal(contact.response.status, 422); assert.match(contact.body.error, /personal contact details/);
  const custom = await post(VALID, { status: 422, upstream: { detail: [{ msg: 'internal pydantic text' }] } });
  assert.equal(custom.body.error, 'Please check the form fields.');
  const limited = await post(VALID, { status: 429, upstream: { detail: 'Too many reports right now. Please wait a moment and try again.' }, headers: { 'retry-after': '60' } });
  assert.equal(limited.response.status, 429); assert.equal(limited.response.headers.get('retry-after'), '60');
  const injected = await post(VALID, { status: 429, upstream: { detail: '<script>alert(1)</script>' }, headers: { 'retry-after': '999999' } });
  assert.equal(injected.body.error, 'Please check the form fields.'); assert.equal(injected.response.headers.get('retry-after'), '60');
});

test('a successful submission returns only safe receipt fields', async () => {
  const { body } = await post(VALID, { upstream: ok({ internal: 'hidden', content_sha256: 'abc' }) });
  assert.deepEqual(Object.keys(body).sort(), ['classification', 'duplicate', 'id', 'message', 'status', 'submitted_at']);
  assert.equal(body.status, 'quarantined');
});

test('queue GET validates classification, rebuilds rows and drops unsafe entries', async () => {
  const row = (over = {}) => ({ id, submitted_at: '2026-11-02T10:00:00+00:00', title: 'T', description: 'D', hazard_type: 'flood', lat: 17.4, lon: 78.5, status: 'quarantined', secret: 'x', ...over });
  const { body } = await get({ classification: 'public_unverified_intake', creates_cases: false, total: 3,
    reports: [row(), row({ id: 'not-a-uuid' }), row({ hazard_type: 'ufo' }), row({ lat: 'x' }), 'junk', null] });
  assert.equal(body.reports.length, 1); assert.equal(body.total, 3); assert.equal('secret' in body.reports[0], false);
  assert.equal((await get({ classification: 'synthetic_exercise', creates_cases: false, reports: [] })).response.status, 502);
  assert.equal((await get({ classification: 'public_unverified_intake', creates_cases: true, reports: [] })).response.status, 502);
  assert.deepEqual((await get({}, 503)).body, { error: 'disabled' });
});

test('status route exposes only safe flags and refuses unexpected classification', async () => {
  const good = { classification: 'public_unverified_intake', enabled: true, quarantine_only: true, creates_cases: false, notifies_responders: false, notice: 'x', hidden: 1 };
  const { body } = await get(good, 200, statusRoute.GET);
  assert.deepEqual(body, { classification: 'public_unverified_intake', enabled: true, quarantine_only: true, creates_cases: false, notifies_responders: false });
  assert.equal((await get({ ...good, creates_cases: true }, 200, statusRoute.GET)).response.status, 502);
});

test('a duplicate receipt is generic and reveals no id or time', async () => {
  const { response, body } = await post(VALID, { upstream: { classification: 'public_unverified_intake', status: 'quarantined', duplicate: true, id, submitted_at: '2026-11-01T00:00:00+00:00' } });
  assert.equal(response.status, 201); assert.equal(body.duplicate, true);
  assert.equal('id' in body, false); assert.equal('submitted_at' in body, false);
});

test('a chunked body without content-length is cut off at the limit', async () => {
  const before = global.fetch; let called = false;
  global.fetch = async () => { called = true; return new Response('{}', { status: 201 }); };
  try {
    const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode('x'.repeat(1024))); controller.close(); } });
    const request = new Request(origin + '/api/public-intake', { method: 'POST', headers: { origin }, body: stream, duplex: 'half' });
    const response = await route.POST(request);
    assert.equal(response.status, 413); assert.equal(called, false);
  } finally { global.fetch = before; }
});

test('a non-numeric content-length is refused', async () => {
  const request = { headers: new Headers({ origin, 'content-length': 'abc' }), body: null, text: async () => '{}' };
  assert.equal((await route.POST(request)).status, 400);
});

test('client validation catches normalised and obfuscated contact details and keeps normal reports', () => {
  const draft = (description) => ({ title: 'Water on the road', description, hazard_type: 'flood', lat: '17.4', lon: '78.5' });
  for (const text of ['call 98765, 43210 now', 'call 98765/43210 now', 'call 9876​543210 now', 'mail user＠gmail．com now',
    'mail user [at] gmail [dot] com now', 'join t.me/groupname now', 'open bit.ly/abc123 now', 'open example。com now', 'call nine eight seven six five four three two one now']) {
    assert.ok(lib.validateDraft(draft(text + ' water is rising')).description, text);
  }
  for (const text of ['Water is knee deep near the market since morning', 'About 3 feet of water, around 40 people waiting', 'Two cars are stuck under the flyover']) {
    assert.deepEqual(lib.validateDraft(draft(text)), {}, text);
  }
});

test('client validation mirrors the server contact-detail rules', () => {
  const draft = (over = {}) => ({ title: 'Water rising here', description: 'Water is knee deep on the road.', hazard_type: 'flood', lat: '17.4', lon: '78.5', ...over });
  assert.deepEqual(lib.validateDraft(draft()), {});
  for (const text of ['Call 98765 43210 now', 'mail me a@b.com please', 'see https://x.org/p', 'photos www.site.in now', 'reach +91 (98765) 43210 ok', 'user @ host . com soon']) {
    assert.ok(lib.validateDraft(draft({ description: text + ' water is rising' })).description, text);
  }
  assert.ok(lib.validateDraft(draft({ lat: '51' })).lat); assert.ok(lib.validateDraft(draft({ lon: '' })).lon);
  assert.ok(lib.validateDraft(draft({ hazard_type: '' })).hazard_type); assert.ok(lib.validateDraft(draft({ title: 'ab' })).title);
  assert.ok(lib.validateDraft(draft({ lat: 'NaN' })).lat);
});
