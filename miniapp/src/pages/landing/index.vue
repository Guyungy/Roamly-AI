<template>
  <view class="landing-page">
    <wd-navbar fixed placeholder safe-area-inset-top>
      <template #title>
        <view class="navbar-title">
          <text class="brand-emoji">🎒</text>
          <text class="brand-name">出门啦</text>
        </view>
      </template>
    </wd-navbar>

    <!-- 剩余次数提示条 -->
    <wd-notice-bar
      v-if="quotaStore.totalRemaining !== undefined"
      type="warning"
      @tap="goToProfile"
      custom-class="quota-notice"
    >
      <template #prefix>
        <text class="notice-icon">🎒</text>
      </template>
      今日剩余 {{ quotaStore.totalRemaining }} 次规划机会。点击获取更多 ›
    </wd-notice-bar>

    <!-- Hero 区域 -->
    <view class="hero-section">
      <view class="hero-content">
        <text class="hero-title">AI 智能行程规划</text>
        <text class="hero-desc">告别繁琐攻略，三步定制你的专属旅程</text>
      </view>
    </view>

    <!-- 表单区域 -->
    <view class="form-container">
      <!-- Step 1: 基础信息 -->
      <wd-card custom-class="step-card">
        <view class="step-header">
          <view class="step-number">1</view>
          <text class="step-title">你想去哪里？</text>
        </view>

        <view class="form-item">
          <wd-input
            v-model="formData.city"
            label="目的地城市"
            placeholder="例如：杭州、成都、北京..."
            clearable
            label-width="180rpx"
          />
        </view>

        <view class="date-row">
          <view class="date-item">
            <text class="picker-label">出发日期</text>
            <picker mode="date" :value="formData.start_date" :start="todayStr" @change="onStartDateChange">
              <view class="native-picker-inner">
                <text :class="formData.start_date ? 'val' : 'ph'">
                  {{ formData.start_date || '选择日期' }}
                </text>
                <text class="picker-icon">📅</text>
              </view>
            </picker>
          </view>
          <view class="date-item">
            <text class="picker-label">返回日期</text>
            <picker mode="date" :value="formData.end_date" :start="formData.start_date" @change="onEndDateChange">
              <view class="native-picker-inner">
                <text :class="formData.end_date ? 'val' : 'ph'">
                  {{ formData.end_date || '选择日期' }}
                </text>
                <text class="picker-icon">📅</text>
              </view>
            </picker>
          </view>
        </view>

        <view v-if="travelDays > 0" class="days-indicator">
          <text>共 {{ travelDays }} 天行程</text>
        </view>
      </wd-card>

      <!-- Step 2: 偏好设置 -->
      <wd-card custom-class="step-card">
        <view class="step-header">
          <view class="step-number">2</view>
          <text class="step-title">出行偏好</text>
        </view>

        <view class="option-group">
          <text class="option-label">交通方式</text>
          <view class="tag-grid">
            <wd-tag
              v-for="opt in transportOptions"
              :key="opt.value"
              round
              type="primary"
              :plain="formData.transportation !== opt.value"
              @click="formData.transportation = opt.value"
              custom-class="choice-tag"
            >
              {{ opt.icon }} {{ opt.label }}
            </wd-tag>
          </view>
        </view>

        <view class="option-group">
          <text class="option-label">住宿类型</text>
          <view class="tag-grid">
            <wd-tag
              v-for="opt in accommodationOptions"
              :key="opt.value"
              round
              type="primary"
              :plain="formData.accommodation !== opt.value"
              @click="formData.accommodation = opt.value"
              custom-class="choice-tag"
            >
              {{ opt.icon }} {{ opt.label }}
            </wd-tag>
          </view>
        </view>
      </wd-card>

      <!-- Step 3: 兴趣标签 -->
      <wd-card custom-class="step-card">
        <view class="step-header">
          <view class="step-number">3</view>
          <text class="step-title">个性化定制</text>
        </view>

        <view class="option-group">
          <text class="option-label">兴趣偏好（多选）</text>
          <view class="tag-grid">
            <wd-tag
              v-for="pref in preferenceOptions"
              :key="pref.value"
              round
              type="primary"
              :plain="!formData.preferences.includes(pref.value)"
              @click="togglePreference(pref.value)"
              custom-class="choice-tag"
            >
              {{ pref.icon }} {{ pref.label }}
            </wd-tag>
          </view>
        </view>

        <view class="textarea-wrapper">
          <wd-textarea
            v-model="formData.free_text_input"
            label="其他需求"
            placeholder="比如：带老人出行，想吃地道美食，不走回头路..."
            auto-height
            :maxlength="200"
            label-width="180rpx"
          />
        </view>
      </wd-card>

      <!-- 提交按钮 -->
      <view class="submit-section">
        <wd-button
          type="primary"
          block
          round
          size="large"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          立即生成行程
        </wd-button>
        <text class="submit-hint">AI 正在为你规划最佳路线...</text>
      </view>
    </view>

    <!-- 加载遮罩 -->
    <LoadingOverlay :visible="tripStore.loading" :progress="tripStore.progressText" />

    <!-- 次数不足弹窗 -->
    <QuotaWall
      :visible="showQuotaWall"
      :ad-can-watch="quotaStore.adCanWatch"
      @close="showQuotaWall = false"
      @watch-ad="handleWatchAd"
      @invite="handleInvite"
    />

    <wd-toast />
  </view>
</template>

<script setup lang="ts">
import { reactive, computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import QuotaWall from '@/components/QuotaWall.vue'
import { useTripStore } from '@/stores/trip'
import { useQuotaStore } from '@/stores/quota'
import { useQuotaAction } from '@/composables/useQuotaAction'
import { usePlanSubmit } from '@/composables/usePlanSubmit'
import type { TripFormData } from '@/types'

const tripStore = useTripStore()
const quotaStore = useQuotaStore()
const { showQuotaWall, checkQuota, handleWatchAd, handleInvite } = useQuotaAction()
const { submitPlan } = usePlanSubmit()

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

onShow(() => {
  quotaStore.ensureToday()
})

function goToProfile() {
  uni.switchTab({ url: '/pages/profile/index' })
}

const formData = reactive({
  city: '',
  start_date: '',
  end_date: '',
  transportation: '公共交通',
  accommodation: '经济型酒店',
  preferences: [] as string[],
  free_text_input: '',
})

const transportOptions = [
  { value: '公共交通', label: '公共交通', icon: '🚇' },
  { value: '自驾', label: '自驾出行', icon: '🚗' },
  { value: '步行', label: '步行为主', icon: '🚶' },
  { value: '混合', label: '混合出行', icon: '🔄' },
]

const accommodationOptions = [
  { value: '经济型酒店', label: '经济实惠', icon: '🏠' },
  { value: '舒适型酒店', label: '舒适商务', icon: '🏨' },
  { value: '豪华型酒店', label: '豪华享受', icon: '🏰' },
  { value: '民宿', label: '特色民宿', icon: '🏡' },
]

const preferenceOptions = [
  { value: '历史文化', label: '历史文化', icon: '🏛️' },
  { value: '自然风光', label: '自然风光', icon: '🌿' },
  { value: '美食探索', label: '美食探索', icon: '🍜' },
  { value: '拍照打卡', label: '拍照打卡', icon: '📸' },
  { value: '购物娱乐', label: '购物娱乐', icon: '🛍️' },
  { value: '亲子活动', label: '亲子活动', icon: '👨‍👩‍👧' },
  { value: '冒险运动', label: '冒险运动', icon: '🏄' },
  { value: '休闲放松', label: '休闲放松', icon: '🧘' },
]

const travelDays = computed(() => {
  if (!formData.start_date || !formData.end_date) return 0
  const start = new Date(formData.start_date)
  const end = new Date(formData.end_date)
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return diff > 0 ? diff : 0
})

const canSubmit = computed(() => {
  return formData.city.trim() && formData.start_date && formData.end_date && travelDays.value > 0 && !tripStore.loading
})

function togglePreference(value: string) {
  const idx = formData.preferences.indexOf(value)
  if (idx >= 0) {
    formData.preferences.splice(idx, 1)
  } else {
    formData.preferences.push(value)
  }
}

function onStartDateChange(e: any) {
  formData.start_date = e.detail.value
  // 如果 end_date < start_date，自动重置
  if (formData.end_date && formData.end_date < formData.start_date) {
    formData.end_date = ''
  }
}

function onEndDateChange(e: any) {
  formData.end_date = e.detail.value
}

async function handleSubmit() {
  if (!canSubmit.value) return
  if (!checkQuota()) return
  
  const submitData: TripFormData = {
    city: formData.city.trim(),
    start_date: formData.start_date,
    end_date: formData.end_date,
    travel_days: travelDays.value,
    transportation: formData.transportation,
    accommodation: formData.accommodation,
    preferences: formData.preferences,
    free_text_input: formData.free_text_input,
  }
  
  await submitPlan(submitData)
}
</script>

<style scoped>
:deep(.wd-navbar) {
  --wd-navbar-title-font-size: 36rpx;
  --wd-navbar-title-font-weight: 700;
}

.landing-page {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding-bottom: 80rpx;
}

.navbar-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.brand-emoji {
  font-size: 40rpx;
}

.brand-name {
  font-size: 34rpx;
  font-weight: 800;
  color: #FF6B35;
}

.notice-icon {
  margin-right: 12rpx;
}

.hero-section {
  padding: 60rpx 40rpx;
  background: #FFFFFF;
}

.hero-title {
  display: block;
  font-size: 48rpx;
  font-weight: 800;
  color: #1A1A2E;
  margin-bottom: 16rpx;
}

.hero-desc {
  font-size: 28rpx;
  color: #9CA3AF;
}

.form-container {
  padding: 20rpx;
}

:deep(.step-card) {
  margin-bottom: 24rpx !important;
  border-radius: 24rpx !important;
  overflow: hidden;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 32rpx;
}

.step-number {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  background: #FF6B35;
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
}

.step-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1A1A2E;
}

.form-item {
  margin-bottom: 24rpx;
}

.date-row {
  display: flex;
  gap: 20rpx;
  padding: 0 12rpx;
}

.date-item {
  flex: 1;
}

.picker-label {
  display: block;
  font-size: 24rpx;
  color: #646566;
  margin-bottom: 12rpx;
  padding-left: 12rpx;
}

.native-picker-inner {
  height: 88rpx;
  background: #F7F8FA;
  border-radius: 12rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.native-picker-inner .ph {
  color: #C8C9CC;
  font-size: 28rpx;
}

.native-picker-inner .val {
  color: #323233;
  font-size: 28rpx;
}

.picker-icon {
  font-size: 28rpx;
}

.days-indicator {
  margin-top: 24rpx;
  text-align: center;
}

.days-indicator text {
  font-size: 24rpx;
  color: #FF6B35;
  background: #FFF5F0;
  padding: 8rpx 24rpx;
  border-radius: 100rpx;
  font-weight: 600;
}

.option-group {
  margin-bottom: 32rpx;
}

.option-label {
  display: block;
  font-size: 26rpx;
  color: #646566;
  margin-bottom: 20rpx;
  padding-left: 12rpx;
}

.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

:deep(.choice-tag) {
  padding: 12rpx 24rpx !important;
  font-size: 26rpx !important;
  --wd-tag-primary-color: #FF6B35;
}

.textarea-wrapper {
  margin-top: 20rpx;
}

.submit-section {
  padding: 40rpx 20rpx;
  text-align: center;
}

:deep(.wd-button--primary) {
  background: #FF6B35 !important;
  border-color: #FF6B35 !important;
}

.submit-hint {
  display: block;
  margin-top: 20rpx;
  font-size: 24rpx;
  color: #9CA3AF;
}

/* 适配 wot-design-uni 的 primary color */
:deep(.wd-notice-bar--warning) {
  color: #FF6B35;
  background-color: #FFF5F0;
}
</style>
