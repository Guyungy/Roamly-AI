/**
 * 隔离测 panBy：不看信息窗，直接看地图上叠加物的位移。
 *
 * 结论（已实测）：位移与请求值严格 1:1 —— 60/120/240/480 全部精确命中。
 *
 * 但有个前提容易踩坑：**必须等动画真的停下来**。
 * panBy 是带过渡的（默认时长长到 2.3 秒），固定 sleep 2.5 秒去量会截到中间态，
 * 量出来的比值会变成 2.88 / 0.27 这种完全不自洽的数 —— 那是测量的错，不是 panBy 的错。
 * 所以这里用「位置连续两次采样不变」判定稳定，而不是 sleep。
 *
 * （顺带记：panBy 有第三个参数 duration，见 probe-panby-duration.js）
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

  // 用第一个景点标记当参照物：它是随地图一起移动的普通叠加物
  const markerY = () =>
    page.evaluate(() => {
      const c = document.querySelector('#amap-container').getBoundingClientRect()
      const m = document.querySelector('#amap-container .tripstar-map-marker')
      return m ? Math.round(m.getBoundingClientRect().top - c.top) : null
    })

  console.log('panBy 隔离测试（无信息窗干扰）')
  for (const n of [60, 120, 240, 480]) {
    const before = await markerY()
    await page.evaluate((v) => window.__wbAmapDebug.panBy(0, v), n)

    let prev = null
    let stable = 0
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(200)
      const now = await markerY()
      if (prev !== null && now === prev) {
        if (++stable >= 2) break
      } else {
        stable = 0
      }
      prev = now
    }

    const moved = (await markerY()) - before
    console.log(
      `  panBy(0, ${String(n).padStart(3)}) → 标记实际位移 ${String(moved).padStart(4)}  (期望 ${n}，比值 ${(moved / n).toFixed(2)})`
    )
  }

  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
