// Source-level guards for operator-only pages. They exist because a signed-out visitor used to trigger
// operator-only requests on page load (a 401 logged to the console on every visit), and several pages
// showed copy claiming the identity provider was off even when it was running.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// file -> [operator-only route it requests, pattern proving the request waits for a signed-in session]
const GATED_FETCHES = {
  'components/proactive-scheduler-status.tsx': ['/api/proactive/scheduler', /if \(!signedIn\) return;/],
  'components/shift-handover.tsx': ['/api/handover', /if \(!session\.authenticated\)[\s\S]{0,80}return;/],
  'app/department-tasks/page.tsx': ['/api/department-tasks', /if \(!session\.authenticated\)[\s\S]{0,80}return;/],
};

for (const [file, [route, guard]] of Object.entries(GATED_FETCHES)) {
  test(`${file} waits for a signed-in session before requesting ${route}`, () => {
    const source = read(file);
    assert.ok(source.includes(route), `${file} no longer references ${route}; update this test`);
    assert.match(source, /useOperatorSession\(\)/, `${file} must read the operator session`);
    assert.match(source, guard, `${file} must not fetch operator data while signed out`);
  });
}

test('every operator-gated page shows the shared sign-in prompt instead of a bespoke or broken state', () => {
  for (const file of [
    'components/post-event-learning.tsx', 'components/exercise-drills.tsx', 'components/shift-handover.tsx',
    'components/operator-copilot.tsx', 'app/department-tasks/page.tsx',
  ]) {
    assert.match(read(file), /<SignInRequired session=\{session\}\/>/, `${file} must render <SignInRequired>`);
  }
});

test('the sign-in prompt tells "not set up" apart from "not signed in", and offers the sign-in link', () => {
  const source = read('components/sign-in-required.tsx');
  assert.match(source, /session\.configured/);
  assert.match(source, /Operator sign-in is not set up/);
  assert.match(source, /href="\/api\/auth\/login"/);
});

test('no component claims the identity provider is off in "this checkout" (it is a deployment choice, not a fact)', () => {
  for (const name of fs.readdirSync(path.join(root, 'components')).filter(n => n.endsWith('.tsx'))) {
    assert.doesNotMatch(read('components/' + name), /identity provider is off in this checkout/, name);
  }
});

test('the top bar keeps every control reachable on a 320px phone', () => {
  const shell = read('components/app-shell.tsx');
  // The right-hand cluster must not shrink-wrap its way past the viewport, and the section title (which
  // duplicates the page heading) must yield space instead of squeezing the controls.
  assert.match(shell, /flex shrink-0 items-center gap-1\.5 sm:gap-3/);
  assert.match(shell, /hidden min-w-0 truncate[^"]*min-\[400px\]:block sm:hidden/);
  assert.match(read('components/operator-auth.tsx'), /aria-label="Operator sign in"/);
});
