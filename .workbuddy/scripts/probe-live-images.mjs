import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const LIVE = 'https://roamly-ai-trip-planner.app.workbuddy.host/';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 150)); });

await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
await page.locator('input[placeholder*="城市"]').first().fill('杭州');
const set = async (ph, v) => { const i = page.locator(`input[placeholder*="${ph}"]`).first(); await i.click(); await page.waitForTimeout(600); await i.fill(v); await i.press('Enter'); await page.waitForTimeout(400); };
await set('出发日', '2026-10-05'); await set('返程日', '2026-10-07');
await page.locator('button:has-text("开始规划旅程")').first().click();
for (let i = 0; i < 40; i++) { await page.waitForTimeout(4000); if (await page.locator('#days').count().catch(() => 0)) break; }
await page.waitForTimeout(5000);

const imgs = await page.evaluate(() => Array.from(document.querySelectorAll('img')).slice(0, 10).map(i => ({
  alt: (i.alt || '').slice(0, 24), srcHead: (i.src || '').slice(0, 55), srcLen: (i.src || '').length,
  nw: i.naturalWidth, nh: i.naturalHeight, dispW: Math.round(i.getBoundingClientRect().width), dispH: Math.round(i.getBoundingClientRect().height)
})));
console.log(JSON.stringify(imgs, null, 1));
await browser.close();
