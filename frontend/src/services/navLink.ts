/**
 * 一键导航链接服务（Web 端触发挂载）。
 *
 * 行程详情 / 地点卡片上的「一键导航」按钮：把 POI 坐标拼成腾讯位置服务 Web 界面的
 * 路线规划链接，由浏览器新窗口打开。
 *
 * 为什么在前端直连拼链接，而不是等后端 T3.1 的 build_nav_link()？
 * - 链接本身是纯字符串拼接，不需要 Key / 密钥（referer 只是调用方标识，非常密），
 *   完全不依赖网络与服务可用性 —— 弱网时这条链接照样能立刻给到用户，正好满足「弱网链接兜底」。
 * - 后端 T3.1 / P-5 落地后，如需统一由后端出参，只需在这个 service 里换成 fetch 调用，
 *   组件层签名不变。
 */

export type NavTravelMode = 'drive' | 'walk' | 'bus' | 'ride'

/** 行车导航作为默认出行方式（站点/酒店/餐饮都是"导航过去"），可扩展 */
const DEFAULT_MODE: NavTravelMode = 'drive'

/** 调起腾讯地图网页 URI 的 referer 标识（应用名，非常密） */
const REFERER = 'qichumenla_app'

/** URI 各段参数编码，保持坐标用半角逗号 */
const enc = (value: string): string => encodeURIComponent(value)

/** 经纬度到 URI 坐标串：腾讯地图用的是 lat,lng */
const toCoord = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(6)},${longitude.toFixed(6)}`

/** 出参统一结构：有坐标即给出导航链接；没有坐标返回 null，组件据此决定是否渲染按钮 */
export interface NavLinkResult {
  /** 可直接放进 <a href> 的腾讯地图路线规划链接 */
  url: string
  /** 出行方式对应的腾讯 URI type 值 */
  mode: NavTravelMode
}

/**
 * 由 POI 坐标生成腾讯地图「路线规划」网页链接。
 *
 * 起算点不传 (fromcoord 缺省)，腾讯端默认取用户当前位置作为起点，
 * 这样用户在行程里走到哪、想导航去当前 POI，直接就能从脚下规划。
 *
 * @param targetName  目的地名称（会出现在腾讯地图页面上）
 * @param latitude    目的地纬度
 * @param longitude   目的地经度
 * @param mode        出行方式，缺省驾车
 */
export function buildNavLink(
  targetName: string,
  latitude: number,
  longitude: number,
  mode: NavTravelMode = DEFAULT_MODE
): NavLinkResult {
  const params = [
    `type=${mode}`,
    `to=${enc(targetName)}`,
    `tocoord=${toCoord(latitude, longitude)}`,
    `referer=${enc(REFERER)}`,
  ]
  return {
    url: `https://apis.map.qq.com/uri/v1/routeplan?${params.join('&')}`,
    mode,
  }
}

export const NAV_DEFAULT_MODE = DEFAULT_MODE
export const NAV_REFERER = REFERER