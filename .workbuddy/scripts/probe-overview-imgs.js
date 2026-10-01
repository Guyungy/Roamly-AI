/**
 * 定点排查：概览景点图到底哪几张是空的（可见性 + 懒加载 交叉判定）
 * 用法：NODE_PATH=... node .workbuddy/scripts/probe-overview-imgs.js
 */
const { chromium } = require('playwright-core')
const LIVE = process.env.LIVE_URL || 'https://roamly-ai-trip-planner.app.workbuddy.host'

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

  const dump = async (tag) => {
    const d = await page.evaluate(() => {
      const out = []
      document.querySelectorAll('.result-container img, .content-wrapper img').forEach((img, i) => {
        const r = img.getBoundingClientRect()
        out.push({
          i,
          host: img.closest('.swiper-slide') ? 'swiper' : (img.closest('.attraction-card') ? 'card' : 'other'),
          name: img.getAttribute('alt') || '',
          nw: img.naturalWidth,
          complete: img.complete,
          loading: img.getAttribute('loading'),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          rendered: r.width > 1 && r.height > 1,
        })
      })
      return {
        vh: window.innerHeight,
        overviewTop: Math.round((document.getElementById('overview')?.getBoundingClientRect().top) ?? NaN),
        imgs: out,
      }
    })
    console.log(`\n=== ${tag} (viewport h=${d.vh}, overview top=${d.overviewTop}) ===`)
    d.imgs.forEach((x) => console.log(
      `${x.rendered ? 'RENDERED' : 'hidden  '} ${String(x.i).padStart(2)} ${x.host.padEnd(7)} nw=${String(x.nw).padStart(4)} complete=${x.complete} loading=${x.loading} rect=${JSON.stringify(x.rect)} ${x.name}`
    ))
    return d
  }

  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800)
  await dump('scrollY=0')

  await page.evaluate(() => document.getElementById('overview').scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1500)
  await dump('概览居中')

  // 手动把可见的空白图重新赋同一 src，看是否只是懒加载没触发
  const refixed = await page.evaluate(async () => {
    const bad = [...document.querySelectorAll('.result-container img')].filter((im) => im.naturalWidth === 0 && im.getBoundingClientRect().width > 1)
    bad.forEach((im) => { const s = im.src; im.src = ''; im.src = s })
    await new Promise((r) => setTimeout(r, 800))
    return bad.map((im) => ({ name: im.alt, nw: im.naturalWidth }))
  })
  console.log('\n重赋 src 后的 visible 空白图: ' + JSON.stringify(refixed))

  await page.screenshot({ path: '/tmp/probe-overview.png' })
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
