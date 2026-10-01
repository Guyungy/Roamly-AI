/**
 * 线上端到端复验（真实云链路，不拦截任何请求）
 *
 * 覆盖：首页生成行程 → 结果页六区块 → 导航栏无 GitHub 入口 → 结果页登录可弹开 → 白色主题 → 控制台异常
 * 用法：
 *   NODE_PATH=/Users/a1/.workbuddy/binaries/node/workspace/node_modules \
 *     /Users/a1/.workbuddy/binaries/node/versions/22.22.2-3/bin/node .workbuddy/scripts/verify-live-result.js
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))

  await page.goto(LIVE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2200)

  /* 首页导航栏 */
  const homeNav = await page.evaluate(() => ({
    github: document.querySelectorAll('.app-nav a[href*="github"]').length,
    straySvg: document.querySelectorAll('.app-nav .nav-item:not(.nav-lang) svg').length,
  }))
  console.log('\n首页导航栏: ' + JSON.stringify(homeNav))
  check('首页导航栏无 GitHub 入口', homeNav.github === 0, `${homeNav.github} 个链接`)
  check('首页导航栏无多余图标', homeNav.straySvg === 0, `${homeNav.straySvg} 个 svg`)

  await page.locator('.app-nav .nav-pill').click()
  await page.waitForTimeout(700)
  check('首页点登录能弹出登录框', await page.locator('.auth-card').isVisible())
  await page.locator('.auth-close').first().click()
  await page.waitForTimeout(400)

  /* 生成一份行程（真实调用云模型） */
  await page.getByPlaceholder('Enter a city').fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  const t0 = Date.now()
  await page.getByRole('button', { name: /START PLANNING/i }).last().click()

  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 120000 }).catch(() => {})
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  check('进入结果页', (await page.evaluate(() => location.pathname)) === '/result', `${elapsed}s`)
  await page.waitForTimeout(3500)

  /* 结果页导航栏 + 登录 */
  const resultNav = await page.evaluate(() => ({
    github: document.querySelectorAll('.app-nav a[href*="github"]').length,
    loginLabel: (document.querySelector('.app-nav .nav-pill') || {}).textContent?.trim() || null,
  }))
  console.log('\n结果页导航栏: ' + JSON.stringify(resultNav))
  check('结果页导航栏无 GitHub 入口', resultNav.github === 0, `${resultNav.github} 个链接`)
  await page.locator('.app-nav .nav-pill').click()
  await page.waitForTimeout(800)
  check('结果页点登录能弹出登录框', await page.locator('.auth-card').isVisible(), `按钮文案「${resultNav.loginLabel}」`)
  await page.locator('.auth-close').first().click()
  await page.waitForTimeout(400)
  check('结果页登录框可关闭', !(await page.locator('.auth-card').isVisible()))

  /* 六个区块 */
  const sections = await page.evaluate(() =>
    ['overview', 'budget', 'map', 'days', 'knowledge-graph', 'weather'].map((id) => {
      const el = document.getElementById(id)
      return { id, h: el ? Math.round(el.getBoundingClientRect().height) : 0 }
    })
  )
  console.log('\n区块高度: ' + JSON.stringify(sections))
  sections.forEach((s) => check(`区块 ${s.id} 存在且有高度`, s.h > 60, `${s.h}px`))

  /* 主题 */
  const theme = await page.evaluate(() => ({
    container: getComputedStyle(document.querySelector('.result-container')).backgroundColor,
    wrapper: getComputedStyle(document.querySelector('.content-wrapper')).backgroundColor,
    body: getComputedStyle(document.body).color,
    navSticky: getComputedStyle(document.querySelector('.section-nav')).position,
  }))
  console.log('\n主题: ' + JSON.stringify(theme))
  check('结果页底为浅色', theme.container === 'rgb(245, 247, 250)', theme.container)
  check('内容卡为白色', theme.wrapper === 'rgb(255, 255, 255)', theme.wrapper)
  check('区块导航为粘性定位', theme.navSticky === 'sticky', theme.navSticky)

  /* 日期：所选日期不得偏移（时区回归） */
  const dates = await page.evaluate(() => ({
    range: (document.querySelector('.overview-meta-item') || {}).textContent?.trim() || null,
    dayDates: [...document.querySelectorAll('.day-date')].map((e) => e.textContent.trim()),
  }))
  console.log('\n日期: ' + JSON.stringify(dates))
  check('概览日期区间为所选起止', /2026-10-05/.test(dates.range || '') && /2026-10-07/.test(dates.range || ''), dates.range)
  check(
    '每日行程日期与所选一致',
    JSON.stringify(dates.dayDates) === JSON.stringify(['2026-10-05', '2026-10-06', '2026-10-07']),
    JSON.stringify(dates.dayDates)
  )

  /* 截图 */
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)
  await page.screenshot({ path: '/tmp/live-v4-nav.png' })
  await page.screenshot({ path: '/tmp/live-v4-full.png', fullPage: true })

  const real = [...new Set(errors)].filter((e) => !/favicon|Failed to load resource: net::ERR/.test(e))
  console.log('\n异常: ' + (real.length ? JSON.stringify(real.slice(0, 6)) : '无'))
  console.log('\n结论: ' + (failures.length ? `${failures.length} 项未通过 →\n  ` + failures.join('\n  ') : '全部通过'))
  await browser.close()
  process.exit(failures.length ? 1 : 0)
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
