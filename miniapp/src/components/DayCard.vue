<template>
  <view class="day-card glass-card">
    <view class="day-header" @tap="expanded = !expanded">
      <view class="day-header-left">
        <view class="day-index-badge">
          <text class="day-index-text">D{{ day.day_index + 1 }}</text>
        </view>
        <view class="day-header-info">
          <text class="day-date">{{ day.date }}</text>
          <text class="day-desc">{{ day.description }}</text>
        </view>
      </view>
      <text class="expand-icon" :class="{ 'is-expanded': expanded }">›</text>
    </view>
    <view v-if="expanded" class="day-body">
      <view class="day-info-bar">
        <view class="info-chip"><text class="chip-icon">🚗</text><text class="chip-text">{{ day.transportation }}</text></view>
        <view class="info-chip"><text class="chip-icon">🏨</text><text class="chip-text">{{ day.accommodation }}</text></view>
      </view>
      <view class="section-label"><view class="label-line" /><text class="label-text">景点安排</text><view class="label-line" /></view>
      <AttractionCard v-for="(attr, index) in day.attractions" :key="attr.name" :attraction="attr" :order="index + 1" :image-url="getImage(attr.name)" />
      <view v-if="day.hotel" class="hotel-section">
        <view class="section-label"><view class="label-line" /><text class="label-text">住宿推荐</text><view class="label-line" /></view>
        <view class="hotel-card glass-card">
          <view class="hotel-header"><text class="hotel-name">{{ day.hotel.name }}</text><text class="hotel-type tag">{{ day.hotel.type }}</text></view>
          <view class="hotel-details">
            <text class="hotel-detail-item">📍 {{ day.hotel.address }}</text>
            <text class="hotel-detail-item">💰 {{ day.hotel.price_range }}</text>
            <text class="hotel-detail-item">⭐ {{ day.hotel.rating }}</text>
            <text class="hotel-detail-item">📏 {{ day.hotel.distance }}</text>
          </view>
        </view>
      </view>
      <view class="section-label"><view class="label-line" /><text class="label-text">餐饮安排</text><view class="label-line" /></view>
      <view class="meals-list">
        <view v-for="meal in day.meals" :key="meal.type" class="meal-item glass-card">
          <view class="meal-type-badge"><text class="meal-emoji">{{ getMealEmoji(meal.type) }}</text><text class="meal-type-text">{{ getMealLabelLocal(meal.type) }}</text></view>
          <view class="meal-info"><text class="meal-name">{{ meal.name }}</text><text v-if="meal.description" class="meal-desc">{{ meal.description }}</text></view>
          <text v-if="meal.estimated_cost" class="meal-cost">¥{{ meal.estimated_cost }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DayPlan } from '@/types'
import AttractionCard from './AttractionCard.vue'
const props = defineProps<{ day: DayPlan; images: Record<string, string>; defaultExpanded?: boolean }>()
const expanded = ref(props.defaultExpanded ?? false)
function getImage(name: string) { return props.images[name] }
function getMealEmoji(type: string) { return ({ breakfast:'🌅', lunch:'☀️', dinner:'🌙', snack:'🍡' } as Record<string,string>)[type] || '🍽️' }
function getMealLabelLocal(type: string) { return ({ breakfast:'早餐', lunch:'午餐', dinner:'晚餐', snack:'小食' } as Record<string,string>)[type] || type }
</script>

<style scoped>
.day-card { margin-bottom: 24rpx; overflow: hidden; }
.day-header { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx; }
.day-header-left { display: flex; align-items: center; gap: 20rpx; flex: 1; }
.day-index-badge {
  width: 72rpx; height: 72rpx; border-radius: 50%;
  background: linear-gradient(135deg, #FFF0E8, #FFE4D0);
  border: 1rpx solid rgba(255, 107, 53, 0.15);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.day-index-text { font-size: 28rpx; font-weight: 700; color: #FF6B35; }
.day-header-info { display: flex; flex-direction: column; gap: 4rpx; flex: 1; min-width: 0; }
.day-date { font-size: 28rpx; font-weight: 600; color: #1A1A2E; }
.day-desc { font-size: 24rpx; color: #9CA3AF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expand-icon { font-size: 40rpx; color: #9CA3AF; transform: rotate(90deg); transition: transform 0.3s ease; }
.expand-icon.is-expanded { transform: rotate(270deg); }
.day-body { padding: 0 32rpx 32rpx; }
.day-info-bar { display: flex; gap: 16rpx; margin-bottom: 32rpx; flex-wrap: wrap; }
.info-chip { display: flex; align-items: center; gap: 8rpx; padding: 12rpx 24rpx; border-radius: 999rpx; background: #F5F6FA; border: 1rpx solid #E8ECF2; }
.chip-icon { font-size: 24rpx; }
.chip-text { font-size: 24rpx; color: #6B7280; }
.section-label { display: flex; align-items: center; gap: 20rpx; margin: 36rpx 0 24rpx; }
.label-line { flex: 1; height: 1rpx; background: linear-gradient(90deg, transparent, #E8ECF2, transparent); }
.label-text { font-size: 26rpx; color: #FF6B35; font-weight: 600; letter-spacing: 4rpx; white-space: nowrap; }
.hotel-card { padding: 28rpx; }
.hotel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.hotel-name { font-size: 30rpx; font-weight: 700; color: #1A1A2E; flex: 1; }
.hotel-details { display: flex; flex-direction: column; gap: 12rpx; }
.hotel-detail-item { font-size: 24rpx; color: #6B7280; }
.meals-list { display: flex; flex-direction: column; gap: 16rpx; }
.meal-item { display: flex; align-items: center; padding: 24rpx; gap: 20rpx; }
.meal-type-badge { display: flex; flex-direction: column; align-items: center; gap: 4rpx; width: 80rpx; flex-shrink: 0; }
.meal-emoji { font-size: 36rpx; }
.meal-type-text { font-size: 20rpx; color: #9CA3AF; }
.meal-info { flex: 1; min-width: 0; }
.meal-name { font-size: 28rpx; color: #1A1A2E; font-weight: 500; display: block; }
.meal-desc { font-size: 24rpx; color: #9CA3AF; display: block; margin-top: 4rpx; }
.meal-cost { font-size: 26rpx; color: #10B981; font-weight: 600; flex-shrink: 0; }
</style>
