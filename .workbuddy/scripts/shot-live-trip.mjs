import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = '/Users/a1/Code/Roamly-AI/.workbuddy/scripts/shots';
const LIVE = 'https://roamly-ai-trip-planner.app.workbuddy.host/';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 200)); });

await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// 城市
await page.locator('input[placeholder*="城市"]').first().fill('杭州');
// 日期：点击后用面板选择
async function setDate(ph, y, m, d) {
  const inp = page.locator(`input[placeholder*="${ph}"]`).first();
  await inp.click();
  await page.waitForTimeout(800);
  await inp.fill(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  await inp.press('Enter');
  await page.waitForTimeout(600);
}
await setDate('出发日', 2026, 10, 5);
await setDate('返程日', 2026, 10, 7);
await page.waitForTimeout(800);

const vals = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ ph: i.placeholder, v: i.value })).filter(x => x.v));
console.log('FORM VALUES:', JSON.stringify(vals));

await page.locator('button:has-text("开始规划旅程")').first().click();
console.log('submitted, waiting for result...');

for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(5000);
  const url = page.url();
  const hasDays = await page.locator('#days').count().catch(() => 0);
  const bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
  console.log(`t=${(i+1)*5}s url=${url} days=${hasDays} bodyLen=${bodyLen}`);
  if (hasDays > 0 && bodyLen > 3000) break;
}
await page.waitForTimeout(4000);
console.log('FINAL URL:', page.url());
await page.screenshot({ path: `${OUT}/live-overview.png` });
await page.screenshot({ path: `${OUT}/live-full.png`, fullPage: true });
await browser.close();
