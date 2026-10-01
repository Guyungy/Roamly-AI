import axios from 'axios'
import type { TripFormData, TripPlanResponse, TripChatRequest, TripChatResponse } from '@/types'
import { hasOwnBackend } from '@/config/cloud'
import { chatWithTripCloud, describeCloudError, generateTripPlanWithCloud } from './cloudLLM'
import type { ProgressReporter } from './cloudLLM'

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
// 后端单任务上限为 10 分钟（backend TASK_TIMEOUT_SECONDS=600），
// 客户端轮询窗口必须 ≥ 该上限，否则长行程会在后端仍执行时被前端误判超时。
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 10 * 60 * 1000
const MAX_POLL_RETRIES = Math.ceil(POLL_TIMEOUT_MS / POLL_INTERVAL_MS) // 200 次

/**
 * 生成旅行计划。
 *
 * - 配置了 VITE_API_BASE_URL：走自建后端（多智能体 + 高德 MCP），提交任务后轮询。
 * - 未配置（线上默认）：走云服务模型，由 cloudLLM 负责流式收集与结构化校验。
 */
export async function generateTripPlan(
  formData: TripFormData,
  onProgress?: ProgressReporter
): Promise<TripPlanResponse> {
  if (!hasOwnBackend) {
    try {
      return await generateTripPlanWithCloud(formData, onProgress)
    } catch (err) {
      throw new Error(describeCloudError(err))
    }
  }

  const { task_id } = await submitTripPlan(formData)

  return new Promise((resolve, reject) => {
    let retryCount = 0
    // 用 setTimeout 串行调度而非 setInterval：避免单次请求耗时 > 间隔时并发轮询
    let timer: ReturnType<typeof setTimeout> | null = null

    const stop = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const poll = async () => {
      try {
        retryCount++

        if (retryCount > MAX_POLL_RETRIES) {
          stop()
          reject(new Error('任务执行超时，请稍后重试'))
          return
        }

        const status = await pollTaskStatus(task_id)

        if (status.status === 'completed') {
          stop()
          resolve(status.result)
        } else if (status.status === 'failed') {
          stop()
          reject(new Error(status.error || '旅行计划生成失败'))
        } else {
          onProgress?.(status.progress || '处理中...')
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (err: any) {
        // 网络抖动不立即终止，允许重试
        if (retryCount > MAX_POLL_RETRIES) {
          stop()
          reject(err)
        } else {
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS)
  })
}

/**
 * AI 行程问答。
 * 未配置自建后端时走云服务模型，并支持通过 onDelta 逐字渲染回复。
 */
export async function chatWithTrip(
  request: TripChatRequest,
  onDelta?: (text: string) => void,
  signal?: AbortSignal
): Promise<TripChatResponse> {
  if (!hasOwnBackend) {
    try {
      return await chatWithTripCloud(request, onDelta, signal)
    } catch (err) {
      throw new Error(describeCloudError(err))
    }
  }

  const response = await apiClient.post('/api/chat/ask', request)
  const data = response.data as TripChatResponse
  onDelta?.(data.reply)
  return data
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<any> {
  const response = await apiClient.get('/health')
  return response.data
}

export default apiClient
