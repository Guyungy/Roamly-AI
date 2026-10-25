import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = '/Users/a1/Code/Roamly-AI/.workbuddy/scripts/shots';
const LIVE = 'https://roamly-ai-trip-planner.app.workbuddy.host/';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/01-landing.png` });
console.log('landing shot done');
await browser.close();
