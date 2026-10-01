/**
 * POI 检索打分诊断（本地假数据 + 真高德）
 * 目的：看某个景点名搜出来的候选里，正主为什么没被选中 / 照片为什么没拿到。
 * 用法：先起 vite preview，再 NODE_PATH=... node .workbuddy/scripts/probe-poi-name-scoring.js [城市] [名字1] [名字2] ...
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

const CITY = process.argv[2] || '杭州'
const NAMES = process.argv.slice(3)
if (!NAMES.length) {
  console.error('用法: node probe-poi-name-scoring.js <城市> <名字...>')
  process.exit(1)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('**/.cloud/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/llm/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'auto', enabled: true, maxOutputTokens: 32000 }]) })
    if (url.includes('/llm/chat/completions')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(PLAN) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.getByPlaceholder(/Enter a city|输入城市名称|都市名を入力/).fill('Hangzhou, China')
  const pickers = page.locator('.n-date-picker input')
  await pickers.nth(0).click(); await page.keyboard.type('2026-10-05'); await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await pickers.nth(1).click(); await page.keyboard.type('2026-10-07'); await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.locator('.submit-btn').click()
  await page.waitForFunction(() => window.AMap && window.AMap.PlaceSearch, null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const out = await page.evaluate(
    async ({ city, names }) => {
      const res = {}
      for (const kw of names) {
        // 页面里那份打分函数的等价复刻，只为看清「谁被淘汰了」
        const NOISE = /停车场|停车楼|售票|出入口|入口|出口|大门|东门|南门|西门|北门|卫生间|厕所|游客中心|服务中心|派出所|公交站|地铁站|便利店|超市|商店|餐厅|酒楼|宾馆|公寓|住宿|路口|岗亭|管理处|办公楼|宿舍|仓库|充电站|加油站|有限公司|分公司/
        const SCENIC = /风景名胜|公园|景点|寺庙|道观|教堂|古迹|遗址|博物馆|纪念馆|美术馆|文化|广场|园林|湿地|古镇|步行街|旅游|景区/
        const norm = (v) => (v || '').replace(/[（(【[][^）)】\]]*[）)】\]]/g, '').replace(/[\s·・\-—_,，。.、'"]/g, '').trim()
        const score = (poi, target) => {
          const p = norm(poi.name)
          const t = norm(target)
          if (!p || !t) return -1
          let s
          if (p === t) s = 100
          else if (t.includes(p)) s = 70
          else if (p.includes(t)) s = 55
          else return -1
          if (NOISE.test(poi.name || '')) s -= 60
          else if (!SCENIC.test(poi.type || '')) s -= 10
          return s
        }
        const ps = new AMap.PlaceSearch({ city, citylimit: true, pageSize: 10, extensions: 'all' })
        const keyword = norm(kw) || kw
        const r = await new Promise((resolve) => {
          const t = setTimeout(() => resolve({ status: 'TIMEOUT' }), 9000)
          ps.search(keyword, (st, out) => {
            clearTimeout(t)
            const pois = (out && out.poiList && out.poiList.pois) || []
            resolve({ status: st, info: out && out.info, pois })
          })
        })
        res[kw] = {
          keyword,
          status: r.status,
          info: r.info,
          pois: (r.pois || []).map((p) => ({
            name: p.name,
            type: p.type,
            photos: (p.photos || []).length,
            score: score({ name: p.name, type: p.type }, kw),
          })),
        }
      }
      return res
    },
    { city: CITY, names: NAMES },
  )

  for (const [kw, r] of Object.entries(out)) {
    console.log(`\n=== 搜「${kw}」→ keyword「${r.keyword}」 status=${r.status} info=${r.info} ===`)
    if (!r.pois.length) console.log('  （0 个候选）')
    r.pois.forEach((p, i) => console.log(`  #${i} score=${String(p.score).padStart(4)} photos=${p.photos}  ${p.name}  [${p.type || '无 type'}]`))
  }
  await browser.close()
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1) })
