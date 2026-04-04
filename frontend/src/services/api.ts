import axios from 'axios'
import type { TripFormData, TripPlanResponse, TripChatRequest, TripChatResponse } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    console.log('发送请求:', config.method?.toUpperCase(), config.url)
    return config
  },
  (error) => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    console.log('收到响应:', response.status, response.config.url)
    return response
  },
  (error) => {
    console.error('响应错误:', error.response?.status, error.message)
    return Promise.reject(error)
  }
)

/**
 * 提交旅行规划任务（立即返回 task_id）
 */
export async function submitTripPlan(formData: TripFormData): Promise<{ task_id: string }> {
  const response = await apiClient.post('/api/trip/plan', formData)
  return response.data
}

/**
 * 轮询任务状态
 */
export async function pollTaskStatus(taskId: string): Promise<any> {
  const response = await apiClient.get(`/api/trip/status/${taskId}`)
  return response.data
}

// 轮询配置
const POLL_INTERVAL_MS = 3000
const MAX_POLL_RETRIES = 60  // 最多轮询 60 次 = 3 分钟

/**
 * 生成旅行计划（提交 + 轮询，带超时保护）
 */
export async function generateTripPlan(
  formData: TripFormData,
  onProgress?: (progress: string) => void
): Promise<TripPlanResponse> {
  const { task_id } = await submitTripPlan(formData)

  return new Promise((resolve, reject) => {
    let retryCount = 0

    const interval = setInterval(async () => {
      try {
        retryCount++

        if (retryCount > MAX_POLL_RETRIES) {
          clearInterval(interval)
          reject(new Error('任务执行超时，请稍后重试'))
          return
        }

        const status = await pollTaskStatus(task_id)

        if (status.status === 'completed') {
          clearInterval(interval)
          resolve(status.result)
        } else if (status.status === 'failed') {
          clearInterval(interval)
          reject(new Error(status.error || '旅行计划生成失败'))
        } else if (status.status === 'processing') {
          // 回调进度信息
          onProgress?.(status.progress || '处理中...')
        }
      } catch (err: any) {
        // 网络错误不立即终止，允许重试
        if (retryCount > MAX_POLL_RETRIES) {
          clearInterval(interval)
          reject(err)
        }
      }
    }, POLL_INTERVAL_MS)
  })
}

/**
 * AI 行程问答
 */
export async function chatWithTrip(request: TripChatRequest): Promise<TripChatResponse> {
  const response = await apiClient.post('/api/chat/ask', request)
  return response.data
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<any> {
  const response = await apiClient.get('/health')
  return response.data
}

export default apiClient
