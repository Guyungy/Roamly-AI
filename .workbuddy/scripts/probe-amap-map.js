/**
 * 高德地图接入排查（本地假数据，不碰线上、不消耗云额度）
 *
 * 做法：拦截 `/.cloud/**` 喂 mock-plan.json，走到结果页 → 滚到地图区 →
 *      断言 mapStatus 是否真的到 ready、有没有瓦片/脚本请求、有没有 INVALID_USER_* 报错。
 *
 * 用法：
 *   cd frontend && npx vite preview --host 0.0.0.0 --port 4173 &
 *   NODE_PATH=... node .workbuddy/scripts/probe-amap-map.js
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4173'
const PLAN = fs.readFileSync(path.join(__dirname, 'mock-plan.json'), 'utf8')
const sseBody = (payload) => {
  const parts = []
  for (let i = 0; i < payload.length; i += 900) parts.push(payload.slice(i, i + 900))
  return parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n'
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  const amapReqs = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 300)))
  page.on('request', (r) => { if (/amap\.com|autonavi/.test(r.url())) amapReqs.push(r.url().slice(0, 120)) })
  page.on('requestfailed', (r) => { if (/amap\.com|autonavi/.test(r.url())) errors.push('REQFAIL ' + r.url().slice(0, 120)) })

  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
    if (url.includes('/llm/chat/completions'))
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1800)
  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.locator('.submit-btn').click()
  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(3000)

  // 地图是懒初始化的，滚过去
  await page.evaluate(() => document.getElementById('map')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(9000)

  const report = await page.evaluate(() => {
    const ph = document.querySelector('.map-placeholder')
    const holder = document.querySelector('#amap-container')
    return {
      amapGlobal: typeof window.AMap,
      securityConfig: window._AMapSecurityConfig ? Object.keys(window._AMapSecurityConfig) : null,
      placeholderVisible: !!ph && getComputedStyle(ph).display !== 'none' && getComputedStyle(ph).visibility !== 'hidden',
      placeholderText: ph ? (ph.textContent || '').trim().slice(0, 40) : null,
      holderChildren: holder ? holder.children.length : -1,
      holderHtml: holder ? holder.innerHTML.slice(0, 200) : null,
      canvasOrTiles: document.querySelectorAll('#amap-container canvas, #amap-container img, #amap-container .amap-layer').length,
      markers: document.querySelectorAll('.amap-marker').length,
      infoWindows: document.querySelectorAll('.amap-info').length,
      mapSectionRect: (() => { const r = document.getElementById('map')?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.height)] : null })(),
    }
  })

  console.log('\n地图状态: ' + JSON.stringify(report, null, 2))
  console.log('高德相关请求数: ' + amapReqs.length)
  amapReqs.slice(0, 8).forEach((u) => console.log('  · ' + u))
  const real = [...new Set(errors)]
  console.log('\n异常/失败: ' + (real.length ? JSON.stringify(real.slice(0, 8), null, 2) : '无'))
  await page.locator('#map').screenshot({ path: '/tmp/amap-map.png' }).catch(() => {})
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
