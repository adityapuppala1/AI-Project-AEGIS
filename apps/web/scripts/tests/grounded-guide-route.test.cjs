const { apiAuth, isApiAuth } = require('./api-auth-stub.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const id = '22222222-2222-4222-8222-222222222222';
const origin = 'http://localhost:3000';
const source = fs.readFileSync(path.join(__dirname, '../../app/api/incidents/[id]/grounded-guide/route.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(name => isApiAuth(name) ? apiAuth : name === 'next/server' ? { NextRequest, NextResponse } : require(name), mod, mod.exports);
const fixture = () => ({
  version: 'aegis.exercise.grounded-guide.v1', incident_id: id, source: 'synthetic_exercise',
  answer_kind: 'evidence', status: 'answered', operational_actions_enabled: false,
  needs_accountable_human_review: true, generated_by: 'deterministic_grounded_template_no_model',
  claims: [{ text: 'Synthetic evidence.', evidence_ids: [id], source_ids: [] }],
  review_options: [], unknowns: ['Real risk unknown.'], limitations: [], next_review_step: 'Review.', note: 'Bounded.',
});
async function call(body, requestOrigin = origin) {
  const before = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(fixture()), { status: 200 }); };
  try {
    const request = new NextRequest(`${origin}/api/incidents/${id}/grounded-guide`, {
      method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { response: await mod.exports.POST(request, { params: Promise.resolve({ id }) }), calls };
  } finally { global.fetch = before; }
}

test('forwards only a bounded question and validates citations', async () => {
  const { response, calls } = await call({ question: 'What evidence is current?' });
  assert.equal(response.status, 200); assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { question: 'What evidence is current?' });
});
for (const body of [{}, { question: 'x' }, { question: 'valid question', model: 'remote' }, { question: 7 }]) {
  test('rejects invalid input ' + JSON.stringify(body), async () => {
    const { response, calls } = await call(body);
    assert.equal(response.status, 400); assert.equal(calls.length, 0);
  });
}
test('rejects cross-origin calls before fetch', async () => {
  const { response, calls } = await call({ question: 'What evidence?' }, 'https://other.test');
  assert.equal(response.status, 403); assert.equal(calls.length, 0);
});
test('fails closed on fabricated citation output', async () => {
  const before = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ ...fixture(), claims: [{ text: 'invented', evidence_ids: ['not-an-id'], source_ids: [] }] }));
  try {
    const request = new NextRequest(`${origin}/api/incidents/${id}/grounded-guide`, { method: 'POST', headers: { origin }, body: JSON.stringify({ question: 'What evidence?' }) });
    assert.equal((await mod.exports.POST(request, { params: Promise.resolve({ id }) })).status, 503);
  } finally { global.fetch = before; }
});
