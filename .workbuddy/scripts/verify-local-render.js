/**
 * 本地渲染核验（不碰线上、不写库）
 *
 * 做法：起本地 vite preview，用 Playwright 拦截 `/.cloud/**` 返回假数据（mock-plan.json），
 * 让结果页六个区块真实渲染出来，然后对几何 / 配色 / 锚点做断言并截图。
 *
 * 用法：
 *   cd frontend && npx vite preview --host 0.0.0.0 --port 4173 &
 *   cd <repo> && NODE_PATH=/Users/a1/.workbuddy/binaries/node/workspace/node_modules \
 *     /Users/a1/.workbuddy/binaries/node/versions/22.22.2-3/bin/node .workbuddy/scripts/verify-local-render.js
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

/** 拦截到的真实请求体（用来断言「发给模型的日期序列」本身是对的） */
let capturedChatBody = ''

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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)))

  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'auto', enabled: true, maxOutputTokens: 32000, credits: 'x9 credits', onlyReasoning: true },
          { id: 'deepseek-v4.1-flash', enabled: true, maxOutputTokens: 32000, credits: 'x0.11 credits' },
        ]),
      })
    if (url.includes('/llm/chat/completions')) {
      capturedChatBody = route.request().postData() || ''
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    }
    if (url.includes('/database/rest'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1800)

  /* ---------------- 首屏：hero 按内容收口，表单要落在第一屏 ---------------- */
  const heroAudit = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const rect = (el) => { const r = el.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) } }
    const hero = q('.hero'), nav = q('.app-nav'), title = q('.hero__title'), panel = q('.form-panel')
    const cs = panel ? getComputedStyle(panel) : null
    return {
      innerH: innerHeight,
      hero: rect(hero),
      navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
      titleTop: title ? Math.round(title.getBoundingClientRect().top) : null,
      panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : null,
      panelOpacity: cs ? cs.opacity : null,
    }
  })
  console.log('\n首屏几何: ' + JSON.stringify(heroAudit))
  check('hero 高度由内容决定（不再写死 100vh）', heroAudit.hero.h < heroAudit.innerH * 0.6, `hero ${heroAudit.hero.h}px / 视口 ${heroAudit.innerH}px`)
  check('导航底到主标题留白合理（≤120px）', heroAudit.titleTop - heroAudit.navBottom <= 120, `${heroAudit.titleTop - heroAudit.navBottom}px`)
  check('表单面板落在第一屏内', heroAudit.panelTop < heroAudit.innerH * 0.6, `panel top ${heroAudit.panelTop}px`)
  check('表单没有被 scroll 动画卡在初始透明态', heroAudit.panelOpacity === '1', `opacity=${heroAudit.panelOpacity}`)

  /* ---------------- 导航栏：窄屏不能被挤出屏幕 ---------------- */
  const navWidths = [1440, 991, 820, 700, 620, 560, 528, 414, 390, 360]
  const navOverflow = []
  for (const w of navWidths) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(220)
    const r = await page.evaluate(() => {
      const nav = document.querySelector('.app-nav')
      const right = Math.round(nav.getBoundingClientRect().right)
      const items = [...nav.querySelectorAll('.nav-pill, .nav-lang, .nav-cta')]
        .map((e) => { const b = e.getBoundingClientRect(); return { t: (e.textContent || 'lang').trim().slice(0, 12), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) } })
        .filter((x) => x.w > 0)
      return { right, items, clipped: items.filter((x) => x.r > right + 1 || x.l < -1).map((x) => x.t) }
    })
    if (r.clipped.length) navOverflow.push(`${w}px→[${r.clipped.join(',')}]`)
  }
  console.log('窄屏导航: ' + (navOverflow.length ? navOverflow.join(' | ') : '全宽段无裁切'))
  check('窄屏下登录/语言/CTA 不被挤出屏幕', navOverflow.length === 0, navOverflow.join(' | '))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.waitForTimeout(300)

  /* ---------------- 导航栏：去掉 GitHub 入口 + 登录可点开 ---------------- */
  const navAudit = await page.evaluate(() => {
    const nav = document.querySelector('.app-nav')
    return {
      githubLinks: nav ? [...nav.querySelectorAll('a[href*="github"]')].length : -1,
      brand: (nav.querySelector('.app-nav__name') || {}).textContent?.trim() || null,
      brandSvg: nav.querySelectorAll('.app-nav__logo svg').length,
      loginBtn: !!nav.querySelector('.nav-pill'),
      loginLabel: (nav.querySelector('.nav-pill') || {}).textContent?.trim() || null,
      // 旧版导航写「出门啦」、首屏写「TRIPSTAR」，同一个品牌两个名字
      strayTripstar: document.body.innerText.includes('TRIPSTAR'),
    }
  })
  console.log('\n导航栏: ' + JSON.stringify(navAudit))
  check('导航栏无 GitHub 入口', navAudit.githubLinks === 0, `${navAudit.githubLinks} 个 github 链接`)
  check(
    '品牌名唯一（不再「出门啦 / TRIPSTAR」两个名字打架）',
    !navAudit.strayTripstar,
    navAudit.strayTripstar ? '页面里仍出现 TRIPSTAR' : navAudit.brand
  )
  check('品牌有图形标识', navAudit.brandSvg === 1, `${navAudit.brandSvg} 个 svg`)
  check('登录按钮存在', navAudit.loginBtn, navAudit.loginLabel)

  await page.locator('.app-nav .nav-pill').click()
  await page.waitForTimeout(500)
  check('Landing 点登录能弹出登录框', await page.locator('.auth-card').isVisible())
  await page.locator('.auth-close').first().click()
  await page.waitForTimeout(400)
  check('登录框可关闭', !(await page.locator('.auth-card').isVisible()))

  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.locator('.submit-btn').last().click()
  await page.waitForTimeout(6500)

  check('进入结果页', (await page.evaluate(() => location.pathname)) === '/result')

  /* ---------------- 景点配图：全部要有图，且不能张张一样 ---------------- */
  /*
   * 等高德实拍图把插画全部换掉再审计。
   * 不要用固定等待：`operate=original` 偶发会撞上超时窗口，走一遍「6s 超时 → 退回缩略图」，
   * 固定 2.5s 会把这种「正在换」误判成「换了插画」。
   */
  await page
    .waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('.attraction-image, .overview-swiper .swiper-slide-img img')]
        if (!imgs.length) return false
        if (!imgs.every((im) => im.complete && im.naturalWidth > 0)) return false
        // 全部换成远程实拍图才算稳定（高德不可达时这里会一直等到超时，再由断言报出来）
        return imgs.every((im) => !(im.currentSrc || im.src).startsWith('data:'))
      },
      null,
      { timeout: 20000 },
    )
    .catch(() => {})
  await page.waitForTimeout(400)
  const artwork = await page.evaluate(() => {
    const digest = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
    const decode = (src) => { try { return atob(src.split(',')[1]) } catch { return '' } }
    const pick = (im) => {
      const src = im.currentSrc || im.src
      return {
        name: (im.alt || '').slice(0, 16),
        loaded: im.complete && im.naturalWidth > 0,
        nw: im.naturalWidth,
        host: (() => { try { return new URL(src).host } catch { return 'inline' } })(),
        original: /operate=original/.test(src),
        // 生成的插画里一定有日轮柔光渐变；旧的空白占位只有一块纯色渐变，没有它
        isArtwork: decode(src).includes('url(#glow)'),
        digest: digest(src),
      }
    }
    const day = [...document.querySelectorAll('.attraction-image')].map(pick)
    const overview = [...document.querySelectorAll('.overview-swiper .swiper-slide-img img')].map(pick)
    return { day, overview }
  })
  const allImgs = [...artwork.day, ...artwork.overview]
  const photoImgs = allImgs.filter((i) => /autonavi/.test(i.host))
  console.log(
    `\n景点配图: 每日行程 ${artwork.day.length} 张 / 概览 ${artwork.overview.length} 张` +
      `（高德实拍 ${photoImgs.length}，插画 ${allImgs.filter((i) => i.isArtwork).length}）`,
  )
  check('每日行程的景点图全部加载成功', artwork.day.length > 0 && artwork.day.every((i) => i.loaded), JSON.stringify(artwork.day.map((i) => i.loaded)))
  check('概览卡的图全部加载成功', artwork.overview.length > 0 && artwork.overview.every((i) => i.loaded), artwork.overview.map((i) => `${i.nw}px`).join(','))
  check('没有一张景点图是空白占位', allImgs.every((i) => i.loaded), `未加载 ${allImgs.filter((i) => !i.loaded).length} 张`)
  check('不同景点配图不重样', new Set(artwork.day.map((i) => i.digest)).size >= Math.min(4, artwork.day.length), `${new Set(artwork.day.map((i) => i.digest)).size} 种 / ${artwork.day.length} 张`)
  // 高德可达时应该是实拍图且用原图尺寸（默认缩略图只有 500px 宽，2x 屏会发虚）。
  // 注意：有些 POI 的「原图」本身就小（实测 800×600、600×800 都有），
  // 所以这里只断言「不比默认缩略图弱」，不去要求一个统一的分辨率下限。
  check('实拍图用的是原图（operate=original）', photoImgs.length === 0 || photoImgs.every((i) => i.original), `${photoImgs.filter((i) => i.original).length}/${photoImgs.length} 张带 original`)
  check('实拍图不比默认缩略图弱（≥500px）', photoImgs.length === 0 || photoImgs.every((i) => i.nw >= 500), `nw=${photoImgs.map((i) => i.nw).join(',')}`)
  check('概览卡按景点名去重', (() => { const n = artwork.overview.map((i) => i.name); return new Set(n).size === n.length })(), artwork.overview.map((i) => i.name).join(' | '))
  await page.locator('#overview').screenshot({ path: '/tmp/local-v9-overview.png' })
  await page.locator('.attraction-image-wrapper').first().screenshot({ path: '/tmp/local-v9-day-attr.png' })

  /* ---------------- 结果页导航栏：登录同样可点开 ---------------- */
  const resultNav = await page.evaluate(() => ({
    githubLinks: [...document.querySelectorAll('.app-nav a[href*="github"]')].length,
    loginLabel: (document.querySelector('.app-nav .nav-pill') || {}).textContent?.trim() || null,
  }))
  console.log('\n结果页导航栏: ' + JSON.stringify(resultNav))
  check('结果页导航栏无 GitHub 入口', resultNav.githubLinks === 0, `${resultNav.githubLinks} 个 github 链接`)

  await page.locator('.app-nav .nav-pill').click()
  await page.waitForTimeout(500)
  check('结果页点登录能弹出登录框', await page.locator('.auth-card').isVisible(), `按钮文案「${resultNav.loginLabel}」`)
  await page.locator('.auth-close').first().click()
  await page.waitForTimeout(400)
  check('结果页登录框可关闭', !(await page.locator('.auth-card').isVisible()))

  /* ---------------- 日期序列：不能差一天（时区回归） ---------------- */
  const promptSeries = (() => {
    const m = /日期序列[：:]\s*([0-9\-、]+)/.exec(capturedChatBody)
    return m ? m[1].split('、') : null
  })()
  const renderedDates = await page.evaluate(() => ({
    range: (document.querySelector('.overview-meta__date') || {}).textContent?.trim() || null,
    dayDates: [...document.querySelectorAll('.day-card__date')].map((e) => e.textContent.trim()),
    weatherHeroDate: (document.querySelector('#weather .date-day') || {}).textContent?.trim() || null,
    weatherWeekdays: [...document.querySelectorAll('#weather .day-name')].map((e) => e.textContent.trim()),
  }))
  console.log('\n日期: ' + JSON.stringify({ promptSeries, ...renderedDates }))
  check(
    '发给模型的日期序列未偏移（本地时区不再被 toISOString 倒推一天）',
    JSON.stringify(promptSeries) === JSON.stringify(['2026-10-05', '2026-10-06', '2026-10-07']),
    JSON.stringify(promptSeries)
  )
  check(
    '每日行程日期与所选一致',
    JSON.stringify(renderedDates.dayDates) === JSON.stringify(['2026-10-05', '2026-10-06', '2026-10-07']),
    JSON.stringify(renderedDates.dayDates)
  )
  check('概览日期区间显示所选起止', /2026-10-05/.test(renderedDates.range || '') && /2026-10-07/.test(renderedDates.range || ''), renderedDates.range)

  // 天气卡的大日期走 Intl 格式化，顺手验证「纯日期按本地时间解析」没把日期推前一天
  const weatherDate = await page.evaluate(() => {
    const el = document.querySelector('#weather .date-day')
    if (!el) return { ok: false, got: '(无 .date-day)', expected: '?' }
    const lang = (document.querySelector('.nav-lang .n-base-selection-label') || {}).textContent || 'English'
    const tag = /中文/.test(lang) ? 'zh-CN' : /日本語/.test(lang) ? 'ja-JP' : 'en-US'
    const expected = new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(2026, 9, 5))
    return { ok: el.textContent.trim() === expected, got: el.textContent.trim(), expected }
  })
  check('天气卡首日日期未偏移一天', weatherDate.ok, `${weatherDate.got} / 期望 ${weatherDate.expected}`)

  /* ---------------- 六个区块 ---------------- */
  const sections = await page.evaluate(() =>
    ['overview', 'budget', 'map', 'days', 'knowledge-graph', 'weather'].map((id) => {
      const el = document.getElementById(id)
      return { id, h: el ? Math.round(el.getBoundingClientRect().height) : 0 }
    })
  )
  console.log('\n区块高度: ' + JSON.stringify(sections))
  sections.forEach((s) => check(`区块 ${s.id} 存在且有高度`, s.h > 60, `${s.h}px`))

  /* ---------------- 概览轮播几何 ---------------- */
  const geo = await page.evaluate(() => {
    const sw = document.querySelector('#overview .swiper')
    const wrap = document.querySelector('#overview .swiper-wrapper')
    const slides = [...document.querySelectorAll('#overview .swiper-slide')]
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) } }
    const rects = slides.map(r)
    let worstOverlap = -999
    for (let i = 1; i < rects.length; i++) worstOverlap = Math.max(worstOverlap, rects[i - 1].r - rects[i].l)
    const heights = rects.map((x) => x.h)
    const first = slides[0]
    const h2 = first && first.querySelector('h2')
    // 真正的"被裁"要看卡片内所有可见子元素的底边有没有越过卡片底边
    let visibleClip = -999
    if (first) {
      const sb = first.getBoundingClientRect()
      first.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect()
        if (b.height > 0) visibleClip = Math.max(visibleClip, Math.round(b.bottom - sb.bottom))
      })
    }
    return {
      swiperRect: r(sw),
      wrapperTransform: getComputedStyle(wrap).transform,
      firstSlideLeftGap: rects[0] ? rects[0].l - Math.round(sw.getBoundingClientRect().left) : null,
      count: slides.length,
      equalHeights: new Set(heights).size === 1,
      heights,
      worstOverlap,
      visibleClip,
      h2Overflow: h2 ? getComputedStyle(h2).overflow : null,
    }
  })
  console.log('\n概览几何: ' + JSON.stringify(geo))
  check('轮播未整体偏移（无残留 translateX）', /matrix\(1, 0, 0, 1, 0, 0\)|none/.test(geo.wrapperTransform), geo.wrapperTransform)
  check('首卡紧贴容器左边', Math.abs(geo.firstSlideLeftGap) <= 1, `${geo.firstSlideLeftGap}px`)
  check('卡片不重叠', geo.worstOverlap <= 0, `最大重叠 ${geo.worstOverlap}px`)
  check('卡片等高', geo.equalHeights, JSON.stringify(geo.heights))
  check('内容未被裁切', geo.visibleClip <= 0, `越出卡片 ${geo.visibleClip}px`)
  check('标题溢出省略生效', geo.h2Overflow === 'hidden', geo.h2Overflow)

  const bleed = await page.evaluate(() => {
    let worst = 0
    document.querySelectorAll('#overview .swiper-slide').forEach((s) => {
      const h2 = s.querySelector('h2')
      if (!h2) return
      worst = Math.max(worst, Math.round(h2.getBoundingClientRect().right - s.getBoundingClientRect().right))
    })
    return worst
  })
  check('标题不越出卡片', bleed <= 0, `${bleed}px`)

  /* ---------------- 概览翻页按钮（桌面端 4 张一屏，后面几张必须有入口） ---------------- */
  const nav = await page.evaluate(async () => {
    const idx = () => [...document.querySelectorAll('#overview .swiper-slide')].findIndex((s) => s.classList.contains('swiper-slide-active'))
    const btn = (i) => document.querySelectorAll('.overview-nav-btn')[i]
    const initial = { count: document.querySelectorAll('.overview-nav-btn').length, active: idx(), prevDisabled: btn(0)?.disabled }
    btn(1)?.click()
    await new Promise((r) => setTimeout(r, 900))
    const afterNext = { active: idx(), prevDisabled: btn(0)?.disabled }
    for (let i = 0; i < 12; i++) { btn(1)?.click(); await new Promise((r) => setTimeout(r, 320)) }
    await new Promise((r) => setTimeout(r, 700))
    return {
      ...initial,
      afterNext,
      endActive: idx(),
      nextDisabledAtEnd: btn(1)?.disabled,
      slides: document.querySelectorAll('#overview .swiper-slide').length,
      imgLoaded: [...document.querySelectorAll('.overview-swiper img')].filter((i) => i.naturalWidth > 0).length,
      imgTotal: document.querySelectorAll('.overview-swiper img').length,
    }
  })
  console.log('\n概览翻页: ' + JSON.stringify(nav))
  check('卡片超过一屏时显示翻页按钮', nav.count === 2, `${nav.count} 个按钮 / ${nav.slides} 张卡`)
  check('起点上一页为禁用态', nav.prevDisabled === true, String(nav.prevDisabled))
  check('点下一页能推进轮播', nav.afterNext.active > nav.active, `${nav.active} → ${nav.afterNext.active}`)
  check(
    '推到底后下一页为禁用态',
    // 注意：末页的 activeIndex 是 slides - slidesPerView，不是 slides - 1，别按“最后一张卡”去断言
    nav.nextDisabledAtEnd === true && nav.endActive >= nav.afterNext.active,
    `active ${nav.endActive}/${nav.slides}（可见 ${nav.slides - nav.endActive} 张）nextDisabled ${nav.nextDisabledAtEnd}`
  )
  check('所有概览卡片图都已加载（eager，不留空白）', nav.imgLoaded === nav.imgTotal && nav.imgTotal > 0,
    `${nav.imgLoaded}/${nav.imgTotal}`)

  /* ---------------- 卡片 CTA 不被裁 ---------------- */
  const hover = await page.evaluate(async () => {
    const slide = document.querySelector('#overview .swiper-slide')
    slide.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 700))
    const btn = slide.querySelector('.show-more')
    return {
      btnH: Math.round(btn.getBoundingClientRect().height),
      clipped: Math.round(btn.getBoundingClientRect().bottom - slide.getBoundingClientRect().bottom),
    }
  })
  check('卡片「跳到当天」按钮完整可见（常显，不靠 hover 撑开）', hover.clipped <= 0 && hover.btnH > 0, `高 ${hover.btnH}px，越出卡片 ${hover.clipped}px`)

  /* ---------------- 主题 ---------------- */
  const theme = await page.evaluate(() => ({
    container: getComputedStyle(document.querySelector('.result-container')).backgroundColor,
    // 页面底色必须与全局 token 同源，不允许再出现硬编码的另一个浅灰
    appBgToken: getComputedStyle(document.documentElement).getPropertyValue('--c-bg-app').trim(),
    wrapper: getComputedStyle(document.querySelector('.content-wrapper')).backgroundColor,
    panel: (() => { const p = document.querySelector('.result-section .panel'); return p ? getComputedStyle(p).backgroundColor : 'n/a' })(),
    navBg: getComputedStyle(document.querySelector('.section-nav')).backgroundColor,
    sectionTitle: getComputedStyle(document.querySelector('.section-title')).color,
    hotelLabel: (() => { const l = document.querySelector('.hotel-card .hotel-facts dt'); return l ? getComputedStyle(l).color : 'n/a' })(),
  }))
  console.log('\n主题: ' + JSON.stringify(theme))
  const hexToRgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
    if (!m) return null
    const n = parseInt(m[1], 16)
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
  }
  check(
    '结果页底色与 --c-bg-app 同源（不再是另一套硬编码浅灰）',
    theme.container === hexToRgb(theme.appBgToken),
    `容器 ${theme.container} / token ${theme.appBgToken} → ${hexToRgb(theme.appBgToken)}`
  )
  /*
   * 改造后 .content-wrapper 是纯容器（透明），层级交给各区块自己的 .panel。
   * 以前是一张包住全页的大白卡，区块再套白卡 → 「卡中卡」层级糊掉。
   */
  check(
    '外层容器不再套大白卡，改由各区块自己成白色面板',
    theme.wrapper === 'rgba(0, 0, 0, 0)' && theme.panel === 'rgb(255, 255, 255)',
    `wrapper ${theme.wrapper} / panel ${theme.panel}`
  )
  const lum = (c) => { const m = /(\d+), (\d+), (\d+)/.exec(c); return m ? (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) / 255 : 1 }
  check('酒店标签文字为深色', lum(theme.hotelLabel) < 0.7, theme.hotelLabel)

  /* ---------------- 锚点跳转：sticky 导航不压标题 ---------------- */
  const navItems = page.locator('.section-nav .section-nav__item')
  const navCount = await navItems.count()
  let anchorOk = true
  const anchorLog = []
  for (const idx of [0, 1, 3, 5]) {
    if (idx >= navCount) continue
    await navItems.nth(idx).click()
    await page.waitForTimeout(1400)
    const info = await page.evaluate((i) => {
      const nav = document.querySelector('.section-nav').getBoundingClientRect()
      const titles = [...document.querySelectorAll('.section-title')]
      const t = titles[i] ? titles[i].getBoundingClientRect() : null
      return { navBottom: Math.round(nav.bottom), titleTop: t ? Math.round(t.top) : null, label: titles[i] ? titles[i].textContent.trim() : null }
    }, idx)
    const ok = info.titleTop !== null && info.titleTop >= info.navBottom
    if (!ok) anchorOk = false
    anchorLog.push(`${info.label}: 导航底${info.navBottom} / 标题顶${info.titleTop} ${ok ? 'OK' : '被遮挡'}`)
  }
  console.log('\n锚点跳转: ' + anchorLog.join(' | '))
  check('锚点跳转后标题未被导航遮挡', anchorOk)

  /* ---------------- 滚动联动高亮 ---------------- */
  await page.locator('#map').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
  const spy = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.section-nav .section-nav__item')]
    return { selected: items.findIndex((li) => li.className.includes('is-active')), label: (items.find((li) => li.className.includes('is-active')) || {}).textContent }
  })
  console.log('\n滚动到地图后高亮: ' + JSON.stringify(spy))
  check('滚动联动高亮跟随当前区块', spy.selected === 2, `选中第 ${spy.selected} 项（期望地图=2）`)

  /* ---------------- 截图 ---------------- */
  await page.locator('.section-nav .section-nav__item').first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: '/tmp/local-v3-overview.png' })
  for (const id of ['budget', 'map', 'days', 'weather']) {
    await page.locator('#' + id).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `/tmp/local-v3-${id}.png` })
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/local-v3-full.png', fullPage: true })

  console.log('\n异常: ' + (errors.length ? JSON.stringify([...new Set(errors)].slice(0, 6)) : '无'))
  console.log('\n结论: ' + (failures.length ? `${failures.length} 项未通过 →\n  ` + failures.join('\n  ') : '全部通过'))
  await browser.close()
  process.exit(failures.length ? 1 : 0)
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
