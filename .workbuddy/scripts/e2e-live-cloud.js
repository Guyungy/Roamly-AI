/**
 * 真跑一次「本地最新构建 + 真实云服务」，把模型实际吐出来的行程抓下来。
 *
 * 目的：验证两件事，而不是靠读代码猜 ——
 *   1) 天气：线上（云模式）没有接任何真实天气源，weather_info 是模型生成的，
 *      这里拿生成的天气跟 open-meteo 的真实预报对一遍，看到底像不像。
 *   2) 坐标：景点坐标同样由模型生成，没有地理编码校正，跟高德真实坐标量偏差。
 *
 * 用法：PREVIEW_URL=http://localhost:4174 node .workbuddy/scripts/e2e-live-cloud.js
 */
const { chromium } = require('playwright-core')

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4174'
const CITY = process.env.CITY || '杭州'
const START = process.env.START || '2026-10-05'
const END = process.env.END || '2026-10-07'

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'zh-CN' })

  const bad = []
  page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 120)))
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 120))
  })

  // 把 SSE 原文攒下来 —— 页面上渲染的可能被规范化过，要拿模型的原始输出
  await page.addInitScript(() => {
    window.__sse = []
    const orig = window.fetch
    window.fetch = async (...args) => {
      const res = await orig(...args)
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
      if (url.includes('/llm/chat/completions')) {
        try {
          const reader = res.clone().body.getReader()
          const dec = new TextDecoder()
          ;(async () => {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              window.__sse.push(dec.decode(value, { stream: true }))
            }
          })()
        } catch {
          /* 拿不到就算了，还能从 DOM 抓 */
        }
      }
      return res
    }
  })

  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  const city = page.locator('.n-auto-complete input').first()
  await city.click()
  await city.fill(CITY)
  await page.waitForTimeout(1200)
  await page.keyboard.press('Escape')

  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click()
  await page.keyboard.type(START)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click()
  await page.keyboard.type(END)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)

  const t0 = Date.now()
  await page.locator('.submit-btn').click()

  // 等到结果页；真实生成通常 30~120s，给足 4 分钟
  await page
    .waitForFunction(() => location.pathname === '/result', null, { timeout: 240000 })
    .catch(() => {})
  const genMs = Date.now() - t0
  await page.waitForTimeout(2000)

  const raw = await page.evaluate(() => (window.__sse || []).join(''))
  const info = await page.evaluate(() => {
    const root = document.querySelector('.result-container')
    if (!root) return { path: location.pathname, hasResult: false }
    const weatherCards = [...root.querySelectorAll('.weather-card, .weather-item, .day-weather')].map((el) =>
      el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120)
    )
    const mapOk = !!document.querySelector('#amap-container canvas')
    const markers = document.querySelectorAll('#amap-container .tripstar-map-marker').length
    return {
      path: location.pathname,
      hasResult: true,
      cityText: (root.querySelector('.hero-city, .city-name, h1') || {}).textContent?.trim() || null,
      weatherCards: weatherCards.slice(0, 6),
      mapOk,
      markers,
      failedMap: !!root.querySelector('.map-error, [data-map-status="error"]'),
      bodyText: root.textContent.replace(/\s+/g, ' ').trim().slice(0, 300),
    }
  })

  // 从 SSE 原文里把 JSON 抠出来
  let plan = null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    // SSE 是 data: 行 + 换行，先剥壳再拼
    const body = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter((l) => l && l !== '[DONE]')
      .map((l) => {
        try {
          return JSON.parse(l)?.choices?.[0]?.delta?.content ?? ''
        } catch {
          return ''
        }
      })
      .join('')
    const s = body.indexOf('{')
    const e = body.lastIndexOf('}')
    if (s >= 0 && e > s) {
      try {
        plan = JSON.parse(body.slice(s, e + 1))
      } catch {
        /* 解析不了就留 null */
      }
    }
  }

  console.log(JSON.stringify({ genMs, info, plan }, null, 2))

  const out = { genMs, info, plan, sseLen: raw.length }
  require('fs').writeFileSync('/tmp/live-run.json', JSON.stringify(out, null, 2))
  if (bad.length) console.log('\n异常请求:\n  ' + [...new Set(bad)].slice(0, 8).join('\n  '))

  await page.screenshot({ path: '/tmp/live-result.png', fullPage: false })
  await browser.close()
})().catch((e) => {
  console.error('失败: ' + e.message)
  process.exit(1)
})
