<template>
  <view class="budget-panel">
    <view class="budget-total-card">
      <text class="budget-title">预算概览</text>
      <view class="budget-total-row">
        <text class="budget-currency">¥</text>
        <text class="budget-total-value">{{ formatAmount(budget.total) }}</text>
      </view>
    </view>
    <view class="budget-grid">
      <view class="budget-grid-item" v-for="item in categoryItems" :key="item.key">
        <view class="grid-item-inner">
          <text class="grid-icon">{{ item.icon }}</text>
          <text class="grid-amount">¥{{ formatAmount(item.amount) }}</text>
          <text class="grid-label">{{ item.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Budget } from '@/types'
import { formatBudgetAmount } from '@/utils/format'
const props = defineProps<{ budget: Budget }>()
function formatAmount(v: number) { return formatBudgetAmount(v) }
const categoryItems = computed(() => [
  { key: 'attraction', icon: '🎫', label: '景点门票', amount: props.budget.total_attractions },
  { key: 'hotel', icon: '🏨', label: '住宿费用', amount: props.budget.total_hotels },
  { key: 'meal', icon: '🍜', label: '餐饮消费', amount: props.budget.total_meals },
  { key: 'transport', icon: '🚗', label: '交通出行', amount: props.budget.total_transportation },
])
</script>

<style scoped>
.budget-total-card {
  padding: 40rpx; text-align: center; margin-bottom: 24rpx;
  background: linear-gradient(135deg, #FFF0E8, #FFF8E8);
  border: 1rpx solid rgba(255, 107, 53, 0.1);
  border-radius: 32rpx;
  box-shadow: 0 4rpx 20rpx rgba(255, 107, 53, 0.05);
}
.budget-title { font-size: 26rpx; color: #6B7280; letter-spacing: 4rpx; display: block; margin-bottom: 16rpx; }
.budget-total-row { display: flex; align-items: baseline; justify-content: center; gap: 8rpx; }
.budget-currency { font-size: 36rpx; color: #FF6B35; font-weight: 600; }
.budget-total-value { font-size: 72rpx; font-weight: 800; color: #FF6B35; line-height: 1; }
.budget-grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.budget-grid-item { width: calc(50% - 8rpx); }
.grid-item-inner {
  padding: 28rpx;
  text-align: center;
  background: #FFFFFF;
  border-radius: 24rpx;
  border: 1rpx solid #E8ECF2;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.04);
}
.grid-icon { font-size: 44rpx; display: block; margin-bottom: 12rpx; }
.grid-amount { font-size: 34rpx; font-weight: 700; color: #1A1A2E; display: block; margin-bottom: 8rpx; }
.grid-label { font-size: 22rpx; color: #9CA3AF; }
</style>
