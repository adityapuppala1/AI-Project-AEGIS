// Core Web Vitals check (lab): LCP and CLS on the key pages, and an INP proxy from real interactions.
// Read-only. Budgets are the "good" thresholds: LCP <= 2500 ms, CLS <= 0.1, interaction latency <= 200 ms.
// A 4x CPU slowdown pass is reported for information. Lab numbers are not field data and are not a capacity claim.
const { createRequire } = require('node:module');
const path = require('node:path');
const qaRequire = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'));
const { chromium } = qaRequire('playwright');
const BASE = 'http://localhost:3000';
const CASE = '22222222-2222-4222-8222-222222222222';
const PAGES = ['/', '/demo', '/incidents', '/incidents/' + CASE, '/sources', '/earth-watch', '/public-intake', '/response-teams', '/approvals', '/watch', '/admin/connectors'];
const BUDGET = { lcp: 2500, cls: 0.1, interaction: 200 };

const collector = () => {
  window.__vitals = { lcp: 0, cls: 0, worst: 0 };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__vitals.cls += entry.value; })
    .observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.interactionId) window.__vitals.worst = Math.max(window.__vitals.worst, entry.duration); })
    .observe({ type: 'event', durationThreshold: 16, buffered: true });
};

async function measure(browser, cpuRate) {
  const rows = [];
  for (const route of PAGES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/*', request => ['localhost', '127.0.0.1'].includes(new URL(request.request().url()).hostname) ? request.continue() : request.abort());
    await context.addInitScript(collector);
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    if (cpuRate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(2500);
    // CLS is the page-load value. The interactions below are user-initiated re-layouts (for example a language
    // change) that real input would exclude, so they only contribute to the interaction-latency figure.
    const loadCls = await page.evaluate(() => window.__vitals.cls);
    // Real interactions: keyboard focus movement, a button toggle and a select change where the page has them.
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    const toggle = page.getByRole('button', { name: /Show data table|Refresh|Global/ }).first();
    if (await toggle.count()) { await toggle.click({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(300); }
    const picker = page.locator('select:has(option[value="te"])');
    if (await picker.count()) { await picker.selectOption('hi'); await page.waitForTimeout(400); await picker.selectOption('en'); await page.waitForTimeout(400); }
    await page.waitForTimeout(500);
    const vitals = await page.evaluate(() => window.__vitals);
    rows.push({ route: route.replace(CASE, '<case>'), lcp: Math.round(vitals.lcp), cls: Number(loadCls.toFixed(3)), interaction: Math.round(vitals.worst) });
    await context.close();
  }
  return rows;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let failed = false;
  try {
    for (const rate of [1, 4]) {
      const rows = await measure(browser, rate);
      console.log(`\n== ${rate}x CPU${rate > 1 ? ' (information only)' : ' (enforced budgets: LCP<=2500 ms, CLS<=0.1, interaction<=200 ms)'}`);
      for (const row of rows) {
        const bad = rate === 1 && (row.lcp > BUDGET.lcp || row.cls > BUDGET.cls || row.interaction > BUDGET.interaction);
        if (bad) failed = true;
        console.log(`${bad ? 'FAIL' : 'ok  '} ${row.route.padEnd(18)} LCP ${String(row.lcp).padStart(5)} ms  CLS ${String(row.cls).padStart(6)}  worst interaction ${String(row.interaction).padStart(4)} ms`);
      }
    }
  } finally { await browser.close(); }
  console.log(failed ? '\nFAILED: a page exceeds a Core Web Vitals budget at 1x CPU' : '\nPASSED: all pages within budget at 1x CPU');
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error('FAIL', error.message); process.exit(1); });
