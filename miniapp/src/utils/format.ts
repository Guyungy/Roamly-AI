/**
 * 格式化预算金额
 */
export function formatBudgetAmount(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

/**
 * 格式化日期显示 (简短模式)
 */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '--'
  const normalized = dateStr
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/[./]/g, '-')
    .trim()
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 格式化星期
 */
export function formatWeekday(dateStr: string, short = false): string {
  if (!dateStr) return '--'
  const normalized = dateStr
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/[./]/g, '-')
    .trim()
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return '--'
  const weekdays = short
    ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    : ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return weekdays[d.getDay()]
}

/**
 * 格式化温度
 */
export function formatTemp(temp: number | null | undefined): string {
  if (!Number.isFinite(Number(temp))) return '--'
  return `${Math.round(Number(temp))}°`
}

/**
 * 获取天气图标 emoji
 */
export function getWeatherEmoji(weatherText: string): string {
  const t = (weatherText || '').toLowerCase()
  if (/(雷|thunder|storm|lightning)/.test(t)) return '⛈️'
  if (/(雪|snow|sleet|hail|冰雹)/.test(t)) return '🌨️'
  if (/(雨.*晴|晴.*雨|sun.*rain|rain.*sun)/.test(t)) return '🌦️'
  if (/(雨|rain|shower|drizzle)/.test(t)) return '🌧️'
  if (/(阴|cloud|overcast)/.test(t)) return '☁️'
  if (/(雾|霾|fog|mist|haze)/.test(t)) return '🌫️'
  return '☀️'
}

/**
 * 获取餐食类型名称
 */
export function getMealLabel(type: string): string {
  const labels: Record<string, string> = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '小食',
  }
  return labels[type] || type
}
