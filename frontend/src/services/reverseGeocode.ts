/**
 * 逆地理编码（坐标 → 城市/地址），用于把「当前位置」标注成人看得懂的地名。
 *
 * 后端 `GET /api/map/reverse-geocode` 走的是高德 Web 服务 Key（Key 只在后端），
 * 该接口没有 `degraded` 语义：没配 Key 直接 500。所以这里**任何失败都返回 null**，
 * 由调用方退回到「当前位置」纯文字 —— 定位本身已经成功了，不能因为地名查不到
 * 就把整个定位判为失败。
 */

import { getJson, isAbortError } from './http'

const API_REVERSE_GEOCODE = '/api/map/reverse-geocode'

export interface ReverseGeocode {
  city: string
  district: string
  address: string
  province: string
}

/** 同一坐标的地名不会变，进程内记住即可 */
const cache = new Map<string, ReverseGeocode | null>()

const keyOf = (longitude: number, latitude: number): string =>
  `${longitude.toFixed(4)},${latitude.toFixed(4)}`

/**
 * 坐标 → 地名。取不到返回 null（**不抛错**，调用方据此只显示「当前位置」）。
 *
 * 后端按 `longitude` / `latitude` 两个 float 收参，与契约 §1.1 的字段顺序一致。
 */
export async function reverseGeocode(
  longitude: number,
  latitude: number,
  signal?: AbortSignal
): Promise<ReverseGeocode | null> {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

  const key = keyOf(longitude, latitude)
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const data = await getJson<ReverseGeocode>(API_REVERSE_GEOCODE, {
      query: { longitude: longitude.toFixed(6), latitude: latitude.toFixed(6) },
      signal,
    })
    const value: ReverseGeocode = {
      city: data?.city ?? '',
      district: data?.district ?? '',
      address: data?.address ?? '',
      province: data?.province ?? '',
    }
    // 全空等于没查到，别缓存成「有效结果」
    const result = value.city || value.district || value.address ? value : null
    cache.set(key, result)
    return result
  } catch (err) {
    // 取消是调用方主动行为：不缓存，下次还能再查
    if (isAbortError(err)) return null
    cache.set(key, null)
    return null
  }
}

/** 把逆地理编码结果压成一行短地名：优先「市·区」，没有就退到地址 */
export const formatPlaceLabel = (geo: ReverseGeocode | null): string => {
  if (!geo) return ''
  const parts = [geo.city, geo.district].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return geo.address || ''
}
