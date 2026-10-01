/**
 * 快速截图：node shot.js <url> <输出png> [宽] [viewport|full]
 */
const { chromium } = require('playwright-core')

;(async () => {
  const url = process.argv[2] || 'http://localhost:4173/'
  const out = process.argv[3] || '/tmp/shot.png'
  const width = parseInt(process.argv[4] || '1440', 10)
  const full = (process.argv[5] || 'full') !== 'viewport'

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 180))
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 180)))

  await page.goto(url, { waitUntil: 'load', timeout: 40000 }).catch((e) => console.log('goto:', e.message))
  await page.waitForTimeout(2000)
  await page.screenshot({ path: out, fullPage: full })
  console.log('saved ' + out + '  (' + width + 'px)')
  console.log(errors.length ? '控制台错误:\n  ' + errors.slice(0, 8).join('\n  ') : '控制台 0 错误')
  await browser.close()
})().catch((e) => {
  console.error('失败: ' + e.message)
  process.exit(1)
})
