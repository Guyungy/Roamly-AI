/**
 * 从「已到达的流式文本」反推生成阶段与进度。
 *
 * 为什么能做「真阶段」而不是编步骤：模型按 PLAN_SYSTEM_PROMPT 的顺序逐个输出 JSON 字段
 * （city → overall_suggestions → days → weather_info → budget），所以只要扫一遍已经收到的
 * 文本，就能准确知道它此刻在写哪一段、days 里已经出现了几天 —— 这是流里的真实结构，不是按时钟演的。
 *
 * 单独成文件是为了能脱离浏览器单测（见 .workbuddy/scripts/verify-plan-progress.js）。
 */

export interface PlanProgressMeta {
  stage: 'understand' | 'days' | 'weather' | 'budget' | 'finalize'
  /** 已出现 day_index 的天数（近似「已排到的第几天」） */
  daysSeen: number
  /** 本次要排的总天数 */
  daysTotal: number
}

export const PLAN_STAGE_ORDER: PlanProgressMeta['stage'][] = [
  'understand',
  'days',
  'weather',
  'budget',
  'finalize',
]

export function analyzeStream(text: string, daysTotal: number): { meta: PlanProgressMeta; percent: number } {
  const daysSeen = (text.match(/"day_index"\s*:/g) || []).length
  const hasDays = /"days"\s*:/.test(text)
  const hasWeather = /"weather_info"\s*:/.test(text)
  const hasBudget = /"budget"\s*:/.test(text)

  // 字段在 JSON 里按顺序出现，所以从后往前判：后出现的字段说明前一段已经写完
  const stage: PlanProgressMeta['stage'] = hasBudget
    ? 'budget'
    : hasWeather
      ? 'weather'
      : hasDays
        ? 'days'
        : 'understand'

  let percent: number
  if (stage === 'understand') percent = 8
  else if (stage === 'days') percent = Math.round(18 + 40 * Math.min(1, daysSeen / Math.max(1, daysTotal)))
  else if (stage === 'weather') percent = 66
  else percent = 84

  return { meta: { stage, daysSeen, daysTotal }, percent }
}
