<template>
  <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
    <view class="navbar-content" :style="{ height: navHeight + 'px' }">
      <view v-if="showBack" class="navbar-back" @tap="handleBack">
        <text class="back-icon">‹</text>
      </view>
      <view class="navbar-brand">
        <text class="brand-icon">✦</text>
        <view class="brand-text-group">
          <text class="brand-title">旅途星辰</text>
          <text class="brand-sub">TripStar · AI</text>
        </view>
      </view>
      <view class="navbar-right">
        <slot name="right" />
      </view>
    </view>
  </view>
  <!-- 占位 -->
  <view :style="{ height: (statusBarHeight + navHeight) + 'px' }" />
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  showBack?: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

const statusBarHeight = ref(20)
const navHeight = ref(44)

// 获取系统信息
try {
  const sysInfo = uni.getSystemInfoSync()
  statusBarHeight.value = sysInfo.statusBarHeight || 20
  // #ifdef MP-WEIXIN
  const menuBtn = uni.getMenuButtonBoundingClientRect()
  navHeight.value = (menuBtn.top - (sysInfo.statusBarHeight || 0)) * 2 + menuBtn.height
  // #endif
  // #ifndef MP-WEIXIN
  navHeight.value = 44
  // #endif
} catch (e) {
  console.warn('获取系统信息失败', e)
}

function handleBack() {
  emit('back')
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/landing/index' }) })
}
</script>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  background: linear-gradient(180deg, rgba(10, 10, 15, 0.95) 0%, rgba(10, 10, 15, 0.85) 100%);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border-bottom: 1rpx solid rgba(255, 179, 71, 0.12);
}

.navbar-content {
  display: flex;
  align-items: center;
  padding: 0 24rpx;
  position: relative;
}

.navbar-back {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  margin-right: 16rpx;
}

.back-icon {
  font-size: 40rpx;
  color: var(--color-brand, #FFD699);
  font-weight: 300;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
}

.brand-icon {
  font-size: 40rpx;
  color: #FFD699;
  text-shadow: 0 0 16rpx rgba(255, 179, 71, 0.5);
}

.brand-text-group {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #FFD699;
  letter-spacing: 2rpx;
}

.brand-sub {
  font-size: 18rpx;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 4rpx;
  text-transform: uppercase;
}

.navbar-right {
  display: flex;
  align-items: center;
}
</style>
