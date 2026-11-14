// The guided tours: every page and tab has one, every target exists in the components, every role sees a sensible
// tour on every page of its menu, the copy makes no forbidden claim, and the flag store is safe and stays in its namespace.
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
function sources(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = dir + '/' + name;
    if (fs.statSync(path.join(root, rel)).isDirectory()) sources(rel, out); else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const tours = load('lib/tours.ts');
const nav = load('lib/navigation.ts');
const roles = load('lib/roles.ts');

// Every data-tour value written in the components and app, including conditional ones such as data-tour={x ? "name" : undefined},
// and the `tour="name"` prop that the kit's Tabs and SegmentedControl turn into data-tour.
const DECLARED = new Set();
for (const file of [...sources('components'), ...sources('app')]) {
  const text = read(file);
  for (const match of text.matchAll(/data-tour=(?:"([a-z0-9-]+)"|\{([^}]*)\})/g)) {
    if (match[1]) DECLARED.add(match[1]);
    else for (const quoted of match[2].matchAll(/"([a-z0-9-]+)"/g)) DECLARED.add(quoted[1]);
  }
  for (const match of text.matchAll(/\btour="([a-z0-9-]+)"/g)) DECLARED.add(match[1]);
}

const everyText = tour => tour.steps.flatMap(step => [step.title, step.body, ...Object.values(step.bodyByRole ?? {})]);

test('every route in the navigation, including tabs, has a tour; so do the pages reached only by link', () => {
  for (const page of nav.allPages) assert.ok(tours.tourForPath(page.href), `no tour for ${page.href}`);
  for (const extra of ['/incidents/3f1c0000-0000-4000-8000-000000000001', '/admin/brand', '/whats-new']) assert.ok(tours.tourForPath(extra), `no tour for ${extra}`);
  assert.ok(tours.tourById('welcome'));
  assert.equal(tours.tourForPath('/not-a-page'), undefined);
});

test('every step target exists as a data-tour attribute in the components or the app', () => {
  for (const tour of tours.TOURS) for (const step of tour.steps) {
    if (step.target) assert.ok(DECLARED.has(step.target), `${tour.id}/${step.id}: no data-tour="${step.target}" in components or app`);
  }
});

test('page tours have three to seven normal steps, unique step ids and valid role keys', () => {
  for (const tour of tours.TOURS) {
    const ids = tour.steps.map(step => step.id);
    assert.equal(new Set(ids).size, ids.length, `${tour.id}: duplicate step ids`);
    if (tour.route && !tour.noShell) {
      const normal = tour.steps.filter(step => !step.refusal).length;
      assert.ok(normal >= 3 && normal <= 7, `${tour.id}: ${normal} normal steps`);
    }
    for (const step of tour.steps) {
      for (const role of [...(step.roles ?? []), ...Object.keys(step.bodyByRole ?? {})]) assert.ok(roles.ROLE_IDS.includes(role), `${tour.id}/${step.id}: unknown role ${role}`);
      assert.ok(step.title && step.body, `${tour.id}/${step.id}: empty text`);
    }
  }
});

test('for every role, every page in its menu yields at least one step, and a refused page explains itself', () => {
  for (const role of roles.ROLE_IDS) {
    for (const page of nav.allPages) {
      const tour = tours.tourForPath(page.href);
      const steps = tours.stepsFor(tour, [role]);
      assert.ok(steps.length >= 1, `${role} gets no step on ${page.href}`);
      if (!roles.canOpenPage(page.href, [role])) {
        assert.ok(steps.every(step => step.id === 'refusal'), `${role} on ${page.href} should see only the refusal step`);
      } else {
        assert.ok(steps.every(step => step.id !== 'refusal'), `${role} can open ${page.href} and must not see a refusal`);
      }
    }
    assert.ok(tours.stepsFor(tours.tourById('welcome'), [role]).length >= 6, `${role}: welcome tour too short`);
    const walk = tours.tourPagesFor([role]);
    assert.ok(walk.length >= 10, `${role}: all-pages walk has ${walk.length} pages`);
    assert.ok(walk.every(page => roles.canOpenPage(page.href, [role]) && !tours.tourForPath(page.href).noShell));
  }
  // The brand page checks the administrator role itself.
  assert.ok(tours.stepsFor(tours.tourForPath('/admin/brand'), ['incident_operator']).every(step => step.id === 'refusal'));
  assert.ok(tours.stepsFor(tours.tourForPath('/admin/brand'), ['platform_admin']).some(step => step.id === 'name'));
});

test('the Welcome tour auto-starts at most once per browser', () => {
  const fresh = { done: [], dismissed: [], all: null }, ok = { authenticated: true, hasRoles: true, pathname: '/' };
  assert.equal(tours.shouldAutoStartWelcome(fresh, ok), true, 'fresh state starts it');
  // The provider records "dismissed" the moment it starts, so any later page or reload does not start it again.
  assert.equal(tours.shouldAutoStartWelcome({ ...fresh, dismissed: ['welcome'] }, ok), false, 'after it began');
  assert.equal(tours.shouldAutoStartWelcome({ ...fresh, done: ['welcome'] }, ok), false, 'after done');
  assert.equal(tours.shouldAutoStartWelcome(fresh, { ...ok, authenticated: false }), false, 'signed out');
  assert.equal(tours.shouldAutoStartWelcome(fresh, { ...ok, hasRoles: false }), false, 'role not known yet');
  for (const pathname of ['/welcome', '/sign-in', '/alert-journey']) assert.equal(tours.shouldAutoStartWelcome(fresh, { ...ok, pathname }), false, pathname);
  assert.equal(tours.shouldAutoStartWelcome({ ...fresh, all: { active: true } }, ok), false, 'during an all-pages walk');
  const provider = read('components/tour/tour-provider.tsx');
  assert.match(provider, /markTourDismissed\(WELCOME_TOUR_ID\);\s*begin\(WELCOME_TOUR_ID/);
  assert.match(provider, /run\.tourId === WELCOME_TOUR_ID\) markTourDismissed/);
});

test('role filtering and role-specific bodies follow the role matrix', () => {
  const approvals = tours.tourForPath('/approvals');
  const maker = tours.stepsFor(approvals, ['incident_operator']), checker = tours.stepsFor(approvals, ['incident_checker']);
  assert.ok(maker.some(step => step.id === 'create'));
  assert.ok(!checker.some(step => step.id === 'create'), 'only makers see the create form');
  assert.match(checker.find(step => step.id === 'purpose').body, /cannot draft or submit/);
  assert.match(maker.find(step => step.id === 'purpose').body, /never approve your own/);
  // The first role in the menu's order of responsibility wins when someone holds several.
  const both = tours.stepsFor(approvals, ['incident_operator', 'incident_checker']).find(step => step.id === 'purpose').body;
  assert.equal(both, checker.find(step => step.id === 'purpose').body);
  // Roles still unknown (session loading) see the normal steps.
  assert.ok(tours.stepsFor(approvals, null).some(step => step.id === 'create' || step.id === 'queue'));
});

test('the closing step of every page is the page help text word for word', () => {
  const help = load('lib/page-help.ts').PAGE_HELP;
  for (const tour of tours.TOURS) {
    if (!tour.route) continue;
    const never = tour.steps.find(step => step.id === 'never');
    if (!never) { assert.ok(tour.noShell, `${tour.id} has no closing step`); continue; }
    const route = tour.route === '/incidents/[id]' ? '/incidents' : tour.route;
    assert.ok(never.body.startsWith(help[route].never), `${tour.id}: closing step differs from page-help`);
  }
});

test('no step text promises a real warning, dispatch or accuracy, and none shows a raw code or UUID', () => {
  const FORBIDDEN = [/accuracy/i, /guarantee/i, /sends? (a )?(public )?warning/i, /dispatch(es|ed)? (a|the) team/i];
  const NEGATION = /\b(never|no|not|nothing|nobody|without|cannot|neither)\b/i;
  for (const tour of tours.TOURS) for (const text of everyText(tour)) {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      for (const pattern of FORBIDDEN) if (pattern.test(sentence)) assert.match(sentence, NEGATION, `${tour.id}: "${sentence}" matches ${pattern} without a negation`);
    }
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(text), `${tour.id}: UUID in "${text}"`);
    assert.ok(!/\b[a-z]+_[a-z_]+\b/.test(text), `${tour.id}: raw code in "${text}"`);
    assert.ok(!/\bAEGIS\b/.test(text), `${tour.id}: old product name in "${text}"`);
  }
});

test('translatable tour text is registered for native review rather than machine translated', () => {
  const pending = read('lib/translations-pending.ts');
  const known = new Set(load('lib/translations.ts').TRANSLATION_ENTRIES.map(entry => entry[0]));
  for (const tour of tours.TOURS) for (const text of [tour.title, ...everyText(tour)]) {
    assert.ok(known.has(text) || pending.includes(JSON.stringify(text)), `not in translations-pending.ts (run node scripts/list-pending-translations.cjs): ${text.slice(0, 60)}`);
  }
});

test('the account menu offers the three tour actions, hints and what is new, and sign-out clears the walk position', () => {
  const menu = read('components/operator-auth.tsx');
  for (const text of ['Tour this page', 'Restart welcome tour', 'Tour all my pages', 'Show tour hints', "What's new"]) assert.ok(menu.includes(`t("${text}")`), text);
  for (const call of ['tour.startPage()', 'tour.startWelcome()', 'tour.startAll()']) assert.ok(menu.includes(call), call);
  assert.match(menu, /async function signOut\(\) \{[^}]*clearTourProgress\(\)/s);
  const shell = read('components/app-shell.tsx');
  assert.ok(shell.includes('<TourProvider'));
  assert.ok(shell.includes('<PageTourAction'));
});

// ---- the flag store ----
function freshStore(windowObject) {
  global.window = windowObject;
  const store = load('lib/tour-storage.ts');
  store.resetTourStateForTests();
  return store;
}
const ALLOWED_FIELDS = ['v', 'content', 'done', 'dismissed', 'hintSeen', 'hints', 'all', 'whatsNewSeen'].sort();

test('the storage wrapper never throws when localStorage is unavailable and falls back to memory', () => {
  const blocked = { get localStorage() { throw new Error('blocked'); } };
  const store = freshStore(blocked);
  assert.doesNotThrow(() => {
    store.readTourState(); store.markTourDone('welcome'); store.markTourDismissed('page:/about'); store.markHintSeen('page:/about');
    store.setTourHints(false); store.setAllPagesProgress({ route: '/about', index: 2, active: true }); store.markWhatsNewSeen('0.3.0'); store.clearTourProgress();
  });
  const state = store.readTourState();
  assert.deepEqual(state.done, ['welcome']); assert.equal(state.hints, false); assert.equal(state.all, null); assert.equal(state.whatsNewSeen, '0.3.0');
  const throwing = { localStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } };
  const second = freshStore(throwing);
  assert.doesNotThrow(() => { second.markTourDone('a'); second.setTourHints(true); second.readTourState(); });
  assert.deepEqual(freshStore(undefined).readTourState().done, []);
  delete global.window;
});

test('the storage wrapper uses one key in its own namespace and stores flags only', () => {
  const written = new Map();
  const store = freshStore({ localStorage: { getItem: key => written.get(key) ?? null, setItem: (key, value) => written.set(key, value), removeItem: key => written.delete(key) } });
  store.markTourDone('welcome'); store.markHintSeen('page:/incidents'); store.setAllPagesProgress({ route: '/audit', index: 4, active: false }); store.markWhatsNewSeen('0.3.0'); store.setTourHints(false);
  assert.deepEqual([...written.keys()], [store.TOUR_STORAGE_KEY]);
  assert.match(store.TOUR_STORAGE_KEY, /^aegis-tours$/);
  const saved = JSON.parse(written.get(store.TOUR_STORAGE_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ALLOWED_FIELDS);
  assert.deepEqual(Object.keys(saved.all).sort(), ['active', 'index', 'route']);
  // Sign-out forgets the walk position only.
  store.clearTourProgress();
  assert.equal(JSON.parse(written.get(store.TOUR_STORAGE_KEY)).all, null);
  assert.deepEqual(JSON.parse(written.get(store.TOUR_STORAGE_KEY)).done, ['welcome']);
  delete global.window;
});

test('stored data is re-validated: unknown fields, identity-looking data and bad values are dropped', () => {
  const store = freshStore(undefined);
  const dirty = store.cleanTourState({ v: 1, content: 1, done: ['welcome', 42, 'has space and <script>'], dismissed: 'x', subject: 'abc', roles: ['platform_admin'], token: 'secret',
    hints: 'maybe', all: { route: '/about', index: -3, active: true, name: 'A Person' }, whatsNewSeen: 'latest', hintSeen: ['page:/about'] });
  assert.deepEqual(Object.keys(dirty).sort(), ALLOWED_FIELDS);
  assert.deepEqual(dirty.done, ['welcome']); assert.deepEqual(dirty.dismissed, []); assert.equal(dirty.all, null); assert.equal(dirty.whatsNewSeen, null); assert.equal(dirty.hints, true);
  // A different content version offers the page hints again but keeps the rest.
  const older = store.cleanTourState({ content: 0, done: ['welcome'], hintSeen: ['page:/about'], hints: false });
  assert.deepEqual(older.hintSeen, []); assert.deepEqual(older.done, ['welcome']); assert.equal(older.hints, false);
  assert.ok(!JSON.stringify(dirty).includes('secret'));
});

test('the tour hooks respect the rules in AGENTS.md: no new dependency, no inline script, labels through t()', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['react-joyride'], undefined);
  for (const file of sources('components/tour')) {
    const text = read(file);
    assert.ok(!/dangerouslySetInnerHTML|<script|eval\(|new Function/.test(text), `${file}: forbidden construct`);
    assert.ok(!/localStorage|sessionStorage/.test(text), `${file}: storage must go through lib/tour-storage.ts`);
  }
  const overlay = read('components/tour/tour-overlay.tsx');
  for (const text of ['Skip tour', 'Back', 'Next', 'Finish', 'Stop tour', 'Step', 'Page']) assert.ok(overlay.includes(`t("${text}")`), text);
  assert.ok(overlay.includes('role="dialog"') && overlay.includes('aria-labelledby') && overlay.includes('aria-live="polite"'));
  assert.ok(overlay.includes("'Escape'".replace(/'/g, '"')) && overlay.includes('ArrowRight') && overlay.includes('ArrowLeft'));
  const css = read('app/globals.css');
  assert.match(css, /prefers-reduced-motion: no-preference\) \{\s*\.tour-card \{ animation/);
});
