// Isolated BFF tests for the shift-handover brief and read-only operator copilot.
// Synthetic sessions/fetch exist only in this test loader and are never production auth overrides.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const ORIGIN = 'http://localhost:3000';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function compile(file, deps) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { if (name in deps) return deps[name]; throw Error('Unexpected dependency ' + name); }, module, module.exports);
  return module.exports;
}
const lib = compile('lib/operator-assist.ts', {});
const load = (session, configured = true) => compile('lib/assist-proxy.ts', {
  'next/server': { NextResponse }, './operator-assist': lib,
  './auth-server': { configuration: () => configured ? { origin: ORIGIN } : null, readSession: async () => session, sameOrigin: r => r.headers.get('origin') === ORIGIN },
}).proxyAssist;
const operator = { accessToken: 'unit-only-token', roles: ['incident_operator'] };
const req = (method, url, body, origin = ORIGIN) => new Request(ORIGIN + url, { method, headers: { origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
async function withFetch(payload, run, status = 200) {
  const original = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }); };
  try { await run(calls); } finally { global.fetch = original; }
}
const answer = (extra = {}) => ({ version: 'aegis.exercise.operator-copilot.v1', read_only: true, operational_actions_enabled: false, intent: 'find_incidents', status: 'answered',
  reason: null, tools_called: ['list_incidents'], facts: [{ text: 'Exercise incident.', refs: [A] }], cited_ids: [A], summary: 'Exercise incident ' + A, generated_by: 'deterministic_template', model_status: 'disabled', note: 'Read-only', ...extra });

test('copilot requires sign-in, same origin, read role and POST', async () => {
  await withFetch(answer(), async calls => {
    assert.equal((await load(null)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).status, 401);
    assert.equal((await load(operator, false)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).status, 503);
    assert.equal((await load(operator)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }, 'https://evil.example'), 'copilot')).status, 403);
    assert.equal((await load({ ...operator, roles: ['department_operator'] })(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).status, 403);
    assert.equal((await load(operator)(req('GET', '/api/copilot'), 'copilot')).status, 405);
    assert.equal(calls.length, 0);
  });
});

test('copilot rejects extra fields, control characters and bad lengths before any upstream call', async () => {
  const proxy = load(operator);
  await withFetch(answer(), async calls => {
    for (const body of [{ question: 'Which incidents?', tool: 'transition' }, { question: 'ab' }, { question: 'x'.repeat(301) }, { question: 'list\u0000incidents' },
      { question: 'show runs‮' }, { question: 5 }, 'not json', { question: 'Which incidents?', agency_id: B }]) {
      assert.equal((await proxy(req('POST', '/api/copilot', body), 'copilot')).status, 400, JSON.stringify(body));
    }
    assert.equal(calls.length, 0);
  });
});

test('copilot forwards only the question with server-side bearer and returns cited output', async () => {
  await withFetch(answer(), async calls => {
    const response = await load(operator)(req('POST', '/api/copilot', { question: '  Which incidents are open?  ' }), 'copilot');
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/copilot/ask');
    assert.deepEqual(JSON.parse(calls[0].options.body), { question: 'Which incidents are open?' });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    const data = await response.json();
    assert.deepEqual(data.cited, [A]); assert.equal(JSON.stringify(data).includes('unit-only-token'), false);
  });
});

test('copilot drops summaries citing uncited ids and refuses payloads that claim write ability', async () => {
  await withFetch(answer({ summary: 'See ' + B }), async () => {
    const data = await (await load(operator)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).json();
    assert.equal(data.summary, null); assert.equal(data.facts.length, 1);
  });
  await withFetch(answer({ operational_actions_enabled: true }), async () => {
    assert.equal((await load(operator)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).status, 502);
  });
  await withFetch(answer({ facts: [{ text: 'x', refs: [B] }] }), async () => {
    const data = await (await load(operator)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).json();
    assert.equal(data.facts.length, 0);
  });
});

test('upstream errors relay only short codes', async () => {
  await withFetch({ detail: 'question_control_characters' }, async () => {
    const data = await (await load(operator)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).json();
    assert.equal(data.code, 'question_control_characters');
  }, 422);
  await withFetch({ detail: 'psycopg OperationalError at 10.0.0.1:5432' }, async () => {
    const data = await (await load(operator)(req('POST', '/api/copilot', { question: 'Which incidents are open?' }), 'copilot')).json();
    assert.equal(data.code, undefined);
  }, 503);
});

const brief = { version: 'aegis.exercise.shift-handover.v1', read_only: true, operational_actions_enabled: false, generated_at: '2026-11-04T10:00:00+00:00',
  since: '2026-11-03T22:00:00+00:00', hours: 12, watch: { status: 'ok' }, runs: { status: 'ok', runs: [{ run_id: A, status: 'running', next_step: 'hand_to_human', awaiting_handoff: true }] },
  evidence_changes: { status: 'disabled', code: 'proactive_disabled' }, scheduler: { status: 'ok', paused: false }, approvals: { status: 'ok', counts: { submitted: 1 }, pending: [{ proposal_id: A, incident_id: B }] },
  sla: { status: 'ok', tasks: [] }, failures: { status: 'unavailable', code: 'proactive_store_unavailable' },
  lines: [{ section: 'runs', code: 'run_awaiting_handoff', text: 'Draft run awaits review.\u0007', refs: [A] }, { section: 'approvals', code: 'x', text: 'no refs', refs: ['bad id!'] }], note: 'Synthetic.' };

test('handover is GET-only, bounded hours, scoped by bearer and rendered as cited Markdown', async () => {
  const proxy = load(operator);
  await withFetch(brief, async calls => {
    for (const hours of ['0', '73', 'abc', '-1', '1e2']) assert.equal((await proxy(req('GET', '/api/handover?hours=' + hours), 'handover')).status, 400);
    assert.equal((await proxy(req('POST', '/api/handover', {}), 'handover')).status, 405);
    assert.equal(calls.length, 0);
    const response = await proxy(req('GET', '/api/handover?hours=24&agency_id=' + B), 'handover');
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/exercise/handover?hours=24');
    const data = await response.json();
    assert.equal(data.lines.length, 1); assert.equal(data.lines[0].text, 'Draft run awaits review.');
    const md = lib.handoverMarkdown(data);
    assert.match(md, /EXERCISE ONLY/); assert.match(md, new RegExp('`' + A + '`')); assert.match(md, /disabled \(proactive_disabled\)/);
    assert.match(lib.handoverFileName(data.generated_at, 'md'), /^aegis-shift-handover-\d+\.md$/);
  });
  await withFetch({ ...brief, operational_actions_enabled: true }, async () => {
    assert.equal((await proxy(req('GET', '/api/handover'), 'handover')).status, 502);
  });
});
