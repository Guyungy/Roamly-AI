#!/usr/bin/env node
/**
 * 深色 → 白色 主题批量改写（只作用于 .vue 的 <style> 块）
 *
 * 用法： node theme-light-transform.js [--apply] [文件...]
 * 不带 --apply 时只打印 dry-run 报告。
 *
 * 规则分两类：
 *  1) EXACT_BG：深色面板/阴影的整值替换（无歧义，直接换）
 *  2) 通用规则：浅色 token（近白）按所在 CSS 属性改写成深色
 *     - color / fill / stroke → 深色文字
 *     - background*            → 极浅的深色薄涂（保留层次）
 *     - border*                → 浅灰描边
 *  例外：白字必须保留的选择器（天气插画、地图标记、橙色底），走 KEEP_WHITE_SELECTORS
 */
const fs = require('fs')
const path = require('path')

const APPLY = process.argv.includes('--apply')
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))

// ---------- 1) 整值替换：深色面板 → 白 ----------
const EXACT = {
  // 页面 / 卡片底
  'linear-gradient(180deg, #0d171d 0%, #142430 58%, #0f1a22 100%)': 'linear-gradient(180deg, #ffffff 0%, #f7f9fc 58%, #ffffff 100%)',
  'rgba(12, 23, 32, 0.56)': '#ffffff',
  'rgba(12, 23, 32, 0.56) !important': '#ffffff !important',
  'rgba(14, 27, 38, 0.66)': '#ffffff',
  'rgba(14, 27, 38, 0.66) !important': '#ffffff !important',
  'rgba(19, 34, 46, 0.8)': '#ffffff',
  'rgba(15, 28, 38, 0.6)': '#ffffff',
  'rgba(3, 10, 15, 0.88)': '#fbfcfe',
  'rgba(17, 29, 38, 0.96)': '#ffffff',
  'rgba(6, 8, 14, 0.86)': '#f8fafc',
  'rgba(6, 14, 20, 0.72)': 'transparent',
  'rgba(6, 14, 20, 0.7)': 'transparent',
  'rgba(6, 14, 20, 0.92)': 'rgba(15, 30, 45, 0.06)',
  'rgba(6, 14, 20, 0)': 'rgba(15, 30, 45, 0)',
  'rgba(4, 11, 18, 0.52)': 'rgba(15, 30, 45, 0.1)',
  'rgba(4, 11, 18, 0.3)': 'rgba(15, 30, 45, 0.08)',
  'rgba(4, 11, 18, 0.2)': 'rgba(15, 30, 45, 0.06)',
  'rgba(0, 0, 0, 0.36)': 'rgba(15, 30, 45, 0.12)',
  'rgba(9, 15, 22, 0.32)': 'rgba(15, 30, 45, 0.12)',
  'rgba(0, 0, 0, 0.22)': 'rgba(15, 30, 45, 0.1)',
  '#0e1b26': '#ffffff',
  // 纯文字色
  '#ecf3fa': '#1f2933',
  '#f7fbff': '#1f2933',
  '#f6fbff': '#1f2933',
  '#f2f7fc': '#1f2933',
  '#ffe3d6': '#b4491f',
  '#ffd5c6': '#b4491f',
  '#99b0c9': '#64748b',
  '#0cf': '#0284c7',
}

// ---------- 2) 近白 token 判定 ----------
function parseRgba(v) {
  const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (!m) return null
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
}

const isNearWhite = (c) => c.r >= 218 && c.g >= 218 && c.b >= 218
const isOrangeTint = (c) => c.r >= 245 && c.g >= 200 && c.g <= 240 && c.b >= 190 && c.b <= 230
const isDarkSurface = (c) => c.r <= 30 && c.g <= 40 && c.b <= 50

const dark = (a) => `rgba(15, 30, 45, ${a})`
const accent = (a) => `rgba(180, 73, 31, ${a})`

function textAlpha(a) {
  const table = [
    [0.2, 0.35], [0.3, 0.42], [0.35, 0.45], [0.4, 0.5], [0.45, 0.55], [0.5, 0.6],
    [0.54, 0.6], [0.6, 0.68], [0.64, 0.7], [0.65, 0.72], [0.68, 0.72], [0.7, 0.75],
    [0.72, 0.75], [0.74, 0.76], [0.75, 0.76], [0.78, 0.78], [0.8, 0.85], [0.809, 0.84],
    [0.84, 0.88], [0.85, 0.88], [0.86, 0.9], [0.88, 0.9], [0.9, 0.92], [0.92, 0.95],
    [0.94, 0.95], [0.95, 0.94], [0.96, 1], [1, 1],
  ]
  let best = table[0]
  for (const t of table) if (Math.abs(t[0] - a) < Math.abs(best[0] - a)) best = t
  return best[1]
}
const bgAlpha = (a) => (a <= 0.02 ? 0.02 : a <= 0.05 ? 0.03 : a <= 0.1 ? 0.05 : 0.08)
const borderAlpha = (a) => (a <= 0.1 ? 0.07 : a <= 0.14 ? 0.09 : a <= 0.2 ? 0.12 : 0.16)

// ---------- 3) 必须保留白色的选择器 ----------
const KEEP_WHITE = [
  'weather',           // 天气区块：白字画在照片/渐变、以及白色插画图形上
  'date-day',
  'location',
  'bolt', 'flake', 'cloud', 'rays', 'sun', 'rain', 'lightning', 'snow',
  'tripstar-map-marker', // 橙色标记上的白字
  'hotel-title',
  'hotel-card',
  'ant-btn-primary',
  'top-switch-nav',
  'map-placeholder',
  'shape-fill',   // 概览卡图片下沿的白色波浪，用于和白色内容区衔接
  'show-more',    // 橙色圆钮上的白色箭头
]

// ---------- 4) 逐行改写 ----------
const propKind = (p) => {
  if (p.startsWith('--')) {
    // CSS 变量按名字判断用途
    if (/text|fg|color/.test(p)) return 'text'
    if (/surface|bg|background/.test(p)) return 'bg'
    if (/border|line/.test(p)) return 'border'
    return 'other'
  }
  if (/^background/.test(p)) return 'bg'
  if (/^border/.test(p) || p === 'outline' || p === 'outline-color') return 'border'
  if (p === 'color' || p === '-webkit-text-fill-color' || p === 'fill' || p === 'stroke' || p === 'caret-color') return 'text'
  if (/box-shadow$/.test(p) || p === 'filter' || p === 'drop-shadow') return 'shadow'
  return 'other'
}

const changes = []
const skipped = []

function transformStyleBlock(styleText, file) {
  const lines = styleText.split('\n')
  let selector = ''
  let keyframe = ''
  let inComment = false

  return lines
    .map((line, idx) => {
      const trimmed = line.trim()

      // 注释处理
      if (inComment) {
        if (trimmed.includes('*/')) inComment = false
        return line
      }
      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
        inComment = true
        return line
      }
      if (trimmed.startsWith('/*') || trimmed.startsWith('//') || trimmed.startsWith('*')) return line

      // @keyframes 上下文（用于跳过天气插画的关键帧）
      const kf = trimmed.match(/^@keyframes\s+([\w-]+)/)
      if (kf) {
        keyframe = kf[1]
        return line
      }
      if (trimmed === '}' && /^\}/.test(line)) {
        if (keyframe) keyframe = ''
        selector = ''
        return line
      }

      if (trimmed.endsWith('{')) {
        selector = trimmed.slice(0, -1).replace(/,$/, '').trim()
        return line
      }
      if (!trimmed.includes(':') || !trimmed.includes(';')) return line

      const declMatch = line.match(/^(\s*)([-a-zA-Z]+)\s*:\s*(.+?)(\s*!important)?;\s*$/)
      if (!declMatch) return line
      const [, indent, prop, rawValue, important = ''] = declMatch
      const value = rawValue.trim()
      const kind = propKind(prop)
      const keepWhite = KEEP_WHITE.some((s) => selector.includes(s) || keyframe.includes(s))

      let next = value

      // (1) 整值替换（EXACT 的 key 不带 !important）
      const exactHit = EXACT[value]
      if (exactHit !== undefined) {
        next = exactHit
      } else {
        // (2) token 级替换
        next = value.replace(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g, (tok) => {
          const hex = tok.match(/^#([0-9a-fA-F]{3,8})$/)
          if (hex) {
            const raw = hex[1]
            const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.slice(0, 6)
            const c = { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: 1 }
            if (isNearWhite(c)) {
              if (keepWhite) return tok
              return kind === 'text' ? '#1f2933' : kind === 'border' ? dark(0.12) : tok
            }
            if (isDarkSurface(c) && kind === 'bg') return c.a >= 0.5 ? '#ffffff' : dark(0.05)
            return tok
          }
          const c = parseRgba(tok)
          if (!c) return tok
          if (isOrangeTint(c)) {
            if (keepWhite) return tok
            return kind === 'text' ? accent(textAlpha(c.a)) : tok
          }
          if (isNearWhite(c)) {
            if (keepWhite) return tok
            if (kind === 'text') return dark(textAlpha(c.a))
            if (kind === 'border') return dark(borderAlpha(c.a))
            if (kind === 'bg') return dark(bgAlpha(c.a))
            return dark(bgAlpha(c.a))
          }
          if (isDarkSurface(c) && kind === 'bg') return c.a >= 0.5 ? '#ffffff' : dark(0.05)
          return tok
        })
      }

      if (next !== value) {
        changes.push({ file, line: idx + 1, selector, prop, from: value, to: next })
        return `${indent}${prop}: ${next}${important};`
      }
      return line
    })
    .join('\n')
}

for (const f of files) {
  const abs = path.resolve(f)
  const src = fs.readFileSync(abs, 'utf8')
  let out = ''
  let cursor = 0
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g
  let m
  while ((m = re.exec(src))) {
    out += src.slice(cursor, m.index + m[0].indexOf(m[1]))
    out += transformStyleBlock(m[1], f)
    cursor = m.index + m[0].indexOf(m[1]) + m[1].length
  }
  out += src.slice(cursor)

  if (APPLY) fs.writeFileSync(abs, out)
}

console.log(`待改写声明：${changes.length} 处  (${APPLY ? '已写入' : 'dry-run'})`)
const byFile = {}
for (const c of changes) (byFile[c.file] = byFile[c.file] || []).push(c)
for (const [f, list] of Object.entries(byFile)) {
  if (process.argv.includes('--verbose')) {
    for (const c of list) {
      console.log(`  L${c.line}  [${c.selector}] ${c.prop}: ${c.from}  ->  ${c.to}`)
    }
    continue
  }
  console.log(`\n=== ${f} (${list.length}) ===`)
  const uniq = new Map()
  for (const c of list) {
    const k = `${c.prop} :: ${c.from} -> ${c.to}`
    uniq.set(k, (uniq.get(k) || 0) + 1)
  }
  for (const [k, n] of [...uniq.entries()].sort()) console.log(`  x${n}  ${k}`)
}
