/* 本地冒烟：真实 Chromium 打开构建产物，确认应用能挂载、无致命错误 */
const { chromium } = require('playwright-core')

const TARGET = process.env.TARGET || 'http://127.0.0.1:4173/'

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()}`))

  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  const result = await page.evaluate(() => {
    const app = document.querySelector('#app')
    const text = document.body.innerText || ''
    return {
      appChildCount: app ? app.children.length : -1,
      bodyTextLength: text.length,
      hasBrand: text.includes('TRIPSTAR') || text.includes('出门啦'),
      hasLoginEntry: text.includes('登录'),
      hasMyTrips: text.includes('我的行程'),
      hasForm: Boolean(document.querySelector('form')),
      // Vite 错误覆盖页的特征
      viteErrorOverlay: Boolean(document.querySelector('vite-error-overlay')),
      title: document.title,
    }
  })

  await page.screenshot({ path: '/tmp/roamly-smoke.png', fullPage: false })

  console.log('=== 渲染结果 ===')
  console.log(JSON.stringify(result, null, 2))
  console.log('\n=== 页面级 JS 异常 ===')
  console.log(pageErrors.length ? pageErrors.slice(0, 8).join('\n') : '无')
  console.log('\n=== console.error（前 10 条）===')
  console.log(consoleErrors.length ? consoleErrors.slice(0, 10).join('\n') : '无')
  console.log('\n=== 失败的请求（前 10 条）===')
  console.log(failedRequests.length ? failedRequests.slice(0, 10).join('\n') : '无')

  await browser.close()
})().catch((err) => {
  console.error('冒烟测试失败:', err.message)
  process.exit(1)
})
