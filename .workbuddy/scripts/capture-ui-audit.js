/**
 * UI 现状档案：把首页与结果页每个区块逐张截图，用于判断"丑在哪"
 * 用法：先起 vite preview，再 NODE_PATH=... node .workbuddy/scripts/capture-ui-audit.js
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
const OUT = process.env.OUT_DIR || '/tmp/ui-audit'
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
    if (url.includes('/llm/chat/completions')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/00-landing-hero.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  await page.screenshot({ path: `${OUT}/01-landing-full.png`, fullPage: true })

  // 表单区
  const form = page.locator('.form-panel')
  if (await form.count()) await form.first().screenshot({ path: `${OUT}/02-landing-form.png` }).catch(() => {})

  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.locator('.submit-btn').click()

  // 加载面板
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${OUT}/03-loading-panel.png` })

  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(9000) // 等照片/地图/天气稳定

  await page.screenshot({ path: `${OUT}/10-result-top.png` })
  await page.screenshot({ path: `${OUT}/11-result-full.png`, fullPage: true })

  const sections = ['#overview', '#days', '#map', '#weather', '#budget']
  for (const sel of sections) {
    const el = page.locator(sel)
    if (await el.count()) {
      await el.first().scrollIntoViewIfNeeded()
      await page.waitForTimeout(900)
      await el.first().screenshot({ path: `${OUT}/2${sections.indexOf(sel)}-${sel.slice(1)}.png` }).catch((e) => console.log(`  ${sel} 截图失败 ${e.message}`))
    }
  }

  // 导航与侧栏
  const nav = page.locator('.result-navbar, .app-nav').first()
  if (await nav.count()) await nav.screenshot({ path: `${OUT}/30-navbar.png` }).catch(() => {})

  // 移动端全页
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/40-mobile-full.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(600)

  /* ---------------- AI 对话面板（本轮重做的悬浮球 + 侧边面板） ---------------- */
  const fab = page.locator('.ai-chat__fab')
  if (await fab.count()) {
    await page.locator('#weather').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(600)
    await fab.first().click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/50-chat-panel.png` })
    // 面板自己截图，便于看清内部布局
    const panel = page.locator('.ai-chat__panel')
    if (await panel.count()) {
      await panel.first().screenshot({ path: `${OUT}/51-chat-panel-only.png` }).catch(() => {})
    }
    await page.locator('.ai-chat__panel .n-button').first().click().catch(() => {})
    await page.waitForTimeout(500)
  } else {
    console.log('（没找到 AI 悬浮球，跳过对话面板截图）')
  }

  /* ---------------- 城市联想下拉 ---------------- */
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  const cityInput = page.locator('.n-auto-complete input').first()
  if (await cityInput.count()) {
    await cityInput.click()
    await cityInput.type('杭州', { delay: 90 })
    await page.waitForTimeout(1800)
    await page.locator('.form-panel').first().screenshot({ path: `${OUT}/60-city-suggest.png` }).catch(() => {})
  }

  /* ---------------- 窄屏首屏 ---------------- */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/61-mobile-landing.png` })

  // 收集设计事实：颜色、圆角、阴影、字号的实际分布
  const facts = await page.evaluate(() => {
    const count = (map) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 14)
    const bg = {}, fg = {}, radius = {}, shadow = {}, size = {}, weight = {}, family = {}
    let n = 0
    document.querySelectorAll('#result-root *, body *').forEach((el) => {
      const b = el.getBoundingClientRect()
      if (b.width < 8 || b.height < 8) return
      const cs = getComputedStyle(el)
      n++
      const bump = (m, k) => { if (k && k !== 'none' && k !== 'normal' && k !== '0px') m[k] = (m[k] || 0) + 1 }
      bump(bg, cs.backgroundColor)
      bump(fg, cs.color)
      bump(radius, cs.borderRadius)
      bump(shadow, cs.boxShadow.slice(0, 46))
      bump(size, cs.fontSize)
      bump(weight, cs.fontWeight)
      bump(family, cs.fontFamily.split(',')[0])
    })
    return { n, bg: count(bg), fg: count(fg), radius: count(radius), shadow: count(shadow), size: count(size), weight: count(weight), family: count(family) }
  })
  console.log('\n=== 参与统计的元素数: ' + facts.n + ' ===')
  const show = (t, k) => { console.log(`\n${t}:`); facts[k].forEach(([v, c]) => console.log(`   ${String(c).padStart(4)}  ${v}`)) }
  show('背景色 TOP', 'bg'); show('文字色 TOP', 'fg'); show('圆角 TOP', 'radius')
  show('阴影 TOP', 'shadow'); show('字号 TOP', 'size'); show('字重 TOP', 'weight'); show('字体 TOP', 'family')

  await browser.close()
  console.log('\n截图目录: ' + OUT)
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
