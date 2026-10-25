/**
 * 浏览器定位（Web 端「当前位置」）。
 *
 * 为什么必须自己转坐标：`navigator.geolocation` 返回的是 **WGS-84**，而契约
 * docs/r1/CONTRACT.md §1.1 要求全项目统一 **GCJ-02**（腾讯、高德都是 GCJ-02）。
 * 中国境内两者差 100–700 米：把 WGS-84 直接塞进 `/api/map/nearby-station`，
 * 会以 1500 米半径搜到偏移几百米的**另一片**站点，距离与步行时长跟着一起错，
 * 而且错得很像真的（列表有数据、排序正常），单测和肉眼都发现不了。
 * 所以本模块的出口一律是 GCJ-02，调用方不需要知道这件事。
 *
 * 失败必须分类型上抛，不能统一说「定位失败」：权限被拒（用户要去改设置）、
 * 非安全上下文（开发环境 http 域名）、不支持、超时 —— 四种情况下用户能做的事完全不同。
 */

import type { Location } from '@/types'

/** 定位失败分类，UI 按类型给不同文案与操作建议 */
export type LocateFailureKind = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout'

export class LocateFailure extends Error {
  readonly kind: LocateFailureKind

  constructor(kind: LocateFailureKind, message: string) {
    super(message)
    this.name = 'LocateFailure'
    this.kind = kind
  }
}

export interface CurrentPosition {
  /** 已转换为 GCJ-02 的坐标，可直接喂给后端契约接口 */
  location: Location
  /** 定位精度半径（米）。浏览器桌面端常是 IP 定位，可能到几千米 —— 必须如实透出 */
  accuracy: number
  /** 定位时刻（毫秒时间戳） */
  timestamp: number
}

const DEFAULT_TIMEOUT_MS = 10000
/** 一分钟内的缓存位置够用：用户点两次「定位」没必要重新握手 GPS */
const DEFAULT_MAX_AGE_MS = 60000

/** 克拉索夫斯基椭球参数（WGS-84 → GCJ-02 偏移算法固定使用这一组） */
const A = 6378245.0
const EE = 0.00669342162296594323
const PI = Math.PI

/**
 * 是否在中国境外。GCJ-02 偏移算法只在中国境内成立，境外必须原样返回，
 * 否则会把东京/首尔的坐标也平移几百米（越界判断是国测局算法的标准前置条件）。
 */
export const isOutOfChina = (location: Location): boolean => {
  const { longitude, latitude } = location
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

const transformLat = (x: number, y: number): number => {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

const transformLng = (x: number, y: number): number => {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

/**
 * WGS-84 → GCJ-02。
 *
 * 注意方向：这个算法是**单向**的，反算需要迭代逼近，本项目没有反算需求
 * （契约坐标一律 GCJ-02，浏览器是唯一会产出 WGS-84 的来源）。
 */
export const wgs84ToGcj02 = (location: Location): Location => {
  const { longitude, latitude } = location
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new LocateFailure('unavailable', '定位返回了非法坐标')
  }
  if (isOutOfChina(location)) return { longitude, latitude }

  const dLat0 = transformLat(longitude - 105.0, latitude - 35.0)
  const dLng0 = transformLng(longitude - 105.0, latitude - 35.0)
  const radLat = (latitude / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const dLat = (dLat0 * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  const dLng = (dLng0 * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)

  return { longitude: longitude + dLng, latitude: latitude + dLat }
}

/** 把 GeolocationPositionError.code 映射成本模块的失败分类 */
const mapPositionError = (err: GeolocationPositionError): LocateFailure => {
  switch (err.code) {
    case 1:
      // PERMISSION_DENIED：用户点了「拒绝」，或站点被浏览器策略禁止
      return new LocateFailure('denied', '定位权限被拒绝')
    case 2:
      // POSITION_UNAVAILABLE：定位服务不可用（无 GPS、系统定位关闭、IP 库查不到）
      return new LocateFailure('unavailable', '定位服务不可用')
    case 3:
      return new LocateFailure('timeout', '定位超时')
    default:
      return new LocateFailure('unavailable', err.message || '定位失败')
  }
}

/**
 * 取当前位置（GCJ-02）。
 *
 * 会抛 `LocateFailure`，调用方按 `kind` 给文案；**不会**返回兜底坐标 ——
 * 定位失败时编一个「北京天安门」出来，比什么都不显示更糟。
 */
export async function getCurrentLocation(
  options: { timeout?: number; maximumAge?: number } = {}
): Promise<CurrentPosition> {
  // 非安全上下文（http 的线上域名）下浏览器直接禁用定位，提前给准确原因，
  // 否则用户只会看到一个莫名的 PERMISSION_DENIED
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new LocateFailure('insecure', '定位需要 HTTPS 或 localhost 环境')
  }

  const geolocation =
    typeof navigator !== 'undefined' ? (navigator.geolocation as Geolocation | undefined) : undefined
  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    throw new LocateFailure('unsupported', '当前浏览器不支持定位')
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, (err) => reject(mapPositionError(err)), {
      enableHighAccuracy: true,
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      maximumAge: options.maximumAge ?? DEFAULT_MAX_AGE_MS,
    })
  })

  const raw = {
    longitude: position.coords.longitude,
    latitude: position.coords.latitude,
  }
  // accuracy 缺失时给一个「不知道」的保守值，UI 据此不宣称精度
  const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : -1

  return {
    location: wgs84ToGcj02(raw),
    accuracy,
    timestamp: position.timestamp || Date.now(),
  }
}
