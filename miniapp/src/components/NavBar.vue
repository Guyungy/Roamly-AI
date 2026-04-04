<template>
  <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
    <view class="navbar-content" :style="{ height: navHeight + 'px' }">
      <view v-if="showBack" class="navbar-back" @tap="handleBack">
        <text class="back-icon">‹</text>
      </view>
      <view class="navbar-brand">
        <text class="brand-icon">🎒</text>
        <text class="brand-title">出门啦</text>
      </view>
      <view class="navbar-right">
        <slot name="right" />
      </view>
    </view>
  </view>
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
  background: #FFFFFF;
  border-bottom: 1rpx solid #F0F2F5;
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
  background: #F5F6FA;
  margin-right: 12rpx;
}

.back-icon {
  font-size: 40rpx;
  color: #FF6B35;
  font-weight: 300;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex: 1;
}

.brand-icon {
  font-size: 36rpx;
}

.brand-title {
  font-size: 34rpx;
  font-weight: 800;
  color: #FF6B35;
  letter-spacing: 2rpx;
}

.navbar-right {
  display: flex;
  align-items: center;
}
</style>
