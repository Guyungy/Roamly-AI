<template>
  <view class="history-page">
    <NavBar />

    <!-- 头部 -->
    <view class="page-header">
      <text class="page-title">我的行程</text>
      <text class="page-count" v-if="!historyStore.isEmpty">共 {{ historyStore.count }} 个</text>
    </view>

    <!-- 行程列表 -->
    <view v-if="!historyStore.isEmpty" class="history-list">
      <view
        v-for="item in historyStore.items"
        :key="item.id"
        class="trip-card"
        @tap="openTrip(item)"
      >
        <!-- 城市头部 -->
        <view class="card-top">
          <view class="city-row">
            <text class="card-city">{{ item.city }}</text>
            <text class="card-days-tag">{{ item.days }}天{{ item.days - 1 }}晚</text>
          </view>
          <view class="card-delete" @tap.stop="confirmDelete(item.id)">
            <text class="delete-x">×</text>
          </view>
        </view>

        <!-- 日期 -->
        <view class="card-date-row">
          <text class="card-date-icon">📅</text>
          <text class="card-date">{{ item.startDate }} — {{ item.endDate }}</text>
        </view>

        <!-- 景点预览 -->
        <view class="card-preview" v-if="getPreviewAttractions(item).length > 0">
          <text
            v-for="name in getPreviewAttractions(item)"
            :key="name"
            class="preview-tag"
          >{{ name }}</text>
        </view>

        <!-- 底部 -->
        <view class="card-footer">
          <text class="card-time">{{ formatTime(item.createdAt) }} 创建</text>
          <view class="card-action">
            <text class="action-text">查看详情</text>
            <text class="action-arrow">›</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <view class="empty-icon-wrap">
        <text class="empty-icon">🗺️</text>
      </view>
      <text class="empty-title">还没有旅行计划</text>
      <text class="empty-desc">去首页创建你的第一个 AI 旅行计划吧</text>
      <button class="empty-btn" @tap="goToPlanning">
        <text class="empty-btn-text">✦ 开始规划</text>
      </button>
    </view>

    <view class="safe-area-bottom" />
  </view>
</template>

<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
import { useHistoryStore, type HistoryItem } from '@/stores/history'
import { useTripStore } from '@/stores/trip'

const historyStore = useHistoryStore()
const tripStore = useTripStore()

function openTrip(item: HistoryItem) {
  tripStore.setTripPlan(item.tripPlan, item.graphData)
  uni.navigateTo({ url: '/pages/result/index' })
}

function confirmDelete(id: string) {
  uni.showModal({
    title: '删除行程',
    content: '确定要删除这条行程记录吗？',
    confirmColor: '#FF6B35',
    success: (res) => {
      if (res.confirm) {
        historyStore.remove(id)
        uni.showToast({ title: '已删除', icon: 'success' })
      }
    }
  })
}

function getPreviewAttractions(item: HistoryItem): string[] {
  if (!item.tripPlan?.days) return []
  const names: string[] = []
  for (const day of item.tripPlan.days) {
    for (const attr of day.attractions) {
      names.push(attr.name)
      if (names.length >= 4) return names
    }
  }
  return names
}

function goToPlanning() {
  uni.switchTab({ url: '/pages/landing/index' })
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}
</script>

<style scoped>
.history-page {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding-bottom: 40rpx;
}

.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 32rpx 40rpx 24rpx;
}

.page-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #1A1A2E;
}

.page-count {
  font-size: 24rpx;
  color: #9CA3AF;
}

/* Card */
.history-list {
  padding: 0 32rpx;
}

.trip-card {
  padding: 32rpx;
  margin-bottom: 24rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 1rpx solid #E8ECF2;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.02);
  transition: all 0.2s;
}

.trip-card:active {
  background-color: #F9FAFB;
  transform: translateY(2rpx);
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.city-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.card-city {
  font-size: 36rpx;
  font-weight: 800;
  color: #FF6B35;
}

.card-days-tag {
  font-size: 22rpx;
  color: #FF6B35;
  padding: 4rpx 12rpx;
  background-color: rgba(255, 107, 53, 0.08);
  border-radius: 8rpx;
}

.card-delete {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: #F5F6FA;
}

.delete-x {
  font-size: 32rpx;
  color: #9CA3AF;
}

.card-date-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 20rpx;
}

.card-date-icon {
  font-size: 24rpx;
}

.card-date {
  font-size: 26rpx;
  color: #6B7280;
}

.card-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 24rpx;
}

.preview-tag {
  font-size: 22rpx;
  color: #6B7280;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background-color: #F5F6FA;
  border: 1rpx solid #E8ECF2;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 20rpx;
  border-top: 1rpx solid #F5F6FA;
}

.card-time {
  font-size: 22rpx;
  color: #9CA3AF;
}

.card-action {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.action-text {
  font-size: 24rpx;
  color: #FF6B35;
  font-weight: 600;
}

.action-arrow {
  font-size: 28rpx;
  color: #FF6B35;
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 60rpx;
}

.empty-icon-wrap {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background-color: #FFFFFF;
  border: 1rpx solid #E8ECF2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.03);
}

.empty-icon {
  font-size: 64rpx;
}

.empty-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A2E;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #9CA3AF;
  margin-bottom: 48rpx;
}

.empty-btn {
  background: linear-gradient(135deg, #FF6B35 0%, #FFB830 100%);
  border: none;
  border-radius: 999rpx;
  padding: 24rpx 64rpx;
  box-shadow: 0 8rpx 32rpx rgba(255, 107, 53, 0.3);
}

.empty-btn-text {
  font-size: 30rpx;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 2rpx;
}
</style>
