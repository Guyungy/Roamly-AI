/**
 * 历史行程管理 Store
 *
 * 持久化存储在本地，支持多条行程记录
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TripPlan, KnowledgeGraphData } from '@/types'

const STORAGE_KEY = 'roamly_history'
const MAX_HISTORY = 20

export interface HistoryItem {
  /** 唯一 ID */
  id: string
  /** 城市 */
  city: string
  /** 出发日期 */
  startDate: string
  /** 结束日期 */
  endDate: string
  /** 天数 */
  days: number
  /** 创建时间戳 */
  createdAt: number
  /** 完整行程数据 */
  tripPlan: TripPlan
  /** 知识图谱数据 */
  graphData?: KnowledgeGraphData | null
  /** 前4个景点名（预计算，避免列表渲染时重复遍历） */
  previewAttractions: string[]
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (raw) {
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    }
  } catch (e) {
    console.warn('加载历史行程失败', e)
  }
  return []
}

function saveHistory(items: HistoryItem[]) {
  try {
    uni.setStorage({ key: STORAGE_KEY, data: JSON.stringify(items) })
  } catch (e) {
    console.warn('保存历史行程失败', e)
  }
}

export const useHistoryStore = defineStore('history', () => {
  const items = ref<HistoryItem[]>(loadHistory())

  const count = computed(() => items.value.length)
  const isEmpty = computed(() => items.value.length === 0)

  /** 添加行程（最新在前） */
  function add(tripPlan: TripPlan, graphData?: KnowledgeGraphData | null) {
    const names: string[] = []
    for (const day of tripPlan.days || []) {
      for (const attr of day.attractions || []) {
        names.push(attr.name)
        if (names.length >= 4) break
      }
      if (names.length >= 4) break
    }

    const item: HistoryItem = {
      id: generateId(),
      city: tripPlan.city,
      startDate: tripPlan.start_date,
      endDate: tripPlan.end_date,
      days: tripPlan.days?.length ?? 0,
      createdAt: Date.now(),
      tripPlan,
      graphData: graphData ?? null,
      previewAttractions: names,
    }
    items.value.unshift(item)
    // 限制最大数量
    if (items.value.length > MAX_HISTORY) {
      items.value = items.value.slice(0, MAX_HISTORY)
    }
    saveHistory(items.value)
    return item
  }

  /** 根据 ID 获取 */
  function getById(id: string): HistoryItem | undefined {
    return items.value.find(i => i.id === id)
  }

  /** 删除 */
  function remove(id: string) {
    items.value = items.value.filter(i => i.id !== id)
    saveHistory(items.value)
  }

  /** 清空所有 */
  function clearAll() {
    items.value = []
    saveHistory(items.value)
  }

  return {
    items,
    count,
    isEmpty,
    add,
    getById,
    remove,
    clearAll,
  }
})
