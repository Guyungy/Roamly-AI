/* 交付前静态校验：i18n key、SFC 结构、云服务接入合规项 */
const fs = require('fs')
const path = require('path')

const root = '/Users/a1/Code/Roamly-AI/frontend'
const src = path.join(root, 'src')

function walk(dir, filter) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, filter))
    else if (filter(full)) out.push(full)
  }
  return out
}

const files = walk(src, (f) => /\.(ts|vue|json)$/.test(f))
const problems = []
const notes = []

/* ---------- 1. i18n key 存在性 ---------- */
const zh = JSON.parse(fs.readFileSync(path.join(src, 'i18n/locales/zh.json'), 'utf8'))
const lookup = (key) => key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), zh)
const keyRe = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g
const usedKeys = new Set()
for (const f of files.filter((f) => /\.(ts|vue)$/.test(f))) {
  const text = fs.readFileSync(f, 'utf8')
  let m
  while ((m = keyRe.exec(text))) usedKeys.add(m[1])
}
const missingKeys = [...usedKeys].filter((k) => lookup(k) === undefined)
console.log(`[1] i18n：引用 ${usedKeys.size} 个 key，缺失 ${missingKeys.length} 个`)
for (const k of missingKeys) problems.push(`i18n key 不存在: ${k}`)

/* ---------- 2. SFC 顶层块结构 ---------- */
const START = /^<(template|script|style)(\s[^>]*)?>\s*$/
const SELF = /^<(template|script|style)\b[^>]*\/>\s*$/
const END = { template: '</template>', script: '</script>', style: '</style>' }
let sfcOk = 0
for (const f of files.filter((f) => f.endsWith('.vue'))) {
  let opened = null
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (opened === null) {
      if (!line.trim() || SELF.test(line)) continue
      const m = START.exec(line)
      if (m) { opened = m[1]; continue }
      problems.push(`${path.relative(root, f)}:${i + 1} 顶层残留内容 -> ${line.trim().slice(0, 60)}`)
    } else if (line === END[opened]) {
      opened = null
    }
  }
  if (opened) problems.push(`${path.relative(root, f)}: <${opened}> 未闭合`)
  else sfcOk++
}
console.log(`[2] SFC 顶层结构：${sfcOk} 个 .vue 通过`)

/* ---------- 3. 云服务接入合规 ---------- */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '')
const all = files.filter((f) => /\.(ts|vue)$/.test(f)).map((f) => { const raw = fs.readFileSync(f, 'utf8'); return { f, raw, t: strip(raw) } })

const forbidden = [
  ['signInAnonymously', '匿名登录'],
  ['@cloudbase/js-sdk', 'CloudBase SDK'],
  ['/.cloud/auth/', '手写 auth 路径'],
  ['/.cloud/database/', '手写 database 路径'],
  ['/.cloud/llm/', '手写 llm 路径'],
  ['createClient(', 'supabase createClient'],
]
for (const [needle, label] of forbidden) {
  const hits = all.filter((x) => x.t.includes(needle)).map((x) => path.relative(root, x.f))
  console.log(`[3] 禁止项 ${label} -> ${hits.length ? hits.join(', ') : '无'}`)
  if (hits.length) problems.push(`出现禁止用法 ${label}: ${hits.join(', ')}`)
}

// 客户端初始化必须同时传 endpoint 与 publishableKey
const initSites = all.filter((x) => /createWorkBuddyCloud\s*[<(]/.test(x.t))
for (const site of initSites) {
  const hasEndpoint = site.t.includes('endpoint')
  const hasKey = site.t.includes('publishableKey')
  console.log(`[4] createWorkBuddyCloud @ ${path.relative(root, site.f)} endpoint=${hasEndpoint} publishableKey=${hasKey}`)
  if (!hasEndpoint || !hasKey) problems.push(`${path.relative(root, site.f)} 初始化缺少 endpoint 或 publishableKey`)
}

// 每个 chat.completions.create 调用点都必须带上首条 system 消息
// （system 可以内联，也可以来自本模块里的 messages 构造函数 / 常量）
//
// 注意有一类调用是 `create({ ...params, signal })` —— messages 由 params 展开传入，
// 窗口里根本找不到字面量 `messages:`。这种情况不能判成缺失（cloudLLM.ts 就是如此，
// 它的 params 来自 messages:[{role:'system'}] 的构造点），所以允许「展开一个对象」
// 也算提供了 messages；但 system 这一条依旧要求模块里真的存在，不放水。
for (const { f, t } of all) {
  const rel = path.relative(root, f)
  const moduleHasSystem = /role:\s*['"]system['"]/.test(t)
  let idx = -1
  let sites = 0
  while ((idx = t.indexOf('chat.completions.create', idx + 1)) !== -1) {
    sites++
    const win = t.slice(idx, idx + 900)
    const passesMessages = /messages\s*:/.test(win)
    const spreadsParams = /\.\.\.\s*\w+/.test(win)
    const inlineSystem = /role:\s*['"]system['"]/.test(win)
    const ok = (passesMessages || spreadsParams) && (inlineSystem || moduleHasSystem)
    console.log(
      `[5] ${rel} 调用点#${sites} messages=${passesMessages ? '显式' : spreadsParams ? '展开传入' : '缺失'} system=${inlineSystem ? '内联' : moduleHasSystem ? '本模块构造' : '缺失'}`
    )
    if (!ok) problems.push(`${rel} chat.completions.create 未提供 system 消息`)
  }
}


// 用户数据访问前必须有登录门禁
const dbUsers = all.filter((x) => /cloud\.database\.(from|rpc)\(/.test(x.t))
for (const { f, t } of dbUsers) {
  const gated = /getSession|isSignedIn|hasOwnBackend/.test(t)
  console.log(`[6] cloud.database @ ${path.relative(root, f)} 门禁=${gated}`)
}

// 不得把 owner_id 发给数据库
const ownerWrites = all.filter((x) => /\.(insert|upsert)\(/.test(x.t) && /owner_id\s*:/.test(x.t)).map((x) => path.relative(root, x.f))
console.log(`[7] 客户端传 owner_id 的文件 -> ${ownerWrites.length ? ownerWrites.join(', ') : '无'}`)
if (ownerWrites.length) problems.push(`客户端不应传 owner_id: ${ownerWrites.join(', ')}`)

/* ---------- 4. 依赖声明 ---------- */
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const bareRe = /(?:from|import)\s+'([^'.][^']*)'/g
const externals = new Set()
for (const { t } of all) {
  let m
  while ((m = bareRe.exec(t))) {
    const spec = m[1]
    if (spec.startsWith('@/') || spec.startsWith('./') || spec.startsWith('../')) continue
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    externals.add(name)
  }
}
const undeclared = [...externals].filter((n) => !deps[n] && !n.startsWith('node:'))
console.log(`[8] 源码引用的外部包 ${externals.size} 个，未声明 ${undeclared.length} 个`)
if (undeclared.length) problems.push(`未在 package.json 声明: ${undeclared.join(', ')}`)

console.log('\n' + (problems.length ? `❌ 发现 ${problems.length} 个问题:` : '✅ 全部检查通过'))
for (const p of problems) console.log('  -', p)
