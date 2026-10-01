/**
 * panBy 支持传时长吗？过渡要 2.4 秒的话点一下标记等太久，得能压短。
 * 顺便探一下 containerToLngLat 在不在（备选：用它 + setCenter 做瞬时位移）。
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4173'
const PLAN = fs.readFileSync(path.join(__dirname, 'mock-plan.json'), 'utf8')

const sseBody = (payload) => {
  const parts = []
  for (let i = 0; i < payload.length; i += 900) parts.push(payload.slice(i, i + 900))
  return (
    parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') +
    'data: [DONE]\n\n'
  )
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
    if (url.includes('/llm/chat/completions'))
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    if (url.includes('/database/rest'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.locator('.n-auto-complete input').first().fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.locator('.submit-btn').click()
  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(14000)

  const api = await page.evaluate(() => {
    const map = window.__wbAmapDebug
    return { containerToLngLat: typeof map.containerToLngLat, panByArity: map.panBy.length }
  })
  console.log('API: ' + JSON.stringify(api))

  const markerY = () =>
    page.evaluate(() => {
      const c = document.querySelector('#amap-container').getBoundingClientRect()
      const m = document.querySelector('#amap-container .tripstar-map-marker')
      return Math.round(m.getBoundingClientRect().top - c.top)
    })

  // 来回移动，避免撞到同一个方向、把上一轮的余量算进来
  const trial = async (label, fn) => {
    await page.evaluate((dir) => window.__wbAmapDebug.panBy(0, dir * 120), 1)
    await page.waitForTimeout(4000)
    const before = await markerY()
    const t0 = Date.now()
    await page.evaluate(fn)
    let prev = null, stable = 0, moved = 0
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(100)
      const now = await markerY()
      moved = now - before
      if (prev !== null && now === prev) { if (++stable >= 3) break } else stable = 0
      prev = now
    }
    console.log(`  ${label}: 耗时 ${Date.now() - t0}ms，位移 ${moved}px`)
  }

  console.log('\n过渡时长对比:')
  await trial('panBy(0, 240) 两参', (v) => window.__wbAmapDebug.panBy(0, -240))
  await trial('panBy(0, 240, 300) 三参', (v) => window.__wbAmapDebug.panBy(0, -240, 300))
  await trial('panBy(0, 240, 0) 零时长', (v) => window.__wbAmapDebug.panBy(0, -240, 0))

  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
