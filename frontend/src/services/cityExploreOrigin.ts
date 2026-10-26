/**
 * 城市探索的「检索原点」解析（契约 §5）。
 *
 * 抽成纯函数是为了能被单测锁住：这里曾经出过一个只在真机上才看得见的 bug ——
 * 定位成功但逆地理编码查不到城市名时（后端没配高德 Key 必然如此），坐标被丢掉了，
 * 于是请求跑完、数据也拿回来了，界面却仍然显示「尚未确定城市」。
 *
 * 三条规则：
 *   1. 定位过的城市压过行程目的地（用户显式表达「我要看我的城市」）
 *   2. 有城市名就只用城市名 —— 城市名更准，且后端拿它查城市中心
 *   3. 没有城市名时用坐标兜底（后端按坐标反查城市），两者**不同时发**
 */

import type { Location } from '@/types'

export interface ExploreOrigin {
  /** 城市名；为空表示只能靠坐标 */
  city: string
  /** 定位坐标；与 city 互斥 */
  center: Location | null
}

export const resolveExploreOrigin = (
  destCity: string | undefined,
  locatedCity: string,
  locatedCenter: Location | null
): ExploreOrigin => {
  const city = (locatedCity || destCity || '').trim()
  if (city) return { city, center: null }
  return { city: '', center: locatedCenter ?? null }
}

/** 有任一原点就能检索；都没有时不请求、不编造 */
export const hasExploreOrigin = (origin: ExploreOrigin): boolean =>
  Boolean(origin.city || origin.center)
