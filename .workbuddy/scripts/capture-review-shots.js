/**
 * 抓两张人眼复核图：首页（含城市联想展开）与结果页顶部（新 UI 观感）。
 * 只截图、不做断言 —— 断言在 verify-*.js 里。
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
  // 中文界面：这是给中文用户看的主场景，也顺带验证 zh 文案
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })

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

  await page.goto(PREVIEW + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1800)

  // 首页：填城市并触发高德联想，把下拉展开
  const city = page.locator('.n-auto-complete input').first()
  await city.click()
  await city.fill('杭州')
  await page.waitForTimeout(1800)
  await page.screenshot({ path: '/tmp/review-landing.png' })
  console.log('已存 /tmp/review-landing.png')

  const options = await page.evaluate(() =>
    [...document.querySelectorAll('.n-base-select-option__content')].map((e) => e.textContent.trim()).slice(0, 5)
  )
  console.log('城市联想候选: ' + JSON.stringify(options))

  // 进结果页
  await city.fill('杭州')
  await page.waitForTimeout(400)
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.locator('.submit-btn').click()
  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(14000)

  // 结果页顶部：概览轮播 + 预算
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)
  await page.screenshot({ path: '/tmp/review-overview.png' })
  console.log('已存 /tmp/review-overview.png')

  // 地图区：滚到地图并点第一个标记，抓详情卡
  await page.locator('#map').scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(900)
  const marker = page.locator('#amap-container .tripstar-map-marker').first()
  await marker.click({ force: true, timeout: 8000 }).catch(() => {})

  // 等卡片位置稳定
  let prev = null, stable = 0
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(200)
    const now = await page.evaluate(() => {
      const d = document.querySelector('.tripstar-map-detail')
      return d ? Math.round(d.getBoundingClientRect().top) : null
    })
    if (prev !== null && now === prev) { if (++stable >= 3) break } else stable = 0
    prev = now
  }

  await page.locator('#map').screenshot({ path: '/tmp/review-map.png' }).catch(async () => {
    await page.screenshot({ path: '/tmp/review-map.png' })
  })
  console.log('已存 /tmp/review-map.png')

  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
