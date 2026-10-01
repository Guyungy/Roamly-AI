import type { TripFormData, TripPlanResponse, TripChatRequest, TripChatResponse } from '@/types'

// API 基础地址 - 通过 env 或编译时注入
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

/**
 * 通用请求封装 - 基于 uni.request
 */
function request<T = any>(options: {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: Record<string, string>
}): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...options.header,
      },
      timeout: 30000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
        } else {
          console.error('请求失败:', res.statusCode, res.data)
          reject(new Error(`请求失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        console.error('网络错误:', err)
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

/**
 * 提交旅行规划任务
 */
export async function submitTripPlan(formData: TripFormData): Promise<{ task_id: string }> {
  return request<{ task_id: string }>({
    url: '/api/trip/plan',
    method: 'POST',
    data: formData,
  })
}

/**
 * 轮询任务状态
 */
export async function pollTaskStatus(taskId: string): Promise<any> {
  return request({
    url: `/api/trip/status/${taskId}`,
    method: 'GET',
  })
}

// 轮询配置
// 后端单任务上限为 10 分钟（TASK_TIMEOUT_SECONDS=600），
// 客户端轮询窗口必须 ≥ 该上限，否则长行程会在后端仍执行时被前端误判超时。
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 10 * 60 * 1000
const MAX_POLL_RETRIES = Math.ceil(POLL_TIMEOUT_MS / POLL_INTERVAL_MS) // 200 次

export interface TripPlanTask {
  promise: Promise<TripPlanResponse>
  cancel: () => void
}

/**
 * 生成旅行计划（提交 + 轮询，带超时和取消支持）
 */
export function generateTripPlan(
  formData: TripFormData,
  onProgress?: (progress: string) => void
): TripPlanTask {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }

  const promise = new Promise<TripPlanResponse>(async (resolve, reject) => {
    try {
      const { task_id } = await submitTripPlan(formData)
      let retryCount = 0

      const poll = async () => {
        if (cancelled) {
          reject(new Error('已取消'))
          return
        }

        try {
          retryCount++
          if (retryCount > MAX_POLL_RETRIES) {
            reject(new Error('任务执行超时，请稍后重试'))
            return
          }

          const status = await pollTaskStatus(task_id)

          if (cancelled) return

          if (status.status === 'completed') {
            resolve(status.result)
          } else if (status.status === 'failed') {
            reject(new Error(status.error || '旅行计划生成失败'))
          } else {
            onProgress?.(status.progress || '处理中...')
            timer = setTimeout(poll, POLL_INTERVAL_MS)
          }
        } catch (err: any) {
          if (cancelled) return
          if (retryCount > MAX_POLL_RETRIES) {
            reject(err)
          } else {
            timer = setTimeout(poll, POLL_INTERVAL_MS)
          }
        }
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS)
    } catch (err) {
      reject(err)
    }
  })

  return { promise, cancel }
}

/**
 * AI 行程问答
 */
export async function chatWithTrip(chatRequest: TripChatRequest): Promise<TripChatResponse> {
  return request<TripChatResponse>({
    url: '/api/chat/ask',
    method: 'POST',
    data: chatRequest,
  })
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<any> {
  return request({ url: '/health' })
}

/**
 * 逆地理编码 — 经纬度转城市名（通过后端中转，避免前端暴露 Key）
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<{
  city: string
  district: string
  address: string
  province: string
}> {
  const res = await request<{
    success: boolean
    data: { city: string; district: string; address: string; province: string }
  }>({
    url: `/api/map/reverse-geocode?longitude=${longitude}&latitude=${latitude}`,
  })
  return res.data
}

/**
 * 获取景点图片
 */
export async function getAttractionPhoto(name: string, city?: string): Promise<string | null> {
  try {
    const params = city ? `name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}` : `name=${encodeURIComponent(name)}`
    const res = await request<{ success: boolean; data: { photo_url: string | null } }>({
      url: `/api/poi/photo?${params}`,
    })
    return res.data?.photo_url || null
  } catch {
    return null
  }
}

// ============ 附近站点（统一调用层，带降级兜底） ============

export interface NearbyStation {
  id: string
  name: string
  type: 'subway' | 'bus'
  address: string
  location: { longitude: number; latitude: number }
  distance: number
}

/** 附步行可达性推导字段 */
export interface StationView extends NearbyStation {
  walkMinutes: number
  walkKm: number
  walkable: boolean
}

export type StationSource = 'live' | 'cache' | 'mock'

export interface StationResult {
  stations: StationView[]
  source: StationSource
}

const WALKABLE_THRESHOLD_M = 800
const WALK_SPEED_MS = 1.2
const CACHE_KEY_PREFIX = 'chumenla:nearby-station:'
const STATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const toStationView = (raw: NearbyStation): StationView => {
  const walkMinutes = Math.max(1, Math.round(raw.distance / WALK_SPEED_MS / 60))
  const walkKm = Math.round((raw.distance / 1000) * 10) / 10
  return {
    ...raw,
    walkMinutes,
    walkKm,
    walkable: raw.distance <= WALKABLE_THRESHOLD_M,
  }
}

const normalizeType = (raw?: string): 'subway' | 'bus' => {
  if (!raw) return 'bus'
  return /(地铁|轨道交通|railway|metro|subway)/i.test(raw) ? 'subway' : 'bus'
}

const normalizeList = (payload: any): NearbyStation[] => {
  const list = Array.isArray(payload?.data) ? payload.data : []
  const out: NearbyStation[] = []
  list.forEach((s: any, i: number) => {
    const lng = s?.location?.longitude
    const lat = s?.location?.latitude
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    out.push({
      id: s?.id || `st-${i}`,
      name: (s?.name || '未知站点').trim(),
      type: normalizeType(s?.type),
      address: (s?.address || '').trim(),
      location: { longitude: lng, latitude: lat },
      distance: typeof s?.distance === 'number' && Number.isFinite(s.distance) ? Math.round(s.distance) : 0,
    })
  })
  return out.sort((a, b) => a.distance - b.distance)
}

/** 由中心坐标生成确定性的 mock 站点（演示兜底） */
const mockStations = (lng: number, lat: number): NearbyStation[] => {
  const pools = [
    { type: 'subway' as const, names: ['地铁·市民中心站', '地铁·科技馆站', '地铁·中央公园站', '地铁·人民广场站'] },
    { type: 'bus' as const, names: ['公交·市民广场站', '公交·文化路站', '公交·和平路口站', '公交·滨河大道站', '公交·中心街区站'] },
  ]
  const seed = Math.abs(Math.round((lat * 7919 + lng * 104729) * 1000))
  const list: NearbyStation[] = []
  const nextRand = () =>
    ((seed * 31 + (list.length + 1) * 7 + Math.floor(seed / (list.length + 2))) % 997) / 997
  pools.forEach((pool, pi) => {
    pool.names.forEach((name, ni) => {
      const base = pi * 260 + ni * 220 + Math.floor(nextRand() * 180)
      const offsetDeg = (base / 111000) * (ni % 2 === 0 ? 1 : -1) * (0.6 + nextRand() * 0.8)
      list.push({
        id: `st-${pi}-${ni}`,
        name,
        type: pool.type,
        address: '演示数据 · 附近站点',
        location: { longitude: lng + offsetDeg, latitude: lat + offsetDeg * 0.7 },
        distance: Math.max(80, base + Math.floor(nextRand() * 60)),
      })
    })
  })
  return list.sort((a, b) => a.distance - b.distance)
}

const stationCacheKey = (lng: number, lat: number) =>
  `${CACHE_KEY_PREFIX}${lng.toFixed(4)},${lat.toFixed(4)}`

const cacheRead = (lng: number, lat: number): StationView[] | null => {
  try {
    const raw = uni.getStorageSync(stationCacheKey(lng, lat))
    if (!raw) return null
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Date.now() - (parsed?.at || 0) > STATION_CACHE_TTL_MS) return null
    if (!Array.isArray(parsed?.list)) return null
    return parsed.list.map(toStationView)
  } catch {
    return null
  }
}

const cacheWrite = (lng: number, lat: number, list: NearbyStation[]) => {
  try {
    uni.setStorageSync(stationCacheKey(lng, lat), JSON.stringify({ at: Date.now(), list }))
  } catch {
    /* 存不下就静默放弃 */
  }
}

/**
 * 拉取中心点附近的站点列表。
 * 优先走真实后端 /api/map/nearby-station；失败/未配置时读本地缓存，再不行回退内置 mock。
 */
export async function fetchNearbyStations(
  longitude: number,
  latitude: number,
  options: { radius?: number; keyword?: string } = {}
): Promise<StationResult> {
  const radius = options.radius ?? 1500
  const keyword = options.keyword ?? '地铁,公交'
  try {
    const params = `coord=${longitude.toFixed(6)},${latitude.toFixed(6)}&radius=${radius}&keyword=${encodeURIComponent(keyword)}`
    const res = await request<{ success: boolean; data: NearbyStation[] }>({
      url: `/api/map/nearby-station?${params}`,
    })
    const list = normalizeList(res)
    if (list.length > 0) {
      cacheWrite(longitude, latitude, list)
      return { stations: list.map(toStationView), source: 'live' }
    }
    throw new Error('empty')
  } catch {
    const cached = cacheRead(longitude, latitude)
    if (cached && cached.length) return { stations: cached, source: 'cache' }
    return { stations: mockStations(longitude, latitude).map(toStationView), source: 'mock' }
  }
}
