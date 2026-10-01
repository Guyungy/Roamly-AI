/**
 * 附近站点检索（前端统一调用层）。
 *
 * 对应后端 REST：`GET /api/map/nearby-station?coord=LNG,LAT&radius=&keyword=`
 * 后端该路由（T2.3）尚未上线时，按 P-5「mock 先行」策略降级：
 *   真后端 → 失败/未配置 → 本地缓存 → 内置 mock。
 * 缓存用 localStorage，保证弱网/后端抖动时列表不空白。
 */

import type { Location } from '@/types'

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

interface StationResponse {
  success: boolean
  data?: Array<{
    id?: string
    name?: string
    type?: string
    address?: string
    location?: { longitude?: number; latitude?: number }
    distance?: number
  }>
}

const normalizeType = (raw: string): 'subway' | 'bus' => {
  if (!raw) return 'bus'
  if (/(地铁|轨道交通|railway|metro|subway)/i.test(raw)) return 'subway'
  return 'bus'
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
const normalizeResponse = (payload: StationResponse): NearbyStation[] => {
  const list = Array.isArray(payload?.data) ? payload.data : []
  const out: NearbyStation[] = []
  list.forEach((s, i) => {
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

const centerKey = (center: Location) => `${center.longitude.toFixed(4)},${center.latitude.toFixed(4)}`

export interface NearbyStationResult {
  stations: StationView[]
  /** 数据来源：live(真实后端) / cache(本地缓存降级) / mock(内置兜底数据) */
  source: 'live' | 'cache' | 'mock'
}

/**
 * 拉取中心点附近的站点列表。
 *
 * - 配置了真实后端且请求成功 → live + 写缓存
 * - 后端失败或未配置 → 先读缓存（cache），读不到再用 mock（mock）
 *   两层降级保证弱网/后端抖动下列表都有内容，不空白。
 *
 * @param center 中心经纬度
 * @param radius 检索半径（米，默认 1500）
 * @returns 排序后的站点列表与数据来源
 */
export async function fetchNearbyStations(
  center: Location,
  options: { radius?: number; keyword?: string; signal?: AbortSignal } = {}
): Promise<NearbyStationResult> {
  const radius = options.radius ?? RADIUS_DEFAULT_M
  const keyword = options.keyword ?? KEYWORD_DEFAULT

  const tryLive = async (): Promise<NearbyStationResult> => {
    const params = new URLSearchParams({
      coord: `${center.longitude.toFixed(6)},${center.latitude.toFixed(6)}`,
      radius: String(radius),
      keyword,
    })
    const resp = await fetch(`${API_NEARBY_STATION}?${params.toString()}`, { signal: options.signal })
    if (!resp.ok) throw new Error(`nearby-station ${resp.status}`)
    const payload = (await resp.json()) as StationResponse
    const list = normalizeResponse(payload)
    if (list.length === 0) throw new Error('empty')
    cacheWrite(center, list)
    return { stations: list.map(toStationView), source: 'live' }
  }

  try {
    return await tryLive()
  } catch {
    // 后端失败 / 未配置（fetch 会 reject）→ 读缓存 → 兜底 mock
    const cached = cacheRead(center)
    if (cached && cached.length) {
      return { stations: cached, source: 'cache' }
    }
    return { stations: mockStations(center).map(toStationView), source: 'mock' }
  }
}