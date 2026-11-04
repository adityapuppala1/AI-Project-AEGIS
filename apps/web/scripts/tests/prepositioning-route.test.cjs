// Isolated BFF tests for the A5 plan and run observability routes.
// Synthetic sessions/fetch exist only in this test loader and are never production auth overrides.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const ORIGIN = 'http://localhost:3000';
const RUN = '77777777-7777-4777-8777-777777777777';
const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';

function compile(file, deps) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { if (name in deps) return deps[name]; throw Error('Unexpected dependency ' + name); }, module, module.exports);
  return module.exports;
}
const lib = compile('lib/proactive.ts', {});
const load = (session, configured = true) => compile('lib/proactive-proxy.ts', {
  'next/server': { NextResponse }, './proactive': lib,
  './auth-server': { configuration: () => configured ? { origin: ORIGIN } : null, readSession: async () => session, sameOrigin: r => r.headers.get('origin') === ORIGIN },
}).proxyProactive;
const operator = { accessToken: 'unit-only-token', roles: ['incident_operator'] };
const req = (method = 'GET') => new Request(ORIGIN + '/x', { method, headers: { origin: ORIGIN } });
async function withFetch(payload, run, status = 200) {
  const original = global.fetch; const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }); };
  try { await run(calls); } finally { global.fetch = original; }
}
const plan = {
  run_id: RUN, plan: {
    version: 'aegis.prepositioning.plan.v1', status: 'planned', reason: null, label: 'anything', synthetic: true, teams_source: 'aegis.synthetic.teams.v1',
    travel_model: { method: 'straight_line_road_factor', road_factor: 1.4, speed_kmh: 25, label: 'estimated, synthetic' },
    search: { method: 'exact', combinations: 625, exact_bound: 4096 },
    options: [{ rank: 1, covered: 2, critical_total: 2, max_minutes: 4.2, total_minutes: 6.1, max_preposition_minutes: 9.3, uncovered_feature_ids: ['bad'],
      assignments: [{ team_id: 'syn-team-rescue-01', team_label: 'Synthetic rescue team 01', capacity: 2, staging_feature_id: F1, staging_kind: 'shelter', preposition_minutes: 9.3,
        covers: [{ feature_id: F1, minutes: 0 }, { feature_id: F2, minutes: 4.2 }], action: 'dispatch_now' },
      { team_id: 'real-unit-7', team_label: 'x', capacity: 1, staging_feature_id: F2, staging_kind: 'shelter', preposition_minutes: 1, covers: [] }] }],
    cited_team_ids: ['syn-team-rescue-01', 'DROP ME'], cited_feature_ids: [F1, F2], critical_feature_ids: [F1, F2], input_sha256: 'a'.repeat(64),
    task_actions: [{ create_task: true }],
  },
};

test('plan route requires sign-in, operator role and GET; rejects bad run ids before any upstream call', async () => {
  await withFetch(plan, async calls => {
    assert.equal((await load(null)(req(), 'run_plan', RUN)).status, 401);
    assert.equal((await load(operator, false)(req(), 'run_plan', RUN)).status, 503);
    assert.equal((await load({ ...operator, roles: ['department_operator'] })(req(), 'run_plan', RUN)).status, 403);
    assert.equal((await load({ ...operator, roles: ['incident_checker'] })(req(), 'run_observability', RUN)).status, 403);
    assert.equal((await load(operator)(req('POST'), 'run_plan', RUN)).status, 405);
    assert.equal((await load(operator)(req(), 'run_plan', '../etc')).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('plan route forwards with a server-side bearer and keeps only cited ids and synthetic minutes', async () => {
  await withFetch(plan, async calls => {
    const response = await load(operator)(req(), 'run_plan', RUN);
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/proactive/runs/' + RUN + '/plan');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    const body = await response.json();
    assert.equal(body.label, 'Recommendation only — no team is moved or notified');
    assert.deepEqual(body.cited_team_ids, ['syn-team-rescue-01']);
    assert.equal(body.options[0].assignments.length, 1);
    assert.deepEqual(body.options[0].uncovered_feature_ids, []);
    assert.equal(JSON.stringify(body).includes('dispatch_now'), false);
    assert.equal(JSON.stringify(body).includes('create_task'), false);
    assert.equal(body.search_method, 'exact');
  });
});

test('plan route relays 404 and 409 as generic codes only', async () => {
  await withFetch({ detail: 'run_not_found' }, async () => {
    const response = await load(operator)(req(), 'run_plan', RUN);
    assert.equal(response.status, 404); assert.equal((await response.json()).code, 'run_not_found');
  }, 404);
  await withFetch({ detail: 'plan_not_ready' }, async () => {
    assert.equal((await load(operator)(req(), 'run_plan', RUN)).status, 409);
  }, 409);
  await withFetch({ plan: { status: 'dispatched' } }, async () => {
    assert.equal((await load(operator)(req(), 'run_plan', RUN)).status, 503);
  });
});

test('observability route reduces actors to system/human and keeps fixed codes', async () => {
  const payload = { status: 'running', origin: 'scheduler', step_budget: 6, budget_used: 2, budget_remaining: 4, total_step_ms: 12,
    nodes: [{ step: 'gather_evidence', status: 'done', actor_kind: 'system', outcome: 'completed', duration_ms: 7, finished_at: '2026-11-04T06:00:00+00:00' },
      { step: 'launch_missiles', status: 'done' }, { step: 'judge', status: 'next', actor_kind: null, outcome: null, duration_ms: null, finished_at: null }],
    events: [{ step: 'gather_evidence', kind: 'step', actor: 'person@example.org', actor_kind: 'system', outcome: '<b>x</b>', duration_ms: 7, budget_used: 1, budget_remaining: 5 }],
    sentinel_flags: { stale: 2, bogus: 9 }, cancellation: null,
    scheduler_ticks: [{ id: RUN, started_at: '2026-11-04T06:00:00+00:00', finished_at: '2026-11-04T06:00:01+00:00', duration_ms: 1250, outcome: 'completed', runs_started: 1, flags_recorded: 0 }] };
  await withFetch(payload, async calls => {
    const response = await load(operator)(req(), 'run_observability', RUN);
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'http://localhost:8000/v1/proactive/runs/' + RUN + '/observability');
    const body = await response.json();
    assert.deepEqual(body.nodes.map(n => n.step), ['gather_evidence', 'judge']);
    assert.equal(JSON.stringify(body).includes('person@example.org'), false);
    assert.equal(body.events[0].outcome.includes('<'), false);
    assert.deepEqual(body.sentinel_flags, { strengthened: 0, weakened: 0, contradicted: 0, stale: 2 });
    assert.equal(body.scheduler_ticks[0].duration_ms, 1250);
    assert.equal(body.budget_remaining, 4);
  });
});

test('run steps include plan_prepositioning before hand_to_human; legacy runs keep five steps', () => {
  assert.deepEqual([...lib.RUN_STEPS].slice(-2), ['plan_prepositioning', 'hand_to_human']);
  const base = { id: RUN, trigger_event_id: F1, status: 'running' };
  assert.equal(lib.cleanRun(base).steps.length, 5);
  assert.equal(lib.cleanRun({ ...base, steps: [...lib.RUN_STEPS] }).steps.length, 6);
  assert.deepEqual(lib.cleanRun({ ...base, completed_steps: [{ step: 'gather_evidence', completed_by: 'x' }, 'judge', { step: 'nope' }] }).completed_steps, ['gather_evidence', 'judge']);
});
