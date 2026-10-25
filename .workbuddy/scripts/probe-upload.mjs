import { createRequire } from 'node:module';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'https://www.workbuddy.link/p/z1Wi4ybJ7J9YN44xNC81Ox?source=2';

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

page.on('request', r => { if (r.url().includes('upload')) console.log('[REQ]', r.method(), r.url(), JSON.stringify(r.headers())); });
page.on('response', async r => { if (r.url().includes('upload')) { let b = ''; try { b = (await r.text()).slice(0, 400) } catch {} console.log('[RES]', r.status(), b); } });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
const frame = page.frames().find(f => f.url().includes('UGC.html'));

const info = await frame.evaluate(() => {
  const sp = window.__SMART_PAGE__;
  const out = { hasSP: !!sp, keys: sp ? Object.keys(sp) : [], userInfo: window.userInfo || null };
  try { out.dbKeys = sp && sp.database ? Object.keys(sp.database).slice(0, 40) : null; } catch (e) { out.dbErr = String(e) }
  try { out.dbUser = sp && sp.database && sp.database.getUserInfo ? String(typeof sp.database.getUserInfo) : null } catch (e) {}
  out.cookies = document.cookie.slice(0, 300);
  out.ls = Object.keys(localStorage).slice(0, 20);
  return out;
});
console.log('SP INFO:', JSON.stringify(info, null, 1));

const cookies = await ctx.cookies();
console.log('COOKIES:', cookies.map(c => `${c.domain} ${c.name}`).join(' | '));

// 直接调一次 uploadImage 看返回
const res = await frame.evaluate(async () => {
  const sp = window.__SMART_PAGE__;
  const b64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  try {
    const r = await sp.database.uploadImage({ data: b64, contentType: 'image/jpeg', fileName: 'probe.jpg' });
    return { ok: true, r: JSON.stringify(r).slice(0, 300) };
  } catch (e) { return { ok: false, err: String((e && (e.message || e.code)) || e).slice(0, 300) }; }
});
console.log('UPLOAD PROBE:', JSON.stringify(res));

await browser.close();
