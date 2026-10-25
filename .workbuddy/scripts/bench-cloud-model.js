const fs = require('fs')
const src = fs.readFileSync('/Users/a1/Code/Roamly-AI/frontend/src/services/cloudLLM.ts', 'utf8')
const m = src.match(/const PLAN_SYSTEM_PROMPT = `([\s\S]*?)`\n/)
if (!m) { console.error('未提取到 PLAN_SYSTEM_PROMPT'); process.exit(1) }
const SYSTEM = m[1]
console.log('提示词长度:', SYSTEM.length)

const body = {
  model: process.env.MODEL || 'deepseek-v4.1-flash',
  stream: true,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: [
      '出行城市：杭州',
      '出行日期：2026-10-05 至 2026-10-07，共 3 天',
      'days[].date 必须严格使用以下日期序列：2026-10-05、2026-10-06、2026-10-07',
      '交通方式偏好：公共交通',
      '住宿偏好：经济型酒店',
      '兴趣偏好：历史人文、美食',
      '现在请直接输出符合上述结构的 JSON 对象。',
    ].join('\n') },
  ],
}

;(async () => {
  const t0 = Date.now()
  const res = await fetch('https://roamly-ai-trip-planner.app.workbuddy.host/.cloud/llm/chat/completions', {
    method: 'POST',
    headers: {
      'x-wb-webapp-access-key': 'wbpk_GDkgA3kTiWoQR3GI2XYwBt_Fjw8wt3ewpHwLueaZ7oOy1bu10wyIuJ7',
      'Origin': 'https://roamly-ai-trip-planner.app.workbuddy.host',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  console.log('HTTP', res.status, '首字节', ((Date.now() - t0) / 1000).toFixed(2) + 's')
  if (!res.ok) { console.log('错误体:', (await res.text()).slice(0, 400)); process.exit(1) }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = '', text = '', chunks = 0, firstChunkAt = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        const d = j.choices && j.choices[0] && j.choices[0].delta
        if (d && d.content) {
          if (!firstChunkAt) { firstChunkAt = Date.now() - t0; console.log('首个内容分片:', (firstChunkAt / 1000).toFixed(2) + 's') }
          text += d.content; chunks++
        }
      } catch (e) {}
    }
  }
  const total = (Date.now() - t0) / 1000
  console.log('分片数:', chunks, '| 内容长度:', text.length, '| 总耗时:', total.toFixed(2) + 's')
  let parsed = null
  try {
    const s = text.indexOf('{'), e = text.lastIndexOf('}')
    parsed = JSON.parse(text.slice(s, e + 1))
  } catch (err) { console.log('JSON 解析失败:', err.message); console.log(text.slice(0, 300)) }
  if (parsed) {
    console.log('解析成功 -> 城市:', parsed.city, '| days:', (parsed.days || []).length,
      '| 首日景点数:', parsed.days && parsed.days[0] ? (parsed.days[0].attractions || []).length : 0,
      '| 有 weather:', Array.isArray(parsed.weather_info) ? parsed.weather_info.length : 0,
      '| 有 budget:', Boolean(parsed.budget))
  }
  fs.writeFileSync('/tmp/plan-output.json', text)
})().catch((e) => { console.error('失败:', e.message); process.exit(1) })
