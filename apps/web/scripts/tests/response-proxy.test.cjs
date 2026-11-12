// Isolated response-loop proxy tests. Synthetic sessions/fetch exist only in this loader; production auth-server
// and deployed routes are never replaced. Also keeps lib/response-teams.ts equal to the API team fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { NextResponse } = require('next/server');

const root = path.join(__dirname, '../..');
const id = '77777777-7777-4777-8777-777777777777';
const NOTE = 'SIMULATION: rehearsal note for the team';
const transpile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function run(code, deps) { const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(deps, mod, mod.exports); return mod.exports; }
const teams = run(transpile('lib/response-teams.ts'), () => { throw Error('no deps'); });

const DESK = { accessToken: 'unit-only-token', roles: ['department_operator'], departmentId: 'infrastructure' };
const TEAM = { accessToken: 'unit-only-token', roles: ['response_team'], teamId: 'syn-team-rescue-01' };
const READER = { accessToken: 'unit-only-token', roles: ['incident_auditor'] };

function loadModule(session, { configured = true, origin = true } = {}) {
  return run(transpile('lib/response-proxy.ts'), name => {
    if (name === 'next/server') return { NextResponse };
    if (name === './response-teams') return teams;
    if (name === './auth-server') return {
      configuration: () => configured ? { origin: 'http://localhost:3000' } : null,
      readSession: async () => session, sameOrigin: () => origin,
    };
    throw Error('Unexpected dependency ' + name);
  });
}
const load = (session, options) => loadModule(session, options).proxyResponse;
async function withFetch(run, body = { ok: true }, status = 200) {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(body), { status }); };
  try { await run(calls); } finally { global.fetch = original; }
}
const get = url => new Request('http://localhost:3000' + url);
const post = (url, body) => new Request('http://localhost:3000' + url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const create = (extra = {}) => ({ proposal_id: id, task_id: 'infrastructure', team_id: 'syn-team-rescue-01', expected_assignment_version: 0, note: NOTE, ...extra });
const report = (extra = {}) => ({ kind: 'accepted', expected_version: 0, note: NOTE, ...extra });

test('team allowlist equals the API fixture and the server claim list', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, '../../services/api/app/fixtures/synthetic_teams.v1.json'), 'utf8'));
  assert.deepEqual(teams.RESPONSE_TEAMS.map(t => [t.id, t.label, t.kind]), fixture.teams.map(t => [t.id, t.label, t.kind]));
  assert.equal(teams.isResponseTeamId('syn-team-rescue-01'), true);
  for (const bad of ['', 'syn-team-other', null, 1, ['syn-team-rescue-01'], 'SYN-TEAM-RESCUE-01']) assert.equal(teams.isResponseTeamId(bad), false);
  const auth = fs.readFileSync(path.join(root, 'lib/auth-server.ts'), 'utf8');
  assert.match(auth, /if \(!isResponseTeamId\(teamId\)\) throw new Error\("Team scope invalid"\)/);
  assert.match(fs.readFileSync(path.join(root, 'app/api/auth/callback/route.ts'), 'utf8'), /teamId: operator\.teamId/);
  assert.match(fs.readFileSync(path.join(root, 'app/api/auth/session/route.ts'), 'utf8'), /teamId: operator\.teamId/);
});

test('the proxy mirrors the server view rules', () => {
  const { responseView } = loadModule(DESK);
  assert.equal(responseView(DESK), 'department');
  assert.equal(responseView(TEAM), 'team');
  assert.equal(responseView(READER), 'reader');
  for (const session of [{ roles: ['platform_admin'] }, { roles: ['platform_admin', 'incident_auditor'] },
    { roles: ['response_team'] }, { roles: ['response_team'], teamId: 'syn-team-other' }, { roles: ['department_operator'] },
    { roles: ['response_team', 'department_operator'], teamId: 'syn-team-rescue-01', departmentId: 'control_room' }])
    assert.equal(responseView(session), 'none', JSON.stringify(session));
  const server = fs.readFileSync(path.join(root, '../../services/api/app/response_routes.py'), 'utf8');
  assert.match(server, /READERS = frozenset\(\{"incident_operator", "incident_checker", "incident_auditor"\}\)/);
  assert.match(server, /if "platform_admin" in roles:/);
  assert.match(server, /if team and desk:/);
});

test('signed-out, unconfigured and wrong roles never fetch', async () => {
  await withFetch(async calls => {
    assert.equal((await load(null)(get('/api/response/requests'), 'requests')).status, 401);
    assert.equal((await load(DESK, { configured: false })(get('/api/response/requests'), 'requests')).status, 503);
    assert.equal((await load(TEAM)(post('/api/response/requests', create()), 'requests')).status, 403);
    assert.equal((await load(READER)(post('/api/response/requests', create()), 'requests')).status, 403);
    assert.equal((await load(READER)(post(`/api/response/requests/${id}/reports`, report()), 'reports', id)).status, 403);
    assert.equal((await load(TEAM)(get(`/api/response/teams?proposal_id=${id}&task_id=infrastructure`), 'teams')).status, 403);
    assert.equal((await load({ accessToken: 't', roles: ['platform_admin'] })(get('/api/response/requests'), 'requests')).status, 403);
    assert.equal((await load(TEAM)(post(`/api/response/requests/${id}/reports`, report({ kind: 'stood_down' })), 'reports', id)).status, 400);
    assert.equal((await load(TEAM)(post(`/api/response/requests/${id}/reports`, report({ kind: 'desk_handled' })), 'reports', id)).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('writes require the same origin', async () => {
  await withFetch(async calls => {
    assert.equal((await load(DESK, { origin: false })(post('/api/response/requests', create()), 'requests')).status, 403);
    assert.equal((await load(TEAM, { origin: false })(post(`/api/response/requests/${id}/reports`, report()), 'reports', id)).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('body allowlist, bounds and id validation', async () => {
  const bad = [create({ department_id: 'communications' }), create({ actor: 'x' }), create({ team_id: 'real-unit' }),
    create({ proposal_id: 'nope' }), create({ task_id: 'police' }), create({ expected_assignment_version: -1 }),
    create({ expected_assignment_version: '0' }), create({ note: 'short' }), create({ note: 'x'.repeat(1001) }),
    create({ note: 'ten chars\nwith newline' }), create({ note: 'zero​width note here' }), [create()], 'not json', 'x'.repeat(4001)];
  await withFetch(async calls => {
    for (const body of bad) {
      const status = (await load(DESK)(post('/api/response/requests', body), 'requests')).status;
      assert.ok(status === 400 || status === 413, JSON.stringify(body).slice(0, 80) + ' -> ' + status);
    }
    for (const body of [report({ team_id: 'syn-team-rescue-02' }), report({ authority: 'team' }), report({ kind: 'requested' }),
      report({ code: 'invented' }), report({ expected_version: 1.5 }), report({ note: '' })])
      assert.equal((await load(TEAM)(post(`/api/response/requests/${id}/reports`, body), 'reports', id)).status, 400);
    assert.equal((await load(TEAM)(post('/api/response/requests/not-a-uuid/reports', report()), 'reports', 'not-a-uuid')).status, 400);
    assert.equal((await load(DESK)(get('/api/response/teams?proposal_id=nope&task_id=infrastructure'), 'teams')).status, 400);
    assert.equal((await load(DESK)(get(`/api/response/teams?proposal_id=${id}&task_id=infrastructure&team_id=x`), 'teams')).status, 400);
    assert.equal((await load(READER)(get('/api/response/requests?incident_id=nope'), 'requests')).status, 400);
    assert.equal((await load(READER)(get('/api/response/requests?team_id=syn-team-rescue-01'), 'requests')).status, 400);
    assert.equal((await load(READER)(new Request('http://localhost:3000/api/response/alerts', { method: 'POST', body: '{}' }), 'alerts')).status, 405);
    assert.equal(calls.length, 0);
  });
});

test('valid calls reach only the fixed upstream paths with the bearer token and no-store', async () => {
  await withFetch(async calls => {
    let result = await load(DESK)(post('/api/response/requests', create()), 'requests');
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.ok(calls[0].url.endsWith('/v1/exercise/response/requests'));
    assert.deepEqual(JSON.parse(calls[0].options.body), create());
    assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-only-token');
    assert.equal(calls[0].options.cache, 'no-store');
    assert.ok(calls[0].options.signal);
    await load(TEAM)(post(`/api/response/requests/${id}/reports`, report({ kind: 'declined', code: 'off_shift' })), 'reports', id);
    assert.ok(calls[1].url.endsWith(`/v1/exercise/response/requests/${id}/reports`));
    assert.deepEqual(JSON.parse(calls[1].options.body), report({ kind: 'declined', code: 'off_shift' }));
    await load(DESK)(post(`/api/response/requests/${id}/reports`, report({ kind: 'stood_down', code: null })), 'reports', id);
    assert.deepEqual(JSON.parse(calls[2].options.body), report({ kind: 'stood_down' }));
    await load(DESK)(get(`/api/response/teams?proposal_id=${id}&task_id=infrastructure`), 'teams');
    assert.ok(calls[3].url.endsWith(`/v1/exercise/response/teams?proposal_id=${id}&task_id=infrastructure`));
    await load(READER)(get(`/api/response/requests?incident_id=${id}`), 'requests');
    assert.ok(calls[4].url.endsWith(`/v1/exercise/response/requests?incident_id=${id}`));
    await load(TEAM)(get('/api/response/requests'), 'requests');
    assert.ok(calls[5].url.endsWith('/v1/exercise/response/requests'));
    await load({ accessToken: 'unit-only-token', roles: ['platform_admin'] })(get('/api/response/alerts'), 'alerts');
    assert.ok(calls[6].url.endsWith('/v1/exercise/response/alerts'));
    assert.equal(calls[6].options.body, undefined);
  });
});

test('upstream failure gives a fixed message', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:8000 secret'); };
  try {
    const result = await load(TEAM)(get('/api/response/requests'), 'requests');
    assert.equal(result.status, 503);
    assert.doesNotMatch(JSON.stringify(await result.json()), /ECONNREFUSED|10\.0\.0\.5/);
  } finally { global.fetch = original; }
});

test('the four browser routes use the proxy and stay behind the sign-in gate; the proxy has no transport', () => {
  for (const [file, route] of [['app/api/response/teams/route.ts', 'teams'], ['app/api/response/requests/route.ts', 'requests'],
    ['app/api/response/requests/[id]/reports/route.ts', 'reports'], ['app/api/response/alerts/route.ts', 'alerts']]) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(text, new RegExp(`proxyResponse\\(request, "${route}"`), file);
  }
  const gate = fs.readFileSync(path.join(root, 'lib/session-gate.ts'), 'utf8');
  assert.doesNotMatch(gate, /api\/response/);
  const proxy = fs.readFileSync(path.join(root, 'lib/response-proxy.ts'), 'utf8');
  assert.doesNotMatch(proxy, /twilio|nodemailer|web-push|sendgrid|smtp|Notification\(|navigator\./i);
  assert.equal((proxy.match(/fetch\(/g) || []).length, 1, 'one fetch, to the AEGIS API only');
});
