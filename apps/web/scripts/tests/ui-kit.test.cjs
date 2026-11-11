const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = request => request.startsWith('.') ? load(path.posix.join(path.posix.dirname(file), request) + '.ts') : require(request);
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}
const kit = load('components/ui/helpers.ts');
const tr = load('lib/translations.ts');
const NOW = Date.parse('2026-11-02T12:00:00Z');
const ago = minutes => new Date(NOW - minutes * 60_000).toISOString();

test('relativeAge uses the shared minute/hour/day bands and rejects bad input', () => {
  assert.deepEqual(kit.relativeAge(ago(0), NOW), { n: 0, unit: 'now' });
  assert.deepEqual(kit.relativeAge(ago(45), NOW), { n: 45, unit: 'min' });
  assert.deepEqual(kit.relativeAge(ago(180), NOW), { n: 3, unit: 'hr' });
  assert.deepEqual(kit.relativeAge(ago(3 * 1440), NOW), { n: 3, unit: 'days' });
  assert.deepEqual(kit.relativeAge(ago(-30), NOW), { n: 0, unit: 'now' }, 'future times clamp to now');
  for (const bad of [null, undefined, '', 'not a date']) assert.equal(kit.relativeAge(bad, NOW), null);
});

test('stale threshold is honest: unknown time is stale, boundary is exclusive', () => {
  assert.equal(kit.isStaleAge(ago(60), NOW), false);
  assert.equal(kit.isStaleAge(ago(48 * 60), NOW), false);
  assert.equal(kit.isStaleAge(ago(48 * 60 + 1), NOW), true);
  assert.equal(kit.isStaleAge(ago(61), NOW, 1), true);
  assert.equal(kit.isStaleAge(ago(59), NOW, 1), false);
  assert.equal(kit.isStaleAge(null, NOW), true);
  assert.equal(kit.isStaleAge('garbage', NOW), true);
});

test('formatAbsolute is deterministic UTC text', () => {
  assert.equal(kit.formatAbsolute('2026-11-02T12:34:56Z'), '2026-11-02 12:34 UTC');
  assert.equal(kit.formatAbsolute(null), '');
});

test('every tone has an icon name, pill classes and a bar colour', () => {
  assert.deepEqual([...kit.TONES], ['neutral', 'info', 'success', 'warning', 'danger', 'sample']);
  const status = fs.readFileSync(path.join(root, 'components/ui/status.tsx'), 'utf8');
  for (const tone of kit.TONES) {
    const icon = kit.TONE_ICON_NAME[tone];
    assert.ok(icon, tone);
    assert.ok(kit.TONE_CLASS[tone].includes('ring-'), tone);
    assert.ok(kit.TONE_BAR_CLASS[tone], tone);
    assert.ok(status.includes(icon.includes('-') ? `"${icon}"` : icon), 'status.tsx maps icon ' + icon);
  }
  assert.equal(new Set(Object.values(kit.TONE_ICON_NAME)).size, kit.TONES.length, 'icons are distinct so tone is not colour-only');
});

test('roving focus keys wrap and respect orientation', () => {
  assert.equal(kit.nextIndex('ArrowRight', 2, 3), 0);
  assert.equal(kit.nextIndex('ArrowLeft', 0, 3), 2);
  assert.equal(kit.nextIndex('Home', 2, 4), 0);
  assert.equal(kit.nextIndex('End', 0, 4), 3);
  assert.equal(kit.nextIndex('ArrowDown', 0, 3), null);
  assert.equal(kit.nextIndex('ArrowDown', 0, 3, 'both'), 1);
  assert.equal(kit.nextIndex('ArrowUp', 0, 3, 'vertical'), 2);
  assert.equal(kit.nextIndex('a', 0, 3), null);
  assert.equal(kit.nextIndex('Home', 0, 0), null);
});

test('sort helpers cycle asc, desc, none and map to aria-sort', () => {
  assert.equal(kit.nextSort(null), 'asc'); assert.equal(kit.nextSort('asc'), 'desc'); assert.equal(kit.nextSort('desc'), null);
  assert.equal(kit.ariaSort('asc'), 'ascending'); assert.equal(kit.ariaSort('desc'), 'descending'); assert.equal(kit.ariaSort(null), 'none');
  assert.equal(kit.clamp01(2), 1); assert.equal(kit.clamp01(-1), 0); assert.equal(kit.clamp01(NaN), 0);
});

test('every literal t("...") in components/ui is translated or registered as pending native review; dynamic kit words are translated', () => {
  const reviewed = new Set(tr.TRANSLATION_ENTRIES.map(entry => entry[0]));
  const known = new Set([...reviewed, ...load('lib/translations-pending.ts').PENDING_NATIVE_REVIEW]);
  const dir = path.join(root, 'components/ui');
  let checked = 0;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.tsx'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of source.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)) {
      const text = JSON.parse('"' + match[1] + '"'); checked += 1;
      assert.ok(known.has(text), `components/ui/${file}: no translation for "${text}"`);
    }
  }
  assert.ok(checked >= 10, 'found ' + checked);
  // Passed through t(variable): step statuses and age units.
  for (const word of [...kit.STEP_STATUSES, 'min', 'hr', 'days']) assert.ok(reviewed.has(word), 'missing dynamic translation: ' + word);
});

test('components/ui is exported from the index and has no raw hex colours', () => {
  const dir = path.join(root, 'components/ui');
  const index = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
  for (const name of ['PageHeader', 'StatTile', 'StatStrip', 'Panel', 'EmptyState', 'ErrorState', 'Skeleton', 'SkeletonRows', 'SkeletonCards', 'StatusPill', 'DataFreshness', 'SegmentedControl', 'FilterChips', 'SearchField', 'SortableHeader', 'ResponsiveTable', 'Stepper', 'KeyValueList', 'CopyButton', 'InlineHelp', 'ToastProvider', 'useToast', 'Tabs', 'TabPanel']) {
    assert.ok(index.includes(name), 'index.ts missing ' + name);
  }
  for (const file of fs.readdirSync(dir)) assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /#[0-9a-fA-F]{6}\b/, file + ' uses a raw hex colour');
});
