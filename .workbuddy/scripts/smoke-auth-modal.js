const { chromium } = require('playwright-core')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)

  await page.getByRole('button', { name: /SIGN IN/i }).first().click()
  await page.waitForTimeout(1200)

  const modal = await page.evaluate(() => {
    const m = document.querySelector('.auth-card')
    if (!m) return null
    return {
      visible: getComputedStyle(m).display !== 'none',
      title: document.querySelector('.auth-title')?.innerText?.trim(),
      tabs: [...m.querySelectorAll('.n-tabs-tab')].map((x) => x.innerText.trim()),
      inputs: [...m.querySelectorAll('input')].map((i) => i.placeholder),
      hasForgot: m.innerText.includes('Forgot password'),
      buttons: [...m.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
    }
  })
  console.log(JSON.stringify(modal, null, 2))
  await page.screenshot({ path: '/tmp/roamly-auth-modal.png' })

  // 切到「注册」页签，确认注册表单出现（需邮箱 + 验证码 + 密码）
  if (modal) {
    await page.getByText('Sign up', { exact: true }).first().click()
    await page.waitForTimeout(600)
    const signup = await page.evaluate(() => {
      const m = document.querySelector('.auth-card')
      return {
        buttons: [...m.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
        inputCount: m.querySelectorAll('input').length,
        hasHint: m.innerText.includes('password'),
      }
    })
    console.log('注册页签:', JSON.stringify(signup))
  }
  console.log('异常:', errs.length ? errs.join('\n') : '无')
  await browser.close()
})().catch((e) => { console.error('失败:', e.message); process.exit(1) })
