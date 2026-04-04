<template>
  <view class="nearby-page">
    <wd-navbar fixed border placeholder>
      <template #title>
        <view class="nav-title">📍 附近出行</view>
      </template>
    </wd-navbar>

    <wd-notice-bar
      type="warning"
      prefix="star-filled"
      @click="goToProfile"
    >
      今日剩余 <text :class="['quota-num', { 'is-zero': !quotaStore.canPlan }]">{{ quotaStore.totalRemaining }}</text> 次规划，点击获取更多
    </wd-notice-bar>

    <view class="hero-section">
      <view class="hero-glow" />
      <text class="hero-icon">📍</text>
      <text class="hero-title">附近出行</text>
      <text class="hero-desc">基于当前位置，AI 为你推荐半天或一天的短途好去处</text>
    </view>

    <view class="card-section">
      <wd-card custom-class="location-card">
        <view class="location-content" @tap="refreshLocation">
          <view class="location-main">
            <view class="location-icon-wrap" :class="{ 'is-locating': locating }">
              <wd-icon name="location-filled" size="24px" color="#4EADBD" />
            </view>
            <view class="location-text">
              <view class="location-label">当前位置</view>
              <view class="location-city" v-if="currentCity">{{ currentCity }}</view>
              <view class="location-city loading" v-else-if="locating">正在定位...</view>
              <view class="location-city fail" v-else>点击获取位置</view>
            </view>
          </view>
          <wd-button size="small" plain round icon="refresh" :loading="locating" @tap.stop="refreshLocation">刷新</wd-button>
        </view>
      </wd-card>
    </view>

    <view class="form-section">
      <view class="section-header">
        <wd-icon name="time" size="18px" />
        <text class="section-title">出行时长</text>
      </view>
      <view class="duration-grid">
        <view 
          v-for="opt in durationOptions" 
          :key="opt.value"
          class="duration-item-wrapper"
          @tap="selectedDuration = opt.value"
        >
          <wd-card :custom-class="['duration-card', { 'is-active': selectedDuration === opt.value }]">
            <view class="duration-body">
              <text class="duration-icon">{{ opt.icon }}</text>
              <view class="duration-info">
                <text class="duration-label">{{ opt.label }}</text>
                <text class="duration-desc">{{ opt.desc }}</text>
              </view>
            </view>
          </wd-card>
        </view>
      </view>
    </view>

    <view class="form-section">
      <view class="section-header">
        <wd-icon name="target" size="18px" />
        <text class="section-title">想去什么地方</text>
        <text class="section-hint">可多选</text>
      </view>
      <view class="category-grid">
        <view
          v-for="cat in categoryOptions"
          :key="cat.value"
          class="category-item"
          @tap="toggleCategory(cat.value)"
        >
          <wd-tag
            round
            size="large"
            :type="selectedCategories.includes(cat.value) ? 'primary' : 'default'"
            :plain="!selectedCategories.includes(cat.value)"
            custom-class="cat-tag"
          >
            {{ cat.icon }} {{ cat.label }}
          </wd-tag>
        </view>
      </view>
    </view>

    <view class="form-section" v-if="suggestions.length > 0">
      <view class="section-header">
        <wd-icon name="bulb" size="18px" />
        <text class="section-title">为你推荐</text>
      </view>
      <scroll-view scroll-x class="suggest-scroll">
        <view class="suggest-list">
          <wd-tag
            v-for="s in suggestions"
            :key="s.text"
            round
            size="medium"
            :type="extraText === s.text ? 'primary' : 'default'"
            :plain="extraText !== s.text"
            custom-class="suggest-tag"
            @click="extraText = extraText === s.text ? '' : s.text"
          >
            {{ s.icon }} {{ s.text }}
          </wd-tag>
        </view>
      </scroll-view>
    </view>

    <view class="submit-section">
      <wd-button
        block
        round
        size="large"
        :disabled="!canSubmit"
        :loading="tripStore.loading"
        custom-style="background: #4EADBD; border-color: #4EADBD;"
        @click="handleSubmit"
      >
        <view class="btn-content">
          <text class="btn-spark">✦</text>
          <text>AI 帮我规划</text>
        </view>
      </wd-button>
      <view class="submit-hint">
        {{ selectedDuration === 'half' ? '约 30 秒生成半日游方案' : '约 1 分钟生成一日游方案' }}
      </view>
    </view>

    <LoadingOverlay :visible="tripStore.loading" :progress="tripStore.progressText" />

    <QuotaWall
      :visible="showQuotaWall"
      :ad-can-watch="quotaStore.adCanWatch"
      @close="showQuotaWall = false"
      @watch-ad="handleWatchAd"
      @invite="handleInvite"
    />

    <wd-toast />
    <wd-message-box />
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
import { useQuotaAction } from '@/composables/useQuotaAction'
import { usePlanSubmit } from '@/composables/usePlanSubmit'
import { reverseGeocode as apiReverseGeocode } from '@/services/api'
import type { TripFormData } from '@/types'

const tripStore = useTripStore()
const quotaStore = useQuotaStore()
const { showQuotaWall, checkQuota, handleWatchAd, handleInvite } = useQuotaAction()
const { submitPlan } = usePlanSubmit()

const currentCity = ref('')
const locating = ref(false)
const selectedDuration = ref<'half' | 'full'>('half')
const selectedCategories = ref<string[]>([])
const extraText = ref('')

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
    const locationRes: any = await Promise.race([
      new Promise((resolve, reject) => {
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
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('定位超时')), 10000))
    ])

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
  if (!checkQuota()) return

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

  await submitPlan(submitData)
}
</script>

<style scoped>
.nearby-page {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding-bottom: env(safe-area-inset-bottom);
}

.nav-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.quota-num {
  font-weight: bold;
  color: #4EADBD;
  margin: 0 4rpx;
}
.quota-num.is-zero {
  color: #fa4350;
}

/* Hero */
.hero-section {
  position: relative;
  text-align: center;
  padding: 40rpx 48rpx 32rpx;
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
  font-size: 48rpx;
  margin-bottom: 8rpx;
  position: relative;
  z-index: 1;
}

.hero-title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #4EADBD;
  letter-spacing: 4rpx;
  position: relative;
  z-index: 1;
}

.hero-desc {
  display: block;
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 8rpx;
  line-height: 1.6;
  position: relative;
  z-index: 1;
}

/* Card Section */
.card-section {
  padding: 0 32rpx;
  margin-bottom: 32rpx;
}

.location-card {
  border-radius: 24rpx !important;
  border: none !important;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.04) !important;
}

.location-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.location-main {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.location-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  background: rgba(78, 173, 189, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.location-icon-wrap.is-locating {
  animation: pulse 1.5s ease-in-out infinite;
}

.location-label {
  font-size: 22rpx;
  color: #9CA3AF;
}

.location-city {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}
.location-city.loading, .location-city.fail {
  font-weight: normal;
  color: #9CA3AF;
}

/* Form Section */
.form-section {
  padding: 0 32rpx;
  margin-bottom: 40rpx;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 24rpx;
  color: #333;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
}

.section-hint {
  font-size: 24rpx;
  color: #9CA3AF;
  margin-left: auto;
}

/* Duration */
.duration-grid {
  display: flex;
  gap: 20rpx;
}

.duration-item-wrapper {
  flex: 1;
}

.duration-card {
  border-radius: 24rpx !important;
  border: 2rpx solid transparent !important;
  transition: all 0.2s;
}

.duration-card.is-active {
  border-color: #4EADBD !important;
  background: rgba(78, 173, 189, 0.05) !important;
}

.duration-body {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 8rpx 0;
}

.duration-icon {
  font-size: 48rpx;
}

.duration-info {
  display: flex;
  flex-direction: column;
}

.duration-label {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.duration-desc {
  font-size: 22rpx;
  color: #9CA3AF;
}

/* Categories */
.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.cat-tag {
  --wd-tag-large-padding: 16rpx 28rpx;
  --wd-tag-large-font-size: 26rpx;
}

:deep(.wd-tag--primary) {
  background-color: #4EADBD !important;
}

/* Suggestions */
.suggest-scroll {
  white-space: nowrap;
}

.suggest-list {
  display: flex;
  gap: 16rpx;
  padding: 4rpx 0;
}

.suggest-tag {
  flex-shrink: 0;
}

/* Submit */
.submit-section {
  padding: 20rpx 48rpx 60rpx;
  text-align: center;
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.btn-spark {
  font-size: 32rpx;
}

.submit-hint {
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 24rpx;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

:deep(.wd-card__title) {
  display: none;
}

:deep(.wd-card__content) {
  padding: 24rpx !important;
}
</style>
