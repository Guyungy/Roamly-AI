/**
 * 当前城市探索（前端调用层）。
 *
 * 对应后端 REST：`GET /api/map/city-explore?kind=&city=|longitude=&latitude=&limit=`
 * 契约见 docs/r1/CONTRACT.md §5。
 *
 * 与 `nearbyStation.ts` 的分工，别混：
 *   nearbyStation  米级半径内的地铁/公交站（§2），回答「我附近怎么走」
 *   cityExplore    整座城市值得去的地方（§5），回答「这座城市有什么」
 *
 * 两者共用同一套四态语义（live / cache / degraded / mock），原因也一样：
 * 「后端降级」和「这城市真没地方」在 UI 上必须能分开，不能靠 mock 假数据糊过去。
 */

import type { Location } from '@/types'
import { getEnvelope, isAbortError, locationParams } from './http'

/** 探索类别。与后端 §5 的 kind 取值一一对应，改一处要同步改另一处 */
export type ExploreKind = 'spot' | 'food' | 'park' | 'museum'

export const EXPLORE_KINDS: ExploreKind[] = ['spot', 'food', 'park', 'museum']

export interface CitySpot {
  id: string
  name: string
  /** 上游 category，如 '旅游景点:国家级景点' */
  category: string
  kind: ExploreKind
  address: string
  location: Location
  /** 与城市中心的直线距离（米），后端按城市中心算，不是用户位置 */
  distance: number
  /** 后端给出的推荐分，已降序 */
  score: number
}

export interface CityCenter {
  name: string
  location: Location
}

/**
 * 数据来源。与 nearbyStation 的四态含义完全一致，UI 必须分别给文案：
 *   live     真后端成功
 *   cache    真后端失败（网络/5xx）→ 最近一次真实结果
 *   degraded 真后端明确回 degraded=true（Key 缺失/城市无法解析）→ **不给假地点**
 *   mock     后端压根没接通 → 内置演示地点（如实标注）
 */
export type CityExploreSource = 'live' | 'cache' | 'degraded' | 'mock'

export interface CityExploreResult {
  spots: CitySpot[]
  source: CityExploreSource
  /** 解析出的城市中心；降级/失败时为 null */
  city: CityCenter | null
  /** source=degraded 时后端给出的原因，直接展示给用户 */
  degradedReason?: string
}

const API_CITY_EXPLORE = '/api/map/city-explore'
const CACHE_KEY_PREFIX = 'chumenla:city-explore:'
const CACHE_TTL_MS = 30 * 60 * 1000
const DEFAULT_LIMIT = 12

/** 契约 §5 的上游结构（字段可能缺失，解析时兜底） */
interface RawCitySpot {
  id?: string
  name?: string
  category?: string
  kind?: string
  address?: string
  location?: { longitude?: number; latitude?: number }
  distance?: number
  score?: number
}

interface RawCityCenter {
  name?: string
  location?: { longitude?: number; latitude?: number }
}

/** 契约 §5 的响应信封：data 是地点数组，city 与 data **平级**挂在信封上 */
interface CityExploreEnvelope {
  success?: boolean
  degraded?: boolean
  message?: string
  city?: RawCityCenter | null
  data?: RawCitySpot[]
}

const normalizeKind = (raw: string | undefined, fallback: ExploreKind): ExploreKind =>
  EXPLORE_KINDS.includes(raw as ExploreKind) ? (raw as ExploreKind) : fallback

const normalizeSpots = (rows: RawCitySpot[] | undefined, kind: ExploreKind): CitySpot[] => {
  const list = Array.isArray(rows) ? rows : []
  const out: CitySpot[] = []
  list.forEach((row, index) => {
    const longitude = row.location?.longitude
    const latitude = row.location?.latitude
    // 没有坐标的地点没法在地图/导航里用，直接丢弃而不是给 0,0
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return

    const name = row.name?.trim()
    if (!name) return

    out.push({
      id: row.id || `spot-${index}`,
      name,
      category: row.category?.trim() || '',
      kind: normalizeKind(row.kind, kind),
      address: row.address?.trim() || '',
      location: { longitude, latitude },
      distance:
        typeof row.distance === 'number' && Number.isFinite(row.distance)
          ? Math.round(row.distance)
          : 0,
      score: typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 0,
    })
  })
  return out.sort((a, b) => b.score - a.score || a.distance - b.distance)
}

const normalizeCity = (raw: RawCityCenter | null | undefined): CityCenter | null => {
  const longitude = raw?.location?.longitude
  const latitude = raw?.location?.latitude
  const name = raw?.name?.trim()
  if (!name) return null
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return { name, location: { longitude, latitude } }
}

/** 缓存键：按「城市 + 类别」而不是按坐标 —— 城市中心由后端解析，前端不该猜 */
const cacheKey = (city: string, kind: ExploreKind) => `${CACHE_KEY_PREFIX}${city}|${kind}`

const cacheRead = (city: string, kind: ExploreKind): CityExploreResult | null => {
  if (typeof localStorage === 'undefined' || !city) return null
  try {
    const raw = localStorage.getItem(cacheKey(city, kind))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; result: CityExploreResult }
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null
    if (!Array.isArray(parsed.result?.spots) || parsed.result.spots.length === 0) return null
    return { ...parsed.result, source: 'cache' }
  } catch {
    return null
  }
}

const cacheWrite = (city: string, kind: ExploreKind, result: CityExploreResult) => {
  if (typeof localStorage === 'undefined' || !city) return
  if (result.spots.length === 0) return
  try {
    localStorage.setItem(cacheKey(city, kind), JSON.stringify({ at: Date.now(), result }))
  } catch {
    /* 存不下就静默放弃，不影响请求结果 */
  }
}

/**
 * 演示数据。只在「后端压根没接通」时用，且调用方必须如实标注 mock。
 * 与 nearbyStation 的 mock 一样按城市名做确定性伪随机，同一城市每次同一组。
 */
const mockSpots = (city: string, kind: ExploreKind): CitySpot[] => {
  const pools: Record<ExploreKind, string[]> = {
    spot: ['老城历史街区', '城市观景台', '滨江步道', '古寺禅院', '艺术中心'],
    food: ['本地菜老字号', '街角面馆', '夜市小吃街', '江畔餐厅', '老牌茶馆'],
    park: ['中央公园', '滨河绿道', '植物园', '湿地公园', '山顶公园'],
    museum: ['市博物馆', '美术馆', '科技馆', '民俗馆', '纪念馆'],
  }
  const seed = Math.abs(
    Array.from(city).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + kind.length * 977
  )
  const rand = (i: number) => ((seed * 31 + i * 137) % 997) / 997

  return pools[kind].map((name, index) => {
    const distance = Math.round(600 + index * 1400 + rand(index) * 900)
    // 0.001 度 ≈ 111 m，把演示点摆在「城市中心」周围
    const offsetDeg = (distance / 111000) * (index % 2 === 0 ? 1 : -1) * (0.5 + rand(index))
    return {
      id: `mock-${kind}-${index}`,
      name,
      category: '演示数据',
      kind,
      address: '演示数据 · 城市探索',
      location: { longitude: 116.397428 + offsetDeg, latitude: 39.90923 + offsetDeg * 0.7 },
      distance,
      score: 100 - index * 10,
    }
  })
}

export interface CityExploreOptions {
  /** 城市名；与 center 二选一，都为空时后端会降级 */
  city?: string
  /** 已定位坐标（GCJ-02）；后端据此反查城市名 */
  center?: Location
  kind?: ExploreKind
  limit?: number
  signal?: AbortSignal
}

/**
 * 拉取某座城市的探索列表。
 *
 * - 成功（degraded=false）→ live，写缓存。**空列表照实返回**（这座城市该类别真没有）。
 * - 后端回 `degraded=true` → degraded + 空列表，不伪造地点（契约 §5 沿用 §2 的「绝不伪造」）。
 * - 网络/5xx/解析失败 → cache（有缓存时）→ 都没有则 mock（如实标注）。
 * - 请求被取消 → 原样上抛，绝不降级，否则切类别时旧响应会污染新列表。
 */
export async function fetchCityExplore(
  options: CityExploreOptions = {}
): Promise<CityExploreResult> {
  const kind = options.kind ?? 'spot'
  const limit = options.limit ?? DEFAULT_LIMIT
  const cityName = options.city?.trim() || ''

  // 城市名未知时（只给了坐标）没有缓存键可用：这类请求直接走网络，失败也不给 mock，
  // 否则会把演示地点挂在「当前位置」名下，看起来像是真的。
  const cacheable = Boolean(cityName)

  try {
    const payload = await getEnvelope<RawCitySpot[]>(API_CITY_EXPLORE, {
      query: {
        kind,
        limit,
        // 城市名优先：它是后端解析城市中心的唯一依据；坐标只在没名字时用
        city: cityName || undefined,
        ...(options.center ? locationParams(options.center) : {}),
      },
      signal: options.signal,
    })

    const spots = normalizeSpots(payload.data, kind)
    const city = normalizeCity((payload as CityExploreEnvelope).city)
    // 成功但该类别真的没有地点：如实返回空列表，不拿 mock 冒充（契约 §5）
    const result: CityExploreResult = { spots, source: 'live', city }
    if (cacheable && spots.length > 0) cacheWrite(cityName, kind, result)
    return result
  } catch (err) {
    if (isAbortError(err)) throw err

    const reason = (err as { degradedReason?: string }).degradedReason
    const isDegraded = (err as { kind?: string }).kind === 'degraded'

    if (isDegraded) {
      // 后端在、但上游不可用或城市无法解析。缓存是**上一次**的事实，不是当下结果，
      // 拿来展示会让人以为这城市现在就是这些地方，所以不给。
      return { spots: [], source: 'degraded', city: null, degradedReason: reason }
    }

    if (cacheable) {
      const cached = cacheRead(cityName, kind)
      if (cached) return cached
    }

    // 连不上后端：给演示数据但如实标注 mock。没有城市名时不编 —— 见上面的注释。
    if (!cityName) {
      return { spots: [], source: 'degraded', city: null, degradedReason: '' }
    }
    return { spots: mockSpots(cityName, kind), source: 'mock', city: null }
  }
}
