/**
 * 线上复验（真实云链路）：① 概览轮播翻页按钮  ② 高德真地图
 *
 * 用法：
 *   NODE_PATH=/Users/a1/.workbuddy/binaries/node/workspace/node_modules \
 *     /Users/a1/.workbuddy/binaries/node/versions/22.22.2-3/bin/node .workbuddy/scripts/verify-live-map-carousel.js
 */
const { chromium } = require('playwright-core')

const LIVE = process.env.LIVE_URL || 'https://roamly-ai-trip-planner.app.workbuddy.host'

const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  const tileOk = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))
  page.on('response', (r) => { if (/amap\.com|autonavi/.test(r.url())) tileOk.push(r.status()) })

  await page.goto(LIVE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2200)
  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  const t0 = Date.now()
  await page.locator('.submit-btn').click()
  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 120000 }).catch(() => {})
  console.log(`进入结果页耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await page.waitForTimeout(4000)

  /* ---------------- 一、概览轮播翻页 ---------------- */
  console.log('\n=== 一、概览轮播翻页按钮 ===')
  const carousel = await page.evaluate(async () => {
    const idx = () => [...document.querySelectorAll('#overview .swiper-slide')].findIndex((s) => s.classList.contains('swiper-slide-active'))
    const btn = (i) => document.querySelectorAll('.overview-nav-btn')[i]
    const slides = document.querySelectorAll('#overview .swiper-slide').length
    const init = { count: document.querySelectorAll('.overview-nav-btn').length, active: idx(), prevDisabled: btn(0)?.disabled, slides }
    btn(1)?.click()
    await new Promise((r) => setTimeout(r, 900))
    const mid = { active: idx(), prevDisabled: btn(0)?.disabled }
    for (let i = 0; i < 12; i++) { btn(1)?.click(); await new Promise((r) => setTimeout(r, 320)) }
    await new Promise((r) => setTimeout(r, 800))
    return { ...init, mid, endActive: idx(), endNextDisabled: btn(1)?.disabled, imgAll: [...document.querySelectorAll('.overview-swiper img')].every((i) => i.naturalWidth > 0), imgCount: document.querySelectorAll('.overview-swiper img').length }
  })
  console.log('轮播: ' + JSON.stringify(carousel))
  check('概览有翻页按钮（桌面不再"后几张卡没入口"）', carousel.count === 2, `${carousel.count} 个 / 共 ${carousel.slides} 张卡`)
  check('起点上一页禁用', carousel.prevDisabled === true, String(carousel.prevDisabled))
  check('点下一页能推进', carousel.mid.active > carousel.active, `${carousel.active} → ${carousel.mid.active}`)
  check('推进后上一页解禁', carousel.mid.prevDisabled === false, String(carousel.mid.prevDisabled))
  check('推到底下一页禁用', carousel.endNextDisabled === true, `active ${carousel.endActive}`)
  check('概览图全部已加载（eager）', carousel.imgAll === true, `${carousel.imgCount} 张`)
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600)
  await page.locator('#overview').screenshot({ path: '/tmp/live-v5-overview-nav.png' }).catch(() => {})

  /* ---------------- 二、高德真地图 ---------------- */
  console.log('\n=== 二、高德地图 ===')
  await page.evaluate(() => document.getElementById('map')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(10000)
  const mapInfo = await page.evaluate(() => {
    const ph = document.querySelector('.map-placeholder')
    return {
      amapGlobal: typeof window.AMap,
      placeholderVisible: !!ph && getComputedStyle(ph).display !== 'none',
      placeholderText: ph ? (ph.textContent || '').trim().slice(0, 30) : null,
      layers: document.querySelectorAll('#amap-container canvas, #amap-container img, #amap-container .amap-layer').length,
      markers: document.querySelectorAll('.amap-marker').length,
      holderText: (document.querySelector('#amap-container')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
    }
  })
  console.log('地图: ' + JSON.stringify(mapInfo))
  console.log('高德资源响应码分布: ' + JSON.stringify(tileOk.reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {})))
  check('地图脚本已加载（window.AMap 存在）', mapInfo.amapGlobal === 'object', mapInfo.amapGlobal)
  check('占位层已让位（不再是"地图不可用"）', mapInfo.placeholderVisible === false, `占位文案「${mapInfo.placeholderText}」`)
  check('地图渲染出图层', mapInfo.layers > 0, `${mapInfo.layers} 个图层节点`)
  check('景点标记已落图', mapInfo.markers >= 3, `${mapInfo.markers} 个 marker`)
  check('高德资源请求全部 2xx', tileOk.length > 0 && tileOk.every((s) => s >= 200 && s < 400), `${tileOk.length} 个请求`)
  await page.locator('#map').screenshot({ path: '/tmp/live-v5-map.png' }).catch(() => {})

  const real = [...new Set(errors)].filter((e) => !/favicon|Failed to load resource: net::ERR/.test(e))
  console.log('\n异常: ' + (real.length ? JSON.stringify(real.slice(0, 6)) : '无'))
  console.log('\n结论: ' + (failures.length ? `${failures.length} 项未通过 →\n  ` + failures.join('\n  ') : '全部通过'))
  await browser.close()
  process.exit(failures.length ? 1 : 0)
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
