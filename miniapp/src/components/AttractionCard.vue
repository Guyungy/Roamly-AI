<template>
  <view class="attraction-card" @tap="$emit('tap')">
    <view class="card-image-wrap">
      <image v-if="imageUrl" :src="imageUrl" mode="aspectFill" class="card-image" @error="$emit('image-error')" />
      <view v-else class="card-image-placeholder">
        <text class="placeholder-icon">🏛️</text>
      </view>
      <view class="card-badge">
        <text class="badge-num">{{ order }}</text>
      </view>
      <view v-if="attraction.ticket_price" class="price-tag">
        <text class="price-text">¥{{ attraction.ticket_price }}</text>
      </view>
    </view>
    <view class="card-info">
      <text class="card-name">{{ attraction.name }}</text>
      <view class="card-meta">
        <text class="meta-item">📍 {{ attraction.address || '暂无地址' }}</text>
        <text class="meta-item">⏱ {{ attraction.visit_duration }}分钟</text>
      </view>
      <text class="card-desc" v-if="attraction.description">{{ attraction.description }}</text>
      <view v-if="attraction.rating" class="card-rating">
        <text class="rating-star">⭐</text>
        <text class="rating-value">{{ attraction.rating }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Attraction } from '@/types'
defineProps<{ attraction: Attraction; order: number; imageUrl?: string }>()
defineEmits<{ (e: 'tap'): void; (e: 'image-error'): void }>()
</script>

<style scoped>
.attraction-card {
  overflow: hidden;
  margin-bottom: 24rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
  border: 1rpx solid #E8ECF2;
}
.card-image-wrap { position: relative; width: 100%; height: 320rpx; }
.card-image { width: 100%; height: 100%; border-radius: 24rpx 24rpx 0 0; }
.card-image-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #FFF0E8, #FFF8E8);
  border-radius: 24rpx 24rpx 0 0;
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
.price-tag {
  position: absolute; bottom: 16rpx; right: 16rpx;
  padding: 8rpx 20rpx; border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.08);
}
.price-text { font-size: 24rpx; color: #10B981; font-weight: 600; }
.card-info { padding: 24rpx; }
.card-name { font-size: 32rpx; font-weight: 700; color: #1A1A2E; margin-bottom: 12rpx; display: block; }
.card-meta { display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 16rpx; }
.meta-item { font-size: 24rpx; color: #6B7280; }
.card-desc {
  font-size: 26rpx; color: #9CA3AF;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.5; margin-bottom: 12rpx;
}
.card-rating { display: flex; align-items: center; gap: 8rpx; }
.rating-star { font-size: 24rpx; }
.rating-value { font-size: 26rpx; color: #FFB830; font-weight: 600; }
</style>
