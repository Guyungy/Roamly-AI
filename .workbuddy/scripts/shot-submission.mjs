import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = '/Users/a1/Code/Roamly-AI/.workbuddy/submission';
const LIVE = 'https://roamly-ai-trip-planner.app.workbuddy.host/';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();

// 1) 首页
await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/01-landing.png` });
console.log('shot landing');

// 2) 生成一次真实行程
await page.locator('input[placeholder*="城市"]').first().fill('杭州');
const set = async (ph, v) => {
  const i = page.locator(`input[placeholder*="${ph}"]`).first();
  await i.click(); await page.waitForTimeout(600); await i.fill(v); await i.press('Enter'); await page.waitForTimeout(400);
};
await set('出发日', '2026-10-05');
await set('返程日', '2026-10-07');
await page.locator('button:has-text("开始规划旅程")').first().click();
for (let i = 0; i < 45; i++) { await page.waitForTimeout(4000); if (await page.locator('#days').count().catch(() => 0)) break; }
await page.waitForTimeout(6000);

const imgs = await page.evaluate(() => Array.from(document.querySelectorAll('img')).slice(0, 4).map(i => ({
  alt: (i.alt || '').slice(0, 16), srcLen: (i.src || '').length, nw: i.naturalWidth, nh: i.naturalHeight
})));
console.log('IMG CHECK:', JSON.stringify(imgs));

// 3) 行程概览（顶部）
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/02-overview.png` });
console.log('shot overview');

// 4) 每日行程 —— Day 1 卡片
const day1 = page.locator('#days .day-card, #days .day-section, #days > *').first();
try {
  await page.locator('#days').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const dh = await page.locator('#days > *').first().boundingBox();
  if (dh) {
    await page.screenshot({ path: `${OUT}/03-day1.png`, clip: { x: 40, y: Math.max(0, dh.y + 120), width: 1360, height: Math.min(1150, dh.height) } });
    console.log('shot day1', JSON.stringify(dh));
  }
} catch (e) { console.log('day1 fail', e.message.slice(0, 100)); }

// 5) 预算明细
try {
  await page.locator('#budget').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-budget.png` });
  console.log('shot budget');
} catch (e) { console.log('budget fail', e.message.slice(0, 100)); }

// 6) 天气
try {
  await page.locator('#weather').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/05-weather.png` });
  console.log('shot weather');
} catch (e) { console.log('weather fail', e.message.slice(0, 100)); }

await browser.close();
console.log('done');
