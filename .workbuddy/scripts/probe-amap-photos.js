/**
 * 景点真照片接入核验（本地假数据 + 真高德，不消耗云额度）
 * 覆盖：PlaceSearch 是否真的带回实拍图 / http→https 是否换掉 / 是否只在能解码时才换上 /
 *       导出 PNG 是否仍然成功（跨域照片有没有污染 canvas）
 * 用法：先起 vite preview，再 NODE_PATH=... node .workbuddy/scripts/probe-amap-photos.js
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

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  const amapReqs = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))
  page.on('request', (r) => { if (/autonavi|amap\.com/.test(r.url())) amapReqs.push(r.url().slice(0, 110)) })
  page.on('requestfailed', (r) => { if (/autonavi|amap\.com/.test(r.url())) errors.push('REQFAIL ' + r.url().slice(0, 110)) })

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

  console.log('城市字段: ' + await page.evaluate(() => JSON.stringify((document.querySelector('.overview-meta-item') || {}).textContent || '').slice(0, 20)))
  const t0 = Date.now()
  let lastPhotoCount = -1
  let stableSince = Date.now()
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500)
    const n = await page.evaluate(() => [...document.querySelectorAll('.result-container img')].filter((im) => /autonavi/.test(im.src) && im.naturalWidth > 0).length)
    if (n !== lastPhotoCount) {
      lastPhotoCount = n
      stableSince = Date.now()
      console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] 实拍图 ${n} 张`)
    }
    if (lastPhotoCount > 0 && Date.now() - stableSince > 9000) break
  }
  console.log(`照片到位用时 ≈ ${((stableSince - t0) / 1000).toFixed(1)}s`)

  const audit = await page.evaluate(() =>
    [...document.querySelectorAll('.result-container img')].map((img) => ({
      alt: (img.alt || '').slice(0, 16),
      host: (() => { try { return new URL(img.src).host } catch { return 'inline' } })(),
      proto: img.src.slice(0, 8),
      nw: img.naturalWidth,
      group: img.closest('#overview') ? 'overview' : img.closest('#days') ? 'days' : 'other',
    }))
  )
  const photo = audit.filter((x) => /autonavi/.test(x.host))
  console.log(`\n图片总数 ${audit.length}；高德实拍 ${photo.length}；插画 ${audit.filter((x) => x.proto.startsWith('data:')).length}`)
  audit.forEach((x) => console.log(`  ${x.group.padEnd(8)} ${String(x.nw).padStart(4)}px ${x.proto.startsWith('data:') ? 'artwork ' : x.host.padEnd(24)} ${x.alt}`))
  console.log('高德请求样本: ' + JSON.stringify([...new Set(amapReqs.map((u) => u.split('?')[0]))].slice(0, 6)))

  // ---- 直接问 JS API：为什么有些景点没拿到照片 ----
  const diag = await page.evaluate(async () => {
    const AMap = window.AMap
    if (!AMap || typeof AMap.PlaceSearch !== 'function') return 'AMap.PlaceSearch 不可用'
    const ps = new AMap.PlaceSearch({ city: '杭州', citylimit: true, pageSize: 5, extensions: 'all' })
    // 用页面上真实的名字（可能是模型给的、带括号后缀的名字），别用手打的字符串
    const domName = [...document.querySelectorAll('#days img')].map((i) => i.alt).find((a) => a.includes('雷峰塔')) || '雷峰塔'
    const run = (kw) =>
      new Promise((res) => {
        const t = setTimeout(() => res({ kw, status: 'TIMEOUT' }), 8000)
        ps.search(kw, (st, r) => {
          clearTimeout(t)
          const pois = (r && r.poiList && r.poiList.pois) || []
          res({ kw, status: st, info: r && r.info, pois: pois.map((p) => ({ name: p.name, photos: (p.photos || []).length, first: (p.photos || [])[0] && p.photos[0].url })) })
        })
      })
    const probeImg = (url) =>
      new Promise((res) => {
        const im = new Image()
        const t = setTimeout(() => res({ url, result: 'TIMEOUT' }), 9000)
        im.onload = () => { clearTimeout(t); res({ url, result: 'OK', nw: im.naturalWidth }) }
        im.onerror = () => { clearTimeout(t); res({ url, result: 'ERROR' }) }
        im.src = url
      })

    const r = await run(domName)
    const firstPhoto = r.pois && r.pois[0] && r.pois[0].first
    return {
      domName,
      search: { status: r.status, info: r.info, first3: (r.pois || []).slice(0, 3) },
      loadHttps: firstPhoto ? await probeImg(firstPhoto.replace(/^http:\/\//, 'https://')) : 'no photo in result',
    }
  })
  console.log('\nPlaceSearch 诊断: ' + JSON.stringify(diag, null, 1))

  // ---- 导出 PNG 是否仍然可用（跨域照片不得污染 canvas） ----
  await page.locator('.top-switch-actions button:has-text("Export Trip")').first().click().catch(() => {})
  await page.waitForTimeout(600)
  await page.locator('.n-dropdown-option:has-text("Export as Image"), .n-dropdown-option:has-text("导出")').first().click().catch(() => {})
  let exportOk = null
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(700)
    const st = await page.evaluate(() => ({
      ok: !!document.querySelector('.n-message--success-type'),
      err: (document.querySelector('.n-message--error-type') || {}).textContent || null,
    }))
    if (st.ok) { exportOk = { ok: true }; break }
    if (st.err) { exportOk = { ok: false, err: st.err }; break }
  }
  console.log('\n导出 PNG: ' + JSON.stringify(exportOk))
  console.log('异常: ' + (errors.length ? JSON.stringify([...new Set(errors)].slice(0, 6)) : '无'))
  await page.locator('#days').screenshot({ path: '/tmp/amap-photos-days.png' }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600)
  await page.locator('#overview').screenshot({ path: '/tmp/amap-photos-overview.png' }).catch(() => {})
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
