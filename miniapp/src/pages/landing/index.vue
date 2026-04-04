<template>
  <view class="landing-page">
    <NavBar />

    <!-- 剩余次数提示条 -->
    <view class="quota-hint-bar" @tap="goToProfile">
      <text class="quota-hint-icon">🎒</text>
      <text class="quota-hint-text">
        今日剩余 <text class="quota-hint-num" :class="{ 'is-zero': !quotaStore.canPlan }">{{ quotaStore.totalRemaining }}</text> 次规划
      </text>
      <text class="quota-hint-arrow">获取更多 ›</text>
    </view>

    <!-- Hero 区域 -->
    <view class="hero-section">
      <view class="hero-content">
        <text class="hero-emoji">🎒</text>
        <text class="hero-title">出门啦</text>
        <text class="hero-subtitle">AI 帮你规划，说走就走！</text>
        <text class="hero-desc">输入目的地，开启你的专属智能行程规划</text>
      </view>
    </view>

    <!-- 表单区域 -->
    <view class="form-section">
      <!-- Step 1: 基础信息 -->
      <view class="form-step">
        <view class="step-header">
          <view class="step-number"><text class="step-num-text">1</text></view>
          <text class="step-title">你想去哪里？</text>
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
                  {{ formData.start_date || '开始日期' }}
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
                  {{ formData.end_date || '结束日期' }}
                </text>
                <text class="picker-icon">📅</text>
              </view>
            </picker>
          </view>
        </view>

        <view v-if="travelDays > 0" class="days-badge">
          <text class="days-text">共 {{ travelDays }} 天行程</text>
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
          <text class="form-label">感兴趣的内容（多选）</text>
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
          <text class="form-label">其他需求</text>
          <textarea
            class="form-textarea"
            v-model="formData.free_text_input"
            placeholder="比如：带老人出行，想吃地道美食..."
            placeholder-class="input-placeholder"
            :maxlength="200"
          />
        </view>
      </view>

      <!-- 提交按钮 -->
      <view class="submit-section">
        <button class="submit-btn" :disabled="!canSubmit" @tap="handleSubmit">
          <text class="submit-icon">🎒</text>
          <text class="submit-text">立即生成行程</text>
        </button>
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
  </view>
</template>

<script setup lang="ts">
import { reactive, computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import QuotaWall from '@/components/QuotaWall.vue'
import { useTripStore } from '@/stores/trip'
import { useQuotaStore } from '@/stores/quota'
import { useHistoryStore } from '@/stores/history'
import { generateTripPlan } from '@/services/api'
import type { TripFormData } from '@/types'

const tripStore = useTripStore()
const quotaStore = useQuotaStore()
const historyStore = useHistoryStore()
const showQuotaWall = ref(false)

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

  // 检查次数
  quotaStore.ensureToday()
  if (!quotaStore.canPlan) {
    showQuotaWall.value = true
    return
  }

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
      // 扣减次数
      quotaStore.consume()
      // 保存到历史记录
      historyStore.add(response.data, response.graph_data)
      // 设置当前行程
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
  // 测试环境模拟
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
    confirmColor: '#FF6B35',
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
.landing-page {
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
  padding: 20rpx 32rpx;
  background-color: #FFF5F0;
  border-bottom: 1rpx solid #FFE4D6;
}

.quota-hint-icon {
  font-size: 28rpx;
}

.quota-hint-text {
  font-size: 26rpx;
  color: #6B7280;
}

.quota-hint-num {
  font-weight: 700;
  color: #FF6B35;
  font-size: 30rpx;
}

.quota-hint-num.is-zero {
  color: #EF4444;
}

.quota-hint-arrow {
  font-size: 24rpx;
  color: #FF6B35;
  margin-left: 8rpx;
  opacity: 0.8;
}

/* Hero */
.hero-section {
  padding: 60rpx 48rpx 40rpx;
  text-align: center;
  background-color: #FFFFFF;
}

.hero-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-emoji {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}

.hero-title {
  font-size: 64rpx;
  font-weight: 800;
  color: #FF6B35;
  background: linear-gradient(135deg, #FF6B35, #FFB830);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 12rpx;
}

.hero-subtitle {
  font-size: 32rpx;
  font-weight: 600;
  color: #1A1A2E;
  margin-bottom: 16rpx;
}

.hero-desc {
  font-size: 28rpx;
  color: #9CA3AF;
  line-height: 1.6;
}

/* 表单 */
.form-section {
  padding: 32rpx;
}

.form-step {
  margin-bottom: 32rpx;
  background: #FFFFFF;
  border-radius: 32rpx;
  padding: 40rpx 32rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.03);
  border: 1rpx solid #E8ECF2;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 32rpx;
}

.step-number {
  width: 48rpx;
  height: 48rpx;
  border-radius: 12rpx;
  background: #FF6B35;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-num-text {
  font-size: 28rpx;
  font-weight: 700;
  color: #FFFFFF;
}

.step-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A2E;
}

.form-group {
  margin-bottom: 32rpx;
}

.form-label {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A2E;
  margin-bottom: 16rpx;
}

.form-input {
  width: 100%;
  height: 96rpx;
  background: #F5F6FA;
  border: 2rpx solid transparent;
  border-radius: 20rpx;
  padding: 0 32rpx;
  font-size: 30rpx;
  color: #1A1A2E;
  box-sizing: border-box;
  transition: all 0.2s;
}

.form-input:focus {
  border-color: #FF6B35;
  background: #FFFFFF;
}

.input-placeholder {
  color: #9CA3AF;
}

.picker-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-value {
  color: #1A1A2E;
  font-size: 30rpx;
}

.picker-icon {
  font-size: 32rpx;
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
  color: #FF6B35;
  font-weight: 700;
  background: #FFF5F0;
  padding: 10rpx 32rpx;
  border-radius: 999rpx;
}

/* 选项网格 */
.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.option-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 24rpx 16rpx;
  border-radius: 24rpx;
  background: #F5F6FA;
  border: 2rpx solid transparent;
  flex: 1;
  min-width: calc(25% - 12rpx);
  box-sizing: border-box;
  transition: all 0.2s;
}

.option-item.option-active {
  background: #FFF5F0;
  border-color: #FF6B35;
}

.option-icon {
  font-size: 40rpx;
}

.option-text {
  font-size: 24rpx;
  color: #6B7280;
  font-weight: 500;
}

.option-item.option-active .option-text {
  color: #FF6B35;
  font-weight: 700;
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
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  background: #F5F6FA;
  border: 2rpx solid transparent;
  transition: all 0.2s;
}

.tag-item.tag-active {
  background: #FF6B35;
  border-color: #FF6B35;
}

.tag-icon {
  font-size: 28rpx;
}

.tag-text {
  font-size: 26rpx;
  color: #6B7280;
  font-weight: 500;
}

.tag-item.tag-active .tag-text {
  color: #FFFFFF;
  font-weight: 700;
}

.form-textarea {
  width: 100%;
  min-height: 180rpx;
  background: #F5F6FA;
  border: 2rpx solid transparent;
  border-radius: 24rpx;
  padding: 24rpx 32rpx;
  font-size: 28rpx;
  color: #1A1A2E;
  box-sizing: border-box;
  line-height: 1.6;
}

/* 提交 */
.submit-section {
  padding: 40rpx 0 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.submit-btn {
  width: 100%;
  height: 110rpx;
  background: linear-gradient(135deg, #FF6B35 0%, #FFB830 100%);
  border: none;
  border-radius: 55rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  box-shadow: 0 12rpx 32rpx rgba(255, 107, 53, 0.25);
}

.submit-btn:active {
  transform: scale(0.98);
}

.submit-btn[disabled] {
  opacity: 0.5;
  box-shadow: none;
}

.submit-icon {
  font-size: 36rpx;
}

.submit-text {
  font-size: 34rpx;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 2rpx;
}

.submit-hint {
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 24rpx;
}
</style>
