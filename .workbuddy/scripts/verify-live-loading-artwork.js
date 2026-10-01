/**
 * 线上复验（真实云链路）：① 生成过程可视化面板  ② 景点配图是否真正显示
 *
 * 覆盖：
 *  - 加载期间 .cloud-progress 出现：阶段清单 / 进度条 / 百分比 / 陪伴文案 / 诚实说明
 *  - 阶段文案随时间推进（真阶段解析，不是静态占位）
 *  - 结果页所有 <img> 的 naturalWidth > 0（无空白图）
 *  - 景点图确实来自插画（data:image/svg+xml）或真照片（http），不是灰底占位
 *
 * 用法：
 *   NODE_PATH=/Users/a1/.workbuddy/binaries/node/workspace/node_modules \
 *     /Users/a1/.workbuddy/binaries/node/versions/22.22.2-3/bin/node .workbuddy/scripts/verify-live-loading-artwork.js
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))

  await page.goto(LIVE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2200)

  // ---- 填表 ----
  await page.getByPlaceholder('Enter a city').fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)

  const t0 = Date.now()
  await page.getByRole('button', { name: /START PLANNING/i }).last().click()

  // ---- 加载期采样 ----
  const samples = []
  let panelSeen = false
  let shot = false
  for (let i = 0; i < 260; i++) {
    if (page.url().includes('/result')) break
    const snap = await page.evaluate(() => {
      const root = document.querySelector('.cloud-progress')
      if (!root) return null
      const active = document.querySelector('.cloud-stage.active .cloud-stage-label')
      return {
        percent: (document.querySelector('.cloud-percent') || {}).textContent?.trim() || null,
        activeStage: active ? active.textContent.trim() : null,
        stages: document.querySelectorAll('.cloud-stage').length,
        done: document.querySelectorAll('.cloud-stage.done').length,
        whisper: (document.querySelector('.cloud-whisper') || {}).textContent?.trim() || null,
        note: (document.querySelector('.cloud-note') || {}).textContent?.trim() || null,
        barWidth: (document.querySelector('.cloud-bar-fill') || {}).style?.width || null,
        elapsed: (document.querySelector('.cloud-elapsed') || {}).textContent?.trim() || null,
      }
    })
    if (snap) {
      panelSeen = true
      const last = samples[samples.length - 1]
      if (!last || last.percent !== snap.percent || last.activeStage !== snap.activeStage || last.whisper !== snap.whisper) {
        samples.push(snap)
        console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${snap.percent} | ${snap.done}/${snap.stages} | ${snap.activeStage || '-'} | ${snap.whisper || '-'}`)
      }
      if (!shot && snap.done >= 1) {
        shot = true
        await page.locator('.stepper-wrapper').screenshot({ path: '/tmp/live-loading-panel.png' }).catch(() => {})
      }
    }
    await page.waitForTimeout(450)
  }

  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 120000 }).catch(() => {})
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.log('\n=== 一、生成过程面板 ===')
  check('加载期间出现过程面板', panelSeen, `采样 ${samples.length} 次`)
  const first = samples[0] || {}
  const last = samples[samples.length - 1] || {}
  check('面板有阶段清单', (first.stages || 0) >= 4, `${first.stages} 个阶段`)
  check('百分比随进度递增', parseInt(last.percent || '0', 10) > parseInt(first.percent || '0', 10), `${first.percent} → ${last.percent}`)
  check('进度条宽度绑定百分比', /%$/.test(last.barWidth || ''), String(last.barWidth))
  check('阶段文案会切换（真解析）', new Set(samples.map((s) => s.activeStage).filter(Boolean)).size >= 2,
    [...new Set(samples.map((s) => s.activeStage).filter(Boolean))].join(' → '))
  check('有阶段完成态', samples.some((s) => s.done > 0), `最多 ${Math.max(...samples.map((s) => s.done || 0))} 个 done`)
  check('有陪伴文案', samples.some((s) => s.whisper), `${new Set(samples.map((s) => s.whisper).filter(Boolean)).size} 条不同文案`)
  check('有诚实说明', !!(first.note && first.note.length > 6), (first.note || '').slice(0, 40))
  check('有秒表计时', /[0-9]/.test(last.elapsed || ''), String(last.elapsed))
  check('进入结果页', page.url().includes('/result'), `${elapsed}s`)

  // ---- 结果页图片 ----
  console.log('\n=== 二、景点配图 ===')
  await page.waitForTimeout(3000)
  // 逐屏滚动触发 lazy load
  const totalH = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < totalH; y += 700) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(160)
  }
  /*
   * 概览是 Swiper 横向轮播（用 transform 走位，不是原生滚动条）：
   * 必须用真实滚轮事件在容器上逐屏推进，才能把后面几张卡拖进视口、逼出懒加载。
   * 否则「没进过视口的图 naturalWidth=0」会被误判成坏图。
   */
  const box = await page.locator('.overview-swiper').boundingBox()
  let activeBefore = null, activeAfter = null
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    activeBefore = await page.evaluate(() => document.querySelectorAll('.overview-swiper .swiper-slide-active').length
      ? [...document.querySelectorAll('.overview-swiper .swiper-slide')].findIndex((s) => s.classList.contains('swiper-slide-active')) : -1)
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 260)
      await page.waitForTimeout(260)
    }
    activeAfter = await page.evaluate(() => [...document.querySelectorAll('.overview-swiper .swiper-slide')]
      .findIndex((s) => s.classList.contains('swiper-slide-active')))
  }
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)

  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('.result-container img, .content-wrapper img')].map((img) => ({
      src: (img.currentSrc || img.src || '').slice(0, 40),
      kind: (img.currentSrc || img.src || '').startsWith('data:') ? 'artwork'
        : /^https?:/.test(img.src) ? 'remote' : 'other',
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      cls: img.className || (img.closest('.swiper-slide-img') ? 'swiper-slide-img' : ''),
    }))
  )
  console.log('图片统计: ' + JSON.stringify({
    total: imgs.length,
    artwork: imgs.filter((i) => i.kind === 'artwork').length,
    remote: imgs.filter((i) => i.kind === 'remote').length,
    broken: imgs.filter((i) => i.nw === 0).length,
  }))
  check('结果页图片数量 > 0', imgs.length > 0, `${imgs.length} 张`)
  const broken = imgs.filter((i) => i.nw === 0)
  check('没有加载失败的空白图', broken.length === 0, broken.length ? JSON.stringify(broken.slice(0, 3)) : '全部 naturalWidth > 0')
  const overviewImgs = imgs.filter((i) => i.cls === 'swiper-slide-img')
  check('概览轮播可横向推进', activeAfter !== null && activeAfter > activeBefore, `activeIndex ${activeBefore} → ${activeAfter}`)
  check('概览景点卡片有图', overviewImgs.length > 0 && overviewImgs.every((i) => i.nw > 0),
    `${overviewImgs.length} 张，最小宽 ${Math.min(...overviewImgs.map((i) => i.nw))}`)

  await page.screenshot({ path: '/tmp/live-artwork-overview.png' })
  await page.evaluate(() => { const el = document.getElementById('days'); el && el.scrollIntoView() })
  await page.waitForTimeout(900)
  await page.screenshot({ path: '/tmp/live-artwork-days.png' })

  const real = [...new Set(errors)].filter((e) => !/favicon|Failed to load resource: net::ERR/.test(e))
  console.log('\n异常: ' + (real.length ? JSON.stringify(real.slice(0, 6)) : '无'))
  console.log('\n结论: ' + (failures.length ? `${failures.length} 项未通过 →\n  ` + failures.join('\n  ') : '全部通过'))
  await browser.close()
  process.exit(failures.length ? 1 : 0)
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
