import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = '/Users/a1/Code/Roamly-AI/.workbuddy/scripts/shots';
const LIVE = 'https://roamly-ai-trip-planner.app.workbuddy.host/';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();

await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

await page.locator('input[placeholder*="城市"]').first().fill('杭州');
async function setDate(ph, y, m, d) {
  const inp = page.locator(`input[placeholder*="${ph}"]`).first();
  await inp.click();
  await page.waitForTimeout(700);
  await inp.fill(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  await inp.press('Enter');
  await page.waitForTimeout(500);
}
await setDate('出发日', 2026, 10, 5);
await setDate('返程日', 2026, 10, 7);
await page.waitForTimeout(500);
await page.locator('button:has-text("开始规划旅程")').first().click();
console.log('submitted');

for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(5000);
  const has = await page.locator('#days').count().catch(() => 0);
  if (has) break;
}
await page.waitForTimeout(6000);
console.log('URL:', page.url());

// 逐区块截图（先滚到锚点，再截视口 + 该区块）
const sections = ['overview', 'budget', 'map', 'days', 'weather'];
for (const id of sections) {
  const el = page.locator(`#${id}`);
  if (!(await el.count())) { console.log('missing', id); continue; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  try {
    await el.screenshot({ path: `${OUT}/sec-${id}.png` });
    console.log('shot', id);
  } catch (e) { console.log('fail', id, e.message.slice(0, 80)); }
}
// 首屏（导航 + 概览开头）
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/sec-top.png` });
console.log('done');
await browser.close();
