// Accessibility, keyboard and reduced-motion checks for the opt-in public pages.
// Requires the stack to run with: scripts/start-windows.ps1 -NoBuild -PublicEarth -PublicIntake
// Only localhost traffic is allowed and the intake POST is mocked, so nothing is written to the database.
const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const qaRequire = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'));
const { chromium } = qaRequire('playwright');
const axePath = qaRequire.resolve('axe-core/axe.min.js');
const BASE = 'http://localhost:3000';
const CASE = '22222222-2222-4222-8222-222222222222';
const PAGES = ['/earth-watch', '/public-intake', '/response-teams'];

async function newContext(browser, viewport, extra = {}) {
  const context = await browser.newContext({ viewport, ...extra });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  return context;
}
const results = [];
const pass = message => { results.push(message); console.log('PASS ' + message); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // 1. axe (WCAG 2.1 AA), both themes, mobile and desktop, plus overflow and page errors.
    for (const width of [390, 1440]) {
      const context = await newContext(browser, { width, height: 900 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of PAGES) {
        const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, route + ' status');
        await page.locator('h1').first().waitFor();
        await page.waitForTimeout(1500);
        assert.equal(await page.getByText('Application error', { exact: false }).count(), 0, route + ' application error');
        await page.addScriptTag({ path: axePath });
        for (const theme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme: theme });
          await page.waitForTimeout(250);
          const report = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          assert.deepEqual(report.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target.join(' ')).slice(0, 3) })), [], `${route} ${theme} ${width}px axe`);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} ${width}px overflow`);
      }
      assert.deepEqual(errors, [], 'page errors at ' + width);
      pass(`axe WCAG 2.1 AA light+dark, no overflow, no page errors at ${width}px on ${PAGES.join(', ')}`);
      await context.close();
    }

    // 2. Keyboard-only completion of the intake form (POST mocked: no database write).
    {
      const context = await newContext(browser, { width: 1440, height: 1000 });
      let posts = 0;
      await context.route('**/api/public-intake', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        posts += 1;
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
          classification: 'public_unverified_intake', status: 'quarantined', duplicate: false,
          id: '11111111-1111-4111-8111-111111111111', submitted_at: '2026-11-02T10:00:00+00:00', message: 'ok' }) });
      });
      const page = await context.newPage();
      await page.goto(BASE + '/public-intake');
      await page.getByRole('button', { name: 'Send to quarantine' }).waitFor();
      // Submit empty by keyboard: errors must appear and nothing may be posted.
      await page.getByRole('button', { name: 'Send to quarantine' }).focus();
      await page.keyboard.press('Enter');
      await page.getByText('Please fix the highlighted fields.').waitFor();
      assert.equal(posts, 0, 'invalid form must not post');
      // Reach the radio group, check the focus indicator, choose with arrow keys, then fill the fields.
      await page.getByRole('radio', { name: /Flood/ }).focus();
      const ring = await page.evaluate(() => { const label = document.activeElement.closest('label'); const style = getComputedStyle(label); return { outline: style.outlineStyle, shadow: style.boxShadow }; });
      assert.ok(ring.outline !== 'none' || ring.shadow !== 'none', 'focused hazard option shows a visible focus indicator ' + JSON.stringify(ring));
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('radio', { name: /Waterlogging/ }).isChecked(), true, 'arrow keys move the radio selection');
      await page.getByRole('textbox', { name: 'Short title' }).focus();
      await page.keyboard.type('Water on the road near the market');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Water is knee deep near the market and rising slowly since morning.');
      await page.getByRole('button', { name: 'Send to quarantine' }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Received for human review' }).waitFor();
      assert.equal(posts, 1, 'exactly one mocked POST');
      pass('keyboard-only intake: empty submit blocked, visible focus on options, arrow-key selection, typed fields, Enter submits (mocked)');
      await context.close();
    }

    // 3. Keyboard operation of Earth Watch controls.
    {
      const context = await newContext(browser, { width: 1440, height: 1000 });
      const page = await context.newPage();
      await page.goto(BASE + '/earth-watch');
      const globalButton = page.getByRole('button', { name: 'Global', exact: true });
      await globalButton.waitFor();
      await globalButton.focus();
      await page.keyboard.press('Enter');
      assert.equal(await globalButton.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'India & neighbours', exact: true }).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: 'Refresh feeds' }).focus();
      await page.keyboard.press('Enter');
      await page.getByText(/Next refresh in/).waitFor();
      pass('keyboard: Earth Watch region toggle (aria-pressed) and Refresh feeds work with Enter');
      await context.close();
    }

    // 3b. Radar dots and table: a mocked public quake near the Hyderabad case must render.
    {
      const context = await newContext(browser, { width: 1440, height: 1000 });
      const quake = { classification: 'public_reference', feed: 'earthquakes', fetched_at: new Date().toISOString(), stale: false, warning: null,
        attribution: 'USGS', cache_seconds: 300, limitations: [], records: [
          { id: 'usgs-mock1', source: 'USGS', category: 'earthquakes', kind: 'Earthquake', title: 'M4.2 · mock 60 km north of the case',
            observed_at: '2026-11-02T01:00:00+00:00', updated_at: null, lat: 17.95, lon: 78.45, magnitude: 4.2, status: 'reviewed', url: null }] };
      await context.route('**/api/earth-watch/earthquakes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quake) }));
      await context.route('**/api/earth-watch/events', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...quake, feed: 'events', records: [] }) }));
      const page = await context.newPage();
      await page.goto(BASE + '/incidents/' + CASE);
      const panel = page.getByLabel('Public signals near this case');
      await panel.getByText('1 within 300 km').waitFor({ timeout: 30000 });
      const row = panel.getByRole('row', { name: /mock 60 km north/ });
      await row.waitFor();
      assert.match(await row.innerText(), /6\d km/, 'distance is about 60 km');
      assert.match(await row.innerText(), /\bN\b|NNE|NNW/, 'direction is roughly north');
      assert.equal(await panel.locator('svg[role="img"] g.reveal-in circle').count(), 2, 'one signal draws a halo and a dot');
      await panel.getByRole('button', { name: '100 km' }).click();
      await panel.getByText('1 within 100 km').waitFor();
      await panel.getByRole('button', { name: '1000 km' }).click();
      await panel.getByText('1 within 1000 km').waitFor();
      pass('radar renders a mocked nearby quake (about 60 km north) in the plot and table; radius buttons filter');
      await context.close();
    }

    // 3c. Command Center telemetry: the chart has a keyboard-operable data-table equivalent.
    {
      const context = await newContext(browser, { width: 1440, height: 1000 });
      const page = await context.newPage();
      await page.goto(BASE + '/');
      const toggle = page.getByRole('button', { name: 'Show data table' });
      await toggle.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Show data table'))?.disabled === false, null, { timeout: 30000 });
      await page.addScriptTag({ path: axePath });
      for (const theme of ['light', 'dark']) {  // the Command Center itself, chart mode (status badges, metrics)
        await page.emulateMedia({ colorScheme: theme });
        const report = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
        assert.deepEqual(report.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target.join(' ')).slice(0, 3) })), [], 'axe on the Command Center in ' + theme);
      }
      await toggle.focus();
      await page.keyboard.press('Enter');
      const table = page.getByRole('table', { name: /Synthetic telemetry values by time/ });
      await table.waitFor();
      assert.ok((await table.locator('tbody tr').count()) >= 12, 'one row per telemetry point');
      assert.equal(await page.getByRole('button', { name: 'Show chart' }).getAttribute('aria-pressed'), 'true');
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        const report = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
        assert.deepEqual(report.violations.map(v => v.id), [], 'axe with the telemetry table in ' + theme);
      }
      await page.getByRole('button', { name: 'Show chart' }).click();
      await page.getByRole('button', { name: 'Show data table' }).waitFor();
      assert.equal(await page.getByRole('table', { name: /Synthetic telemetry values by time/ }).count(), 0);
      pass('Command Center telemetry: Enter toggles an accessible data table (12+ rows, axe clean in both themes) and back to the chart');
      await context.close();
    }

    // 3d. Telugu and Hindi: switching, html lang, persistence, axe in each language, and blocked storage.
    {
      const context = await newContext(browser, { width: 1440, height: 1000 });
      const page = await context.newPage();
      await page.goto(BASE + '/public-intake');
      const picker = page.locator('select:has(option[value="te"])');
      await picker.waitFor();
      await page.addScriptTag({ path: axePath });
      const checks = [['te', 'ప్రజా నివేదికలు', 'భూమి పరిశీలన'], ['hi', 'सार्वजनिक रिपोर्ट', 'पृथ्वी निगरानी']];
      for (const [code, title, navLabel] of checks) {
        await picker.selectOption(code);
        await page.getByRole('heading', { name: title, level: 1 }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.lang), code, 'html lang follows the language');
        assert.ok(await page.getByRole('link', { name: navLabel }).count() >= 1, 'translated navigation label ' + navLabel);
        assert.match(await page.locator('main').innerText(), /112/, 'emergency number is shown in ' + code);
        await page.waitForTimeout(1500);  // let the staggered fade-in finish; axe measures mid-fade text as low contrast
        for (const theme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme: theme });
          const report = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          assert.deepEqual(report.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target.join(' ')).slice(0, 3) })), [], `axe in ${code} ${theme}`);
        }
        await page.reload();
        await page.getByRole('heading', { name: title, level: 1 }).waitFor();   // preference persisted
        assert.equal(await page.evaluate(() => document.documentElement.lang), code, 'language persists across reload');
        await page.addScriptTag({ path: axePath });
      }
      await picker.selectOption('en');
      await page.getByRole('heading', { name: 'Public Intake', level: 1 }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
      await context.close();
      const blocked = await newContext(browser, { width: 1440, height: 1000 });
      await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
      const lone = await blocked.newPage();
      const errors = [];
      lone.on('pageerror', error => errors.push(error.message));
      await lone.goto(BASE + '/public-intake');
      await lone.getByRole('heading', { name: 'Public Intake', level: 1 }).waitFor();
      assert.deepEqual(errors, [], 'blocked storage must not break the page');
      await blocked.close();
      pass('Telugu and Hindi: nav, titles and the emergency notice translate, html lang follows, choice persists, axe clean in both themes, blocked storage falls back to English');
    }

    // 4. Reduced motion: decorative animations must stop; with no preference they must run.
    for (const motion of ['reduce', 'no-preference']) {
      const context = await newContext(browser, { width: 1440, height: 1000 }, { reducedMotion: motion });
      const page = await context.newPage();
      await page.goto(BASE + '/incidents/' + CASE);
      await page.locator('.radar-ping').first().waitFor({ state: 'attached', timeout: 30000 });
      const read = selector => page.evaluate(sel => { const style = getComputedStyle(document.querySelector(sel)); return { name: style.animationName, duration: style.animationDuration }; }, selector);
      const sweep = await read('.radar-sweep');
      const ping = await read('.radar-ping');
      await page.goto(BASE + '/earth-watch');
      await page.getByText('Public feeds', { exact: true }).waitFor();
      const dot = await page.evaluate(() => { const style = getComputedStyle(document.querySelector('[aria-label="Feed heartbeat"] span[aria-hidden="true"]')); return { name: style.animationName, duration: style.animationDuration }; });
      if (motion === 'reduce') {
        for (const item of [sweep, ping, dot]) assert.ok(item.name === 'none' || parseFloat(item.duration) < 0.05, 'reduced motion stops animation: ' + JSON.stringify(item));
      } else {
        assert.equal(sweep.name, 'aegis-radar-sweep'); assert.equal(ping.name, 'aegis-radar-ping');
        assert.notEqual(dot.name, 'none');
      }
      pass(`prefers-reduced-motion=${motion}: radar sweep, radar ping and pulse dot ${motion === 'reduce' ? 'are stopped' : 'animate'}`);
      await context.close();
    }
    console.log(JSON.stringify({ ok: true, checks: results.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error.message); process.exit(1); });
