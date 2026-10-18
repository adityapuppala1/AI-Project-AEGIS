const { createRequire } = require('node:module');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = createRequire(path.resolve(__dirname, '../../.git/browser-qa/package.json'))('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      for (const theme of ['light', 'dark']) {
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        await page.goto('http://localhost:3000/demo');
        await page.locator('html').waitFor();
        await page.waitForFunction(expected => document.documentElement.classList.contains(expected), theme);

        const state = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const rail = document.querySelector('.command-rail');
          const panel = document.querySelector('.panel');
          return {
            canvas: root.getPropertyValue('--canvas').trim(),
            surface: root.getPropertyValue('--surface').trim(),
            accent: root.getPropertyValue('--accent').trim(),
            signal: root.getPropertyValue('--signal').trim(),
            railImage: rail ? getComputedStyle(rail).backgroundImage : 'none',
            panelRadius: panel ? getComputedStyle(panel).borderRadius : '0px',
            panelBorder: panel ? getComputedStyle(panel).borderTopColor : 'transparent',
            overflow: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        assert.ok(state.canvas && state.surface && state.accent && state.signal);
        assert.notEqual(state.railImage, 'none');
        assert.notEqual(state.panelRadius, '0px');
        assert.notEqual(state.panelBorder, 'transparent');
        assert.equal(state.overflow, false);
      }

      const toggle = page.getByRole('button', { name: /Switch to (light|dark) theme/ });
      const before = await page.locator('html').getAttribute('class');
      await toggle.click();
      await page.waitForFunction(previous => document.documentElement.className !== previous, before);
      assert.notEqual(await page.locator('html').getAttribute('class'), before);
      await page.goto('http://localhost:3000/');
      assert.equal(await page.getByRole('navigation', { name: 'Primary navigation' }).getByText('Observe', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('region', { name: 'Operator quick actions' }).getByRole('link').count(), 4);
      if (width === 390) {
        const metrics = page.getByRole('region', { name: 'Exercise overview metrics' }).locator('article');
        const first = await metrics.nth(0).boundingBox();
        const second = await metrics.nth(1).boundingBox();
        assert.ok(first && second && Math.abs(first.y - second.y) < 2, 'mobile metrics must form a two-column scan row');
        await page.goto('http://localhost:3000/demo');
        const stepNav = page.getByRole('navigation', { name: 'Exercise demo steps' });
        const stageButtons = stepNav.getByRole('button');
        const firstStage = await stageButtons.nth(0).boundingBox();
        const secondStage = await stageButtons.nth(1).boundingBox();
        assert.ok(firstStage && secondStage && Math.abs(firstStage.y - secondStage.y) < 2, 'mobile journey stages must use a horizontal selector');
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS operations graphite themes at ${width}px: light/dark hierarchy, toggle, no overflow/page errors`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
