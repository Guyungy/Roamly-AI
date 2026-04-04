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
const POLL_INTERVAL_MS = 3000
const MAX_POLL_RETRIES = 60

/**
 * 生成旅行计划（提交 + 轮询，带超时保护）
 */
export function generateTripPlan(
  formData: TripFormData,
  onProgress?: (progress: string) => void
): Promise<TripPlanResponse> {
  return new Promise(async (resolve, reject) => {
    try {
      const { task_id } = await submitTripPlan(formData)
      let retryCount = 0

      const poll = async () => {
        try {
          retryCount++

          if (retryCount > MAX_POLL_RETRIES) {
            reject(new Error('任务执行超时，请稍后重试'))
            return
          }

          const status = await pollTaskStatus(task_id)

          if (status.status === 'completed') {
            resolve(status.result)
          } else if (status.status === 'failed') {
            reject(new Error(status.error || '旅行计划生成失败'))
          } else {
            onProgress?.(status.progress || '处理中...')
            setTimeout(poll, POLL_INTERVAL_MS)
          }
        } catch (err: any) {
          if (retryCount > MAX_POLL_RETRIES) {
            reject(err)
          } else {
            setTimeout(poll, POLL_INTERVAL_MS)
          }
        }
      }

      setTimeout(poll, POLL_INTERVAL_MS)
    } catch (err) {
      reject(err)
    }
  })
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
