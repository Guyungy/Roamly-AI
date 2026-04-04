<template>
  <view v-if="visible" class="loading-overlay">
    <view class="loading-content">
      <view class="loading-ring">
        <view class="ring-track" />
        <view class="ring-glow" />
        <text class="loading-icon">🎒</text>
      </view>
      <text class="loading-title">正在为你规划旅程~</text>
      <text class="loading-progress">{{ progress || '正在初始化...' }}</text>
      <view class="loading-dots">
        <view class="dot dot-1" />
        <view class="dot dot-2" />
        <view class="dot dot-3" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; progress?: string }>()
</script>

<style scoped>
.loading-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.loading-content { display: flex; flex-direction: column; align-items: center; padding: 60rpx; }
.loading-ring {
  width: 160rpx; height: 160rpx; position: relative;
  display: flex; align-items: center; justify-content: center; margin-bottom: 48rpx;
}
.ring-track {
  position: absolute; inset: 0; border-radius: 50%;
  border: 3rpx solid #F0F2F5;
}
.ring-glow {
  position: absolute; inset: 0; border-radius: 50%;
  border: 3rpx solid transparent;
  border-top-color: #FF6B35;
  border-right-color: rgba(255, 107, 53, 0.4);
  animation: spin 1.5s linear infinite;
}
.loading-icon { font-size: 52rpx; animation: bounce 1.5s ease-in-out infinite; }
.loading-title { font-size: 36rpx; font-weight: 700; color: #1A1A2E; margin-bottom: 16rpx; letter-spacing: 2rpx; }
.loading-progress { font-size: 26rpx; color: #9CA3AF; margin-bottom: 32rpx; text-align: center; max-width: 500rpx; }
.loading-dots { display: flex; gap: 16rpx; }
.dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #FF6B35; animation: dotPulse 1.4s ease-in-out infinite; }
.dot-2 { animation-delay: 0.2s; }
.dot-3 { animation-delay: 0.4s; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10rpx); } }
@keyframes dotPulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }
</style>
