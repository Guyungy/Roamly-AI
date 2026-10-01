import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = '/Users/a1/Code/Roamly-AI/.workbuddy/submission';
const LIVE = 'https://roamly-ai-trip-planner.app.workbuddy.host/';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.locator('input[placeholder*="城市"]').first().fill('杭州');
const set = async (ph, v) => { const i = page.locator(`input[placeholder*="${ph}"]`).first(); await i.click(); await page.waitForTimeout(600); await i.fill(v); await i.press('Enter'); await page.waitForTimeout(400); };
await set('出发日', '2026-10-05'); await set('返程日', '2026-10-07');
await page.locator('button:has-text("开始规划旅程")').first().click();
for (let i = 0; i < 45; i++) { await page.waitForTimeout(4000); if (await page.locator('#days').count().catch(() => 0)) break; }
await page.waitForTimeout(7000);

// 定位 Day 1 区块的起点，再把视口摆到「每日行程标题 + Day1 头部」位置
const top = await page.evaluate(() => {
  const el = document.getElementById('days');
  const r = el.getBoundingClientRect();
  return Math.round(window.scrollY + r.top);
});
await page.evaluate((y) => window.scrollTo(0, y - 60), top);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/03-day1.png` });
console.log('day1 viewport shot at', top);
await browser.close();
