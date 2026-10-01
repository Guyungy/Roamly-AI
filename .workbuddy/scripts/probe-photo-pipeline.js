/**
 * 定点诊断：为什么「西溪国家湿地公园」有时拿不到照片。
 * 记录每次 place/text 搜索（含 keywords）与每个 showpic 图片请求，看清断在哪一步。
 * 用法：先起 vite preview，再 NODE_PATH=... node .workbuddy/scripts/probe-photo-pipeline.js
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

const ROUNDS = Number(process.env.ROUNDS || 3)

;(async () => {
  const browser = await chromium.launch({ headless: true })
  for (let round = 1; round <= ROUNDS; round++) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const searches = []
    const pics = []
    const failed = []
    page.on('request', (r) => {
      const u = r.url()
      const m = /place\/text\?[^]*?keywords=([^&]*)/.exec(u)
      if (m) searches.push(decodeURIComponent(m[1]))
      if (/showpic\//.test(u)) pics.push(u.replace(/^https?:\/\//, '').slice(0, 78))
    })
    page.on('requestfailed', (r) => {
      if (/showpic|autonavi/.test(r.url())) failed.push(r.url().slice(0, 78) + ' :: ' + (r.failure() || {}).errorText)
    })
    await page.route('**/.cloud/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/llm/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
      if (url.includes('/llm/chat/completions')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500)
    await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
    const pickers = page.locator('.n-date-picker input')
    await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await page.locator('.submit-btn').click()
    await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})

    // 等到图片不再变化为止
    let sig = ''
    let stable = 0
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(500)
      const now = await page.evaluate(() =>
        [...document.querySelectorAll('.attraction-image')].map((im) => `${im.alt}:${im.naturalWidth}:${/autonavi/.test(im.src)}`).join('|'),
      )
      if (now === sig) { stable += 1; if (stable >= 4) break } else { sig = now; stable = 0 }
    }
    const audit = await page.evaluate(() =>
      [...document.querySelectorAll('.attraction-image')].map((im) => ({
        alt: im.alt,
        nw: im.naturalWidth,
        src: (im.currentSrc || im.src).replace(/^https?:\/\//, '').slice(0, 78),
      })),
    )
    const xixiPicRequests = pics.filter((u) => /存储|showpic/.test(u))
    console.log(`\n===== 第 ${round} 轮 =====`)
    console.log('搜索关键词: ' + JSON.stringify(searches))
    console.log('showpic 请求数: ' + pics.length)
    console.log('请求失败: ' + (failed.length ? JSON.stringify(failed) : '无'))
    audit.forEach((a) => console.log(`  ${String(a.nw).padStart(5)}px  ${a.alt}`))
    const xixi = audit.find((a) => a.alt.includes('西溪'))
    console.log(`西溪: nw=${xixi && xixi.nw} src=${xixi && xixi.src}`)
    console.log('西溪相关的图片请求: ' + JSON.stringify(pics.filter((u) => u.includes('5723d86c') || u.includes('ee8ba4fd'))))
    console.log('（本轮共 ' + xixiPicRequests.length + ' 个 showpic 请求）')
    await page.close()
  }
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
