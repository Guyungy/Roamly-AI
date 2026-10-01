/**
 * 生成阶段判定（cloudLLM/planProgress 的 analyzeStream）离线单测。
 *
 * 为什么单独测：这段逻辑决定「界面上告诉用户 AI 正在做什么」，必须保证
 *   1) 阶段单调前进，不会来回跳；
 *   2) 进度百分比单调不减；
 *   3) 天数计数只在真的出现 day_index 之后才报，且不超过总天数。
 * 用真实模型输出的「逐段前缀」来喂，而不是构造理想输入。
 *
 * 用法：node .workbuddy/scripts/verify-plan-progress.js
 */
const { execFileSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const FE = path.join(ROOT, 'frontend')
const ESBUILD = path.join(FE, 'node_modules/.bin/esbuild')
const OUT = '/tmp/plan-progress.cjs'

execFileSync(ESBUILD, ['src/services/planProgress.ts', '--format=cjs', '--platform=node', `--outfile=${OUT}`, '--log-level=error'], { cwd: FE })
const { analyzeStream } = require(OUT)

const failures = []
let passed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else failures.push(`${name}: ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

const TOTAL = 3

// 按模型真实输出顺序拼接的前缀快照
const CHUNKS = [
  ['{"city":"杭州","start_date":"2026-10-05","end_date":"2026-10-07","overall_suggestions":"早晚温差约10度，带件薄外套。",', 'understand'],
  ['"days":[{"date":"2026-10-05","day_index":0,"description":"抵达日"', 'days'],
  [',"attractions":[{"name":"西湖","category":"自然风光"}],"meals":[]}', 'days'],
  [',{"date":"2026-10-06","day_index":1,"description":"灵隐线","attractions":[],"meals":[]}', 'days'],
  [',{"date":"2026-10-07","day_index":2,"description":"湿地点","attractions":[],"meals":[]}],', 'days'],
  ['"weather_info":[{"date":"2026-10-05","day_weather":"晴","day_temp":25}]', 'weather'],
  [',"budget":{"total_attractions":195,"total_hotels":1140,"total_meals":565,"total_transportation":120,"total":2020}}', 'budget'],
]

let acc = ''
let prevPercent = -1
let prevStageIndex = -1
let monotonicStage = true
let monotonicPercent = true
const seenStages = []

for (const [piece, expectedStage] of CHUNKS) {
  acc += piece
  const { meta, percent } = analyzeStream(acc, TOTAL)
  const stageIndex = ['understand', 'days', 'weather', 'budget', 'finalize'].indexOf(meta.stage)
  if (stageIndex < prevStageIndex) monotonicStage = false
  if (percent < prevPercent) monotonicPercent = false
  prevStageIndex = stageIndex
  prevPercent = percent
  seenStages.push(meta.stage)
  check(`阶段判定：…${piece.slice(0, 26)}…`, meta.stage === expectedStage, `得到 ${meta.stage}，期望 ${expectedStage}`)
  check('  天数不超总天数', meta.daysSeen <= TOTAL, `${meta.daysSeen}/${TOTAL}`)
}

check('阶段单调前进（不会回退）', monotonicStage, seenStages.join(' → '))
check('进度百分比单调不减', monotonicPercent, `末值 ${prevPercent}%`)
check('最终百分比不会提前到 100', prevPercent < 100, `${prevPercent}%`)
check('三个阶段都出现过', new Set(seenStages).size >= 3, [...new Set(seenStages)].join(', '))

// days 阶段的天数计数必须是真数出来的
const twoDays = analyzeStream('"days":[{"day_index":0},{"day_index":1},', TOTAL)
check('days 阶段实时数出已排天数', twoDays.meta.stage === 'days' && twoDays.meta.daysSeen === 2, `${twoDays.meta.stage} / ${twoDays.meta.daysSeen}`)

// 关键：schema 里的 "day_index" 出现在 system prompt，不在输出流里，所以不会被误计
const empty = analyzeStream('', TOTAL)
check('空流不报天数', empty.meta.daysSeen === 0 && empty.meta.stage === 'understand', `${empty.meta.stage} / ${empty.meta.daysSeen}`)

console.log(`\n结论: ${failures.length === 0 ? '全部通过' : failures.length + ' 项失败'}（${passed} 项通过）`)
process.exit(failures.length === 0 ? 0 : 1)
