/**
 * 附近站点检索（前端统一调用层）。
 *
 * 对应后端 REST：`GET /api/map/nearby-station?longitude=&latitude=&radius=&keyword=`
 * 请求参数按 R1 契约（docs/r1/CONTRACT.md §2）用 longitude / latitude 两个 float，
 * 不用 `coord="lng,lat"` 单串——腾讯上游是 `"lat,lng"`，单串最易串位。
 *
 * 基址拼接、HTTP 错误分类、`degraded` 识别都在 `./http` 里收口，本文件只做业务解析
 * 与降级策略。降级分四种来源，UI 必须如实区分（见 `NearbyStationSource`）：
 *   live     真后端成功
 *   cache    真后端失败（网络/5xx）→ 最近一次真实结果
 *   degraded 真后端明确回 `degraded=true`（Key 缺失/上游失败）→ **不给假站点**
 *   mock     压根没配自建后端（云端模式/本地纯前端）→ 内置演示站点
 */

import type { Location } from '@/types'
import { getJson, isAbortError, locationParams } from './http'

export interface NearbyStation {
  /** 站点唯一标识，用于列表 key 与点击定位 */
  id: string
  /** 站点名称 */
  name: string
  /** 站点类型：subway(地铁) / bus(公交) */
  type: 'subway' | 'bus'
  address: string
  location: Location
  /** 与中心点的直线距离（米） */
  distance: number
}

/** 前端统一调用层产出的站点，附上步行可达性推导字段 */
export interface StationView extends NearbyStation {
  /** 步行时长估算（分钟） */
  walkMinutes: number
  /** 步行距离（公里，保留 1 位小数） */
  walkKm: number
  /** 是否步行可达（阈值内） */
  walkable: boolean
}

const API_NEARBY_STATION = '/api/map/nearby-station'

/** 步行可达阈值：超过此距离提示「稍远/建议乘车」 */
export const WALKABLE_THRESHOLD_M = 800

/** 平均步行速度：1.2 m/s，用于距离→分钟换算（约 5 km/h） */
const WALK_SPEED_MS = 1.2

const CACHE_KEY_PREFIX = 'chumenla:nearby-station:'
const RADIUS_DEFAULT_M = 1500
const KEYWORD_DEFAULT = '地铁,公交'

/** 契约 §2 的上游站点结构（字段可能缺失，解析时兜底） */
interface RawStation {
  id?: string
  name?: string
  /** 契约取值：metro | bus | other */
  type?: string
  address?: string
  location?: { longitude?: number; latitude?: number }
  distance?: number
  lines?: string[]
}

/** 契约 type(metro/bus/other) → 前端展示用的 subway/bus */
const normalizeType = (raw: string): 'subway' | 'bus' => {
  if (!raw) return 'bus'
  if (raw === 'metro' || raw === 'subway') return 'subway'
  if (raw === 'bus') return 'bus'
  return /(地铁|轨道交通|railway|metro|subway)/i.test(raw) ? 'subway' : 'bus'
}

export const toStationView = (raw: NearbyStation): StationView => {
  const walkMinutes = Math.max(1, Math.round(raw.distance / WALK_SPEED_MS / 60))
  const walkKm = Math.round((raw.distance / 1000) * 10) / 10
  return {
    ...raw,
    walkMinutes,
    walkKm,
    walkable: raw.distance <= WALKABLE_THRESHOLD_M,
  }
}

/** 归一化后端返回，兜住缺字段 / 非标准坐标 */
const normalizeResponse = (list: RawStation[] | undefined): NearbyStation[] => {
  const rows = Array.isArray(list) ? list : []
  const out: NearbyStation[] = []
  rows.forEach((s, i) => {
    const lng = s.location?.longitude
    const lat = s.location?.latitude
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    out.push({
      id: s.id || `st-${i}`,
      name: s.name?.trim() || '未知站点',
      type: normalizeType(s.type ?? ''),
      address: s.address?.trim() || '',
      location: { longitude: lng, latitude: lat },
      distance: typeof s.distance === 'number' && Number.isFinite(s.distance) ? Math.round(s.distance) : 0,
    })
  })
  return out.sort((a, b) => a.distance - b.distance)
}

/** 由中心坐标生成稳定的 mock 站点（确定性伪随机，保证列表可复现） */
const mockStations = (center: Location): NearbyStation[] => {
  const stations: NearbyStation[] = []
  const pools = [
    { type: 'subway' as const, names: ['地铁·市民中心站', '地铁·科技馆站', '地铁·中央公园站', '地铁·人民广场站'] },
    { type: 'bus' as const, names: ['公交·市民广场站', '公交·文化路站', '公交·和平路口站', '公交·滨河大道站', '公交·中心街区站'] },
  ]
  // 以坐标为种子，取低 8 位做确定性随机，同一坐标每次返回同一组站点
  const seed = Math.abs(Math.round((center.latitude * 7919 + center.longitude * 104729) * 1000))
  const rand = () => ((seed * 31 + stations.length * 7 + Math.floor(seed / (stations.length + 1))) % 997) / 997
  pools.forEach((pool, pi) => {
    pool.names.forEach((name, ni) => {
      // 距离按类型拉开：地铁站通常更远一点；整体渐次递增
      const base = pi * 260 + ni * 220 + Math.floor(rand() * 180)
      // 经纬度偏移：0.001 度 ≈ 111m，模拟站点落在中心附近
      const offsetDeg = (base / 111000) * (ni % 2 === 0 ? 1 : -1) * (0.6 + rand() * 0.8)
      stations.push({
        id: `st-${pi}-${ni}`,
        name,
        type: pool.type,
        address: '演示数据 · 附近站点',
        location: {
          longitude: center.longitude + offsetDeg,
          latitude: center.latitude + (offsetDeg * 0.7),
        },
        distance: Math.max(80, base + Math.floor(rand() * 60)),
      })
    })
  })
  return stations.sort((a, b) => a.distance - b.distance)
}

const centerKey = (center: Location) => `${center.longitude.toFixed(4)},${center.latitude.toFixed(4)}`

const cacheRead = (center: Location): StationView[] | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + centerKey(center))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; list: NearbyStation[] }
    // 缓存 24 小时内有效
    if (Date.now() - parsed.at > 24 * 60 * 60 * 1000) return null
    if (!Array.isArray(parsed.list)) return null
    return parsed.list.map(toStationView).filter(Boolean)
  } catch {
    return null
  }
}

const cacheWrite = (center: Location, list: NearbyStation[]) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      CACHE_KEY_PREFIX + centerKey(center),
      JSON.stringify({ at: Date.now(), list })
    )
  } catch {
    /* 存不下就静默放弃，不影响请求结果 */
  }
}

/**
 * 数据来源。UI 必须按它分别给文案——把 degraded 说成「缓存」或把 mock 说成
 * 「真实数据」都是在骗用户。
 */
export type NearbyStationSource = 'live' | 'cache' | 'degraded' | 'mock'

export interface NearbyStationResult {
  stations: StationView[]
  source: NearbyStationSource
  /** source=degraded 时后端给出的降级原因，直接展示给用户 */
  degradedReason?: string
}

/**
 * 拉取中心点附近的站点列表。
 *
 * - 真后端成功（degraded=false）→ live，写缓存。**空列表照实返回**（附近真没有站点）。
 * - 真后端回 `degraded=true` → degraded + 空列表，不伪造站点（契约 §2「绝不伪造」），
 *   原因通过 `degradedReason` 透出给 UI。
 * - 网络/5xx/解析失败 → cache（有缓存时）→ 都没有则 mock（如实标注）。
 * - 请求被取消（切中心点）→ 原样上抛，绝不降级，否则旧响应会污染新列表。
 */
export async function fetchNearbyStations(
  center: Location,
  options: { radius?: number; keyword?: string; signal?: AbortSignal } = {}
): Promise<NearbyStationResult> {
  const radius = options.radius ?? RADIUS_DEFAULT_M
  const keyword = options.keyword ?? KEYWORD_DEFAULT

  // 注意：不能因为「没配 VITE_API_BASE_URL」就跳过请求。本地开发正是靠 Vite 代理
  // 把相对路径 /api 转到 localhost:8000，这时基址为空但后端是通的。
  // 基址为空且确实没有后端时，请求会 404 走进下面的降级分支，代价只是一次往返。
  try {
    const data = await getJson<RawStation[]>(API_NEARBY_STATION, {
      // 契约 §2：longitude / latitude 两个 float，不走 "lng,lat" 单串
      query: { ...locationParams(center), radius, keyword },
      signal: options.signal,
    })
    const list = normalizeResponse(data)
    // 成功但附近确实没有站点：如实返回空列表（面板显示"暂无站点"），
    // 不能拿 mock 假站点冒充——契约 §2 明确「绝不伪造站点」。
    if (list.length > 0) cacheWrite(center, list)
    return { stations: list.map(toStationView), source: 'live' }
  } catch (err) {
    // 主动取消不是失败：上抛让调用方丢弃结果
    if (isAbortError(err)) throw err

    const reason = (err as { degradedReason?: string }).degradedReason
    const isDegraded = (err as { kind?: string }).kind === 'degraded'
    const cached = cacheRead(center)

    if (isDegraded) {
      // 后端在、但上游不可用（Key 缺失 / 未授权 / 上游报错）。
      // 契约 §2 要求「绝不伪造站点」，而缓存是**上一次**的真实结果、不是当下事实——
      // 把它当成本次结果展示，用户会以为附近就是这些站。所以这里返回空列表，
      // 由 UI 如实说明「后端已降级」，把原因一并透出。
      return { stations: [], source: 'degraded', degradedReason: reason }
    }

    if (cached && cached.length) return { stations: cached, source: 'cache' }
    // 真后端配了却连不上，且没有缓存：给演示数据但如实标注 mock
    return { stations: mockStations(center).map(toStationView), source: 'mock' }
  }
}
