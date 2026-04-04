<template>
  <wd-overlay :show="visible" custom-style="display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.92);">
    <view class="loading-content" @tap.stop>
      <wd-loading size="60px" color="#FF6B35" />
      <text class="loading-title">正在为你规划旅程~</text>
      <text class="loading-progress">{{ progress || '正在初始化...' }}</text>
    </view>
  </wd-overlay>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; progress?: string }>()
</script>

<style scoped>
.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx;
}
.loading-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A2E;
  margin-top: 32rpx;
  margin-bottom: 12rpx;
}
.loading-progress {
  font-size: 26rpx;
  color: #9CA3AF;
  text-align: center;
}
</style>
