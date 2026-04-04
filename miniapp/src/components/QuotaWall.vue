<template>
  <view v-if="visible" class="quota-wall-mask" @tap.self="$emit('close')">
    <view class="quota-wall-popup">
      <view class="popup-close" @tap="$emit('close')"><text class="close-icon">×</text></view>
      <view class="popup-header">
        <view class="popup-icon-ring"><text class="popup-icon">🎒</text></view>
        <text class="popup-title">次数用完啦~</text>
        <text class="popup-desc">今日免费次数已用完，试试下面的方式获取更多吧</text>
      </view>
      <view class="popup-options">
        <view class="option-card" :class="{ 'option-disabled': adCanWatch <= 0 }" @tap="onWatchAd">
          <view class="option-left"><text class="option-emoji">🎬</text><view class="option-info"><text class="option-name">看个小视频</text><text class="option-sub">约 15~30 秒</text></view></view>
          <view class="option-right"><view class="reward-badge"><text class="reward-text">+1 次</text></view><text class="option-remain">还可看 {{ adCanWatch }} 次</text></view>
        </view>
        <view class="option-card" @tap="onInvite">
          <view class="option-left"><text class="option-emoji">🎁</text><view class="option-info"><text class="option-name">喊朋友一起</text><text class="option-sub">好友首次使用即可</text></view></view>
          <view class="option-right"><view class="reward-badge reward-green"><text class="reward-text">+3 次</text></view><text class="option-remain">长期有效</text></view>
        </view>
      </view>
      <text class="popup-tip">每天 0 点自动恢复 1 次免费机会哦 ✨</text>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; adCanWatch: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'watch-ad'): void; (e: 'invite'): void }>()
function onWatchAd() { emit('watch-ad') }
function onInvite() { emit('invite') }
</script>

<style scoped>
.quota-wall-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: flex-end; justify-content: center; z-index: 9999;
}
.quota-wall-popup {
  width: 100%; background: #FFFFFF;
  border-top-left-radius: 40rpx; border-top-right-radius: 40rpx;
  padding: 48rpx 40rpx;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  position: relative;
  box-shadow: 0 -8rpx 40rpx rgba(0,0,0,0.08);
}
.popup-close { position: absolute; top: 24rpx; right: 24rpx; width: 56rpx; height: 56rpx; border-radius: 50%; background: #F5F6FA; display: flex; align-items: center; justify-content: center; }
.close-icon { font-size: 36rpx; color: #9CA3AF; }
.popup-header { text-align: center; margin-bottom: 40rpx; }
.popup-icon-ring { width: 96rpx; height: 96rpx; border-radius: 50%; background: #FFF0E8; display: flex; align-items: center; justify-content: center; margin: 0 auto 20rpx; }
.popup-icon { font-size: 44rpx; }
.popup-title { display: block; font-size: 36rpx; font-weight: 800; color: #1A1A2E; margin-bottom: 12rpx; }
.popup-desc { display: block; font-size: 26rpx; color: #9CA3AF; }
.popup-options { display: flex; flex-direction: column; gap: 20rpx; margin-bottom: 32rpx; }
.option-card { display: flex; align-items: center; justify-content: space-between; padding: 32rpx; border-radius: 24rpx; background: #F9FAFB; border: 1rpx solid #E8ECF2; }
.option-card:active { background: #F0F2F5; }
.option-card.option-disabled { opacity: 0.4; }
.option-left { display: flex; align-items: center; gap: 20rpx; }
.option-emoji { font-size: 44rpx; }
.option-info { display: flex; flex-direction: column; gap: 4rpx; }
.option-name { font-size: 30rpx; font-weight: 700; color: #1A1A2E; }
.option-sub { font-size: 22rpx; color: #9CA3AF; }
.option-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6rpx; }
.reward-badge { padding: 8rpx 24rpx; border-radius: 999rpx; background: linear-gradient(135deg, #FF6B35, #FF8F5E); }
.reward-green { background: linear-gradient(135deg, #10B981, #34D399); }
.reward-text { font-size: 26rpx; font-weight: 700; color: #FFFFFF; }
.option-remain { font-size: 20rpx; color: #9CA3AF; }
.popup-tip { display: block; text-align: center; font-size: 24rpx; color: #9CA3AF; padding-bottom: 20rpx; }
</style>
