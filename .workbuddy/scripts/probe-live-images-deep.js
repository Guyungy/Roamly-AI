/**
 * 线上图片深挖：把结果页所有「图片类节点」逐一审计 + 分段截图，定位「图没显示」到底缺在哪
 *
 * 覆盖三类：<img>（含 nw/nh/rect/opacity）、background-image、以及被 @error 换成插画的节点。
 * 用法：
 *   NODE_PATH=... node .workbuddy/scripts/probe-live-images-deep.js
 */
const { chromium } = require('playwright-core')
const LIVE = process.env.LIVE_URL || 'https://roamly-ai-trip-planner.app.workbuddy.host'

const audit = () => {
  const out = { imgs: [], bg: [] }
  document.querySelectorAll('.result-container img, .content-wrapper img, img').forEach((img, i) => {
    const r = img.getBoundingClientRect()
    const cs = getComputedStyle(img)
    out.imgs.push({
      i,
      alt: (img.alt || '').slice(0, 18),
      where: img.closest('#overview') ? 'overview'
        : img.closest('#days') ? 'days'
          : img.closest('#budget') ? 'budget'
            : img.closest('#map') ? 'map' : 'other',
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
      objectFit: cs.objectFit,
      bgcolor: cs.backgroundColor,
      cls: (img.className || '').slice(0, 30),
      srcKind: /^data:image\/svg/.test(img.src) ? 'svg-data' : img.src.startsWith('data:') ? 'data' : 'url',
      srcHead: img.src.slice(0, 60),
    })
  })
  document.querySelectorAll('.result-container *, .content-wrapper *').forEach((el) => {
    const bi = getComputedStyle(el).backgroundImage
    if (bi && bi !== 'none') {
      const r = el.getBoundingClientRect()
      out.bg.push({ cls: (el.className || '').toString().slice(0, 30), bi: bi.slice(0, 70), rect: [Math.round(r.width), Math.round(r.height)] })
    }
  })
  return out
}

;(async () => {
  const browser = await chromium.launch({ headless: true })

  for (const vp of [{ width: 1440, height: 1000, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)) })
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 180)))

    await page.goto(LIVE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2200)
    await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
    const pickers = page.locator('.n-date-picker input')
    await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await page.locator('.submit-btn').click()
    await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(4000)

    // 全页滚一遍触发懒加载
    const total = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < total; y += Math.round(vp.height * 0.8)) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(1500)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(800)

    const a = await page.evaluate(audit)
    console.log(`\n========== ${vp.tag} ${vp.width}x${vp.height} ==========`)
    console.log(`img 总数 ${a.imgs.length}，按区域：` + JSON.stringify(a.imgs.reduce((m, x) => ((m[x.where] = (m[x.where] || 0) + 1), m), {})))
    const bad = a.imgs.filter((x) => x.nw === 0)
    console.log(`未解码 (nw=0) 共 ${bad.length} 张`)
    a.imgs.forEach((x) => console.log(
      `  ${String(x.nw).padStart(5)}x${String(x.nh).padEnd(5)} ${x.where.padEnd(8)} op=${x.opacity} ${x.visibility} fit=${x.objectFit} bg=${x.bgcolor} ${x.srcKind} rect=${JSON.stringify(x.rect)} "${x.alt}"`
    ))
    console.log('背景图节点: ' + JSON.stringify(a.bg.slice(0, 8)))

    // 分段截图
    const segs = Math.min(8, Math.ceil(total / vp.height))
    for (let s = 0; s < segs; s++) {
      await page.evaluate((yy) => window.scrollTo(0, yy), s * vp.height)
      await page.waitForTimeout(500)
      await page.screenshot({ path: `/tmp/deep-${vp.tag}-${s}.png` })
    }
    console.log('异常: ' + (errors.length ? JSON.stringify([...new Set(errors)].slice(0, 5)) : '无'))
    await page.close()
  }
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
