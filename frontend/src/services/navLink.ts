/**
 * 一键导航链接服务（Web 端触发挂载）。
 *
 * 行程详情 / 地点卡片上的「一键导航」按钮：链接**只由后端生成**
 * （`GET /api/map/nav-link`，契约 docs/r1/CONTRACT.md §4）。
 * 前端不再自行拼接腾讯 URI —— 之前 poll-161 在前端拼了一遍，与后端
 * `build_nav_url` 重复，两处 referer/坐标顺序一旦不一致就会静默跑偏。
 *
 * 后端该接口是纯本地拼接、不依赖 Key，因此这里失败即视为「后端不可用」，
 * 按钮不渲染，不做前端兜底拼接。
 *
 * 基址拼接与错误分类已收口到 `./http`（P-5）。本文件只剩缓存与批量并发。
 */

import type { Location } from '@/types'
import { getJson, isAbortError, locationParams } from './http'

export type NavTravelMode = 'walk' | 'drive' | 'transit'

/** 地点卡片的默认出行方式：走到景点/酒店，步行最贴近真实意图 */
const DEFAULT_MODE: NavTravelMode = 'walk'

const API_NAV_LINK = '/api/map/nav-link'

export interface NavLink {
  mode: string
  destination: string
  provider: string
  url: string
}

/** 同一次会话内同名同坐标的链接不会变，命中缓存可省掉重复请求 */
const cache = new Map<string, string>()

const cacheKey = (
  destination: string,
  mode: NavTravelMode,
  latitude?: number,
  longitude?: number
): string => `${mode}|${destination}|${latitude ?? ''},${longitude ?? ''}`

/**
 * 取一个目的地的导航链接。
 *
 * @param destination 目的地名称
 * @param location    目的地坐标；缺坐标时后端只按名称生成链接
 * @param mode        出行方式，缺省步行
 * @returns 链接；后端不可用或返回异常时为 null（调用方据此不渲染按钮）
 */
export async function fetchNavLink(
  destination: string,
  location?: Location,
  mode: NavTravelMode = DEFAULT_MODE,
  signal?: AbortSignal
): Promise<string | null> {
  const name = destination?.trim()
  if (!name) return null

  const key = cacheKey(name, mode, location?.latitude, location?.longitude)
  const hit = cache.get(key)
  if (hit) return hit

  // 契约 §4 的 nav-link 接口不带 degraded 语义（纯本地拼接、不依赖 Key），
  // 所以这里任何 ApiFailure 都只意味着「后端不可用」→ 不渲染按钮。
  try {
    const data = await getJson<NavLink | null>(API_NAV_LINK, {
      query: {
        destination: name,
        mode,
        // 有坐标才带；后端按 (lng, lat) 两个 float 收，不拼 "lat,lng" 单串
        ...(location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
          ? locationParams(location)
          : {}),
      },
      signal,
    })
    const url = data?.url
    if (!url) return null
    cache.set(key, url)
    return url
  } catch (err) {
    // 请求被取消是调用方主动行为，不算「后端不可用」，但结果同样是不渲染
    if (isAbortError(err)) return null
    // 后端不可用（未部署 / 断网 / 5xx）：不渲染按钮，绝不前端兜底拼接
    return null
  }
}

/**
 * 批量取导航链接，返回 `目的地名 → 链接` 映射（取不到的条目不出现在结果里）。
 *
 * 单个地点失败不影响其他地点；并发上限默认 4，避免一次行程几十个点位
 * 同时打后端。
 */
export async function fetchNavLinks(
  items: Array<{ name: string; location?: Location }>,
  options: { mode?: NavTravelMode; concurrency?: number; signal?: AbortSignal } = {}
): Promise<Record<string, string>> {
  const mode = options.mode ?? DEFAULT_MODE
  const concurrency = Math.max(1, options.concurrency ?? 4)

  // 同名地点只请求一次（概览与每日行程会重复出现同一个景点）
  const unique = new Map<string, { name: string; location?: Location }>()
  items.forEach((item) => {
    const name = item.name?.trim()
    if (name && !unique.has(name)) unique.set(name, { ...item, name })
  })

  const queue = [...unique.values()]
  const out: Record<string, string> = {}

  const worker = async () => {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      if (options.signal?.aborted) return
      const url = await fetchNavLink(next.name, next.location, mode, options.signal)
      if (url) out[next.name] = url
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return out
}

export const NAV_DEFAULT_MODE = DEFAULT_MODE
