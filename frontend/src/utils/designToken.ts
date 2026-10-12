/**
 * JS 侧读取设计 token。
 *
 * CSS 里可以写 var(--c-brand-500)，但 ECharts 的配置对象、高德的 Polyline 参数
 * 都只吃字面量颜色 —— 于是这些地方就会各自硬编码一份"差不多"的橙色，
 * 改主色时必然漏掉几处（本项目原来就有 #d76e42 / #f5593d / #e85520 三个版本）。
 *
 * 这里统一从 :root 的 CSS 变量取值，保证 JS 与 CSS 同源。
 * 取值在调用时进行（不是模块加载时），这样 <html> 上的主题变量已经注入完毕。
 */
export const token = (name: string, fallback: string): string => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** 品牌主色（按钮、折线、标记的默认落点） */
export const brandColor = (): string => token('--c-brand-500', '#ff6b35')

/** 品牌深色（需要更高对比度时用，例如压在浅色底上的线） */
export const brandStrongColor = (): string => token('--c-brand-600', '#e85520')

/** 成功/绿（步行路线等语义色） */
export const successColor = (): string => token('--c-success', '#0e9f8a')

/** 信息/蓝（公共交通等语义色） */
export const infoColor = (): string => token('--c-info', '#3b7ddd')

/** 警示/琥珀（骑行等语义色） */
export const warningColor = (): string => token('--c-warning', '#d98b0b')

const hexToRgb = (hex: string): [number, number, number] | null => {
  const matched = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!matched) return null
  let body = matched[1]
  if (body.length === 3) {
    body = body
      .split('')
      .map((char) => char + char)
      .join('')
  }
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ]
}

const withAlpha = (hex: string, alpha: number, fallbackRgb: string): string => {
  const rgb = hexToRgb(hex)
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : `rgba(${fallbackRgb}, ${alpha})`
}

/**
 * 品牌色的透明版本。
 * ECharts / 高德参数只吃字面量，写不了 var() 也写不了 color-mix()，
 * 所以阴影/描边这类"品牌色 + 透明度"只能在这里算出来。
 */
export const brandRgba = (alpha: number): string => withAlpha(brandColor(), alpha, '255, 107, 53')

/** 品牌深色的透明版本 */
export const brandStrongRgba = (alpha: number): string =>
  withAlpha(brandStrongColor(), alpha, '232, 85, 32')

/** 中性最深的透明版本：ECharts 的连线/标签灰，保证和页面灰阶同源 */
export const inkRgba = (alpha: number): string => withAlpha(token('--c-ink-900', '#16181d'), alpha, '22, 24, 29')
