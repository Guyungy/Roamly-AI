/**
 * 窄屏布局体检（本地假数据，免费）：找出「被压扁」的容器与列数写死的地方
 * 用法：先起 vite preview，再 NODE_PATH=... node .workbuddy/scripts/probe-narrow-layout.js
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

const SELECTORS = [
  '#days .days-list',
  '#days .day-card',
  '#days .attraction-card',
  '#days .attraction-image-wrapper',
  '#days .attraction-image',
  '#days .day-info',
  '#days .info-row',
  '#budget .budget-layout',
  '#budget .budget-card',
  '.overview-meta',
]

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

  for (const w of [1440, 768, 390]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(600)
    const dump = await page.evaluate((sels) => {
      const r = (el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.x)}` }
      const info = {}
      sels.forEach((s) => {
        const el = document.querySelector(s)
        if (!el) { info[s] = 'MISSING'; return }
        const cs = getComputedStyle(el)
        info[s] = {
          rect: r(el),
          display: cs.display,
          cols: cs.gridTemplateColumns === 'none' ? undefined : cs.gridTemplateColumns,
          flexDir: cs.flexDirection === 'row' ? undefined : cs.flexDirection,
          inlineStyle: (el.getAttribute('style') || '').slice(0, 90) || undefined,
        }
      })
      // 景点卡的上溯链，找栅格容器
      const chain = []
      let cur = document.querySelector('#days .attraction-card')
      while (cur && cur.id !== 'days' && chain.length < 6) {
        chain.push(`${cur.tagName.toLowerCase()}.${(cur.className || '').toString().split(' ').slice(0, 3).join('.')} ${r(cur)}`)
        cur = cur.parentElement
      }
      // 被压扁的文本块（宽 < 140 且含中文/文字）
      const crushed = [...document.querySelectorAll('#days *, #budget *')]
        .filter((el) => el.children.length === 0 && (el.textContent || '').trim().length > 4 && el.getBoundingClientRect().width < 140 && el.getBoundingClientRect().height > 4)
        .slice(0, 6)
        .map((el) => `${(el.className || el.tagName).toString().slice(0, 24)} ${r(el)} "${el.textContent.trim().slice(0, 14)}"`)
      /*
       * 比父容器还宽的元素（窄屏溢出源）。
       *
       * 要排掉「祖先已经设了横向滚动」的情况：明细表和段落导航都是刻意做成
       * overflow-x:auto 的 —— 内容比容器宽正是它们该有的样子，报出来只会误导。
       * 只在页面真的能横向滚动时（docW > 视口）才值得追。
       */
      const inScroller = (el) => {
        let cur = el.parentElement
        while (cur && cur !== document.body) {
          const ox = getComputedStyle(cur).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
          cur = cur.parentElement
        }
        return false
      }
      const overflow = [...document.querySelectorAll('.result-container *')]
        .filter((el) => {
          const p = el.parentElement
          if (!p || el.tagName === 'IMG') return false
          if (inScroller(el)) return false
          const w = el.getBoundingClientRect().width
          return w > 80 && w - p.getBoundingClientRect().width > 4
        })
        .slice(0, 8)
        .map((el) => `${(el.className || el.tagName).toString().split(' ').slice(0, 2).join('.').slice(0, 26)} w=${Math.round(el.getBoundingClientRect().width)} 父w=${Math.round(el.parentElement.getBoundingClientRect().width)} 区=${el.closest('section')?.id}`)
      return { info, chain, crushed, overflow, docW: document.documentElement.scrollWidth }
    }, SELECTORS)
    console.log(`\n================ ${w}px (文档宽 ${dump.docW}) ================`)
    Object.entries(dump.info).forEach(([k, v]) => console.log(`  ${k.padEnd(34)} ${JSON.stringify(v)}`))
    console.log('  卡片上溯链:')
    dump.chain.forEach((c) => console.log('    · ' + c))
    console.log('  被压扁的文本块: ' + (dump.crushed.length ? JSON.stringify(dump.crushed, null, 0) : '无'))
    console.log('  比父容器宽的元素: ' + (dump.overflow.length ? JSON.stringify(dump.overflow, null, 0) : '无'))
  }
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
