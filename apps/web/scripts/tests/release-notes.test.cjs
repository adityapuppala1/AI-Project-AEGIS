// Version and release notes: the version has one source (apps/web/package.json), the newest release matches it, the data
// is well formed, CHANGELOG.md carries every version, the footer shows the version from the single module, and /whats-new
// stays behind the sign-in gate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
const repo = path.join(root, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = request => request.startsWith('.') ? load(path.posix.join(path.posix.dirname(file), request) + '.ts') : require(request);
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}

const notes = load('lib/release-notes.ts');
const pkg = JSON.parse(read('package.json'));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

test('the newest release equals the version in package.json, and package-lock.json agrees', () => {
  assert.equal(notes.RELEASES[0].version, pkg.version);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

test('versions are valid semver and strictly descending', () => {
  for (const release of notes.RELEASES) assert.match(release.version, SEMVER, release.version);
  for (let i = 1; i < notes.RELEASES.length; i++) assert.ok(compare(notes.RELEASES[i - 1].version, notes.RELEASES[i].version) > 0, `${notes.RELEASES[i - 1].version} must be newer than ${notes.RELEASES[i].version}`);
});

test('exactly the newest release is tagged; earlier ones are untagged summaries with a period', () => {
  assert.equal(notes.RELEASES.filter(release => release.tagged).length, 1);
  assert.equal(notes.RELEASES[0].tagged, true);
  for (const release of notes.RELEASES.slice(1)) {
    assert.equal(release.tagged, false, `${release.version} was never tagged`);
    assert.ok(release.period && release.period.length > 4, `${release.version}: needs a period`);
    assert.equal(release.date, undefined, `${release.version}: an untagged summary has no release date`);
  }
  assert.match(fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8'), /0\.3\.0 is the first tagged release/);
  assert.match(read('components/whats-new.tsx'), /first tagged release/);
});

test('every release has a summary and at least one item in a known group, and tagged ones a valid date', () => {
  for (const release of notes.RELEASES) {
    if (release.tagged) {
      assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(!Number.isNaN(Date.parse(release.date + 'T00:00:00Z')), `${release.version}: bad date`);
    }
    assert.ok(release.summary.length > 10);
    assert.ok(release.items.length >= 1, `${release.version}: no items`);
    for (const item of release.items) {
      assert.ok(notes.RELEASE_GROUPS.includes(item.group), `${release.version}: unknown group ${item.group}`);
      assert.ok(item.text.length > 10);
      assert.ok(!/\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/.test(item.text), `${release.version}: looks like a commit hash`);
      assert.ok(!/\bAEGIS\b/.test(item.text), `${release.version}: old product name`);
    }
  }
  assert.ok(notes.RELEASES.every(release => release.items.some(item => item.group === 'New')), 'each version has something new');
});

test('release note text makes no claim of real warnings, dispatch or forecast accuracy', () => {
  const FORBIDDEN = [/accuracy/i, /guarantee/i, /sends? (a )?(public )?warning/i, /dispatch(es|ed)? (a|the) team/i];
  const NEGATION = /\b(never|no|not|nothing|nobody|without|cannot|neither|stay locked|locked)\b/i;
  for (const release of notes.RELEASES) for (const text of [release.summary, ...release.items.map(item => item.text)]) for (const sentence of text.split(/(?<=[.!?])\s+/))
    for (const pattern of FORBIDDEN) if (pattern.test(sentence)) assert.match(sentence, NEGATION, `${release.version}: "${sentence}"`);
});

test('CHANGELOG.md has a heading for every version in the data', () => {
  const changelog = fs.readFileSync(path.join(repo, 'CHANGELOG.md'), 'utf8');
  for (const release of notes.RELEASES) {
    const heading = release.tagged ? release.date : 'Summary of earlier work \\(no tagged release\\)';
    assert.match(changelog, new RegExp(`^## \\[${release.version.replace(/\./g, '\\.')}\\] - ${heading}`, 'm'), `CHANGELOG.md: no heading for ${release.version}`);
    assert.equal(changelog.includes(`releases/tag/v${release.version}`), release.tagged, `CHANGELOG.md: tag link only for tagged ${release.version}`);
  }
});

test('the version comes from one module and the footer no longer hard-codes it', () => {
  const version = read('lib/version.ts');
  assert.ok(!/package\.json/.test(version.replace(/\/\/.*$/gm, '')), 'lib/version.ts must not import package.json (the dependency list would reach the browser)');
  const fallback = /FALLBACK_VERSION = "([^"]+)"/.exec(version)[1];
  assert.equal(fallback, pkg.version, 'FALLBACK_VERSION must equal apps/web/package.json');
  assert.match(read('next.config.ts'), /NEXT_PUBLIC_APP_VERSION: version/);
  assert.equal(load('lib/version.ts').APP_VERSION, pkg.version);
  const shell = read('components/app-shell.tsx');
  assert.ok(!/\bv\d+\.\d+(\.\d+)?\b/.test(shell), 'app-shell.tsx must not contain a literal version');
  assert.ok(shell.includes('APP_VERSION_LABEL') && shell.includes('href="/whats-new"'));
  const tsconfig = JSON.parse(read('tsconfig.json'));
  assert.equal(tsconfig.compilerOptions.resolveJsonModule, true);
});

test('/whats-new is a signed-in page: it is in the menu, has help and is not on the public list', () => {
  const gate = read('lib/session-gate.ts');
  const publicPages = /const PUBLIC_PAGES = new Set\(\[([^\]]*)\]\)/.exec(gate)[1];
  assert.ok(!publicPages.includes('whats-new'));
  assert.ok(!/whats-new/.test(gate), 'lib/session-gate.ts is unchanged by this feature');
  const nav = load('lib/navigation.ts');
  assert.ok(nav.allPages.some(page => page.href === '/whats-new'));
  assert.ok(load('lib/page-help.ts').PAGE_HELP['/whats-new']);
  assert.ok(fs.existsSync(path.join(root, 'app/whats-new/page.tsx')));
  // The page marks the current version as seen, through the flag store only.
  const page = read('components/whats-new.tsx');
  assert.ok(page.includes('markWhatsNewSeen(APP_VERSION)'));
  assert.ok(!/localStorage|sessionStorage/.test(page));
});

test('the pages for release process, README and AGENTS.md describe the same rules', () => {
  const process = fs.readFileSync(path.join(repo, 'docs/RELEASE_PROCESS.md'), 'utf8');
  for (const needle of ['apps/web/package.json', 'lib/release-notes.ts', 'CHANGELOG.md', 'git tag -a', 'no force', 'tours.test.cjs', 'release-notes.test.cjs']) assert.ok(process.toLowerCase().includes(needle.toLowerCase()), `docs/RELEASE_PROCESS.md: ${needle}`);
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  assert.ok(readme.includes('CHANGELOG.md') && readme.includes('docs/RELEASE_PROCESS.md') && readme.includes('/whats-new'));
  const agents = fs.readFileSync(path.join(repo, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('release-notes.test.cjs') && agents.includes('tours.test.cjs'));
});
