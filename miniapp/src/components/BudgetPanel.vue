<template>
  <view class="budget-panel">
    <!-- 总预算卡片 -->
    <view class="budget-total-card glass-card">
      <text class="budget-title">预算概览</text>
      <view class="budget-total-row">
        <text class="budget-currency">¥</text>
        <text class="budget-total-value">{{ formatAmount(budget.total) }}</text>
      </view>
    </view>

    <!-- 分类预算网格 -->
    <view class="budget-grid">
      <view class="budget-grid-item" v-for="item in categoryItems" :key="item.key">
        <view class="grid-item-inner glass-card">
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

const props = defineProps<{
  budget: Budget
}>()

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
  padding: 40rpx;
  text-align: center;
  margin-bottom: 24rpx;
  background: linear-gradient(135deg, rgba(255, 179, 71, 0.08), rgba(255, 214, 153, 0.04));
  border-color: rgba(255, 179, 71, 0.2);
}

.budget-title {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 4rpx;
  display: block;
  margin-bottom: 16rpx;
}

.budget-total-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8rpx;
}

.budget-currency {
  font-size: 36rpx;
  color: #FFD699;
  font-weight: 600;
}

.budget-total-value {
  font-size: 72rpx;
  font-weight: 800;
  background: linear-gradient(135deg, #FFD699, #FFB347);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.budget-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.budget-grid-item {
  width: calc(50% - 8rpx);
}

.grid-item-inner {
  padding: 28rpx;
  text-align: center;
}

.grid-icon {
  font-size: 44rpx;
  display: block;
  margin-bottom: 12rpx;
}

.grid-amount {
  font-size: 34rpx;
  font-weight: 700;
  color: #f0f0f0;
  display: block;
  margin-bottom: 8rpx;
}

.grid-label {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.4);
}
</style>
