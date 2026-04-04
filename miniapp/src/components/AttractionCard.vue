<template>
  <view class="attraction-card glass-card" @tap="$emit('tap')">
    <!-- 图片区 -->
    <view class="card-image-wrap">
      <image
        v-if="imageUrl"
        :src="imageUrl"
        mode="aspectFill"
        class="card-image"
        @error="$emit('image-error')"
      />
      <view v-else class="card-image-placeholder">
        <text class="placeholder-icon">🏛️</text>
      </view>
      <!-- 序号角标 -->
      <view class="card-badge">
        <text class="badge-num">{{ order }}</text>
      </view>
      <!-- 票价标签 -->
      <view v-if="attraction.ticket_price" class="price-tag">
        <text class="price-text">¥{{ attraction.ticket_price }}</text>
      </view>
    </view>

    <!-- 信息区 -->
    <view class="card-info">
      <text class="card-name">{{ attraction.name }}</text>
      <view class="card-meta">
        <text class="meta-item">📍 {{ attraction.address || '暂无地址' }}</text>
        <text class="meta-item">⏱ {{ attraction.visit_duration }}分钟</text>
      </view>
      <text class="card-desc" v-if="attraction.description">{{ attraction.description }}</text>
      <view v-if="attraction.rating" class="card-rating">
        <text class="rating-star">★</text>
        <text class="rating-value">{{ attraction.rating }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Attraction } from '@/types'

defineProps<{
  attraction: Attraction
  order: number
  imageUrl?: string
}>()

defineEmits<{
  (e: 'tap'): void
  (e: 'image-error'): void
}>()
</script>

<style scoped>
.attraction-card {
  overflow: hidden;
  margin-bottom: 24rpx;
}

.card-image-wrap {
  position: relative;
  width: 100%;
  height: 320rpx;
}

.card-image {
  width: 100%;
  height: 100%;
}

.card-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1035, #15132b);
}

.placeholder-icon {
  font-size: 80rpx;
  opacity: 0.5;
}

.card-badge {
  position: absolute;
  top: 16rpx;
  left: 16rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFD699, #FFB347);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(255, 179, 71, 0.4);
}

.badge-num {
  font-size: 26rpx;
  font-weight: 700;
  color: #0a0a0f;
}

.price-tag {
  position: absolute;
  bottom: 16rpx;
  right: 16rpx;
  padding: 8rpx 20rpx;
  border-radius: 20rpx;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.price-text {
  font-size: 24rpx;
  color: #4ade80;
  font-weight: 600;
}

.card-info {
  padding: 24rpx;
}

.card-name {
  font-size: 32rpx;
  font-weight: 700;
  color: #f0f0f0;
  margin-bottom: 12rpx;
  display: block;
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 16rpx;
}

.meta-item {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.55);
}

.card-desc {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.45);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  margin-bottom: 12rpx;
}

.card-rating {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.rating-star {
  color: #FFD699;
  font-size: 26rpx;
}

.rating-value {
  font-size: 26rpx;
  color: #FFD699;
  font-weight: 600;
}
</style>
