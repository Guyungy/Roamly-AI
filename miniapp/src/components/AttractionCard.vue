<template>
  <wd-card custom-class="attraction-card" @click="$emit('tap')">
    <view class="card-image-wrap">
      <image v-if="imageUrl && !imgFailed" :src="imageUrl" mode="aspectFill" class="card-image" @error="onImgError" />
      <view v-else class="card-image-placeholder">
        <text class="placeholder-icon">🏛️</text>
      </view>
      <view class="card-badge">
        <text class="badge-num">{{ order }}</text>
      </view>
      <wd-tag v-if="attraction.ticket_price" type="success" custom-style="position: absolute; bottom: 16rpx; right: 16rpx; background: rgba(255,255,255,0.9); border: none; color: #10B981;">
        ¥{{ attraction.ticket_price }}
      </wd-tag>
    </view>
    <view class="card-content">
      <text class="card-name">{{ attraction.name }}</text>
      <view class="card-meta">
        <text class="meta-item">📍 {{ attraction.address || '暂无地址' }}</text>
        <text class="meta-item">⏱ {{ attraction.visit_duration }}分钟</text>
      </view>
      <text class="card-desc" v-if="attraction.description">{{ attraction.description }}</text>
      <view v-if="attraction.rating" class="card-rating">
        <wd-tag type="warning" plain size="small">⭐ {{ attraction.rating }}</wd-tag>
      </view>
    </view>
  </wd-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Attraction } from '@/types'
defineProps<{ attraction: Attraction; order: number; imageUrl?: string }>()
defineEmits<{ (e: 'tap'): void; (e: 'image-error'): void }>()

const imgFailed = ref(false)
function onImgError() {
  imgFailed.value = true
}
</script>

<style scoped>
.attraction-card {
  margin-bottom: 24rpx;
  overflow: hidden;
}
:deep(.wd-card__content) {
  padding: 0 !important;
}
.card-image-wrap { position: relative; width: 100%; height: 320rpx; }
.card-image { width: 100%; height: 100%; }
.card-image-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #FFF0E8, #FFF8E8);
}
.placeholder-icon { font-size: 80rpx; }
.card-badge {
  position: absolute; top: 16rpx; left: 16rpx;
  width: 52rpx; height: 52rpx; border-radius: 50%;
  background: linear-gradient(135deg, #FF6B35, #FF8F5E);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(255, 107, 53, 0.3);
}
.badge-num { font-size: 26rpx; font-weight: 700; color: #FFFFFF; }
.card-content { padding: 24rpx; }
.card-name { font-size: 32rpx; font-weight: 700; color: #1A1A2E; margin-bottom: 12rpx; display: block; }
.card-meta { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 16rpx; }
.meta-item { font-size: 24rpx; color: #6B7280; }
.card-desc {
  font-size: 26rpx; color: #9CA3AF;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.5; margin-bottom: 12rpx;
}
.card-rating { display: flex; align-items: center; gap: 8rpx; margin-top: 12rpx; }
</style>
