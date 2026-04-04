<template>
  <view class="nearby-page">
    <NavBar />

    <!-- 次数提示条 -->
    <view class="quota-hint-bar" @tap="goToProfile">
      <text class="quota-hint-icon">✦</text>
      <text class="quota-hint-text">
        今日剩余 <text class="quota-hint-num" :class="{ 'is-zero': !quotaStore.canPlan }">{{ quotaStore.totalRemaining }}</text> 次规划
      </text>
      <text class="quota-hint-arrow">获取更多 ›</text>
    </view>

    <!-- Hero -->
    <view class="hero-section">
      <view class="hero-glow" />
      <text class="hero-icon">📍</text>
      <text class="hero-title">附近出行</text>
      <text class="hero-desc">基于当前位置，AI 为你推荐半天或一天的短途好去处</text>
    </view>

    <!-- 定位卡片 -->
    <view class="location-card" @tap="refreshLocation">
      <view class="location-left">
        <view class="location-icon-wrap" :class="{ 'is-locating': locating }">
          <text class="location-pin">📍</text>
        </view>
        <view class="location-info">
          <text class="location-label">当前位置</text>
          <text class="location-city" v-if="currentCity">{{ currentCity }}</text>
          <text class="location-city location-loading" v-else-if="locating">正在定位...</text>
          <text class="location-city location-fail" v-else>点击获取位置</text>
        </view>
      </view>
      <view class="location-refresh">
        <text class="refresh-icon">↻</text>
      </view>
    </view>

    <!-- 时长选择 -->
    <view class="form-section">
      <view class="section-label-row">
        <text class="section-label-icon">⏱</text>
        <text class="section-label-text">出行时长</text>
      </view>
      <view class="duration-grid">
        <view
          v-for="opt in durationOptions"
          :key="opt.value"
          class="duration-item"
          :class="{ 'is-active': selectedDuration === opt.value }"
          @tap="selectedDuration = opt.value"
        >
          <text class="duration-emoji">{{ opt.icon }}</text>
          <text class="duration-name">{{ opt.label }}</text>
          <text class="duration-desc">{{ opt.desc }}</text>
        </view>
      </view>
    </view>

    <!-- 类型选择 -->
    <view class="form-section">
      <view class="section-label-row">
        <text class="section-label-icon">🎯</text>
        <text class="section-label-text">想去什么地方</text>
        <text class="section-label-hint">可多选</text>
      </view>
      <view class="category-grid">
        <view
          v-for="cat in categoryOptions"
          :key="cat.value"
          class="category-item"
          :class="{ 'is-active': selectedCategories.includes(cat.value) }"
          @tap="toggleCategory(cat.value)"
        >
          <text class="category-emoji">{{ cat.icon }}</text>
          <text class="category-name">{{ cat.label }}</text>
        </view>
      </view>
    </view>

    <!-- 推荐卡片 -->
    <view class="suggest-section" v-if="suggestions.length > 0">
      <view class="section-label-row">
        <text class="section-label-icon">💡</text>
        <text class="section-label-text">为你推荐</text>
      </view>
      <scroll-view scroll-x class="suggest-scroll">
        <view class="suggest-list">
          <view
            v-for="s in suggestions"
            :key="s.text"
            class="suggest-chip"
            :class="{ 'is-active': extraText === s.text }"
            @tap="extraText = extraText === s.text ? '' : s.text"
          >
            <text class="suggest-chip-icon">{{ s.icon }}</text>
            <text class="suggest-chip-text">{{ s.text }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 提交按钮 -->
    <view class="submit-section">
      <button class="submit-btn" :disabled="!canSubmit" @tap="handleSubmit">
        <text class="submit-icon">✦</text>
        <text class="submit-text">AI 帮我规划</text>
      </button>
      <text class="submit-hint">{{ selectedDuration === 'half' ? '约 30 秒生成半日游方案' : '约 1 分钟生成一日游方案' }}</text>
    </view>

    <LoadingOverlay :visible="tripStore.loading" :progress="tripStore.progressText" />

    <QuotaWall
      :visible="showQuotaWall"
      :ad-can-watch="quotaStore.adCanWatch"
      @close="showQuotaWall = false"
      @watch-ad="handleWatchAd"
      @invite="handleInvite"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import QuotaWall from '@/components/QuotaWall.vue'
import { useTripStore } from '@/stores/trip'
import { useQuotaStore } from '@/stores/quota'
import { useHistoryStore } from '@/stores/history'
import { generateTripPlan, reverseGeocode as apiReverseGeocode } from '@/services/api'
import type { TripFormData } from '@/types'

const tripStore = useTripStore()
const quotaStore = useQuotaStore()
const historyStore = useHistoryStore()

const currentCity = ref('')
const locating = ref(false)
const selectedDuration = ref<'half' | 'full'>('half')
const selectedCategories = ref<string[]>([])
const extraText = ref('')
const showQuotaWall = ref(false)

onShow(() => {
  quotaStore.ensureToday()
})

onMounted(() => {
  if (!currentCity.value) {
    getLocation()
  }
})

const durationOptions = [
  { value: 'half' as const, label: '半日游', desc: '3~4小时', icon: '🌤' },
  { value: 'full' as const, label: '一日游', desc: '6~8小时', icon: '☀️' },
]

const categoryOptions = [
  { value: '公园绿地', label: '公园绿地', icon: '🌳' },
  { value: '人文古迹', label: '人文古迹', icon: '🏛️' },
  { value: '商圈逛街', label: '商圈逛街', icon: '🛍️' },
  { value: '美食探店', label: '美食探店', icon: '🍜' },
  { value: '亲子遛娃', label: '亲子遛娃', icon: '🎠' },
  { value: '咖啡书店', label: '咖啡书店', icon: '☕' },
  { value: '展览演出', label: '展览演出', icon: '🎨' },
  { value: '户外运动', label: '户外运动', icon: '🚴' },
]

/** 根据选择的类型动态生成推荐 */
const suggestions = computed(() => {
  const items: { icon: string; text: string }[] = []

  if (selectedCategories.value.includes('美食探店')) {
    items.push({ icon: '🔥', text: '带我去网红打卡餐厅' })
    items.push({ icon: '🍰', text: '想吃当地特色小吃' })
  }
  if (selectedCategories.value.includes('公园绿地')) {
    items.push({ icon: '🧺', text: '适合野餐的地方' })
    items.push({ icon: '🐕', text: '可以遛狗的公园' })
  }
  if (selectedCategories.value.includes('亲子遛娃')) {
    items.push({ icon: '🎪', text: '有儿童游乐设施' })
    items.push({ icon: '🦁', text: '想去动物园或水族馆' })
  }
  if (selectedCategories.value.includes('咖啡书店')) {
    items.push({ icon: '📖', text: '安静适合看书的地方' })
  }
  if (selectedCategories.value.includes('户外运动')) {
    items.push({ icon: '🏔️', text: '轻松的徒步路线' })
    items.push({ icon: '🚣', text: '有水上活动的地方' })
  }
  if (selectedCategories.value.includes('商圈逛街')) {
    items.push({ icon: '💎', text: '有特色市集的地方' })
  }
  if (selectedCategories.value.includes('展览演出')) {
    items.push({ icon: '🖼️', text: '最近有什么好展览' })
  }
  if (selectedCategories.value.includes('人文古迹')) {
    items.push({ icon: '📜', text: '有历史故事的地方' })
  }

  if (items.length === 0 && selectedCategories.value.length === 0) {
    items.push(
      { icon: '🎲', text: '随便逛逛，给我惊喜' },
      { icon: '📸', text: '适合拍照的小众景点' },
      { icon: '🌸', text: '当季最美的地方' },
    )
  }

  return items.slice(0, 6)
})

const canSubmit = computed(() => {
  return currentCity.value && !tripStore.loading
})

function toggleCategory(value: string) {
  const idx = selectedCategories.value.indexOf(value)
  if (idx >= 0) {
    selectedCategories.value.splice(idx, 1)
  } else {
    selectedCategories.value.push(value)
  }
}

function goToProfile() {
  uni.switchTab({ url: '/pages/profile/index' })
}

async function getLocation() {
  locating.value = true
  try {
    // 1. 获取经纬度（小程序原生接口，gcj02 坐标系）
    const locationRes: any = await new Promise((resolve, reject) => {
      uni.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: (err: any) => {
          // 用户拒绝授权 → 引导打开设置
          if (err.errMsg?.includes('deny') || err.errMsg?.includes('auth')) {
            promptOpenSettings()
          }
          reject(err)
        },
      })
    })

    // 2. 通过后端 API 逆地理编码（Key 安全存放在后端）
    try {
      const geo = await apiReverseGeocode(locationRes.latitude, locationRes.longitude)
      currentCity.value = geo.city || geo.province || '当前位置'
    } catch (geoErr) {
      console.warn('逆地理编码失败:', geoErr)
      currentCity.value = '当前位置'
    }
  } catch (err: any) {
    console.warn('定位失败:', err)
    promptManualInput()
  } finally {
    locating.value = false
  }
}

/** 引导用户前往系统设置开启定位权限 */
function promptOpenSettings() {
  uni.showModal({
    title: '需要定位权限',
    content: '请允许"出门啦"获取你的位置，才能推荐附近好去处哦~',
    confirmText: '去设置',
    cancelText: '手动输入',
    confirmColor: '#4EADBD',
    success: (res) => {
      if (res.confirm) {
        // #ifdef MP-WEIXIN
        uni.openSetting({
          success: (settingRes: any) => {
            if (settingRes.authSetting?.['scope.userLocation']) {
              getLocation()
            } else {
              promptManualInput()
            }
          }
        })
        // #endif
        // #ifndef MP-WEIXIN
        promptManualInput()
        // #endif
      } else {
        promptManualInput()
      }
    }
  })
}

/** 手动输入城市名（定位失败的兜底方案） */
function promptManualInput() {
  uni.showModal({
    title: '输入你所在的城市',
    editable: true,
    placeholderText: '例如：杭州',
    confirmColor: '#4EADBD',
    success: (r: any) => {
      if (r.confirm && r.content) {
        currentCity.value = r.content.trim()
      }
    }
  })
}

function refreshLocation() {
  currentCity.value = ''
  getLocation()
}

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function handleSubmit() {
  if (!canSubmit.value) return

  quotaStore.ensureToday()
  if (!quotaStore.canPlan) {
    showQuotaWall.value = true
    return
  }

  tripStore.setLoading(true)
  tripStore.setProgress('正在定位周边好去处...')

  try {
    const today = getTodayStr()
    const durationDesc = selectedDuration.value === 'half' ? '半天（约3-4小时）' : '一整天（约6-8小时）'
    const categoryDesc = selectedCategories.value.length > 0
      ? selectedCategories.value.join('、')
      : '随便逛逛'

    let freeText = `这是一次${durationDesc}的短途出行，从${currentCity.value}出发，不需要住宿。`
    freeText += `\n偏好类型：${categoryDesc}。`
    if (extraText.value) {
      freeText += `\n额外要求：${extraText.value}。`
    }
    freeText += `\n请根据出行时长合理安排景点数量，不要太赶。半天安排2-3个地点，一天安排4-5个地点。`

    const submitData: TripFormData = {
      city: currentCity.value,
      start_date: today,
      end_date: today,
      travel_days: 1,
      transportation: '公共交通',
      accommodation: '无需住宿',
      preferences: selectedCategories.value,
      free_text_input: freeText,
    }

    const response = await generateTripPlan(submitData, (progress) => {
      tripStore.setProgress(progress)
    })

    if (response.success && response.data) {
      quotaStore.consume()
      historyStore.add(response.data, response.graph_data)
      tripStore.setTripPlan(response.data, response.graph_data)
      tripStore.setLoading(false)
      uni.navigateTo({ url: '/pages/result/index' })
    } else {
      throw new Error(response.message || '规划失败')
    }
  } catch (err: any) {
    tripStore.setLoading(false)
    uni.showToast({
      title: err.message || '规划失败，请重试',
      icon: 'none',
      duration: 3000,
    })
  }
}

function handleWatchAd() {
  // #ifdef MP-WEIXIN
  if (wx.createRewardedVideoAd) {
    const ad = wx.createRewardedVideoAd({ adUnitId: 'adunit-placeholder' })
    ad.onClose((res: any) => {
      if (res && res.isEnded) {
        quotaStore.rewardByAd()
        showQuotaWall.value = false
        uni.showToast({ title: '+1次规划机会', icon: 'success' })
      }
    })
    ad.onError(() => uni.showToast({ title: '广告加载失败', icon: 'none' }))
    ad.show().catch(() => ad.load().then(() => ad.show()))
    return
  }
  // #endif
  quotaStore.rewardByAd()
  showQuotaWall.value = false
  uni.showToast({ title: '[测试] +1次', icon: 'success' })
}

function handleInvite() {
  showQuotaWall.value = false
  uni.showModal({
    title: '邀请好友',
    content: '分享给好友，好友首次使用后你将获得 3 次规划机会！',
    confirmText: '去分享',
    confirmColor: '#4EADBD',
    success: (res) => {
      if (res.confirm) {
        // #ifndef MP-WEIXIN
        quotaStore.rewardByInvite()
        uni.showToast({ title: '[测试] +3次', icon: 'success' })
        // #endif
      }
    }
  })
}
</script>

<style scoped>
.nearby-page {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding-bottom: 60rpx;
}

/* 次数提示条 */
.quota-hint-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 16rpx 32rpx;
  background-color: rgba(78, 173, 189, 0.05);
  border-bottom: 1rpx solid #E8ECF2;
}

.quota-hint-icon { font-size: 24rpx; color: #4EADBD; }
.quota-hint-text { font-size: 24rpx; color: #6B7280; }
.quota-hint-num { font-weight: 700; color: #4EADBD; font-size: 28rpx; }
.quota-hint-num.is-zero { color: #ef4444; }
.quota-hint-arrow { font-size: 22rpx; color: #9CA3AF; margin-left: 8rpx; }

/* Hero */
.hero-section {
  position: relative;
  text-align: center;
  padding: 56rpx 48rpx 40rpx;
  overflow: hidden;
}

.hero-glow {
  position: absolute;
  top: -80rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 500rpx;
  height: 400rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(78, 173, 189, 0.1) 0%, transparent 70%);
  pointer-events: none;
}

.hero-icon {
  display: block;
  font-size: 52rpx;
  margin-bottom: 16rpx;
  position: relative;
  z-index: 1;
}

.hero-title {
  display: block;
  font-size: 44rpx;
  font-weight: 800;
  color: #4EADBD;
  letter-spacing: 6rpx;
  position: relative;
  z-index: 1;
}

.hero-desc {
  display: block;
  font-size: 26rpx;
  color: #6B7280;
  margin-top: 12rpx;
  line-height: 1.6;
  position: relative;
  z-index: 1;
}

/* 定位卡片 */
.location-card {
  margin: 0 32rpx 32rpx;
  padding: 28rpx 32rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 1rpx solid #E8ECF2;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}

.location-card:active {
  background-color: #F9FAFB;
}

.location-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.location-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: rgba(78, 173, 189, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.location-icon-wrap.is-locating {
  animation: pulse 1.5s ease-in-out infinite;
}

.location-pin { font-size: 32rpx; }
.location-label { font-size: 22rpx; color: #9CA3AF; display: block; }
.location-city { font-size: 34rpx; font-weight: 700; color: #4EADBD; display: block; }
.location-loading { color: #9CA3AF; font-weight: 400; font-size: 28rpx; }
.location-fail { color: #9CA3AF; font-weight: 400; font-size: 28rpx; }

.location-refresh {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: #F5F6FA;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-icon { font-size: 36rpx; color: #9CA3AF; }

/* Sections */
.form-section {
  padding: 0 32rpx;
  margin-bottom: 32rpx;
}

.section-label-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 20rpx;
}

.section-label-icon { font-size: 28rpx; }
.section-label-text { font-size: 30rpx; font-weight: 700; color: #1A1A2E; }
.section-label-hint { font-size: 22rpx; color: #9CA3AF; margin-left: auto; }

/* Duration */
.duration-grid {
  display: flex;
  gap: 16rpx;
}

.duration-item {
  flex: 1;
  padding: 32rpx 24rpx;
  border-radius: 20rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #E8ECF2;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  transition: all 0.2s;
}

.duration-item.is-active {
  background-color: rgba(78, 173, 189, 0.05);
  border-color: #4EADBD;
  box-shadow: 0 4rpx 16rpx rgba(78, 173, 189, 0.1);
}

.duration-emoji { font-size: 44rpx; }
.duration-name { font-size: 30rpx; font-weight: 700; color: #6B7280; }
.duration-item.is-active .duration-name { color: #4EADBD; }
.duration-desc { font-size: 22rpx; color: #9CA3AF; }

/* Category grid */
.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.category-item {
  width: calc(25% - 12rpx);
  padding: 24rpx 8rpx;
  border-radius: 20rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #E8ECF2;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  box-sizing: border-box;
  transition: all 0.2s;
}

.category-item.is-active {
  background-color: rgba(78, 173, 189, 0.08);
  border-color: #4EADBD;
}

.category-emoji { font-size: 36rpx; }
.category-name { font-size: 22rpx; color: #6B7280; }
.category-item.is-active .category-name { color: #4EADBD; font-weight: 600; }

/* Suggestions */
.suggest-section {
  padding: 0 32rpx;
  margin-bottom: 32rpx;
}

.suggest-scroll {
  white-space: nowrap;
  margin-top: 4rpx;
}

.suggest-list {
  display: inline-flex;
  gap: 12rpx;
  padding: 4rpx 0;
}

.suggest-chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 24rpx;
  border-radius: 999rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #E8ECF2;
  white-space: nowrap;
  transition: all 0.2s;
}

.suggest-chip.is-active {
  background-color: rgba(78, 173, 189, 0.1);
  border-color: #4EADBD;
}

.suggest-chip:active { opacity: 0.7; }
.suggest-chip-icon { font-size: 24rpx; }
.suggest-chip-text { font-size: 24rpx; color: #6B7280; }
.suggest-chip.is-active .suggest-chip-text { color: #4EADBD; font-weight: 600; }

/* Submit */
.submit-section {
  padding: 16rpx 32rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.submit-btn {
  width: 100%;
  height: 100rpx;
  background: linear-gradient(135deg, #4EADBD 0%, #76C8D5 100%);
  border: none;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 8rpx 24rpx rgba(78, 173, 189, 0.3);
}

.submit-btn[disabled] {
  opacity: 0.4;
  box-shadow: none;
}

.submit-btn:active { opacity: 0.85; }

.submit-icon { font-size: 32rpx; color: #FFFFFF; }
.submit-text { font-size: 32rpx; font-weight: 700; color: #FFFFFF; letter-spacing: 4rpx; }
.submit-hint { font-size: 24rpx; color: #9CA3AF; margin-top: 20rpx; }

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.7; }
}
</style>
