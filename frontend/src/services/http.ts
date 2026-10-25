/**
 * 前端统一调用层（P-5 收口）。
 *
 * 为什么要有这一层：poll-159 / poll-161 各自在自己的 service 里写了一遍
 * 「基址拼接 + resp.ok 判断 + JSON 解析 + 降级判定 + 缓存」，三处细节一旦不一致
 * 就会静默跑偏——比如某处把 `degraded=true` 当成成功、某处忘了拼 `VITE_API_BASE_URL`。
 * 这里把这段重复逻辑收成一份，各 service 只负责「怎么解析业务字段」。
 *
 * 契约见 docs/r1/CONTRACT.md §1。本层只做三件事，不做业务：
 *   1. 拼基址与查询串
 *   2. 把 HTTP / 网络 / 解析失败统一成 ApiFailure（带 kind，便于调用方决定降级策略）
 *   3. 识别后端契约里的 `degraded` 语义
 */

import type { Location } from '@/types'

/**
 * 自建后端基址。本地开发留空走 Vite 代理；线上单独部署后端时由 VITE_API_BASE_URL 注入。
 * 不拼这个基址的话，线上会把请求打到前端自己的域名上（404 → 永远降级到 mock）。
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

/** 后端契约 §1.2：非 0 的 status 一律视为失败，不得降级为「空列表」冒充成功 */
export interface ApiEnvelope<T> {
  success: boolean
  /** Key 缺失 / 上游失败 / 未授权时为 true；此时 data 是空数组，不是「真的没有」 */
  degraded?: boolean
  message?: string
  data?: T
}

/**
 * 失败分类。调用方据此决定「要不要降级」：
 * - `network`：连不上 / 断网 / 超时 —— 降级合理
 * - `http`：后端返回 4xx/5xx —— 4xx 多为入参错误，不该拿假数据掩盖
 * - `degraded`：后端明确说「上游不可用」—— 降级合理，且应透出原因
 * - `malformed`：响应不是预期的 JSON 结构 —— 降级，但要留日志
 * - `aborted`：调用方主动取消 —— **必须原样上抛，不能降级**，否则切城市时旧请求会写入新列表
 */
export type ApiFailureKind = 'network' | 'http' | 'degraded' | 'malformed' | 'aborted'

export class ApiFailure extends Error {
  readonly kind: ApiFailureKind
  readonly status?: number
  /** 后端 `degraded=true` 时带回的说明，用于在 UI 上如实告知「为什么是兜底数据」 */
  readonly degradedReason?: string

  constructor(
    kind: ApiFailureKind,
    message: string,
    extra: { status?: number; degradedReason?: string } = {}
  ) {
    super(message)
    this.name = 'ApiFailure'
    this.kind = kind
    this.status = extra.status
    this.degradedReason = extra.degradedReason
  }

  /** 这类失败是否值得降级到缓存 / 内置数据 */
  get isDegradable(): boolean {
    return this.kind !== 'aborted'
  }
}

export const isAbortError = (err: unknown): boolean =>
  err instanceof ApiFailure
    ? err.kind === 'aborted'
    : (err as { name?: string } | null)?.name === 'AbortError'

export interface RequestOptions {
  /** 查询参数。undefined / null 的键会被丢弃，避免发出 `?city=undefined` */
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const params = new URLSearchParams()
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    params.set(key, String(value))
  })
  const qs = params.toString()
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

/**
 * 发一次 GET 并解出契约信封。
 *
 * 成功返回 `data`（可能为空数组 —— 那是「附近真没有」，调用方必须如实展示）；
 * 失败抛 ApiFailure，由调用方决定降级。**本函数绝不返回伪造数据。**
 */
export async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query)

  let resp: Response
  try {
    resp = await fetch(url, { signal: options.signal })
  } catch (err) {
    if (isAbortError(err)) throw new ApiFailure('aborted', `${path} 请求被取消`)
    throw new ApiFailure('network', `${path} 请求失败: ${(err as Error)?.message ?? err}`)
  }

  if (!resp.ok) {
    // 4xx 通常是入参问题（如契约 §1.2 的 348 纬度越界 → FastAPI 422），
    // 拿 mock 盖掉只会让问题更难查，所以照样抛，由调用方决定要不要降级
    throw new ApiFailure('http', `${path} 返回 ${resp.status}`, { status: resp.status })
  }

  let payload: ApiEnvelope<T>
  try {
    payload = (await resp.json()) as ApiEnvelope<T>
  } catch (err) {
    if (isAbortError(err)) throw new ApiFailure('aborted', `${path} 请求被取消`)
    throw new ApiFailure('malformed', `${path} 响应不是合法 JSON`)
  }

  if (!payload || typeof payload !== 'object') {
    throw new ApiFailure('malformed', `${path} 响应结构异常`)
  }

  // 降级响应（degraded=true）的 data=[] 是「上游没给」，不是「附近真没有」，
  // 两者在前端的处置不同：前者该走缓存/mock 兜底，后者该如实显示空列表。
  if (payload.degraded) {
    throw new ApiFailure('degraded', payload.message || `${path} 上游降级`, {
      degradedReason: payload.message || '',
    })
  }

  if (!payload.success) {
    throw new ApiFailure('malformed', payload.message || `${path} 未返回成功标记`)
  }

  return payload.data as T
}

/**
 * 契约 §1.1：全项目统一 `Location{longitude, latitude}`。
 * 腾讯上游用 `"lat,lng"` 字符串顺序，与 Location 字段顺序**相反** —— 这个转换
 * 只在后端做（`to_coord`），前端一旦自己拼就会出现串位，所以这里只提供
 * 「拆成两个 float 参数」的辅助，不提供拼单串的版本。
 */
export const locationParams = (
  center: Location
): { longitude: string; latitude: string } => ({
  longitude: center.longitude.toFixed(6),
  latitude: center.latitude.toFixed(6),
})

export { buildUrl as __buildUrl }
