/**
 * 行程规划提交 composable
 * 统一封装提交→轮询→存储→跳转逻辑
 */
import { onUnmounted } from 'vue'
import { useTripStore } from '@/stores/trip'
import { useQuotaStore } from '@/stores/quota'
import { useHistoryStore } from '@/stores/history'
import { generateTripPlan, type TripPlanTask } from '@/services/api'
import type { TripFormData } from '@/types'

export function usePlanSubmit() {
  const tripStore = useTripStore()
  const quotaStore = useQuotaStore()
  const historyStore = useHistoryStore()

  let currentTask: TripPlanTask | null = null

  /** 提交行程规划 */
  async function submitPlan(formData: TripFormData): Promise<boolean> {
    tripStore.setLoading(true)
    tripStore.setProgress('正在初始化智能体...')

    try {
      const task = generateTripPlan(formData, (progress) => {
        tripStore.setProgress(progress)
      })
      currentTask = task

      const response = await task.promise

      if (response.success && response.data) {
        quotaStore.consume()
        historyStore.add(response.data, response.graph_data)
        tripStore.setTripPlan(response.data, response.graph_data)
        tripStore.setLoading(false)
        uni.navigateTo({ url: '/pages/result/index' })
        return true
      } else {
        throw new Error(response.message || '规划失败')
      }
    } catch (err: any) {
      tripStore.setLoading(false)
      if (err.message !== '已取消') {
        uni.showToast({
          title: err.message || '规划失败，请重试',
          icon: 'none',
          duration: 3000,
        })
      }
      return false
    } finally {
      currentTask = null
    }
  }

  /** 取消正在进行的规划 */
  function cancelPlan() {
    if (currentTask) {
      currentTask.cancel()
      currentTask = null
    }
  }

  // 页面卸载时自动取消
  onUnmounted(() => {
    cancelPlan()
  })

  return {
    submitPlan,
    cancelPlan,
  }
}
