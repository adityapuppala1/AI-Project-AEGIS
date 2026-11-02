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
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
  return mod.exports;
}
const tr = load('lib/translations.ts');
const intake = load('lib/public-intake.ts');
const TELUGU = /[ఀ-౿]/, DEVANAGARI = /[ऀ-ॿ]/;

test('every entry has real Telugu and Hindi text, not English left in place', () => {
  for (const [english, te, hi] of tr.TRANSLATION_ENTRIES) {
    assert.ok(english.trim().length > 0);
    assert.match(te, TELUGU, 'Telugu script missing for: ' + english);
    assert.match(hi, DEVANAGARI, 'Devanagari script missing for: ' + english);
    assert.notEqual(te, english); assert.notEqual(hi, english);
  }
});

test('english keys are unique and translations contain no markup or placeholders', () => {
  const keys = tr.TRANSLATION_ENTRIES.map(entry => entry[0]);
  assert.equal(new Set(keys).size, keys.length, 'duplicate English keys');
  for (const entry of tr.TRANSLATION_ENTRIES) for (const text of entry) assert.doesNotMatch(text, /[<>{}]/, text);
});

test('safety-critical wording keeps its anchors in every language', () => {
  const emergency = tr.TRANSLATION_ENTRIES.find(entry => entry[0] === 'In an emergency, call 112 now.');
  assert.match(emergency[1], /112/); assert.match(emergency[2], /112/);
  const footer = tr.TRANSLATION_ENTRIES.find(entry => entry[0].startsWith('Synthetic exercise data.'));
  for (const text of footer.slice(1)) assert.match(text, /NASA\/USGS/);
  const banner = tr.TRANSLATION_ENTRIES.find(entry => entry[0] === 'Public reference data, not an AEGIS assessment.');
  for (const text of banner.slice(1)) assert.match(text, /AEGIS/);
  for (const english of ['Quarantined · not a case', 'stored · read-only · not cases', 'It is unverified, creates no case and notifies no responder.']) {
    assert.ok(tr.TRANSLATION_ENTRIES.some(entry => entry[0] === english), english);
  }
});

test('translate falls back to English for unknown text and for English itself', () => {
  assert.equal(tr.translate('en', 'Command Center'), 'Command Center');
  assert.equal(tr.translate('te', 'Command Center'), 'కమాండ్ సెంటర్');
  assert.equal(tr.translate('hi', 'Command Center'), 'कमांड सेंटर');
  assert.equal(tr.translate('te', 'A string nobody translated'), 'A string nobody translated');
  assert.equal(tr.translate('hi', ''), '');
  assert.equal(tr.translate('hi', '__proto__'), '__proto__');
  assert.equal(tr.translate('te', 'constructor'), 'constructor');
  assert.equal(tr.isLang('te') && tr.isLang('hi') && tr.isLang('en'), true);
  for (const bad of ['fr', '', null, undefined, '__proto__', 42]) assert.equal(tr.isLang(bad), false);
});

test('every navigation label and group in the app shell is translated', () => {
  const shell = fs.readFileSync(path.join(root, 'components/app-shell.tsx'), 'utf8');
  const block = shell.slice(shell.indexOf('const navigation'), shell.indexOf('// Matches Tailwind'));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map(match => match[1]);
  assert.ok(labels.length >= 20, 'found ' + labels.length);
  const known = new Set(tr.TRANSLATION_ENTRIES.map(entry => entry[0]));
  for (const label of labels) assert.ok(known.has(label), 'missing translation for nav label: ' + label);
});

test('every literal t("...") in the translated components has a translation', () => {
  const known = new Set(tr.TRANSLATION_ENTRIES.map(entry => entry[0]));
  const files = ['components/app-shell.tsx', 'components/public-intake.tsx', 'components/earth-watch.tsx', 'components/command-center.tsx', 'components/language-switcher.tsx', 'components/global-search.tsx', 'components/operator-auth.tsx'];
  let checked = 0;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)) {
      const text = JSON.parse('"' + match[1] + '"'); checked += 1;
      assert.ok(known.has(text), `${file}: no translation for "${text}"`);
    }
  }
  assert.ok(checked > 50, 'expected many t() calls, found ' + checked);
});

test('page titles, descriptions, hazard labels, cities and every form validation message are translated', () => {
  const known = new Set(tr.TRANSLATION_ENTRIES.map(entry => entry[0]));
  for (const hazard of intake.HAZARDS) { assert.ok(known.has(hazard.label), hazard.label); assert.ok(known.has(hazard.hint), hazard.hint); }
  for (const place of intake.PRESET_LOCATIONS) assert.ok(known.has(place.label), place.label);
  const bad = { title: 'ab', description: 'short', hazard_type: '', lat: '99', lon: '0' };
  const messages = Object.values(intake.validateDraft(bad));
  messages.push(...Object.values(intake.validateDraft({ title: 'Water on the road', description: 'Call me on 98765 43210 about the water here', hazard_type: 'flood', lat: '17', lon: '78' })));
  assert.ok(messages.length >= 5);
  for (const message of messages) assert.ok(known.has(message), 'untranslated validation message: ' + message);
  for (const text of ['Public Intake', 'Earth Watch', 'Team Availability', 'Command Center']) assert.ok(known.has(text), text);
  const sources = {
    'components/public-intake.tsx': 'A quarantine-only form for unverified public reports.',
    'components/earth-watch.tsx': 'A read-only view of public satellite imagery',
    'components/team-availability.tsx': 'A read-only synthetic view of which fictional desks',
  };
  for (const [file, start] of Object.entries(sources)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.includes(start), file);
    assert.ok([...known].some(entry => entry.startsWith(start)), 'no translated description for ' + file);
  }
});
