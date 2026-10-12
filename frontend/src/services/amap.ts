/**
 * 高德 JS API 的唯一加载入口（地图、景点真照片、城市联想都走这里）。
 *
 * 为什么必须是"唯一"：
 * - loader 对同一个 key 重复 load 会再次注入脚本；
 * - 更要命的是 plugins 会互相覆盖 —— 先加载地图的那次只带了一部分插件，
 *   后面想补插件的调用会把前一次的列表盖掉，于是先前注册的 AMap.Driving 就没了。
 *
 * 所以：插件清单在这里并成一份（union），promise 记忆化，全局只加载一次。
 * JS API 2.0 起 Web端 Key 必须配套「安全密钥」，且必须在注入脚本**之前**挂到 window 上。
 */
const AMAP_PLUGINS = [
  // 地图与叠加物
  'AMap.Marker',
  'AMap.Polyline',
  'AMap.InfoWindow',
  // 路线规划：四档交通方式
  'AMap.Driving',
  'AMap.Walking',
  'AMap.Riding',
  'AMap.Transfer',
  // POI 检索与输入联想
  'AMap.PlaceSearch',
  'AMap.AutoComplete',
]

let amapLoadPromise: Promise<any> | null = null

/** 是否配置了 Web端 Key（没配时各页面要给出「地图不可用」的降级说明） */
export const hasAmapKey = (): boolean => Boolean(import.meta.env.VITE_AMAP_WEB_JS_KEY)

export const loadAMap = async (): Promise<any | null> => {
  const key = import.meta.env.VITE_AMAP_WEB_JS_KEY
  if (!key) return null

  if (!amapLoadPromise) {
    const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE
    if (securityJsCode) {
      ;(window as unknown as { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
        securityJsCode,
      }
    }
    // 动态 import：没配 Key 或首屏用不到地图时，loader 不进主 chunk
    const { default: AMapLoader } = await import('@amap/amap-jsapi-loader')
    amapLoadPromise = AMapLoader.load({
      key, // 高德地图 Web端(JS API) Key
      version: '2.0',
      plugins: AMAP_PLUGINS,
    }).catch((error) => {
      amapLoadPromise = null // 失败不缓存，允许重试
      throw error
    })
  }

  return amapLoadPromise
}

/*
 * 底图样式：默认样式把整城的 POI（医院/学校/银行/商铺）连点名带图标全画上，
 * 我们自己的行程编号标记反而被淹掉 —— 而且那些 POI 和这趟旅行毫无关系。
 * 换成「淡雅白」并关掉 POI 图层（features 只留背景/道路/建筑），
 * 地图变成一张留白画布，视线自然落到行程本身。
 * 用内置样式而不是自定义样式 ID：自定义样式要在高德控制台建图、绑定 Key，
 * 换 Key 就失效；内置样式随代码走。
 */
export const AMAP_MAP_STYLE = 'amap://styles/whitesmoke'

/** 只保留底图、道路与建筑，关掉 POI 图层 */
export const AMAP_MAP_FEATURES = ['bg', 'road', 'building']
