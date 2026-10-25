/**
 * 宽度扫描（本地假数据，免费）：找出每日行程卡片图在哪些宽度下被压扁
 * 用法：先起 vite preview，再 NODE_PATH=... node .workbuddy/scripts/probe-width-sweep.js
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4173'
const PLAN = fs.readFileSync(path.join(__dirname, 'mock-plan.json'), 'utf8')
const sseBody = (p) => {
  const parts = []
  for (let i = 0; i < p.length; i += 900) parts.push(p.slice(i, i + 900))
  return parts.map((x) => `data: ${JSON.stringify({ choices: [{ delta: { content: x } }] })}\n\n`).join('') + 'data: [DONE]\n\n'
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
    if (url.includes('/llm/chat/completions')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1600)
  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.locator('.submit-btn').click()
  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)

  console.log('宽度  | 每日行程图(宽×高) | 每日卡列数 | 概览卡(宽×高) | 主体最小可读宽度')
  for (const w of [1440, 1280, 1024, 900, 820, 768, 640, 560, 480, 414, 390, 360]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(450)
    const r = await page.evaluate(() => {
      const dayImg = document.querySelector('#days .attraction-card img')
      const ovImg = document.querySelector('#overview .swiper-slide img')
      const grid = document.querySelector('#days .attraction-grid')
      const firstCard = document.querySelector('#days .attraction-card')
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns : 'n/a'
      const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] }
      const desc = document.querySelector('#days .attraction-card .attraction-desc, #days .attraction-card p')
      return {
        dayImg: rect(dayImg),
        ovImg: rect(ovImg),
        card: rect(firstCard),
        cols: cols === 'n/a' ? 'n/a' : cols.split(' ').length + '列: ' + cols,
        descW: desc ? Math.round(desc.getBoundingClientRect().width) : null,
        docW: document.documentElement.scrollWidth,
      }
    })
    console.log(`${String(w).padStart(5)} | ${JSON.stringify(r.dayImg).padEnd(14)} | ${String(r.cols).padEnd(22)} | ${JSON.stringify(r.ovImg).padEnd(12)} | 卡 ${JSON.stringify(r.card)} 描述宽 ${r.descW} 文档宽 ${r.docW}${r.docW > w + 2 ? '  ← 横向溢出' : ''}`)
  }

  for (const w of [390, 768]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(500)
    await page.evaluate(() => document.getElementById('days')?.scrollIntoView())
    await page.waitForTimeout(700)
    await page.screenshot({ path: `/tmp/sweep-days-${w}.png` })
  }
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
