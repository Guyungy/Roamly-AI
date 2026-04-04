<template>
  <view class="budget-panel">
    <wd-card custom-class="budget-total-card">
      <view class="total-content">
        <text class="budget-title">预算概览</text>
        <view class="budget-total-row">
          <text class="budget-currency">¥</text>
          <text class="budget-total-value">{{ formatAmount(budget.total) }}</text>
        </view>
      </view>
    </wd-card>

    <wd-grid :column="2" :border="false" custom-style="margin-top: 24rpx;">
      <wd-grid-item v-for="item in categoryItems" :key="item.key" use-slot>
        <view class="grid-item-inner">
          <text class="grid-icon">{{ item.icon }}</text>
          <text class="grid-amount">¥{{ formatAmount(item.amount) }}</text>
          <text class="grid-label">{{ item.label }}</text>
        </view>
      </wd-grid-item>
    </wd-grid>
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
  background: linear-gradient(135deg, #FFF0E8, #FFF8E8) !important;
  border: 1rpx solid rgba(255, 107, 53, 0.1) !important;
  text-align: center;
}
.total-content { padding: 20rpx 0; }
.budget-title { font-size: 26rpx; color: #6B7280; letter-spacing: 4rpx; display: block; margin-bottom: 16rpx; }
.budget-total-row { display: flex; align-items: baseline; justify-content: center; gap: 8rpx; }
.budget-currency { font-size: 36rpx; color: #FF6B35; font-weight: 600; }
.budget-total-value { font-size: 72rpx; font-weight: 800; color: #FF6B35; line-height: 1; }
.grid-item-inner {
  padding: 24rpx;
  text-align: center;
  background: #FFFFFF;
  border-radius: 24rpx;
  width: 100%;
}
.grid-icon { font-size: 44rpx; display: block; margin-bottom: 12rpx; }
.grid-amount { font-size: 34rpx; font-weight: 700; color: #1A1A2E; display: block; margin-bottom: 8rpx; }
.grid-label { font-size: 22rpx; color: #9CA3AF; }
:deep(.wd-grid-item__content) { background: transparent !important; padding: 10rpx !important; }
</style>
