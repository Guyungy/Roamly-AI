<template>
  <wd-popup v-model="visible" position="bottom" :safe-area-inset-bottom="true" custom-style="border-radius: 40rpx 40rpx 0 0; background: #FFFFFF;" :close-on-click-modal="true" @close="$emit('close')">
    <view class="popup-body">
      <view class="popup-header">
        <text class="popup-emoji">🎒</text>
        <text class="popup-title">次数用完啦~</text>
        <text class="popup-desc">试试下面的方式获取更多机会吧</text>
      </view>

      <wd-cell-group border>
        <wd-cell title="看个小视频" label="约 15~30 秒" icon="play-circle-fill" is-link :clickable="adCanWatch > 0" @click="onWatchAd">
          <template #value>
            <wd-tag type="primary" round>+1 次</wd-tag>
          </template>
        </wd-cell>
        <wd-cell title="喊朋友一起" label="好友首次使用即可" icon="gift" is-link @click="onInvite">
          <template #value>
            <wd-tag type="success" round>+3 次</wd-tag>
          </template>
        </wd-cell>
      </wd-cell-group>

      <text class="popup-tip">每天 0 点自动恢复 1 次免费机会哦 ✨</text>
    </view>
  </wd-popup>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; adCanWatch: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'watch-ad'): void; (e: 'invite'): void }>()
function onWatchAd() { emit('watch-ad') }
function onInvite() { emit('invite') }
</script>

<style scoped>
.popup-body {
  padding: 40rpx 32rpx;
}
.popup-header {
  text-align: center;
  margin-bottom: 32rpx;
}
.popup-emoji {
  display: block;
  font-size: 64rpx;
  margin-bottom: 16rpx;
}
.popup-title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #1A1A2E;
  margin-bottom: 8rpx;
}
.popup-desc {
  display: block;
  font-size: 26rpx;
  color: #9CA3AF;
}
.popup-tip {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 24rpx;
  padding-bottom: 16rpx;
}
</style>
