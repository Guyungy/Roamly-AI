/**
 * 景点配图生成：本地分层矢量插画。
 *
 * 为什么不用真照片：真照片有两条来源，都不可依赖——
 *   1. `GET /api/poi/photo`（后端接 Unsplash）：只有部署了自建后端才有；
 *   2. 高德 POI 照片：要配地图 Key。
 * 云模式（当前线上形态）两者都没有，于是每个景点都退回同一块浅灰渐变，
 * 六张卡长得一模一样，看起来就像"图挂了"。
 *
 * 这里提供**永远可用**的兜底：按景点名做确定性取色（同名 → 同图，不会每次刷新都变），
 * 按 category / 名称关键词选构图（山水 / 古建 / 天际线 / 乐园 / 街巷）。
 * 调用方一旦拿到真照片，仍然优先用真照片（见 Result.vue 的 getAttractionImage）。
 *
 * 输出是 data URL，所以导出成 HTML 时也能自带图，不依赖任何外链。
 */

export type ArtworkVariant = 'card' | 'wide'

/** 每种配色：天空上、天空下、远山、中山、近山、水面、日光、墨色 */
interface Palette {
  sky: [string, string]
  far: string
  mid: string
  near: string
  water: string
  sun: string
  ink: string
}

const PALETTES: Palette[] = [
  { sky: ['#dfeaf7', '#f8fbfe'], far: '#b6cbdf', mid: '#8fadc9', near: '#6688a8', water: '#c7dbec', sun: '#f6c99a', ink: '#41576c' },
  { sky: ['#fde9d3', '#fff8f0'], far: '#edc9a3', mid: '#d9a878', near: '#bd8455', water: '#eed6b8', sun: '#f5b070', ink: '#6b4527' },
  { sky: ['#e8e3f7', '#fbfaff'], far: '#c3b9e0', mid: '#a294cd', near: '#7d6cae', water: '#d5cdea', sun: '#f0c2c8', ink: '#4b3f6b' },
  { sky: ['#dcefe4', '#f8fdfa'], far: '#b3d6c1', mid: '#8bbc9e', near: '#5d9776', water: '#c6e3d5', sun: '#f4d59a', ink: '#33553f' },
  { sky: ['#f7ddd2', '#fff9f5'], far: '#e2b8a6', mid: '#c9957f', near: '#a97258', water: '#e9cdbd', sun: '#f2a97f', ink: '#6d3f2c' },
  { sky: ['#e2e9ee', '#fafcfd'], far: '#bcc8d2', mid: '#98a7b4', near: '#6e808f', water: '#cdd9e2', sun: '#efd9c4', ink: '#3d4a55' },
  { sky: ['#f9e7c9', '#fffbf2'], far: '#e5cb9a', mid: '#cfa96f', near: '#a8803f', water: '#ecd9b2', sun: '#f0a95e', ink: '#5f431c' },
  { sky: ['#d7ecf6', '#f6fdff'], far: '#a9d0e3', mid: '#7fb2cb', near: '#528ba8', water: '#bedcec', sun: '#f7d3a0', ink: '#2f5468' },
]

/** djb2，给同一个景点名一个稳定的索引 */
function hash(text: string): number {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h
}

type Scene = 'landscape' | 'heritage' | 'skyline' | 'park' | 'street'

const SCENE_KEYWORDS: Array<[Scene, string[]]> = [
  ['park', ['乐园', '游乐园', '主题公园', '游乐场', '动物园', '水族馆', '摩天轮', 'ferris', 'theme park', 'zoo']],
  ['skyline', ['城市', '地标', '天际', '摩天', '广场', '商圈', '大桥', '塔楼', '观光厅', 'skyline', 'tower', 'city', 'downtown']],
  ['heritage', ['古迹', '古建', '寺', '庙', '塔', '城墙', '宫', '博物馆', '文化', '园林', '石窟', '古镇', '故居', '祠', '陵', '碑', '教堂', 'temple', 'museum', 'palace', 'shrine']],
  ['street', ['街', '巷', '夜市', '集市', '老城', '里弄', '步行街', '市场', 'street', 'market', 'alley']],
  ['landscape', ['自然', '风光', '公园', '湖', '山', '湿地', '海岛', '森林', '草原', '瀑布', '溪', '峡', '沙滩', '海岸', '雪', '花', '园', 'mountain', 'lake', 'park', 'island', 'forest', 'beach']],
]

function pickScene(name: string, category?: string): Scene {
  const hay = `${category || ''} ${name}`
  for (const [scene, keys] of SCENE_KEYWORDS) {
    if (keys.some((k) => hay.includes(k))) return scene
  }
  return 'landscape'
}

/* ------------------------------ 构图零件 ------------------------------ */

/** 一条从左贯到右的平缓山脊，落到画面底部闭合 */
function ridge(y: number, amp: number, w: number, h: number, seed: number): string {
  const a = amp * (0.7 + (seed % 3) * 0.25)
  return [
    `M0,${h}`,
    `L0,${y}`,
    `Q${w * 0.16},${y - a} ${w * 0.34},${y - a * 0.42}`,
    `Q${w * 0.52},${y + a * 0.3} ${w * 0.68},${y - a * 0.6}`,
    `Q${w * 0.84},${y - a * 1.15} ${w},${y - a * 0.25}`,
    `L${w},${h}`,
    'Z',
  ].join(' ')
}

function sun(cx: number, cy: number, r: number, color: string): string {
  // 用径向渐变做柔光晕：早期版本叠一个低透明度大圆，边是硬的，看着像贴了个圆盘
  return `<circle cx="${cx}" cy="${cy}" r="${r * 3.1}" fill="url(#glow)" opacity="0.75"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.92"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#core)"/>`
}

function clouds(w: number, h: number, color: string, seed: number): string {
  const out: string[] = []
  for (let i = 0; i < 3; i++) {
    const s = seed + i * 7
    const cx = w * (0.12 + ((s % 5) / 5) * 0.72)
    const cy = h * (0.12 + ((s % 3) / 3) * 0.14)
    const rw = w * (0.09 + ((s % 4) / 4) * 0.06)
    out.push(
      `<g opacity="${0.34 - i * 0.07}" fill="${color}">` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rw}" ry="${rw * 0.3}"/>` +
      `<ellipse cx="${cx - rw * 0.42}" cy="${cy + rw * 0.1}" rx="${rw * 0.52}" ry="${rw * 0.24}"/>` +
      `<ellipse cx="${cx + rw * 0.46}" cy="${cy + rw * 0.08}" rx="${rw * 0.46}" ry="${rw * 0.22}"/>` +
      '</g>',
    )
  }
  return out.join('')
}

function birds(w: number, h: number, color: string, seed: number): string {
  let out = ''
  for (let i = 0; i < 3; i++) {
    const x = w * (0.3 + i * 0.13 + ((seed + i) % 4) * 0.02)
    const y = h * (0.2 + ((seed + i * 3) % 3) * 0.05)
    const s = w * 0.014
    out += `<path d="M${x},${y} q${s * 0.6},${-s * 0.6} ${s},0 q${s * 0.4},${-s * 0.6} ${s},0" fill="none" stroke="${color}" stroke-width="${Math.max(1.2, w * 0.0016)}" stroke-linecap="round" opacity="0.55"/>`
  }
  return out
}

/** 古建：塔身 + 飞檐逐层收窄 */
function pagoda(cx: number, baseY: number, w: number, h: number, p: Palette, scale = 1): string {
  const tiers = 4
  const tierH = h * 0.115 * scale
  let out = ''
  for (let i = 0; i < tiers; i++) {
    const y = baseY - i * tierH
    const bw = w * (0.086 - i * 0.013) * scale
    const rw = w * (0.155 - i * 0.024) * scale
    const roofH = tierH * 0.62
    out += `<rect x="${cx - bw / 2}" y="${y - tierH * 0.62}" width="${bw}" height="${tierH * 0.62}" fill="${p.ink}" opacity="${0.92 - i * 0.03}"/>`
    out += `<path d="M${cx - rw / 2},${y} Q${cx - rw * 0.3},${y - roofH * 0.72} ${cx},${y - roofH} Q${cx + rw * 0.3},${y - roofH * 0.72} ${cx + rw / 2},${y} Z" fill="${p.ink}" opacity="0.95"/>`
    if (i > 0) out += `<rect x="${cx - bw * 0.2}" y="${y - tierH * 0.5}" width="${bw * 0.4}" height="${tierH * 0.2}" fill="${p.near}" opacity="0.5"/>`
  }
  const topY = baseY - tiers * tierH
  out += `<rect x="${cx - w * 0.004 * scale}" y="${topY - h * 0.05 * scale}" width="${w * 0.008 * scale}" height="${h * 0.05 * scale}" fill="${p.ink}"/>`
  out += `<circle cx="${cx}" cy="${topY - h * 0.058 * scale}" r="${w * 0.009 * scale}" fill="${p.ink}"/>`
  return out
}

/** 单檐亭子：同一套飞檐画法，只留一层，避免出现"箭头"一样的怪形状 */
function pavilion(cx: number, baseY: number, w: number, h: number, p: Palette, scale = 1): string {
  const bodyH = h * 0.05 * scale
  const bw = w * 0.032 * scale
  const rw = w * 0.07 * scale
  const roofH = h * 0.042 * scale
  const roofY = baseY - bodyH
  return `<g opacity="0.88">` +
    `<rect x="${cx - bw / 2}" y="${roofY}" width="${bw}" height="${bodyH}" fill="${p.ink}"/>` +
    `<rect x="${cx - bw * 0.34}" y="${baseY - bodyH * 0.46}" width="${bw * 0.68}" height="${bodyH * 0.46}" fill="${p.sky[1]}" opacity="0.45"/>` +
    `<path d="M${cx - rw / 2},${roofY} Q${cx - rw * 0.28},${roofY - roofH * 0.7} ${cx},${roofY - roofH} Q${cx + rw * 0.28},${roofY - roofH * 0.7} ${cx + rw / 2},${roofY} Z" fill="${p.ink}"/>` +
    `<circle cx="${cx}" cy="${roofY - roofH - h * 0.008 * scale}" r="${w * 0.005 * scale}" fill="${p.ink}"/>` +
    '</g>'
}

/** 拱桥：一段拱线 + 一道栏板，落在水面上 */
function bridge(cx: number, baseY: number, w: number, h: number, color: string): string {
  const rw = w * 0.12
  const rh = h * 0.11
  return `<g fill="none" stroke="${color}" stroke-linecap="round" opacity="0.9">` +
    `<path d="M${cx - rw},${baseY} Q${cx},${baseY - rh * 2.1} ${cx + rw},${baseY}" stroke-width="${Math.max(2.4, h * 0.016)}"/>` +
    `<path d="M${cx - rw * 0.92},${baseY - rh * 0.62} Q${cx},${baseY - rh * 1.62} ${cx + rw * 0.92},${baseY - rh * 0.62}" stroke-width="${Math.max(1.2, h * 0.007)}" opacity="0.7"/>` +
    '</g>'
}

/** 小船：船身 + 帆，给宽幅水面一个视觉落点 */
function boat(cx: number, waterY: number, w: number, h: number, p: Palette): string {
  const bw = w * 0.05
  const bh = h * 0.035
  return `<g opacity="0.92">` +
    `<path d="M${cx - bw},${waterY} L${cx + bw},${waterY} L${cx + bw * 0.62},${waterY + bh} L${cx - bw * 0.62},${waterY + bh} Z" fill="${p.ink}"/>` +
    `<path d="M${cx - bw * 0.06},${waterY} L${cx - bw * 0.06},${waterY - bh * 3.1} L${cx + bw * 0.62},${waterY - bh * 0.35} Z" fill="${p.ink}"/>` +
    `<ellipse cx="${cx}" cy="${waterY + bh * 1.6}" rx="${bw * 1.25}" ry="${bh * 0.28}" fill="${p.sky[1]}" opacity="0.5"/>` +
    '</g>'
}

/** 天际线：高低错落的楼块 + 窗点 */
function skyline(w: number, h: number, baseY: number, p: Palette, seed: number): string {
  const towers = 9
  const gap = w * 0.016
  const unit = (w - gap * (towers + 1)) / towers
  let out = ''
  for (let i = 0; i < towers; i++) {
    const s = seed + i * 13
    const th = h * (0.16 + ((s % 6) / 6) * 0.24)
    const x = gap + i * (unit + gap)
    const o = i % 2 === 0 ? 0.9 : 0.72
    out += `<rect x="${x}" y="${baseY - th}" width="${unit}" height="${th}" fill="${p.ink}" opacity="${o}"/>`
    if (i % 3 === 1) out += `<rect x="${x + unit * 0.42}" y="${baseY - th - h * 0.045}" width="${unit * 0.16}" height="${h * 0.045}" fill="${p.ink}" opacity="${o}"/>`
    const cols = 2
    const rows = Math.max(2, Math.floor(th / (h * 0.045)))
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((s + r * 3 + c * 5) % 3 === 0) continue
        out += `<rect x="${x + unit * (0.22 + c * 0.34)}" y="${baseY - th + r * (th / rows)}" width="${unit * 0.16}" height="${(th / rows) * 0.34}" fill="${p.sky[1]}" opacity="0.62"/>`
      }
    }
  }
  return out
}

/** 针叶树：三角层叠 */
function conifer(x: number, baseY: number, w: number, h: number, color: string, scale = 1): string {
  const th = h * 0.1 * scale
  const tw = w * 0.05 * scale
  return `<g opacity="0.95">` +
    `<rect x="${x - tw * 0.09}" y="${baseY - th * 0.34}" width="${tw * 0.18}" height="${th * 0.34}" fill="${color}"/>` +
    `<path d="M${x},${baseY - th * 1.5} L${x - tw / 2},${baseY - th * 0.3} L${x + tw / 2},${baseY - th * 0.3} Z" fill="${color}"/>` +
    `<path d="M${x},${baseY - th * 1.95} L${x - tw * 0.4},${baseY - th * 0.9} L${x + tw * 0.4},${baseY - th * 0.9} Z" fill="${color}"/>` +
    '</g>'
}

/** 阔叶树：树干 + 三团圆冠，比三角柔和 */
function canopy(x: number, baseY: number, w: number, h: number, color: string, scale = 1): string {
  const th = h * 0.11 * scale
  const tw = w * 0.05 * scale
  return `<g opacity="0.95">` +
    `<rect x="${x - tw * 0.075}" y="${baseY - th * 0.5}" width="${tw * 0.15}" height="${th * 0.5}" fill="${color}"/>` +
    `<circle cx="${x}" cy="${baseY - th * 0.86}" r="${tw * 0.62}" fill="${color}"/>` +
    `<circle cx="${x - tw * 0.44}" cy="${baseY - th * 0.66}" r="${tw * 0.46}" fill="${color}"/>` +
    `<circle cx="${x + tw * 0.46}" cy="${baseY - th * 0.7}" r="${tw * 0.42}" fill="${color}"/>` +
    `<circle cx="${x + tw * 0.1}" cy="${baseY - th * 1.24}" r="${tw * 0.38}" fill="${color}"/>` +
    '</g>'
}

/** 按种子挑树形，避免满屏同一种树 */
function tree(x: number, baseY: number, w: number, h: number, color: string, scale = 1, seed = 0): string {
  return seed % 2 === 0 ? conifer(x, baseY, w, h, color, scale) : canopy(x, baseY, w, h, color, scale)
}

/** 摩天轮 */
function ferrisWheel(cx: number, cy: number, r: number, p: Palette): string {
  let out = `<g opacity="0.95" stroke="${p.ink}" fill="none" stroke-width="${Math.max(1.4, r * 0.045)}">`
  out += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`
  out += `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}"/>`
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i
    out += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(a)}" y2="${cy + r * Math.sin(a)}"/>`
  }
  out += '</g>'
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i
    out += `<circle cx="${cx + r * Math.cos(a)}" cy="${cy + r * Math.sin(a)}" r="${r * 0.1}" fill="${p.sun}" opacity="0.95"/>`
  }
  out += `<path d="M${cx},${cy} L${cx - r * 0.55},${cy + r * 1.5} L${cx + r * 0.55},${cy + r * 1.5} Z" fill="${p.ink}" opacity="0.8"/>`
  return out
}

/** 水面：一条带 + 几道横向反光 */
function water(w: number, h: number, top: number, p: Palette, seed: number): string {
  let out = `<rect x="0" y="${top}" width="${w}" height="${h - top}" fill="${p.water}"/>`
  for (let i = 0; i < 5; i++) {
    const y = top + (h - top) * (0.18 + i * 0.17)
    const lw = w * (0.12 + ((seed + i * 5) % 4) * 0.05)
    const lx = w * (0.08 + ((seed + i * 3) % 6) * 0.14)
    out += `<rect x="${lx}" y="${y}" width="${lw}" height="${Math.max(1.4, h * 0.005)}" rx="${h * 0.003}" fill="${p.sky[1]}" opacity="${0.5 - i * 0.07}"/>`
  }
  return out
}

/** 地面 + 一条小路 */
function ground(w: number, h: number, top: number, color: string): string {
  return `<rect x="0" y="${top}" width="${w}" height="${h - top}" fill="${color}"/>` +
    `<path d="M${w * 0.34},${h} L${w * 0.47},${top} L${w * 0.53},${top} L${w * 0.66},${h} Z" fill="#ffffff" opacity="0.28"/>`
}

/** 街巷：两侧屋块 + 中间纵深 + 一串灯笼 */
function streetScene(w: number, h: number, baseY: number, p: Palette, seed: number): string {
  let out = ''
  // 中间的路面：下宽上窄，给出纵深
  out += `<path d="M${w * 0.36},${h} L${w * 0.465},${baseY - h * 0.16} L${w * 0.535},${baseY - h * 0.16} L${w * 0.64},${h} Z" fill="${p.sky[1]}" opacity="0.5"/>`
  for (let i = 0; i < 5; i++) {
    const s = seed + i * 11
    const bw = w * (0.1 + ((s % 3) / 3) * 0.06)
    const bh = h * (0.24 + ((s % 4) / 4) * 0.14) * (1 - i * 0.07)
    const lx = w * (0.01 + i * 0.045)
    const rx = w * (0.99 - i * 0.045)
    const ly = baseY - bh + i * h * 0.03
    const ry = baseY - bh + i * h * 0.03
    out += `<rect x="${lx}" y="${ly}" width="${bw}" height="${bh}" fill="${p.ink}" opacity="${0.92 - i * 0.11}"/>`
    out += `<rect x="${rx - bw}" y="${ry}" width="${bw}" height="${bh}" fill="${p.ink}" opacity="${0.92 - i * 0.11}"/>`
    // 屋檐
    out += `<path d="M${lx - w * 0.008},${ly} L${lx + bw + w * 0.008},${ly} L${lx + bw * 0.86},${ly - h * 0.02} L${lx + bw * 0.14},${ly - h * 0.02} Z" fill="${p.ink}" opacity="${0.92 - i * 0.11}"/>`
    out += `<path d="M${rx - bw - w * 0.008},${ry} L${rx + w * 0.008},${ry} L${rx - bw * 0.14},${ry - h * 0.02} L${rx - bw * 0.86},${ry - h * 0.02} Z" fill="${p.ink}" opacity="${0.92 - i * 0.11}"/>`
    // 灯笼
    out += `<circle cx="${lx + bw * 0.5}" cy="${ly + bh * 0.34}" r="${w * 0.012}" fill="${p.sun}" opacity="0.95"/>`
    out += `<circle cx="${rx - bw * 0.5}" cy="${ry + bh * 0.34}" r="${w * 0.012}" fill="${p.sun}" opacity="0.95"/>`
  }
  // 横跨街面的一串灯笼
  out += `<path d="M${w * 0.3},${baseY - h * 0.34} Q${w * 0.5},${baseY - h * 0.27} ${w * 0.7},${baseY - h * 0.34}" fill="none" stroke="${p.ink}" stroke-width="${Math.max(1, h * 0.004)}" opacity="0.45"/>`
  for (let i = 0; i < 4; i++) {
    const t = 0.34 + i * 0.107
    const x = w * (0.3 + t * 0.4)
    out += `<circle cx="${x}" cy="${baseY - h * 0.305}" r="${w * 0.011}" fill="${p.sun}" opacity="0.9"/>`
  }
  return out
}

/* ------------------------------ 主入口 ------------------------------ */

const SIZES: Record<ArtworkVariant, [number, number]> = { card: [900, 800], wide: [1400, 480] }

/** 生成 SVG 源码（导出成文件 / 调试用） */
export function buildAttractionArtworkSvg(
  name: string,
  category?: string,
  variant: ArtworkVariant = 'card',
): string {
  const [w, h] = SIZES[variant]
  const seed = hash(`${name}|${category || ''}`)
  const p = PALETTES[seed % PALETTES.length]
  const scene = pickScene(name, category)
  const baseY = h * (variant === 'wide' ? 0.84 : 0.88)

  let body = ''
  // 天空
  body += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`

  if (scene === 'skyline') {
    body += sun(w * 0.74, h * 0.3, h * 0.11, p.sun)
    body += clouds(w, h, p.sky[1], seed)
    body += `<rect x="0" y="${baseY}" width="${w}" height="${h - baseY}" fill="${p.mid}" opacity="0.35"/>`
    body += skyline(w, h, baseY, p, seed)
    body += `<rect x="0" y="${baseY}" width="${w}" height="${h - baseY}" fill="${p.near}" opacity="0.25"/>`
    body += tree(w * 0.06, baseY + h * 0.03, w, h, p.near, 0.85, seed + 1)
  } else if (scene === 'park') {
    body += sun(w * 0.2, h * 0.28, h * 0.1, p.sun)
    body += clouds(w, h, p.sky[1], seed + 3)
    body += `<path d="${ridge(baseY - h * 0.02, h * 0.07, w, h, seed)}" fill="${p.far}" opacity="0.7"/>`
    body += ground(w, h, baseY, p.mid)
    body += ferrisWheel(w * 0.62, baseY - h * 0.2, h * 0.17, p)
    body += tree(w * 0.16, baseY, w, h, p.near, 1.15, seed)
    body += tree(w * 0.28, baseY, w, h, p.near, 0.8, seed + 1)
  } else if (scene === 'heritage') {
    body += sun(w * 0.78, h * 0.26, h * 0.1, p.sun)
    body += clouds(w, h, p.sky[1], seed + 5)
    body += `<path d="${ridge(baseY - h * 0.1, h * 0.1, w, h, seed)}" fill="${p.far}" opacity="0.55"/>`
    body += ground(w, h, baseY, p.mid)
    body += pagoda(w * 0.5, baseY, w, h, p)
    body += pavilion(w * 0.19, baseY, w, h, p, 1.05)
    body += pavilion(w * 0.83, baseY, w, h, p, 0.85)
    body += tree(w * 0.07, baseY, w, h, p.near, 0.9, seed)
    body += tree(w * 0.93, baseY, w, h, p.near, 0.75, seed + 1)
    body += birds(w, h, p.ink, seed)
  } else if (scene === 'street') {
    body += `<rect width="${w}" height="${h * 0.72}" fill="url(#dusk)"/>`
    body += clouds(w, h, p.sky[1], seed + 2)
    body += ground(w, h, baseY, p.mid)
    body += streetScene(w, h, baseY, p, seed)
    body += tree(w * 0.5, baseY + h * 0.02, w, h, p.near, 0.7, seed)
  } else {
    // landscape
    body += sun(w * 0.72, h * 0.24, h * 0.095, p.sun)
    body += clouds(w, h, p.sky[1], seed)
    body += `<path d="${ridge(h * 0.52, h * 0.11, w, h, seed)}" fill="${p.far}" opacity="0.75"/>`
    body += `<path d="${ridge(h * 0.62, h * 0.085, w, h, seed + 2)}" fill="${p.mid}" opacity="0.9"/>`
    if (variant === 'wide') {
      body += `<path d="${ridge(h * 0.72, h * 0.05, w, h, seed + 4)}" fill="${p.near}"/>`
      body += pagoda(w * 0.16, h * 0.76, w, h, p, 0.55)
      body += water(w, h, h * 0.82, p, seed)
      body += bridge(w * 0.52, h * 0.98, w, h, p.ink)
      body += boat(w * 0.83, h * 0.92, w, h, p)
    } else {
      // 卡片版：湖面留够高度，前景岸线只压最底部一条，
      // 早期版本岸线从 0.74 起，把整片水盖掉了，只剩一条缝 —— 看起来像一大块空地
      body += water(w, h, h * 0.7, p, seed)
      body += `<path d="${ridge(h * 0.87, h * 0.04, w, h, seed + 4)}" fill="${p.near}" opacity="0.94"/>`
      body += tree(w * 0.12, h * 1.02, w, h, p.ink, 1.05, seed)
      body += tree(w * 0.23, h * 1.03, w, h, p.ink, 0.8, seed + 1)
      body += tree(w * 0.88, h * 1.02, w, h, p.ink, 0.95, seed + 1)
      body += boat(w * 0.62, h * 0.79, w, h, p)
    }
    body += birds(w, h, p.ink, seed)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    '<defs>' +
    // 三段天空：比两段多一点层次，整体不至于发白
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${p.sky[0]}"/><stop offset="62%" stop-color="${p.sky[1]}"/>` +
    `<stop offset="100%" stop-color="${p.sky[1]}"/>` +
    '</linearGradient>' +
    // 日轮柔光：中心近似实心，边缘完全透明，避免出现硬边圆盘
    `<radialGradient id="glow">` +
    `<stop offset="0%" stop-color="${p.sun}" stop-opacity="0.5"/>` +
    `<stop offset="55%" stop-color="${p.sun}" stop-opacity="0.16"/>` +
    `<stop offset="100%" stop-color="${p.sun}" stop-opacity="0"/>` +
    '</radialGradient>' +
    `<radialGradient id="core">` +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>' +
    '<stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>' +
    '</radialGradient>' +
    `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${p.sky[0]}"/><stop offset="100%" stop-color="${p.sun}" stop-opacity="0.35"/>` +
    '</linearGradient>' +
    '</defs>' +
    body +
    '</svg>'
}

/**
 * data URL 缓存。
 *
 * 必须缓存：getAttractionImage 是在模板里直接调用的，而结果页每次滚动都会重渲染
 * （滚动高亮会改 activeSection），不缓存就等于每个滚动帧都把整段 SVG 重新拼一遍再 base64。
 * 键含 variant，所以卡片版和横幅版各存一份；单份行程的景点数很少，不必担心涨爆。
 */
const artworkCache = new Map<string, string>()
const ARTWORK_CACHE_LIMIT = 200

/** 生成可直接放到 <img src> 上的 data URL（同名 + 同类别 + 同画幅 → 同图） */
export function buildAttractionArtwork(
  name: string,
  category?: string,
  variant: ArtworkVariant = 'card',
): string {
  const key = `${variant}|${name}|${category || ''}`
  const cached = artworkCache.get(key)
  if (cached) return cached

  const svg = buildAttractionArtworkSvg(name, category, variant)
  const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`

  if (artworkCache.size >= ARTWORK_CACHE_LIMIT) artworkCache.clear()
  artworkCache.set(key, url)
  return url
}
