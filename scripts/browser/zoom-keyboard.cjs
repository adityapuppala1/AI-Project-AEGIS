// Read-only automated proxy for DEMO_REHEARSAL A1/A2/A5: 200%-zoom reflow and
// keyboard behavior of the navigation drawer. GET navigation only; no writes.
// Supporting evidence only; it is not human or screen-reader acceptance.
const { createRequire } = require('node:module');
const path = require('node:path');
const { chromium } = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'))('playwright');

const BASE = 'http://localhost:3000';
const CASE = '22222222-2222-4222-8222-222222222222';
const ROUTES = ['/', '/demo', '/incidents', '/incidents/' + CASE, '/sources', '/ingestion', '/model-lab',
  '/approvals', '/department-tasks', '/agency-sync', '/audit', '/playbooks', '/admin', '/help'];
// 1280x800 and 1440x900 windows at 200% zoom give these CSS viewports.
const ZOOMED = [{ width: 640, height: 400 }, { width: 720, height: 450 }];
const checks = [], failures = [], errors = [];
const record = (ok, pass, fail) => (ok ? checks.push(pass) : failures.push(fail));

const focusedName = page => page.evaluate(() => {
  const el = document.activeElement;
  return el ? (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 40) : '';
});
const railInert = page => page.evaluate(() => document.querySelector('aside.command-rail').inert);
const railOffscreen = page => page.evaluate(() => document.querySelector('aside.command-rail').getBoundingClientRect().right <= 0);

async function tabStops(page, count) {
  const stops = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const b = el.getBoundingClientRect();
      return {
        name: (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 40),
        visible: b.width > 0 && b.height > 0 && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight,
      };
    }));
  }
  return stops.filter(Boolean);
}

async function openRoute(page, route) {
  const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  if (response.status() !== 200) throw new Error(`${route} HTTP ${response.status()}`);
  await page.locator('h1').first().waitFor();
  await page.waitForTimeout(500);
}

async function checkReflow(page, tag) {
  for (const route of ROUTES) {
    await openRoute(page, route);
    const r = await page.evaluate(() => {
      const scrollsX = el => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
      const offscreen = [];
      for (const el of document.querySelectorAll('main a[href], main button, main input, main select, main textarea, .command-topbar button')) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden' || scrollsX(el)) continue;
        if (b.left < -1 || b.right > innerWidth + 1) offscreen.push((el.getAttribute('aria-label') || el.innerText || el.tagName).trim().slice(0, 40));
      }
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, offscreen, appError: document.body.innerText.includes('Application error:') };
    });
    const problems = [r.appError && 'application error', r.overflow && 'page-level horizontal overflow',
      r.offscreen.length && `controls outside viewport: ${r.offscreen.slice(0, 5).join(' | ')}`].filter(Boolean);
    record(!problems.length, `${tag} reflow ${route}`, `${tag} ${route}: ${problems.join('; ')}`);
  }
}

async function checkClosedDrawer(page, tag) {
  await openRoute(page, '/sources');
  const hidden = (await tabStops(page, 30)).filter(s => !s.visible).map(s => s.name);
  record(!hidden.length, `${tag} 30 Tab stops visible with drawer closed`,
    `${tag} ${hidden.length}/30 Tab stops invisible: ${[...new Set(hidden)].slice(0, 6).join(' | ')}`);
}

async function checkOpenDrawer(page, tag) {
  await openRoute(page, '/sources');
  const open = page.getByRole('button', { name: 'Open navigation' });
  const link = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Model Evaluation Lab' });
  await open.click();
  await link.waitFor({ state: 'visible' });
  const onOpen = await focusedName(page);
  record(onOpen === 'Close menu', `${tag} focus enters drawer on open`, `${tag} focus on open is "${onOpen}", expected Close menu`);
  const stops = await tabStops(page, 5);
  record(stops.every(s => s.visible), `${tag} open drawer Tab stops visible`, `${tag} invisible Tab stop inside open drawer`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await railOffscreen(page), afterEscape = await focusedName(page);
  record(closed, `${tag} Escape closes drawer`, `${tag} Escape does not close navigation`);
  if (!closed) { await page.getByRole('button', { name: 'Close menu' }).click(); await page.waitForTimeout(300); }
  else record(afterEscape === 'Open navigation', `${tag} focus returns to menu control`, `${tag} focus after Escape is "${afterEscape}"`);

  await open.click();
  await link.waitFor({ state: 'visible' });
  await link.click();
  await page.waitForURL('**/model-lab');
  await page.waitForTimeout(400);
  record(await railInert(page), `${tag} drawer inert after navigation`, `${tag} drawer still exposed after navigation`);
}

async function checkDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(`1440 ${e.message}`));
  await openRoute(page, '/sources');
  const visible = !(await railInert(page));
  const stops = await tabStops(page, 8);
  const reached = stops.some(s => s.name === 'Command Center' && s.visible);
  record(visible && reached && stops.every(s => s.visible), '1440 persistent rail visible and tabbable',
    `1440 rail visible=${visible}, Command Center reached=${reached}, all stops visible=${stops.every(s => s.visible)}`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const viewport of ZOOMED) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      await context.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
      const page = await context.newPage();
      const tag = `${viewport.width}x${viewport.height}@2x`;
      page.on('pageerror', e => errors.push(`${tag} ${e.message}`));
      await checkReflow(page, tag);
      await checkClosedDrawer(page, tag);
      await checkOpenDrawer(page, tag);
      await context.close();
    }
    await checkDesktop(browser);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ passed: checks.length, checks, failures, errors }, null, 2));
  if (failures.length || errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
