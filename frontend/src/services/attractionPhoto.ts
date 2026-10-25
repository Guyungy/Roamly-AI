/**
 * 景点真照片（自建后端 POI 图库）。
 *
 * 对应 `GET /api/poi/photo?name=&city=`。之前这段 fetch 直接写在 Result.vue 里，
 * 自己拼 `VITE_API_BASE_URL` + 自己判断 `data.success` —— 与 nearbyStation/navLink
 * 三份重复逻辑。P-5 收口后统一走 `./http`，页面只拿结果。
 *
 * 取不到照片不是错误路径：调用方会退回本地插画，所以这里失败一律返回 null。
 */

import { getJson, isAbortError } from './http'

interface PoiPhoto {
  name?: string
  photo_url?: string | null
}

/**
 * @returns 图片地址；后端不可用 / 无图 / 被取消时返回 null
 */
export async function fetchAttractionPhoto(
  name: string,
  city?: string,
  signal?: AbortSignal
): Promise<string | null> {
  const keyword = name?.trim()
  if (!keyword) return null

  try {
    const data = await getJson<PoiPhoto | null>('/api/poi/photo', {
      query: { name: keyword, city },
      signal,
    })
    return data?.photo_url || null
  } catch (err) {
    if (isAbortError(err)) return null
    // 后端未部署 / Unsplash 未配置：静默退回本地插画，不打扰用户
    return null
  }
}
