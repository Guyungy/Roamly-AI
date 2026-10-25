/**
 * 定点排查：概览横向轮播到底能不能推进（拖拽 / 滚轮 / 键盘三条路径）
 * 关注：后面几张卡是否能进视口、进视口后图片是否真的加载出来
 *
 * 用法：NODE_PATH=... node .workbuddy/scripts/probe-overview-drag.js
 */
const { chromium } = require('playwright-core')
const LIVE = process.env.LIVE_URL || 'https://roamly-ai-trip-planner.app.workbuddy.host'

const state = () => ({
  active: [...document.querySelectorAll('.overview-swiper .swiper-slide')].findIndex((s) => s.classList.contains('swiper-slide-active')),
  wrapperTransform: getComputedStyle(document.querySelector('.overview-swiper .swiper-wrapper')).transform,
  slides: document.querySelectorAll('.overview-swiper .swiper-slide').length,
  loaded: [...document.querySelectorAll('.overview-swiper img')].filter((i) => i.naturalWidth > 0).length,
  boxes: [...document.querySelectorAll('.overview-swiper .swiper-slide')].map((s) => Math.round(s.getBoundingClientRect().x)),
  pager: {
    arrows: document.querySelectorAll('.overview-swiper .swiper-button-next, .overview-swiper .swiper-button-prev').length,
    bullets: document.querySelectorAll('.overview-swiper .swiper-pagination-bullet').length,
  },
})

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(LIVE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2200)
  await page.getByPlaceholder('Enter a city').fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /START PLANNING/i }).last().click()
  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(4000)
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600)

  console.log('初始: ' + JSON.stringify(await page.evaluate(state)))

  const box = await page.locator('.overview-swiper').boundingBox()
  console.log('容器 box: ' + JSON.stringify(box))
  const cy = box.y + box.height / 2

  // 路径 A：真实拖拽（用户手势）
  await page.mouse.move(box.x + box.width - 80, cy)
  await page.mouse.down()
  for (let i = 1; i <= 24; i++) { await page.mouse.move(box.x + box.width - 80 - i * 40, cy); await page.waitForTimeout(16) }
  await page.mouse.up()
  await page.waitForTimeout(1200)
  console.log('拖拽后: ' + JSON.stringify(await page.evaluate(state)))

  // 路径 B：滚轮（每次重新把鼠标放回容器中心，避免页面滚动导致指针离开）
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(box.x + box.width / 2, cy)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(300)
  }
  console.log('滚轮后: ' + JSON.stringify(await page.evaluate(state)))

  // 路径 C：键盘方向键（Keyboard 模块）
  await page.mouse.move(box.x + box.width / 2, cy)
  await page.keyboard.press('Tab')
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500) }
  await page.waitForTimeout(1000)
  console.log('键盘后: ' + JSON.stringify(await page.evaluate(state)))

  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
  await page.screenshot({ path: '/tmp/probe-after-drag.png' })
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
