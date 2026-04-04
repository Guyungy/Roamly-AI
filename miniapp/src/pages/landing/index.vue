<template>
  <view class="landing-page">
    <NavBar />

    <!-- Hero 区域 -->
    <view class="hero-section">
      <view class="hero-glow" />
      <view class="hero-content">
        <text class="hero-star">✦</text>
        <text class="hero-title">旅途星辰</text>
        <text class="hero-subtitle">TripStar · AI 旅行引擎</text>
        <text class="hero-desc">告诉我你的目的地，AI 将为你规划完美行程</text>
      </view>
    </view>

    <!-- 表单区域 -->
    <view class="form-section">
      <!-- Step 1: 基础信息 -->
      <view class="form-step">
        <view class="step-header">
          <view class="step-number"><text class="step-num-text">1</text></view>
          <text class="step-title">目的地与日期</text>
        </view>

        <view class="form-group">
          <text class="form-label">目的地城市</text>
          <input
            class="form-input"
            v-model="formData.city"
            placeholder="例如：杭州、成都、北京..."
            placeholder-class="input-placeholder"
          />
        </view>

        <view class="form-row">
          <view class="form-group flex-1">
            <text class="form-label">出发日期</text>
            <picker mode="date" :value="formData.start_date" @change="onStartDateChange">
              <view class="form-input picker-input">
                <text :class="formData.start_date ? 'picker-value' : 'input-placeholder'">
                  {{ formData.start_date || '选择日期' }}
                </text>
                <text class="picker-icon">📅</text>
              </view>
            </picker>
          </view>
          <view class="form-group flex-1">
            <text class="form-label">返回日期</text>
            <picker mode="date" :value="formData.end_date" :start="formData.start_date" @change="onEndDateChange">
              <view class="form-input picker-input">
                <text :class="formData.end_date ? 'picker-value' : 'input-placeholder'">
                  {{ formData.end_date || '选择日期' }}
                </text>
                <text class="picker-icon">📅</text>
              </view>
            </picker>
          </view>
        </view>

        <view v-if="travelDays > 0" class="days-badge">
          <text class="days-text">共 {{ travelDays }} 天</text>
        </view>
      </view>

      <!-- Step 2: 偏好设置 -->
      <view class="form-step">
        <view class="step-header">
          <view class="step-number"><text class="step-num-text">2</text></view>
          <text class="step-title">出行偏好</text>
        </view>

        <view class="form-group">
          <text class="form-label">交通方式</text>
          <view class="option-grid">
            <view
              v-for="opt in transportOptions"
              :key="opt.value"
              class="option-item"
              :class="{ 'option-active': formData.transportation === opt.value }"
              @tap="formData.transportation = opt.value"
            >
              <text class="option-icon">{{ opt.icon }}</text>
              <text class="option-text">{{ opt.label }}</text>
            </view>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">住宿类型</text>
          <view class="option-grid">
            <view
              v-for="opt in accommodationOptions"
              :key="opt.value"
              class="option-item"
              :class="{ 'option-active': formData.accommodation === opt.value }"
              @tap="formData.accommodation = opt.value"
            >
              <text class="option-icon">{{ opt.icon }}</text>
              <text class="option-text">{{ opt.label }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Step 3: 兴趣标签 -->
      <view class="form-step">
        <view class="step-header">
          <view class="step-number"><text class="step-num-text">3</text></view>
          <text class="step-title">兴趣偏好</text>
        </view>

        <view class="form-group">
          <text class="form-label">感兴趣的内容（可多选）</text>
          <view class="tag-grid">
            <view
              v-for="pref in preferenceOptions"
              :key="pref.value"
              class="tag-item"
              :class="{ 'tag-active': formData.preferences.includes(pref.value) }"
              @tap="togglePreference(pref.value)"
            >
              <text class="tag-icon">{{ pref.icon }}</text>
              <text class="tag-text">{{ pref.label }}</text>
            </view>
          </view>
        </view>

        <view class="form-group">
          <text class="form-label">特殊需求（选填）</text>
          <textarea
            class="form-textarea"
            v-model="formData.free_text_input"
            placeholder="比如：带老人出行，需要无障碍设施..."
            placeholder-class="input-placeholder"
            :maxlength="200"
          />
        </view>
      </view>

      <!-- 提交按钮 -->
      <view class="submit-section">
        <button class="submit-btn" :disabled="!canSubmit" @tap="handleSubmit">
          <text class="submit-icon">✦</text>
          <text class="submit-text">开始AI规划</text>
        </button>
        <text class="submit-hint">AI 将在 1~3 分钟内为你生成完整行程</text>
      </view>
    </view>

    <!-- 加载遮罩 -->
    <LoadingOverlay :visible="tripStore.loading" :progress="tripStore.progressText" />
  </view>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import { useTripStore } from '@/stores/trip'
import { generateTripPlan } from '@/services/api'
import type { TripFormData } from '@/types'

const tripStore = useTripStore()

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

  tripStore.setLoading(true)
  tripStore.setProgress('正在初始化智能体...')

  try {
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

    const response = await generateTripPlan(submitData, (progress) => {
      tripStore.setProgress(progress)
    })

    if (response.success && response.data) {
      tripStore.setTripPlan(response.data, response.graph_data)
      tripStore.setLoading(false)
      uni.switchTab({ url: '/pages/result/index' })
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
</script>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0a0a0f 0%, #15132b 50%, #1a1035 100%);
  padding-bottom: 60rpx;
}

/* Hero */
.hero-section {
  position: relative;
  padding: 80rpx 48rpx 60rpx;
  text-align: center;
  overflow: hidden;
}

.hero-glow {
  position: absolute;
  top: -100rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 600rpx;
  height: 600rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 179, 71, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-star {
  font-size: 60rpx;
  color: #FFD699;
  text-shadow: 0 0 40rpx rgba(255, 179, 71, 0.5);
  margin-bottom: 20rpx;
}

.hero-title {
  font-size: 56rpx;
  font-weight: 800;
  background: linear-gradient(135deg, #FFD699, #FFB347);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 8rpx;
  margin-bottom: 8rpx;
}

.hero-subtitle {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 8rpx;
  text-transform: uppercase;
  margin-bottom: 24rpx;
}

.hero-desc {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
}

/* 表单 */
.form-section {
  padding: 0 32rpx;
}

.form-step {
  margin-bottom: 40rpx;
  background: rgba(255, 255, 255, 0.03);
  border: 1rpx solid rgba(255, 179, 71, 0.1);
  border-radius: 24rpx;
  padding: 36rpx 32rpx;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 32rpx;
}

.step-number {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255, 214, 153, 0.15), rgba(255, 179, 71, 0.25));
  border: 1rpx solid rgba(255, 179, 71, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-num-text {
  font-size: 28rpx;
  font-weight: 700;
  color: #FFD699;
}

.step-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #f0f0f0;
  letter-spacing: 2rpx;
}

.form-group {
  margin-bottom: 28rpx;
}

.form-label {
  display: block;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 12rpx;
  letter-spacing: 1rpx;
}

.form-input {
  width: 100%;
  height: 88rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 16rpx;
  padding: 0 28rpx;
  font-size: 30rpx;
  color: #f0f0f0;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: rgba(255, 179, 71, 0.4);
  background: rgba(255, 255, 255, 0.06);
}

.input-placeholder {
  color: rgba(255, 255, 255, 0.2);
}

.picker-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-value {
  color: #f0f0f0;
  font-size: 30rpx;
}

.picker-icon {
  font-size: 32rpx;
  opacity: 0.5;
}

.form-row {
  display: flex;
  gap: 20rpx;
}

.flex-1 {
  flex: 1;
}

.days-badge {
  text-align: center;
  margin-top: 8rpx;
}

.days-text {
  font-size: 26rpx;
  color: #FFD699;
  font-weight: 600;
  background: rgba(255, 179, 71, 0.1);
  padding: 8rpx 28rpx;
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 179, 71, 0.2);
}

/* 选项网格 */
.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 28rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  flex: 1;
  min-width: calc(50% - 8rpx);
  box-sizing: border-box;
}

.option-item.option-active {
  background: linear-gradient(135deg, rgba(255, 214, 153, 0.12), rgba(255, 179, 71, 0.08));
  border-color: rgba(255, 179, 71, 0.4);
}

.option-icon {
  font-size: 32rpx;
}

.option-text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.7);
}

.option-item.option-active .option-text {
  color: #FFD699;
  font-weight: 600;
}

/* 标签网格 */
.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
}

.tag-item.tag-active {
  background: linear-gradient(135deg, #FFD699, #FFB347);
  border-color: transparent;
}

.tag-icon {
  font-size: 28rpx;
}

.tag-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.6);
}

.tag-item.tag-active .tag-text {
  color: #0a0a0f;
  font-weight: 600;
}

.tag-item.tag-active .tag-icon {
  /* 保持 emoji 原色 */
}

.form-textarea {
  width: 100%;
  min-height: 160rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  font-size: 28rpx;
  color: #f0f0f0;
  box-sizing: border-box;
  line-height: 1.6;
}

/* 提交 */
.submit-section {
  padding: 32rpx 0 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.submit-btn {
  width: 100%;
  height: 100rpx;
  background: linear-gradient(135deg, #FFD699 0%, #FFB347 100%);
  border: none;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 8rpx 40rpx rgba(255, 179, 71, 0.3);
}

.submit-btn[disabled] {
  opacity: 0.4;
  box-shadow: none;
}

.submit-icon {
  font-size: 32rpx;
  color: #0a0a0f;
}

.submit-text {
  font-size: 32rpx;
  font-weight: 700;
  color: #0a0a0f;
  letter-spacing: 4rpx;
}

.submit-hint {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.25);
  margin-top: 20rpx;
}
</style>
