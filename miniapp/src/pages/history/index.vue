<template>
  <view class="history-page">
    <wd-navbar title="我的行程" fixed placeholder />

    <!-- 头部统计 -->
    <view class="page-header" v-if="!historyStore.isEmpty">
      <view class="page-title">我的探索</view>
      <wd-badge :value="historyStore.count" type="primary" class="page-count-badge" />
    </view>

    <!-- 行程列表 -->
    <view v-if="!historyStore.isEmpty" class="history-list">
      <view v-for="item in historyStore.items" :key="item.id" class="swipe-container">
        <wd-swipe-action>
          <wd-card class="trip-card" @click="openTrip(item)">
            <template #title>
              <view class="card-title-row">
                <text class="card-city">{{ item.city }}</text>
                <wd-tag type="primary" plain size="small" class="card-days-tag">
                  {{ item.days }}天{{ item.days - 1 }}晚
                </wd-tag>
              </view>
            </template>

            <view class="card-date-row">
              <wd-icon name="calendar" size="28rpx" color="#9CA3AF" />
              <text class="card-date">{{ item.startDate }} — {{ item.endDate }}</text>
            </view>

            <!-- 景点预览 -->
            <view class="card-preview" v-if="(item.previewAttractions || []).length > 0">
              <wd-tag
                v-for="name in (item.previewAttractions || [])"
                :key="name"
                round
                plain
                class="preview-tag"
              >
                {{ name }}
              </wd-tag>
            </view>

            <template #footer>
              <view class="card-footer">
                <text class="card-time">{{ formatTime(item.createdAt) }} 创建</text>
                <view class="card-action">
                  <text class="action-text">查看详情</text>
                  <wd-icon name="arrow-right" size="24rpx" color="#FF6B35" />
                </view>
              </view>
            </template>
          </wd-card>

          <template #right>
            <view class="delete-btn" @tap.stop="confirmDelete(item.id)">
              <wd-icon name="delete" size="40rpx" color="#FFFFFF" />
              <text class="delete-text">删除</text>
            </view>
          </template>
        </wd-swipe-action>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <wd-status-tip image="search" tip="还没有旅行计划" />
      <view class="empty-desc">去首页创建你的第一个 AI 旅行计划吧</view>
      <view class="empty-action">
        <wd-button type="primary" round block @click="goToPlanning">
          ✦ 开始规划
        </wd-button>
      </view>
    </view>

    <view class="safe-area-bottom" />
  </view>
</template>

<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'
import { useHistoryStore, type HistoryItem } from '@/stores/history'
import { useTripStore } from '@/stores/trip'

const historyStore = useHistoryStore()
const tripStore = useTripStore()

onPullDownRefresh(() => {
  // history is local, just stop the animation
  uni.stopPullDownRefresh()
})

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
  align-items: center;
  padding: 32rpx 32rpx 16rpx;
  gap: 16rpx;
}

.page-title {
  font-size: 36rpx;
  font-weight: 800;
  color: #1A1A2E;
}

/* Card */
.history-list {
  padding: 0 24rpx;
}

.swipe-container {
  margin-bottom: 24rpx;
  border-radius: 24rpx;
  overflow: hidden;
}

.trip-card {
  margin: 0 !important;
  border: none !important;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.card-city {
  font-size: 34rpx;
  font-weight: 800;
  color: #1A1A2E;
}

.card-date-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 12rpx;
  margin-bottom: 24rpx;
}

.card-date {
  font-size: 26rpx;
  color: #6B7280;
}

.card-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.preview-tag {
  color: #6B7280 !important;
  background-color: #F5F6FA !important;
  border-color: #E8ECF2 !important;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.delete-btn {
  height: 100%;
  width: 140rpx;
  background-color: #fa4350;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
}

.delete-text {
  font-size: 24rpx;
  margin-top: 8rpx;
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 160rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #9CA3AF;
  margin: 24rpx 0 48rpx;
}

.empty-action {
  width: 320rpx;
}
</style>
