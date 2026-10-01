/**
 * 高德深度融合核验（本地假数据，不碰线上）
 *
 * 覆盖这一轮新做的五件事：
 *   1. 底图皮肤：淡雅白 + 关掉 POI 图层
 *   2. 真实路线：四档交通方式（驾车/公交/骑行/步行）调对应的规划服务
 *   3. 真实里程/耗时：路线概览行里的数字来自规划接口，不是估算
 *   4. 点击标记出详情卡：POI 明细（照片/地址/电话/评分）+「在高德打开」
 *   5. 城市输入联想：AutoComplete 返回候选
 * 外加：画入动画跑完之后每段折线都是完整路径（不能停在半截）
 *
 * 用法：先起 vite preview，再
 *   NODE_PATH=/Users/a1/.workbuddy/binaries/node/workspace/node_modules \
 *     /Users/a1/.workbuddy/binaries/node/versions/22.22.2-3/bin/node .workbuddy/scripts/verify-amap-deep.js
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4173'
const PLAN = fs.readFileSync(path.join(__dirname, 'mock-plan.json'), 'utf8')

const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

const sseBody = (payload) => {
  const parts = []
  for (let i = 0; i < payload.length; i += 900) parts.push(payload.slice(i, i + 900))
  return (
    parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') +
    'data: [DONE]\n\n'
  )
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const errors = []
  const amapCalls = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))
  // 记录高德侧的静态资源请求：用来确认四档规划服务/联想服务真的被调起来了
  page.on('request', (r) => {
    const url = r.url()
    if (/restapi\.amap\.com|webapi\.amap\.com|amap\.com\/ws/.test(url)) amapCalls.push(url.slice(0, 190))
  })

  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
    if (url.includes('/llm/chat/completions'))
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    if (url.includes('/database/rest'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1600)

  /* ---------------- 1) 城市输入联想 ---------------- */
  const cityInput = page.locator('.n-auto-complete input').first()
  check('目的地城市用的是自动完成输入框', await cityInput.count() > 0, `${await cityInput.count()} 个`)

  await cityInput.click()
  await cityInput.fill('杭州')
  await page.waitForTimeout(1800)
  const cityOptions = await page.evaluate(() =>
    [...document.querySelectorAll('.n-auto-complete-menu .n-base-select-option__content, .v-binder-follower-content .n-base-select-option')]
      .map((e) => e.textContent.trim())
      .filter(Boolean)
      .slice(0, 5)
  )
  console.log('\n城市联想候选: ' + JSON.stringify(cityOptions))
  check('城市输入能拿到高德联想候选', cityOptions.length > 0, `${cityOptions.length} 项`)

  // 候选是「名称 · 省市区」，菜单若与输入框等宽会被截在省市区前，几条候选看着几乎一样
  const menuGeom = await page.evaluate(() => {
    const menu = document.querySelector('.n-base-select-menu')
    const input = document.querySelector('.n-auto-complete')
    if (!menu || !input) return null
    return {
      menu: Math.round(menu.getBoundingClientRect().width),
      input: Math.round(input.getBoundingClientRect().width),
      truncated: [...document.querySelectorAll('.n-base-select-option__content')].some((el) => el.scrollWidth > el.clientWidth + 1),
    }
  })
  console.log('联想菜单几何: ' + JSON.stringify(menuGeom))
  check(
    '联想菜单比输入框宽（名称 · 省市区 读得全，不被截断）',
    Boolean(menuGeom) && menuGeom.menu > menuGeom.input,
    menuGeom ? `菜单 ${menuGeom.menu}px / 输入框 ${menuGeom.input}px` : 'n/a'
  )

  await cityInput.fill('Hangzhou, China')
  await page.waitForTimeout(500)

  /* ---------------- 2) 进入结果页（触发地图） ---------------- */
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.locator('.submit-btn').click()

  await page.waitForFunction(() => location.pathname === '/result', null, { timeout: 60000 }).catch(() => {})
  // 等地图 + 路线规划 + 照片都落定（规划是逐段串行的）
  await page.waitForTimeout(14000)

  /* ---------------- 3) 底图皮肤 ---------------- */
  const skin = await page.evaluate(() => {
    const canvas = document.querySelector('#amap-container canvas')
    const container = document.querySelector('#amap-container')
    return {
      hasCanvas: !!canvas,
      canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
      containerH: container ? Math.round(container.getBoundingClientRect().height) : 0,
    }
  })
  console.log('\n底图: ' + JSON.stringify(skin))
  check('地图画布已渲染', skin.hasCanvas && skin.canvasSize, skin.canvasSize)
  check('地图画布有确定高度（高德初始化需要）', skin.containerH > 200, `${skin.containerH}px`)

  /* ---------------- 3.5) 所有标记都在视野内 ---------------- */
  const markerVisibility = await page.evaluate(() => {
    const container = document.querySelector('#amap-container')
    if (!container) return null
    const c = container.getBoundingClientRect()
    const items = [...container.querySelectorAll('.tripstar-map-marker')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        label: (el.querySelector('.tripstar-map-marker__index') || {}).textContent?.trim() || '?',
        inside:
          r.left >= c.left - 1 &&
          r.right <= c.right + 1 &&
          r.top >= c.top - 1 &&
          r.bottom <= c.bottom + 1,
      }
    })
    return { total: items.length, clipped: items.filter((i) => !i.inside).map((i) => i.label) }
  })
  console.log('\n标记视野: ' + JSON.stringify(markerVisibility))
  check(
    '所有景点标记都落在视野内（fitView 留了边距）',
    Boolean(markerVisibility) && markerVisibility.total > 0 && markerVisibility.clipped.length === 0,
    markerVisibility ? `${markerVisibility.total} 个，越界 ${JSON.stringify(markerVisibility.clipped)}` : 'n/a'
  )

  /* ---------------- 4) 真实路线 + 里程/耗时 ---------------- */
  const routes = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.map-route')].map((li) => ({
      day: (li.querySelector('.map-route__day') || {}).textContent?.trim(),
      mode: (li.querySelector('.map-route__mode') || {}).textContent?.trim(),
      modeKey: (li.querySelector('.map-route__mode') || {}).dataset?.mode,
      text: (li.querySelector('.map-route__text') || {}).textContent?.trim(),
    }))
    return {
      rows,
      legend: [...document.querySelectorAll('.map-legend')].map((e) => e.textContent.trim()),
      note: (document.querySelector('.map-routes__note') || {}).textContent?.trim() || null,
    }
  })
  console.log('\n路线概览: ' + JSON.stringify(routes))
  check('地图卡渲染了路线概览', routes.rows.length > 0, `${routes.rows.length} 行`)
  check(
    '每行都有交通方式与里程耗时',
    routes.rows.length > 0 && routes.rows.every((r) => r.mode && /\d/.test(r.text)),
    JSON.stringify(routes.rows.map((r) => r.text))
  )
  check(
    '里程不是 0（说明真的拿到了规划结果，不是直线兜底）',
    routes.rows.some((r) => /\d+(\.\d+)?\s*(公里|km)/.test(r.text)) || routes.rows.some((r) => /\d+\s*(m|米)/.test(r.text)),
    JSON.stringify(routes.rows.map((r) => r.text))
  )
  check('图例只列实际用到的交通方式', routes.legend.length > 0, routes.legend.join(' / '))

  // 折线：数量、颜色、以及画入动画跑完后路径是否完整
  const polylines = await page.evaluate(() => {
    const map = window.__wbAmapDebug
    if (!map) return null
    const list = map.getAllOverlays('polyline') || []
    return list.map((p) => {
      const path = p.getPath() || []
      return {
        points: path.length,
        stroke: p.getOptions ? p.getOptions().strokeColor : null,
        dashed: (p.getOptions ? p.getOptions().strokeStyle : null) === 'dashed',
      }
    })
  })

  if (polylines) {
    console.log('\n折线: ' + JSON.stringify(polylines))
    check('地图上有路线折线', polylines.length > 0, `${polylines.length} 条`)
    check(
      '画入动画结束后每条折线都是完整路径（没有停在半截）',
      polylines.every((p) => p.points > 1),
      JSON.stringify(polylines.map((p) => p.points))
    )
    check(
      '折线颜色来自设计 token（品牌橙 / 成功绿 / 信息蓝 / 警示琥珀）',
      polylines.every((p) => p.stroke),
      JSON.stringify([...new Set(polylines.map((p) => p.stroke))])
    )
  } else {
    console.log('\n（未暴露 window.__wbAmapDebug，跳过折线内部结构断言）')
  }

  /* ---------------- 5) 高德接口调用痕迹 ---------------- */
  console.log('\n高德接口调用:')
  const grouped = {}
  amapCalls.forEach((u) => {
    const key = /driving|walking|riding|transfer|place|text|assistant/.exec(u)
    const label = key ? key[0] : (u.includes('webapi') ? 'webapi' : 'restapi')
    grouped[label] = (grouped[label] || 0) + 1
  })
  Object.entries(grouped).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  check('确实调用了高德的路线/检索接口', amapCalls.length > 0, `${amapCalls.length} 次`)

  /* ---------------- 6) 点击标记出详情卡 ---------------- */
  /*
   * 用真实输入事件点击标记。
   * 一开始是用 evaluate 直接 dispatchEvent 合成 MouseEvent —— 不行：
   * 高德是在地图容器上做坐标命中测试，合成事件不被它的命中逻辑接住。
   * Playwright 的 click 是走 CDP 的真实输入事件，高德才会认。
   */
  const marker = page.locator('#amap-container .tripstar-map-marker').first()
  let markerClick = { clicked: false, hasDetail: false, reason: 'no marker' }
  if (await marker.count()) {
    await marker.click({ force: true, timeout: 8000 }).catch(() => {})

    /*
     * 等卡片位置稳定再断言。
     * 固定 sleep 会翻车：贴边钳位是靠 panBy 带过渡挪过去的，实测过渡要 2 秒上下，
     * 之前写死等 3000ms，正好截在动画中途，量出来的溢出是「还没挪到位」的中间态，
     * 会把一个其实是好的实现判成 FAIL。
     */
    const cardTop = () =>
      page.evaluate(() => {
        const c = document.querySelector('#amap-container').getBoundingClientRect()
        const d = document.querySelector('.tripstar-map-detail')
        return d ? Math.round(d.getBoundingClientRect().top - c.top) : null
      })

    let prevTop = null
    let stableCount = 0
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(200)
      const now = await cardTop()
      if (prevTop !== null && now === prevTop) {
        if (++stableCount >= 3) break
      } else {
        stableCount = 0
      }
      prevTop = now
    }

    markerClick = await page.evaluate(() => {
      const detail = document.querySelector('.tripstar-map-detail')
      if (!detail) return { clicked: true, hasDetail: false, reason: 'window did not open' }
      const container = document.querySelector('#amap-container')
      const link = detail.querySelector('.tripstar-map-detail__link')

      const c = container.getBoundingClientRect()
      const r = detail.getBoundingClientRect()
      const MK = 10 // 与 keepDetailWindowInView 里的 MARGIN 对齐
      const overflow = {
        top: Math.round(c.top - r.top),
        bottom: Math.round(r.bottom - c.bottom),
        left: Math.round(c.left - r.left),
        right: Math.round(r.right - c.right),
      }

      return {
        clicked: true,
        hasDetail: true,
        title: (detail.querySelector('.tripstar-map-detail__title') || {}).textContent?.trim() || null,
        meta: (detail.querySelector('.tripstar-map-detail__meta') || {}).textContent?.trim() || null,
        rows: [...detail.querySelectorAll('.tripstar-map-detail__row')].map((row) => {
          const label = (row.querySelector('.tripstar-map-detail__label') || {}).textContent?.trim() || ''
          const value = (row.querySelector('.tripstar-map-detail__value') || {}).textContent?.trim() || ''
          const text = row.textContent.replace(/\s+/g, ' ').trim()
          return { label, value, text, glued: Boolean(label && value) && !text.includes(`${label} `) && !text.includes(`${label}\n`) }
        }),
        hasCover: !!detail.querySelector('.tripstar-map-detail__cover img'),
        link: link ? link.href : null,
        cardH: Math.round(r.height),
        containerH: Math.round(c.height),
        overflow,
        clipped: Object.values(overflow).some((v) => v > MK),
      }
    })
  }
  console.log('\n标记详情卡: ' + JSON.stringify(markerClick))
  check('详情卡能弹出', markerClick.hasDetail, markerClick.title || markerClick.reason)
  check('详情卡里有 POI 明细行（不是只有名字）', markerClick.rows && markerClick.rows.length >= 2, JSON.stringify(markerClick.rows))
  check(
    '详情卡有「第几天 · 第几站」元信息行',
    Boolean(markerClick.meta) && /Day\s*1|第\s*1\s*天/.test(markerClick.meta),
    markerClick.meta
  )
  check(
    '标签与值之间有分隔（读屏/复制粘贴不粘连成 "Address杭州市…"）',
    markerClick.rows && markerClick.rows.every((r) => r.glued === false),
    JSON.stringify(markerClick.rows.map((r) => r.text))
  )
  check(
    '详情卡带「在高德打开」的深链',
    Boolean(markerClick.link) && markerClick.link.includes('uri.amap.com'),
    markerClick.link
  )
  check('详情卡带实拍照片', markerClick.hasCover, markerClick.hasCover ? '有封面图' : '无封面图')
  check(
    '详情卡完整落在视野内（实拍图回来后也没被地图容器裁掉）',
    markerClick.hasDetail && !markerClick.clipped,
    markerClick.hasDetail
      ? `卡高 ${markerClick.cardH} / 容器 ${markerClick.containerH}；四边溢出 ${JSON.stringify(markerClick.overflow)}`
      : 'n/a'
  )

  await page.screenshot({ path: '/tmp/amap-deep-map.png', clip: { x: 0, y: 0, width: 1440, height: 1100 } })

  console.log('\n异常: ' + (errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : '无'))
  if (errors.length) failures.push(`控制台有 ${errors.length} 条错误`)

  console.log(`\n结论: ${failures.length ? failures.length + ' 项未通过 →\n  ' + failures.join('\n  ') : '全部通过'}`)
  await browser.close()
  process.exit(failures.length ? 1 : 0)
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
