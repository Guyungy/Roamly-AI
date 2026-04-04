/**
 * 规划次数管理 Store
 *
 * 变现策略：
 * - 每日免费 1 次
 * - 看激励视频广告 +1 次（每日上限 5 次）
 * - 邀请好友 +3 次（长期有效）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'roamly_quota'
const DAILY_FREE = 1
const AD_REWARD_PER_VIEW = 1
const AD_DAILY_LIMIT = 5
const INVITE_REWARD = 3

interface QuotaData {
  /** 当天日期 YYYY-MM-DD */
  date: string
  /** 今日已使用的免费次数 */
  freeUsed: number
  /** 今日已看广告次数 */
  adWatched: number
  /** 广告奖励剩余次数（当日有效） */
  adRemaining: number
  /** 邀请奖励剩余次数（永久有效） */
  inviteRemaining: number
  /** 累计邀请人数 */
  totalInvites: number
}

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function loadQuota(): QuotaData {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (raw) {
      const data: QuotaData = typeof raw === 'string' ? JSON.parse(raw) : raw
      // 跨天自动重置每日次数
      if (data.date !== getTodayStr()) {
        return {
          date: getTodayStr(),
          freeUsed: 0,
          adWatched: 0,
          adRemaining: 0,
          inviteRemaining: data.inviteRemaining || 0,
          totalInvites: data.totalInvites || 0,
        }
      }
      return data
    }
  } catch (e) {
    console.warn('加载次数数据失败', e)
  }
  return {
    date: getTodayStr(),
    freeUsed: 0,
    adWatched: 0,
    adRemaining: 0,
    inviteRemaining: 0,
    totalInvites: 0,
  }
}

function saveQuota(data: QuotaData) {
  try {
    uni.setStorageSync(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('保存次数数据失败', e)
  }
}

export const useQuotaStore = defineStore('quota', () => {
  const data = ref<QuotaData>(loadQuota())

  /** 今日免费剩余 */
  const freeRemaining = computed(() => Math.max(0, DAILY_FREE - data.value.freeUsed))
  /** 今日广告可看次数 */
  const adCanWatch = computed(() => Math.max(0, AD_DAILY_LIMIT - data.value.adWatched))
  /** 总可用次数 = 免费 + 广告奖励 + 邀请奖励 */
  const totalRemaining = computed(() => freeRemaining.value + data.value.adRemaining + data.value.inviteRemaining)
  /** 是否可以规划 */
  const canPlan = computed(() => totalRemaining.value > 0)

  /** 确保日期是今天（切页面时调用） */
  function ensureToday() {
    if (data.value.date !== getTodayStr()) {
      data.value = {
        date: getTodayStr(),
        freeUsed: 0,
        adWatched: 0,
        adRemaining: 0,
        inviteRemaining: data.value.inviteRemaining,
        totalInvites: data.value.totalInvites,
      }
      saveQuota(data.value)
    }
  }

  /** 消耗一次规划次数（优先级：免费 > 广告 > 邀请） */
  function consume(): boolean {
    ensureToday()
    if (freeRemaining.value > 0) {
      data.value.freeUsed++
    } else if (data.value.adRemaining > 0) {
      data.value.adRemaining--
    } else if (data.value.inviteRemaining > 0) {
      data.value.inviteRemaining--
    } else {
      return false
    }
    saveQuota(data.value)
    return true
  }

  /** 看广告获得奖励 */
  function rewardByAd(): boolean {
    ensureToday()
    if (data.value.adWatched >= AD_DAILY_LIMIT) {
      return false
    }
    data.value.adWatched++
    data.value.adRemaining += AD_REWARD_PER_VIEW
    saveQuota(data.value)
    return true
  }

  /** 邀请好友获得奖励 */
  function rewardByInvite() {
    data.value.totalInvites++
    data.value.inviteRemaining += INVITE_REWARD
    saveQuota(data.value)
  }

  return {
    data,
    freeRemaining,
    adCanWatch,
    totalRemaining,
    canPlan,
    ensureToday,
    consume,
    rewardByAd,
    rewardByInvite,
    // 常量导出
    DAILY_FREE,
    AD_REWARD_PER_VIEW,
    AD_DAILY_LIMIT,
    INVITE_REWARD,
  }
})
