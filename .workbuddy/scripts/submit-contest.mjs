import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/a1/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright-core');

const EXEC = '/Users/a1/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = '/Users/a1/Code/Roamly-AI/.workbuddy/submission';
const OUT = '/Users/a1/Code/Roamly-AI/.workbuddy/scripts';
const URL = 'https://www.workbuddy.link/p/z1Wi4ybJ7J9YN44xNC81Ox?source=2';

const NAME = '出门啦 · AI 出行规划助手';
const INTRO = '出门啦是一个 AI 出行规划助手。填好目的地、日期和出行偏好后，多个 AI 智能体分工协作——查景点、看天气、找酒店、排路线，约 1～3 分钟生成一份完整的多日行程。结果页包含每日景点路线与餐饮安排，门票、餐饮、住宿、交通的分项预算，目标日期的天气预报，以及带标记连线的景点地图；生成后还能基于这份行程继续追问细节。除了长途多日游，也可用「附近出行」：自动定位当前城市，选半天或一天就能拿到推荐。历史行程会留在本地，随时回看。';
const LINK = 'https://roamly-ai-trip-planner.app.workbuddy.host/';
const AUTHOR = '圭木';
const UID = '52bedec2-d26c-43a3-bfee-61cfbbf96960';
const PHONE = '18718194303';
const STAGE = '出发行动前（出发前做准备时用）';
const SCOPE = '国内游';
const AUDIENCE = '朋友结伴';
const FEATURE = '行程规划';
const FILES = ['01-landing.png', '02-overview.png', '03-day1.png', '04-budget.png']
  .map(f => `${SHOTS}/${f}`).filter(f => fs.existsSync(f));
console.log('files:', FILES.map(f => f.split('/').pop()).join(', '));

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('dialog', d => d.accept().catch(() => {}));
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) console.log('[http]', r.status(), r.url().slice(0, 120)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
const frame = page.frames().find(f => f.url().includes('UGC.html'));
if (!frame) { console.log('FRAME NOT FOUND'); await browser.close(); process.exit(1); }

// 打开投稿表单
await frame.evaluate(() => document.getElementById('pub').click());
await page.waitForTimeout(1200);
await frame.evaluate(() => document.getElementById('optB').click());
await page.waitForTimeout(1500);
console.log('form open:', await frame.locator('#fName').count());

// 01 名称 / 06 介绍 / 07 链接
await frame.fill('#fName', NAME);
await frame.fill('#fRaw', INTRO);
await frame.fill('#fUrl', LINK);

// 02/03/04/05 选项（点 .rdo 触发 box 的 onclick）
async function choose(key, value) {
  const ok = await frame.evaluate(([k, v]) => {
    const box = document.querySelector(`.form-choice[data-choice="${k}"]`);
    if (!box) return 'no-box';
    const b = Array.from(box.querySelectorAll('.rdo')).find(x => x.dataset.v === v);
    if (!b) return 'no-option';
    b.click();
    return 'ok';
  }, [key, value]);
  console.log(`choice ${key}=${value} ->`, ok);
}
await choose('stage', STAGE);
await choose('scope', SCOPE);
await choose('audience', AUDIENCE);
await choose('feature', FEATURE);

// 08 截图
await frame.setInputFiles('#fFile', FILES);
let shotN = 0;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  shotN = await frame.locator('#shotw .s').count();
  if (shotN > 0) { await page.waitForTimeout(3000); break; }
}
shotN = await frame.locator('#shotw .s').count();
console.log('shots uploaded into form:', shotN);

// 11/12/13
await frame.fill('#fAuthor', AUTHOR);
await frame.fill('#fUid', UID);
await frame.fill('#fPhone', PHONE);

// 14 授权（不要用 check()，会被 label 双触发）
await frame.evaluate(() => { const el = document.getElementById('fOk'); if (!el.checked) el.click(); });
console.log('fOk checked:', await frame.evaluate(() => document.getElementById('fOk').checked));

await page.screenshot({ path: `${OUT}/submit-prefill.png`, fullPage: false });

// 提交
await frame.evaluate(() => document.getElementById('fSub').click());
console.log('submitted, waiting...');

let done = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(3000);
  const txt = await frame.locator('#sheet').innerText().catch(() => '');
  if (txt.includes('提交成功') || txt.includes('提交失败') || txt.includes('审核')) { console.log('SHEET:', txt.replace(/\n/g, ' | ').slice(0, 500)); done = true; break; }
  if (i % 5 === 4) console.log('waiting...', i * 3, 's');
}
const toast = await frame.locator('#toast').innerText().catch(() => '');
console.log('TOAST:', toast);
const finalSheet = await frame.locator('#sheet').innerText().catch(() => '');
console.log('FINAL SHEET:', finalSheet.replace(/\n/g, ' | ').slice(0, 600));
await page.screenshot({ path: `${OUT}/submit-result.png`, fullPage: false });
await browser.close();
console.log('done', done);
