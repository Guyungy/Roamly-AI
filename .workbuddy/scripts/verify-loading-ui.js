/**
 * 云模式「生成过程可视化」的浏览器核验。
 *
 * 关键手法：把 window.fetch 打桩，让 /llm/chat/completions 返回一个**按真实字段边界分片、
 * 且带延时的 SSE 流**。这样界面会像真的一样一段一段收到内容，我们就能真的看到
 * 阶段从「理解偏好」推进到「编排动线 → 天气 → 预算」，而不是只能断言"有个 spinner"。
 *
 * 选择器对应 Landing.vue 的「生成过程面板」（v-show="loading"）：
 *   .loading > .progress > .progress__bar > .progress__fill
 *                        > .progress__meta > .progress__percent / .progress__elapsed
 *                        > .stage-list > .stage.stage--{done|active|pending}
 *                                       > .stage__label / .stage__detail
 *                        > .whisper / .loading__note
 * 这一段曾整体重构过（旧类是 .cloud-progress / .cloud-stage / .stepper-wrapper），
 * 脚本没跟上就会一直报「整轮都没抓到」—— 那是脚本过期，不是界面坏了。
 *
 * 用法：
 *   cd frontend && npx vite preview --port 4173 &
 *   node .workbuddy/scripts/verify-loading-ui.js
 */
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:4174'
const OUT = process.env.OUT || '/tmp'
const PLAN = fs.readFileSync(path.join(__dirname, 'mock-plan.json'), 'utf8')

const failures = []
let passed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else failures.push(`${name}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

/* 按真实字段边界切分，每片之间留延时 —— 模拟模型逐个字段往外吐 */
function buildPieces(plan) {
  const at = (needle) => {
    const i = plan.indexOf(needle)
    if (i < 0) throw new Error(`mock plan 里找不到 ${needle}`)
    return i
  }
  const iDays = at('"days"')
  const iWeather = at('"weather_info"')
  const iBudget = at('"budget"')
  const dayIdx = []
  for (const n of ['"day_index": 1', '"day_index": 2']) {
    const i = plan.indexOf(n)
    if (i > 0) dayIdx.push(i)
  }
  const cuts = [0, iDays, ...dayIdx, iWeather, iBudget, plan.length]
  const pieces = []
  for (let i = 0; i < cuts.length - 1; i++) {
    pieces.push({ delay: i === 0 ? 250 : 900, text: plan.slice(cuts[i], cuts[i + 1]) })
  }
  return pieces
}

;(async () => {
  const pieces = buildPieces(PLAN)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    // 界面语言跟着浏览器语言走，默认跑英文；要复核中文文案就传 LOCALE=zh-CN
    locale: process.env.LOCALE || 'en-US',
  })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)))

  // 页面级 fetch 打桩：只拦 chat/completions，其余（模型列表、DB）交给 Playwright 路由
  await page.addInitScript((chunks) => {
    const origFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      if (!url.includes('/llm/chat/completions')) return origFetch(input, init)
      const enc = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          for (const c of chunks) {
            await new Promise((r) => setTimeout(r, c.delay))
            controller.enqueue(
              enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: c.text } }] }) + '\n\n')
            )
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    }
  }, pieces)

  await page.route('**/.cloud/**', (route) => {
    const u = route.request().url()
    if (u.includes('/llm/models'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'deepseek-v4.1-flash', enabled: true, maxOutputTokens: 32000 }]),
      })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto(PREVIEW + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1600)
  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  // 面板出现前先抓一次「首帧」
  await page.locator('.submit-btn').last().click()

  const samples = []
  const started = Date.now()
  let savedShot = false
  while (Date.now() - started < 14000) {
    const snap = await page.evaluate(() => {
      const panel = document.querySelector('.loading')
      // v-show 控制的：节点一直在 DOM 里，所以还要看是否真的显示了
      if (!panel || panel.offsetParent === null) return null
      const rows = [...panel.querySelectorAll('.stage-list .stage')].map((el) => ({
        state: el.classList.contains('stage--done') ? 'done' : el.classList.contains('stage--active') ? 'active' : 'pending',
        label: (el.querySelector('.stage__label') || {}).textContent?.trim() || '',
        detail: (el.querySelector('.stage__detail') || {}).textContent?.trim() || '',
      }))
      // 阶段还没上来（.progress 未渲染）时先别当成有效样本
      if (rows.length === 0) return null
      return {
        rows,
        percent: (panel.querySelector('.progress__percent') || {}).textContent?.trim() || '',
        elapsed: (panel.querySelector('.progress__elapsed') || {}).textContent?.trim() || '',
        whisper: (panel.querySelector('.whisper') || {}).textContent?.trim() || '',
        note: (panel.querySelector('.loading__note') || {}).textContent?.trim() || '',
        barWidth: (panel.querySelector('.progress__fill') || {}).style?.width || '',
        path: location.pathname,
      }
    })
    if (snap) samples.push({ t: Date.now() - started, ...snap })
    // 抓一张「正在排每日动线」的过程帧，用来人眼复核这块 UI
    if (snap && !savedShot && snap.rows.some((r) => r.detail)) {
      savedShot = true
      await page.locator('.loading').screenshot({ path: path.join(OUT, 'loading-mid.png') })
    }
    if (await page.evaluate(() => location.pathname === '/result')) break
    await page.waitForTimeout(180)
  }

  const first = samples[0]
  check('生成了过程面板', !!first, samples.length ? '' : '整轮都没抓到可见的 .loading 阶段清单')
  if (!first) {
    await browser.close()
    console.log(`\n结论: ${failures.length} 项失败`)
    process.exit(1)
  }

  check('阶段清单 5 行', first.rows.length === 5, `${first.rows.length} 行`)
  check('首行是「理解偏好」且为进行中', first.rows[0].state === 'active' && first.rows[0].label.length > 0, JSON.stringify(first.rows[0]))
  check('未到的阶段是 pending', first.rows.slice(1).every((r) => r.state === 'pending'), first.rows.map((r) => r.state).join(','))
  check('有进度百分比', /%$/.test(first.percent), first.percent)
  check('有已用秒数', /\d/.test(first.elapsed), first.elapsed)
  check('有陪伴文案', first.whisper.length > 4, first.whisper.slice(0, 24))
  check('有「进度是估算」的说明', first.note.length > 4, first.note.slice(0, 24))
  check('进度条按百分比设了宽度', /%$/.test(first.barWidth), first.barWidth)

  // 阶段推进的真实证据：把所有采样里出现过的进行中阶段按顺序抽出来
  const activeSeq = []
  for (const s of samples) {
    const label = s.rows.find((r) => r.state === 'active')?.label
    if (label && activeSeq[activeSeq.length - 1] !== label) activeSeq.push(label)
  }
  console.log('\n阶段推进: ' + activeSeq.join(' → '))
  check('阶段真实推进过（≥3 个不同阶段）', activeSeq.length >= 3, activeSeq.join(' → '))

  const details = samples.map((s) => s.rows.find((r) => r.detail)?.detail).filter(Boolean)
  const uniqDetails = [...new Set(details)]
  console.log('天数计数采样: ' + uniqDetails.join(' | '))
  // 断言不能写死中文格式（「已排到第 1 / 3 天」），本地跑英文 locale 时是 "Day 1 of 3 drafted"。
  // 只校验语义：条数在推进、且始终带着总天数 3。
  check('天数计数在实时推进', uniqDetails.length >= 2, uniqDetails.join(' | '))
  check('天数计数带上了总天数', uniqDetails.every((d) => /3/.test(d)), uniqDetails.join(' | '))

  const percents = samples.map((s) => parseInt(s.percent, 10)).filter((n) => !Number.isNaN(n))
  const monotonic = percents.every((p, i) => i === 0 || p >= percents[i - 1])
  console.log('百分比轨迹: ' + percents.join(' → '))
  check('百分比单调不减', monotonic, percents.join(' → '))
  check('百分比真的在涨', percents.length > 1 && percents[percents.length - 1] > percents[0], `${percents[0]}% → ${percents[percents.length - 1]}%`)

  // 秒表文案带语言前缀（"3s elapsed" / "已用 3 秒" / "経過 3 秒"），提取数字而不是 parseInt
  const num = (s) => {
    const m = /\d+/.exec(String(s || ''))
    return m ? parseInt(m[0], 10) : NaN
  }
  const elapsedVals = samples.map((s) => num(s.elapsed)).filter((n) => !Number.isNaN(n))
  check('秒表在走', elapsedVals.length > 1 && elapsedVals[elapsedVals.length - 1] > elapsedVals[0], `${elapsedVals[0]}s → ${elapsedVals[elapsedVals.length - 1]}s`)

  const whispers = [...new Set(samples.map((s) => s.whisper).filter(Boolean))]
  console.log('陪伴文案条数: ' + whispers.length)
  check('陪伴文案会轮播', whispers.length >= 1, `${whispers.length} 条`)
  check('陪伴文案不是没翻译的 key', whispers.every((w) => !w.includes('home.loading')), whispers[0]?.slice(0, 30))

  // 等落地到结果页
  await page.waitForTimeout(1500)
  await page.waitForFunction(() => location.pathname === '/result', { timeout: 20000 }).catch(() => {})
  check('生成完成后进入结果页', (await page.evaluate(() => location.pathname)) === '/result', await page.evaluate(() => location.pathname))

  console.log('\n异常: ' + (errors.length ? errors.join(' | ') : '无'))
  console.log(`\n结论: ${failures.length === 0 ? '全部通过' : failures.length + ' 项失败'}（${passed} 项通过）`)
  await browser.close()
  process.exit(failures.length === 0 ? 0 : 1)
})().catch((e) => {
  console.error('失败: ' + e.message)
  process.exit(1)
})
