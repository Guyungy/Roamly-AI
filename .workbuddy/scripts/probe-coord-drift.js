/**
 * 量化「LLM 给的坐标」与「高德真实坐标」差多远。
 *
 * 背景：线上（云模式）的景点坐标是模型生成的，没有经过任何地理编码校正，
 * 而地图标记直接用这个坐标定位。本探针用页面里已有的高德 JS API（PlaceSearch）
 * 反查同一景点名的真实坐标，算直线偏差 —— 偏差大就意味着标记落在错的地方。
 *
 * 用法：PREVIEW_URL=http://localhost:4174 node .workbuddy/scripts/probe-coord-drift.js
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4174'
const PLAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock-plan.json'), 'utf8'))

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })

  // 首页只需要高德能加载起来，接口随便挡掉
  await page.route('**/.cloud/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)

  // 在页面里触发一次城市输入，确保 AutoComplete（= AMap loader）已被加载
  const city = page.locator('.n-auto-complete input').first()
  if (await city.count()) {
    await city.click()
    await city.fill('杭州')
    await page.waitForTimeout(2500)
  }

  const targets = PLAN.days.flatMap((d) => d.attractions).map((a) => ({
    name: a.name,
    lng: a.location.longitude,
    lat: a.location.latitude,
  }))

  const rows = await page.evaluate(async (items) => {
    // loader 是模块级 promise，页面里拿不到；直接复用 window 上已注入的 AMap
    const AMap = window.AMap
    if (!AMap || typeof AMap.PlaceSearch !== 'function') {
      return { error: '页面上没有 AMap.PlaceSearch（高德未加载）' }
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    // 每个关键词独立实例 —— 共用一个会串台（见 Result.vue 的注释）
    const search = (kw) =>
      new Promise((resolve) => {
        const ps = new AMap.PlaceSearch({ city: '杭州', citylimit: true, pageSize: 10, extensions: 'all' })
        let done = false
        const finish = (v) => {
          if (done) return
          done = true
          resolve(v)
        }
        setTimeout(() => finish(null), 8000)
        ps.search(kw, (status, result) => {
          if (status !== 'complete') return finish(null)
          const pois = result?.poiList?.pois ?? []
          finish(pois[0] ?? null)
        })
      })

    const haversine = (a, b) => {
      const R = 6371000
      const toRad = (d) => (d * Math.PI) / 180
      const dLat = toRad(b.lat - a.lat)
      const dLng = toRad(b.lng - a.lng)
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
      return Math.round(2 * R * Math.asin(Math.sqrt(s)))
    }

    const out = []
    for (const it of items) {
      const kw = it.name.replace(/[（(].*?[)）]/g, '').trim() || it.name
      const poi = await search(kw)
      await sleep(250)
      if (!poi?.location) {
        out.push({ name: it.name, mock: { lng: it.lng, lat: it.lat }, realName: null, real: null, driftM: null })
        continue
      }
      const real = { lng: poi.location.lng, lat: poi.location.lat }
      out.push({
        name: it.name,
        mock: { lng: it.lng, lat: it.lat },
        realName: poi.name,
        real,
        driftM: haversine({ lng: it.lng, lat: it.lat }, real),
        address: poi.address ?? null,
      })
    }
    return { rows: out }
  }, targets)

  if (rows.error) {
    console.log('❌ ' + rows.error)
  } else {
    console.log(`\n坐标漂移实测（城市：${PLAN.city}，起点为「模型给的坐标」）\n`)
    console.log(
      '景点'.padEnd(26) + '模型坐标'.padEnd(24) + '高德真实坐标'.padEnd(24) + '偏差'
    )
    for (const r of rows.rows) {
      const m = `${r.mock.lng.toFixed(4)},${r.mock.lat.toFixed(4)}`
      const real = r.real ? `${r.real.lng.toFixed(4)},${r.real.lat.toFixed(4)}` : '（搜不到）'
      console.log(
        (r.name || '').slice(0, 24).padEnd(26) +
          m.padEnd(24) +
          real.padEnd(24) +
          (r.driftM == null ? '—' : r.driftM >= 1000 ? `${(r.driftM / 1000).toFixed(2)} km` : `${r.driftM} m`)
      )
    }
    const valid = rows.rows.filter((r) => r.driftM != null)
    if (valid.length) {
      const worst = valid.reduce((a, b) => (b.driftM > a.driftM ? b : a))
      const avg = Math.round(valid.reduce((s, r) => s + r.driftM, 0) / valid.length)
      console.log(`\n平均偏差 ${avg} m；最大偏差 ${worst.driftM} m（${worst.name}）`)
    }
  }

  await browser.close()
})().catch((e) => {
  console.error('失败: ' + e.message)
  process.exit(1)
})
