// The shared interface rules: one label helper, one role description that mirrors the server rules, one navigation
// list, one help pattern. These tests keep the description honest: where it claims to mirror a rule, the rule's
// source file is read and compared.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} };
  const localRequire = request => request.startsWith('.') ? load(path.posix.join(path.posix.dirname(file), request) + '.ts') : require(request);
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}
const labels = load('lib/labels.ts');
const roles = load('lib/roles.ts');
const help = load('lib/page-help.ts');
const hazards = load('lib/hazards.ts');
const nav = load('lib/navigation.ts');
const sorted = list => [...list].sort();
const listed = text => sorted([...text.matchAll(/"([a-z_]+)"/g)].map(match => match[1]));

// ---- label helper ----
test('codeLabel gives reviewed labels for known codes and never shows a raw code for an unknown one', () => {
  assert.equal(labels.codeLabel('submitted'), 'Awaiting checker');
  assert.equal(labels.codeLabel('proactive_disabled'), 'Proactive automation is switched off in this deployment');
  assert.equal(labels.codeLabel('incident_operator'), 'Maker');
  assert.equal(labels.codeLabel('platform_admin'), 'Administrator');
  assert.equal(labels.codeLabel('heavy_rain'), 'Heavy rain');
  assert.equal(labels.codeLabel('nasa_firms'), 'NASA FIRMS');
  assert.equal(labels.codeLabel('some_new_reason_code'), 'Some new reason code');
  assert.equal(labels.codeLabel('sla_target-elapsed'), 'SLA target elapsed');
  assert.equal(labels.codeLabel('aegis.exercise.policy.v1'), 'Aegis exercise policy v1');
  for (const empty of [null, undefined, '', '   ']) assert.equal(labels.codeLabel(empty), 'Not known');
  for (const key of ['__proto__', 'constructor', 'toString']) assert.equal(typeof labels.codeLabel(key), 'string');
  for (const code of labels.KNOWN_LABEL_CODES) {
    const text = labels.codeLabel(code);
    assert.ok(text.length > 1 && !labels.isMachineCode(text), code + ' -> ' + text);
    assert.match(text, /^[A-Z]/, 'labels are sentence case: ' + text);
  }
  assert.equal(labels.isMachineCode('database_query_succeeded'), true);
  assert.equal(labels.isMachineCode('Database answered'), false);
});

test('record ids are shortened for display, and names give initials', () => {
  const id = '3f2a9c1e-1111-4111-8111-00000000a1b2';
  assert.equal(labels.shortId(id), '3f2a9c1e…a1b2');
  assert.equal(labels.shortId('control_room'), 'control_room');
  assert.equal(labels.isUuid(id), true); assert.equal(labels.isUuid('nope'), false);
  assert.equal(labels.initials('Demo demo-admin'), 'DA');
  assert.equal(labels.initials('demo-maker'), 'DM');
  assert.equal(labels.initials('asha'), 'AS');
  assert.equal(labels.initials(''), '?'); assert.equal(labels.initials(null), '?');
  assert.deepEqual(labels.timeLeft(72 * 60_000 + 5_000), { hours: 1, minutes: 12 });
  assert.equal(labels.timeLeft(0), null); assert.equal(labels.timeLeft(-5), null); assert.equal(labels.timeLeft(NaN), null);
});

test('every hazard has one glyph, and unknown hazards get the neutral one', () => {
  assert.equal(hazards.hazardStyle('river_flood').key, 'river_flood');
  assert.equal(hazards.hazardStyle('River flood').key, 'river_flood');
  assert.equal(hazards.hazardStyle('Flood').key, 'river_flood');
  assert.equal(hazards.hazardStyle('urban flooding').key, 'urban_flood');
  assert.equal(hazards.hazardStyle('heat').key, 'heatwave');
  assert.equal(hazards.hazardStyle('something else').key, 'other');
  assert.equal(hazards.hazardStyle(null).key, 'other');
  for (const style of hazards.HAZARD_STYLES) for (const rgb of [style.light, style.dark]) assert.match(rgb, /^\d{1,3} \d{1,3} \d{1,3}$/);
  assert.equal(new Set(hazards.HAZARD_STYLES.map(style => style.key)).size, hazards.HAZARD_STYLES.length);
});

// ---- roles: the description must match the rules the server enforces ----
test('the role list is exactly the server role list, each with a plain label and a tone', () => {
  const server = /const ALL_ROLES: Role\[\] = \[([^\]]+)\]/.exec(read('lib/auth-server.ts'));
  assert.deepEqual(sorted(roles.ROLE_IDS), listed(server[1]));
  for (const id of roles.ROLE_IDS) {
    const info = roles.ROLE_INFO[id];
    assert.ok(info.label && !labels.isMachineCode(info.label) && info.summary.length > 20, id);
    assert.equal(labels.codeLabel(id), info.label, 'label helper and role table agree for ' + id);
  }
  assert.equal(new Set(roles.ROLE_IDS.map(id => roles.ROLE_INFO[id].tone)).size, roles.ROLE_IDS.length, 'each role has its own colour and icon');
  assert.equal(roles.primaryRole(['incident_operator', 'platform_admin']), 'platform_admin');
  assert.equal(roles.primaryRole(['made_up']), null);
  assert.deepEqual(roles.knownRoles(['x', 'incident_checker']), ['incident_checker']);
});

test('the permission matrix repeats the role lists written in the route rules', () => {
  const cap = id => sorted(roles.CAPABILITIES.find(item => item.id === id).roles);
  const assist = /const READ_ROLES: Role\[\] = \[([^\]]+)\]/.exec(read('lib/assist-proxy.ts'));
  assert.deepEqual(cap('read_assist'), listed(assist[1]));
  const forecast = /const READ_ROLES: Role\[\] = \[([^\]]+)\]/.exec(read('app/api/forecast/route.ts'));
  assert.deepEqual(cap('read_forecast'), listed(forecast[1]));
  const learning = read('lib/learning-proxy.ts');
  assert.deepEqual(cap('read_learning'), listed(/const READ: Role\[\] = \[([^\]]+)\]/.exec(learning)[1]));
  assert.deepEqual(cap('review_threshold'), listed(/\/review\$\/\.test\(path\)\) return \[([^\]]+)\]/.exec(learning)[1]));
  assert.deepEqual(cap('apply_threshold'), listed(/\/apply\$\/\.test\(path\)\) return \[([^\]]+)\]/.exec(learning)[1]));
  assert.deepEqual(cap('respond_drill'), listed(/\/respond\$\/\.test\(path\)\) return \[([^\]]+)\]/.exec(learning)[1]));
  assert.match(learning, /return \["incident_operator"\];\s*\}/, 'other learning writes are maker-only');
  assert.deepEqual(cap('propose_threshold'), ['incident_operator']);
  const proactive = read('lib/proactive-proxy.ts');
  assert.deepEqual(cap('connectors'), listed(/route === "connector_audit"\) return \[([^\]]+)\]/.exec(proactive)[1]));
  assert.deepEqual(cap('refresh_watch'), listed(/route === "watch_refresh"\) return \[([^\]]+)\]/.exec(proactive)[1]));
  assert.deepEqual(cap('read_pause'), listed(/route === "pause_get"\) return \[([^\]]+)\]/.exec(proactive)[1]));
  assert.deepEqual(cap('set_pause'), listed(/route === "pause_set"\) return \[([^\]]+)\]/.exec(proactive)[1]));
  assert.deepEqual(cap('read_scheduler'), listed(/route === "scheduler"\) return \[([^\]]+)\]/.exec(proactive)[1]));
  assert.match(proactive, /const PUBLIC_ROUTES = new Set<ProactiveRoute>\(\["watch", "watch_history", "triggers_config"\]\)/, 'reading the watch needs no particular role');
  assert.deepEqual(cap('read_watch'), sorted(roles.ROLE_IDS));
  const proposals = read('lib/proposal-proxy.ts');
  assert.match(proposals, /\? "incident_operator" : "incident_checker";/, 'maker operations versus approve/reject');
  assert.deepEqual(cap('make_proposal'), ['incident_operator']);
  assert.deepEqual(cap('check_proposal'), ['incident_checker']);
  assert.deepEqual(cap('read_proposals'), listed(/else if \(!hasRole\(session\.roles, ([^)]+)\)\)/.exec(proposals)[1]));
  assert.match(read('lib/department-proxy.ts'), /session\.roles\.includes\("department_operator"\)/);
  assert.deepEqual(cap('department_inbox'), ['department_operator']);
  const response = read('lib/response-proxy.ts');
  const responseReaders = listed(/const READERS: Role\[\] = \[([^\]]+)\]/.exec(response)[1]);
  assert.match(response, /if \(view !== "department"\) return failure\(403, "Verified department role required"\);/, 'requests and suggestions are desk-only');
  assert.match(response, /const kinds = view === "team" \? TEAM_KINDS : DESK_KINDS;/, 'teams answer, desks also stand down');
  assert.deepEqual(cap('request_team'), ['department_operator']);
  assert.deepEqual(cap('team_respond'), ['response_team']);
  assert.deepEqual(cap('read_team_requests'), sorted([...responseReaders, 'department_operator', 'response_team']));
  assert.ok(!cap('read_team_requests').includes('platform_admin'), 'administrators see nothing here, as on the server');
  assert.deepEqual(cap('read_pause'), listed(/route === "pause_get"\) return \[([^\]]+)\]/.exec(proactive)[1]));
  // Every row names an existing rule file and uses known roles and groups.
  for (const item of roles.CAPABILITIES) {
    assert.ok(fs.existsSync(path.join(root, item.rule)), item.rule);
    assert.ok(item.roles.length > 0 && item.roles.every(roles.isRoleId), item.id);
    assert.ok(roles.CAPABILITY_GROUPS.includes(item.group), item.group);
  }
  assert.equal(new Set(roles.CAPABILITIES.map(item => item.id)).size, roles.CAPABILITIES.length);
});

test('page access is a menu convenience derived from the matrix, never wider than it', () => {
  assert.equal(roles.canOpenPage('/approvals', ['platform_admin']), false);
  assert.equal(roles.canOpenPage('/approvals', ['incident_auditor']), true);
  assert.equal(roles.canOpenPage('/department-tasks', ['incident_operator']), false);
  assert.equal(roles.canOpenPage('/department-tasks', ['department_operator']), true);
  assert.equal(roles.canOpenPage('/handover', ['department_operator']), false);
  assert.equal(roles.canOpenPage('/admin/connectors', ['incident_checker']), false);
  assert.equal(roles.canOpenPage('/incidents', ['department_operator']), true);
  assert.equal(roles.canOpenPage('/approvals', null), true, 'unknown session shows the full menu; the server still decides');
  const pages = new Set(nav.allPages.map(page => page.href));
  for (const href of roles.GATED_PAGES) assert.ok(pages.has(href), 'gated page is in the menu: ' + href);
  // The interface never gates by itself: the shell only moves entries, and no page hides data on the client alone.
  const shell = read('components/app-shell.tsx');
  assert.match(shell, /Menus only: the server decides/);
});

// ---- navigation ----
test('signed-in navigation stays inside the app and every page has help and a chain step where it serves one', () => {
  const hrefs = nav.allPages.map(page => page.href);
  assert.ok(!hrefs.includes('/welcome'), 'the public landing page is not a menu entry');
  assert.ok(hrefs.includes('/about') && hrefs.includes('/admin/users'));
  assert.equal(new Set(hrefs).size, hrefs.length, 'no page is listed twice');
  for (const page of nav.allPages) {
    if (page.href === '/alert-journey') continue; // full-screen experience without the shell
    assert.ok(help.PAGE_HELP[page.href], 'no "How this page works" text for ' + page.href);
    if (page.chain) assert.ok(nav.CHAIN.includes(page.chain), page.href);
  }
  for (const entry of Object.values(help.PAGE_HELP)) {
    assert.deepEqual(Object.keys(entry), ['shows', 'can', 'never'], 'the same three parts in the same order');
    assert.match(entry.never, /\bnever\b/i);
    for (const text of Object.values(entry)) assert.ok(text.length > 20 && !/[<>{}]/.test(text));
  }
  assert.deepEqual(help.helpFor('/incidents/22222222-2222-4222-8222-222222222222'), help.PAGE_HELP['/incidents']);
  assert.deepEqual(help.helpFor('/admin/users'), help.PAGE_HELP['/admin/users']);
  assert.equal(help.helpFor('/alert-journey'), null);
  assert.deepEqual([...nav.CHAIN], ['Sense', 'Predict', 'Decide', 'Hand over', 'Reach', 'Learn']);
  assert.equal(nav.locate('/admin/users').tab.href, '/admin/users');
  assert.equal(nav.locate('/admin/users').item.href, '/admin');
  for (const steps of Object.values(nav.GROUP_CHAIN)) for (const step of steps) assert.ok(nav.CHAIN.includes(step));
});

test('new signed-in pages stay behind the sign-in gate, and /welcome sends a signed-in visitor into the app', () => {
  const gate = read('lib/session-gate.ts');
  assert.match(gate, /const PUBLIC_PAGES = new Set\(\["\/", "\/welcome", "\/sign-in"\]\);/, 'no public page was added');
  for (const page of ['app/about/page.tsx', 'app/admin/users/page.tsx', 'app/not-found.tsx', 'app/error.tsx', 'app/global-error.tsx']) assert.ok(fs.existsSync(path.join(root, page)), page);
  const welcome = read('app/welcome/page.tsx');
  assert.match(welcome, /if \(await readSession\(\)\) redirect\("\/about"\);/);
  const users = read('components/users-access.tsx');
  assert.match(users, /scripts\/new-demo-accounts\.ps1/);
  assert.doesNotMatch(users, /<input|<select|<textarea|method: "(POST|PUT|DELETE)"/, 'the users page has no controls and writes nothing');
});

// ---- session handling in one shared place ----
test('session expiry is handled once: the provider watches for the gate answer and keeps the existing sign-out path', () => {
  const provider = read('components/session-provider.tsx');
  assert.match(provider, /code === "SIGN_IN_REQUIRED"/);
  assert.match(provider, /"\/sign-in\?"/);
  assert.match(provider, /expired=1/);
  assert.match(read('app/layout.tsx'), /<SessionProvider>\{children\}<\/SessionProvider>/);
  const load = file => { const mod = { exports: {} }; const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    new Function('require', 'module', 'exports', code)(() => new Proxy({}, { get: () => () => null }), mod, mod.exports); return mod.exports; };
  const { signInAgainUrl } = load('components/session-provider.tsx');
  assert.equal(signInAgainUrl('/handover'), '/sign-in?next=%2Fhandover&expired=1');
  assert.equal(signInAgainUrl('/admin/users'), '/sign-in?next=%2Fadmin%2Fusers&expired=1');
  for (const bad of ['/', '//evil.example', '/a?b=c', '/a/../b', 'https://evil.example', '/x'.repeat(80)]) assert.equal(signInAgainUrl(bad), '/sign-in?expired=1', bad);
  const auth = read('components/operator-auth.tsx');
  assert.match(auth, /clearExerciseDraftRecovery\(\);/);
  assert.match(auth, /fetch\("\/api\/auth\/logout", \{ method: "POST", credentials: "same-origin" \}\)/);
  assert.match(auth, /window\.location\.assign\(body\.logoutUrl \|\| "\/"\)/);
  assert.doesNotMatch(read('lib/use-operator-session.ts'), /access_token|id_token|refresh_token/, 'the browser session summary never carries a token');
});

// ---- one pattern each ----
test('the kit exports the shared patterns and the stylesheet defines the button variants and print rules once', () => {
  const index = read('components/ui/index.ts');
  for (const name of ['Button', 'IconButton', 'PermissionState', 'RecordRef', 'CitedLine', 'DataTable', 'PageHelp', 'Toolbar', 'RoleChip', 'TwoKey', 'HazardGlyph', 'ChainMarker', 'Dialog', 'Tip']) assert.ok(index.includes(name), 'index.ts missing ' + name);
  const css = read('app/globals.css');
  for (const rule of ['.control-primary', '.control-quiet', '.control-danger', '.control-sm', '.control-icon', '@media print', '.exercise-tape', '.record-ref', '.data-table']) assert.ok(css.includes(rule), rule);
  const layout = read('components/ui/layout.tsx');
  assert.match(layout, /className=\{bodyClassName \?\? "panel-body"\}/, 'Panel pads its body unless told otherwise');
  // Pages no longer override button height or text size on .control.
  const offenders = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const rel = dir + '/' + name;
      if (fs.statSync(path.join(root, rel)).isDirectory()) { if (!/welcome|globe|alert-journey/.test(rel)) walk(rel); continue; }
      if (!name.endsWith('.tsx') || /sign-in/.test(name)) continue;
      for (const match of read(rel).matchAll(/className="([^"]*\bcontrol\b[^"]*)"/g)) if (/(^| )(!?min-h-\d+|h-(8|9|10|11)|!?text-xs|!px-0)( |$)/.test(match[1])) offenders.push(rel + ': ' + match[1]);
    }
  })('components');
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(read('components/shift-handover.tsx'), /<code/, 'handover shows labels and record references, not raw codes');
  assert.doesNotMatch(read('components/operator-copilot.tsx'), /<code/);
});

test('prose from the API has machine codes read as plain words', () => {
  assert.equal(labels.plainText('Replayed from known_events for heavy_rain.'), 'Replayed from known events for heavy rain.');
  assert.equal(labels.plainText('Nothing to change here.'), 'Nothing to change here.');
  assert.equal(labels.plainText('See catalogue/known_events.csv rows.'), 'See catalogue/known_events.csv rows.', 'file names are not rewritten');
});

test('humanText turns file names in API notes into plain words, and leaves plainText unchanged', () => {
  assert.equal(labels.humanText('Event references cite research/real-data/catalogue/known_events.csv rows.'), 'Event references cite the public catalogue of known events rows.');
  assert.equal(labels.humanText('Loaded from exercise_scenarios.v1.json.'), 'Loaded from the exercise scenario list.');
  assert.equal(labels.humanText('Read some_new-table.csv first.'), 'Read some new table file first.');
  assert.equal(labels.humanText('Replayed from known_events for heavy_rain.'), 'Replayed from known events for heavy rain.');
  assert.equal(labels.humanText('Nothing to change here.'), 'Nothing to change here.');
  assert.doesNotMatch(labels.humanText('See catalogue/known_events.csv and a.json'), /\.(csv|json)/);
});
