// The team response screens (docs/RESPONSE_LOOP.md): plain labels for every state, kind, code and authority, the
// display rules that decide which action is offered, the shape checks on API answers, and the shell wiring (menu entry,
// count, no sound or push). The proxy and the API stay the control; these tests only keep the screens honest.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = request => request.startsWith('.') ? load(path.posix.join(path.posix.dirname(file), request) + '.ts') : require(request);
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}
const labels = load('lib/labels.ts');
const ui = load('lib/response-ui.ts');
const roles = load('lib/roles.ts');
const nav = load('lib/navigation.ts');
const help = load('lib/page-help.ts');
const session = load('lib/use-operator-session.ts');
const teams = load('lib/response-teams.ts');
const quoted = text => [...text.matchAll(/"([a-z_]+)"/g)].map(match => match[1]).sort();

test('the closed lists on screen equal the lists the browser proxy accepts', () => {
  const proxy = read('lib/response-proxy.ts');
  const teamKinds = quoted(/const TEAM_KINDS = \[([^\]]+)\]/.exec(proxy)[1]);
  const codes = quoted(/const CODES = \[([^\]]+)\]/.exec(proxy)[1]);
  assert.deepEqual([...ui.ALL_CODES].sort(), codes);
  // Every kind a desk may send is a kind the screens know; "requested" is only ever written by creating a request.
  assert.deepEqual([...ui.REPORT_KINDS].filter(kind => kind !== 'requested').sort(), [...teamKinds, 'stood_down', 'desk_handled'].sort());
  assert.match(proxy, /const DESK_KINDS = \[\.\.\.TEAM_KINDS, "stood_down", "desk_handled"\]/);
});

test('no response state, kind, code or authority lacks a plain label, and none is shown raw', () => {
  const plain = text => assert.ok(typeof text === 'string' && /^[A-Z]/.test(text) && !labels.isMachineCode(text) && !/_/.test(text), String(text));
  for (const state of ui.RESPONSE_STATES) { assert.ok(Object.hasOwn(labels.RESPONSE_STATE_LABELS, state), 'state ' + state); plain(labels.responseStateLabel(state)); }
  for (const kind of ui.REPORT_KINDS) { assert.ok(Object.hasOwn(labels.REPORT_KIND_LABELS, kind), 'kind ' + kind); plain(labels.reportKindLabel(kind)); }
  for (const authority of ui.AUTHORITIES) { assert.ok(Object.hasOwn(labels.AUTHORITY_LABELS, authority), 'authority ' + authority); plain(labels.authorityLabel(authority)); }
  for (const [kind, codes] of Object.entries(ui.KIND_CODES)) for (const code of codes) {
    assert.ok(code === 'other' ? Object.hasOwn(labels.OTHER_CODE_LABELS, kind) : Object.hasOwn(labels.REPORT_CODE_LABELS, code), `code ${code} for ${kind}`);
    plain(labels.reportCodeLabel(kind, code));
  }
  for (const kind of Object.keys(ui.KIND_CODES)) assert.ok(Object.hasOwn(labels.RESPONSE_ACTION_LABELS, kind) || kind === 'on_site' || kind === 'completed', kind);
  for (const kind of ui.REPORT_KINDS.filter(item => !['requested', 'desk_handled', 'stood_down'].includes(item))) assert.ok(Object.hasOwn(labels.RESPONSE_ACTION_LABELS, kind), 'team button for ' + kind);
  for (const kind of ui.REPORT_KINDS.filter(item => item !== 'requested')) assert.ok(Object.hasOwn(labels.RELAY_ACTION_LABELS, kind), 'desk button for ' + kind);
  assert.equal(labels.reportCodeLabel('declined', 'other'), 'Another reason');
  assert.equal(labels.reportCodeLabel('needs_support', 'other'), 'Something else');
  assert.equal(labels.authorityLabel('department_relay'), "Desk, on the team's behalf");
  assert.equal(labels.authorityLabel('team'), 'Team'); assert.equal(labels.authorityLabel('department'), 'Desk');
  assert.equal(labels.responseStateLabel('some_new_state'), 'Some new state', 'an unknown value is read as words, never shown raw');
  for (const text of [...Object.values(labels.RESPONSE_STATE_LABELS), ...Object.values(labels.RESPONSE_ACTION_LABELS)]) assert.ok(labels.KNOWN_LABEL_TEXTS.includes(text), 'translation register source: ' + text);
});

test('each state offers one forward step, and a desk may also stand down or mark handled', () => {
  assert.deepEqual(ui.teamKinds('requested'), ['accepted', 'declined']);
  assert.deepEqual(ui.teamKinds('accepted'), ['en_route', 'situation_report', 'needs_support']);
  assert.deepEqual(ui.teamKinds('en_route'), ['on_site', 'situation_report', 'needs_support']);
  assert.deepEqual(ui.teamKinds('on_site'), ['completed', 'situation_report', 'needs_support']);
  for (const state of ['declined', 'completed', 'stood_down']) assert.deepEqual(ui.teamKinds(state), []);
  assert.deepEqual(ui.deskKinds('requested', false), ['accepted', 'declined', 'stood_down']);
  assert.deepEqual(ui.deskKinds('on_site', true), ['completed', 'situation_report', 'needs_support', 'stood_down', 'desk_handled']);
  assert.deepEqual(ui.deskKinds('declined', true), ['desk_handled'], 'a flagged finished request can still be marked handled');
  assert.ok(!ui.teamKinds('requested').includes('stood_down') && !ui.teamKinds('on_site').includes('desk_handled'), 'a team cannot stand down or clear a flag');
});

test('the note rule matches the proxy: 10 to 1000 characters, no control or line-separator characters', () => {
  assert.equal(ui.noteProblem('too short'), 'short');
  assert.equal(ui.noteProblem('          a          '), 'short', 'trimmed length counts');
  assert.equal(ui.noteProblem('Ten chars!'), null);
  assert.equal(ui.noteProblem('x'.repeat(1000)), null);
  assert.equal(ui.noteProblem('x'.repeat(1001)), 'long');
  for (const bad of ['line one\nline two here', 'tab\there is bad', 'zero​width here ok?', 'sep arator here']) assert.equal(ui.noteProblem(bad), 'characters', JSON.stringify(bad));
});

test('requests group for a team page as answer, active, finished, and malformed answers are dropped', () => {
  const make = (id, state, updated) => ({ id, state, version: 1, updated_at: updated, incident: { id: 'i', hazard_label: 'Heavy rainfall' }, task: { id: 'control_room', summary: 's', department: 'control_room' }, team: { id: 'syn-team-rescue-01', label: 'T', kind: 'rescue' } });
  const answer = ui.cleanRequests({ requests: [make('a', 'requested', '2026-11-12T10:00:00Z'), make('b', 'completed', '2026-11-12T11:00:00Z'), make('c', 'on_site', '2026-11-12T09:00:00Z'), make('d', 'requested', '2026-11-12T12:00:00Z'), { id: 'bad' }, null] });
  assert.equal(answer.length, 4, 'two malformed rows are dropped');
  const groups = ui.groupForTeam(answer);
  assert.deepEqual(groups.answer.map(item => item.id), ['d', 'a'], 'newest first');
  assert.deepEqual(groups.active.map(item => item.id), ['c']);
  assert.deepEqual(groups.finished.map(item => item.id), ['b']);
  assert.equal(ui.cleanRequests({ nope: 1 }), null); assert.equal(ui.cleanRequests(null), null);
  const withExtra = ui.cleanRequest({ ...make('x', 'requested', ''), secret: 'x', reports: [{ kind: 'requested', occurred_at: '2026-11-12T10:00:00Z', authority: 'department', code: null, note: 'n', mine: true, actor_subject: 'leak' }] });
  assert.equal('secret' in withExtra, false); assert.equal('actor_subject' in withExtra.reports[0], false, 'unknown fields are not carried through');
  assert.equal(ui.istText('2026-11-12T08:35:00Z'), '12 Nov, 14:05 IST');
  assert.equal(ui.istText('nonsense'), '—');
});

test('only desks and teams get the menu count, and administrators or dual-role tokens get none', () => {
  assert.equal(ui.alertView(['response_team']), 'team');
  assert.equal(ui.alertView(['department_operator']), 'desk');
  for (const held of [['platform_admin'], ['incident_operator'], ['incident_checker', 'incident_auditor'], ['response_team', 'department_operator'], ['response_team', 'platform_admin'], [], null]) assert.equal(ui.alertView(held), null, JSON.stringify(held));
  assert.equal(ui.canReadRequests(['incident_auditor']), true);
  assert.equal(ui.canReadRequests(['platform_admin']), false);
  assert.equal(ui.canReadRequests(['response_team', 'department_operator']), false);
});

test('team suggestions keep the facts and say why a team cannot be requested', () => {
  const answer = ui.cleanSuggestions({ capability_basis: 'assessed', hazard_label: 'Heavy rainfall', travel_label: 'Planning estimate', teams: [
    { id: 'syn-team-rescue-01', label: 'R', kind: 'rescue', capabilities: ['boat'], matched_capabilities: ['boat'], capacity: 2, active_requests: 0, free_capacity: 2, available_now: true, available_utc: '04:00-16:00', estimated_travel_minutes: 12, suggested: true },
    { id: 'syn-team-health-01', label: 'H', kind: 'health', capabilities: [], matched_capabilities: [], capacity: 1, active_requests: 1, free_capacity: 0, available_now: false, available_utc: '', estimated_travel_minutes: null, suggested: false }, 7] });
  assert.equal(answer.teams.length, 2);
  const [first, second] = answer.teams;
  assert.equal(ui.whyNotRequestable(first, 'assessed', false), null);
  assert.equal(ui.whyNotRequestable(first, 'assessed', true), 'taken');
  assert.equal(ui.whyNotRequestable(second, 'assessed', false), 'full');
  assert.equal(ui.whyNotRequestable({ ...second, free_capacity: 1 }, 'assessed', false), 'hours');
  assert.equal(ui.whyNotRequestable({ ...second, free_capacity: 1, available_now: true }, 'assessed', false), 'capability');
  assert.equal(ui.whyNotRequestable({ ...second, free_capacity: 1, available_now: true }, 'not_assessed', false), null, 'no hazard match was computed, so none is required');
  assert.equal(ui.cleanSuggestions({ capability_basis: 'weird', teams: [] }).capability_basis, 'not_assessed');
});

test('My Team is a menu entry for response teams, with help, a role rule and the session team', () => {
  const entry = nav.allPages.find(page => page.href === '/my-team');
  assert.ok(entry && entry.label === 'My Team' && entry.chain === 'Reach');
  assert.ok(nav.navigation.find(group => group.label === 'Coordinate').items.some(item => item.href === '/my-team'));
  assert.ok(help.PAGE_HELP['/my-team'] && /never/i.test(help.PAGE_HELP['/my-team'].never));
  assert.deepEqual(roles.pageRoles('/my-team'), ['response_team']);
  assert.equal(roles.canOpenPage('/my-team', ['response_team']), true);
  assert.equal(roles.canOpenPage('/my-team', ['department_operator']), false);
  assert.equal(roles.ROLE_INFO.response_team.tone, 'team');
  assert.ok(fs.existsSync(path.join(root, 'app/my-team/page.tsx')) && /title: "My Team"/.test(read('app/my-team/page.tsx')));
  assert.match(read('app/api/auth/callback/route.ts'), /response_team"\) \? "\/my-team"/, 'a response team lands on My Team');
  const clean = session.cleanSession({ authenticated: true, configured: true, roles: ['response_team'], teamId: 'syn-team-rescue-01', departmentId: undefined });
  assert.equal(clean.teamId, 'syn-team-rescue-01');
  assert.ok(teams.isResponseTeamId(clean.teamId));
});

test('the shell polls the count only while the tab is visible, and nothing alerts by sound, push or browser notification', () => {
  const alerts = read('lib/use-response-alerts.ts');
  assert.match(alerts, /document\.visibilityState !== "visible"\) return/);
  assert.match(alerts, /if \(!view\)/, 'only for the two roles');
  const files = ['lib/use-response-alerts.ts', 'lib/use-response-requests.ts', 'lib/response-client.ts', 'components/app-shell.tsx', 'components/response-alert-toast.tsx', 'components/my-team.tsx', 'components/team-response-desk.tsx', 'components/response-parts.tsx', 'components/field-teams.tsx', 'components/incident-team-response.tsx'];
  for (const file of files) assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ''), /new Notification\(|Notification\.requestPermission|new Audio\(|AudioContext|serviceWorker|PushManager|navigator\.vibrate|WebSocket|EventSource/, file);
  const shell = read('components/app-shell.tsx');
  assert.match(shell, /aria-live="polite"/);
  assert.match(shell, /<ResponseAlertToast view=\{alerts\.view\} rose=\{alerts\.rose\} \/>/);
  const toast = read('components/response-alert-toast.tsx');
  assert.match(toast, /New request for your team/); assert.match(toast, /Something needs your desk/);
});

test('the response screens carry the rehearsal statement, use the shared kit, and never hand-roll it', () => {
  const my = read('components/my-team.tsx');
  assert.match(my, /This is a rehearsal\./); assert.match(my, /Nobody is called, texted or radioed/); assert.match(my, /planning estimates/);
  assert.match(read('components/team-response-desk.tsx'), /<RehearsalNote \/>/, 'the desk section repeats the statement');
  for (const file of ['components/my-team.tsx', 'components/team-response-desk.tsx', 'components/response-parts.tsx', 'components/field-teams.tsx', 'components/incident-team-response.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /<button\b|<table\b/, file + ' uses the kit Button and DataTable');
    assert.doesNotMatch(source, />\{[\w.]*\.(state|kind|code|authority)\}</, file + ' never prints a raw state, kind, code or authority');
  }
  assert.match(read('app/department-tasks/page.tsx'), /<TeamResponseDesk /);
  assert.match(read('app/department-tasks/page.tsx'), /Stand down or finish the task's team requests before closing it/);
  assert.match(read('components/team-availability.tsx'), /<FieldTeams\/>/);
  assert.match(read('components/incident-intelligence.tsx'), /<IncidentTeamResponse incidentId=\{incident\.id\}\/>/);
  assert.match(read('components/incident-team-response.tsx'), /if \(!allowed \|\| status === "refused"\) return null;/, 'other roles see nothing extra and no error panel');
});

test('team kinds, capabilities and the failure sentences have reviewed labels', () => {
  const labels = load('lib/labels.ts');
  const expected = { rescue: 'Rescue', health: 'Health', municipal: 'Municipal', flood_rescue: 'Flood rescue', search_rescue: 'Search and rescue', evacuation: 'Evacuation', medical: 'Medical', fire_response: 'Fire response' };
  for (const [code, text] of Object.entries(expected)) { assert.ok(labels.hasLabel(code), code + ' has a reviewed label'); assert.equal(labels.codeLabel(code), text); assert.ok(labels.KNOWN_LABEL_TEXTS.includes(text), text + ' is registered for translation'); }
  const client = load('lib/response-client.ts');
  assert.equal(client.failureMessage(401, null), labels.RESPONSE_FAILURE_TEXTS.signedOut);
  assert.equal(client.failureMessage(0, null), labels.RESPONSE_FAILURE_TEXTS.unavailable);
  assert.equal(client.failureMessage(409, { detail: 'Server sentence kept.' }), 'Server sentence kept.', 'a server sentence is shown as received');
  for (const text of Object.values(labels.RESPONSE_FAILURE_TEXTS)) assert.ok(labels.KNOWN_LABEL_TEXTS.includes(text), 'registered: ' + text);
});
