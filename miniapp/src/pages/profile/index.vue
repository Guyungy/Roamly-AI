<template>
  <view class="profile-page">
    <NavBar />

    <!-- 用户区 -->
    <view class="user-section">
      <view class="avatar-ring">
        <text class="avatar-emoji">🎒</text>
      </view>
      <text class="user-greeting">出门啦用户</text>
      <text class="user-sub">探索世界的每一个角落</text>
    </view>

    <!-- 配额仪表盘 -->
    <view class="quota-dashboard">
      <view class="dashboard-header">
        <text class="dashboard-title">今日规划额度</text>
        <text class="dashboard-reset">每日 0:00 重置</text>
      </view>

      <view class="quota-display">
        <view class="quota-number-wrap">
          <text class="quota-number" :class="{ 'is-zero': !quotaStore.canPlan }">
            {{ quotaStore.totalRemaining }}
          </text>
          <text class="quota-label-unit">次可用</text>
        </view>

        <view class="quota-breakdown">
          <view class="breakdown-item">
            <text class="breakdown-dot free-dot" />
            <text class="breakdown-label">免费</text>
            <text class="breakdown-value">{{ quotaStore.freeRemaining }}</text>
          </view>
          <view class="breakdown-item">
            <text class="breakdown-dot ad-dot" />
            <text class="breakdown-label">广告奖励</text>
            <text class="breakdown-value">{{ quotaStore.data.adRemaining }}</text>
          </view>
          <view class="breakdown-item">
            <text class="breakdown-dot invite-dot" />
            <text class="breakdown-label">邀请奖励</text>
            <text class="breakdown-value">{{ quotaStore.data.inviteRemaining }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 获取次数 -->
    <view class="section-header">
      <view class="section-line" />
      <text class="section-title">获取更多次数</text>
      <view class="section-line" />
    </view>

    <!-- 看广告 -->
    <view class="action-card" @tap="watchAd">
      <view class="action-left">
        <view class="action-icon-wrap ad-icon-bg">
          <text class="action-icon">🎬</text>
        </view>
        <view class="action-info">
          <text class="action-name">观看视频广告</text>
          <text class="action-desc">看一段短视频即可获得规划机会</text>
        </view>
      </view>
      <view class="action-right">
        <view class="reward-pill">
          <text class="reward-pill-text">+1次</text>
        </view>
        <text class="action-remain">今日还可看 {{ quotaStore.adCanWatch }} 次</text>
      </view>
    </view>

    <!-- 邀请好友 -->
    <view class="action-card" @tap="inviteFriend">
      <view class="action-left">
        <view class="action-icon-wrap invite-icon-bg">
          <text class="action-icon">🎁</text>
        </view>
        <view class="action-info">
          <text class="action-name">邀请好友使用</text>
          <text class="action-desc">好友首次使用后双方各得奖励</text>
        </view>
      </view>
      <view class="action-right">
        <view class="reward-pill reward-pill-green">
          <text class="reward-pill-text">+3次</text>
        </view>
        <text class="action-remain">已邀请 {{ quotaStore.data.totalInvites }} 人</text>
      </view>
    </view>

    <!-- 统计 -->
    <view class="section-header" style="margin-top: 48rpx;">
      <view class="section-line" />
      <text class="section-title">使用统计</text>
      <view class="section-line" />
    </view>

    <view class="stats-grid">
      <view class="stat-card">
        <text class="stat-value">{{ historyStore.count }}</text>
        <text class="stat-label">行程总数</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ totalCities }}</text>
        <text class="stat-label">到访城市</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ totalDays }}</text>
        <text class="stat-label">旅行天数</text>
      </view>
    </view>

    <!-- 其他操作 -->
    <view class="menu-section">
      <view class="menu-item" @tap="clearHistory">
        <text class="menu-icon">🗑️</text>
        <text class="menu-text">清空所有行程</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @tap="showAbout">
        <text class="menu-icon">ℹ️</text>
        <text class="menu-text">关于出门啦</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="footer-text">
      <text class="footer-ver">出门啦 v2.0.0</text>
      <text class="footer-powered">Powered by AI 🎒</text>
    </view>

    <view class="safe-area-bottom" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { useQuotaStore } from '@/stores/quota'
import { useHistoryStore } from '@/stores/history'

const quotaStore = useQuotaStore()
const historyStore = useHistoryStore()

onShow(() => {
  quotaStore.ensureToday()
})

const totalCities = computed(() => {
  const cities = new Set(historyStore.items.map(i => i.city))
  return cities.size
})

const totalDays = computed(() => {
  return historyStore.items.reduce((sum, i) => sum + i.days, 0)
})

function watchAd() {
  if (quotaStore.adCanWatch <= 0) {
    uni.showToast({ title: '今日广告次数已达上限', icon: 'none' })
    return
  }
  // #ifdef MP-WEIXIN
  if (wx.createRewardedVideoAd) {
    const ad = wx.createRewardedVideoAd({ adUnitId: 'adunit-placeholder' })
    ad.onClose((res: any) => {
      if (res && res.isEnded) {
        quotaStore.rewardByAd()
        uni.showToast({ title: '+1次规划机会！', icon: 'success' })
      } else {
        uni.showToast({ title: '需完整观看才能获得奖励', icon: 'none' })
      }
    })
    ad.onError(() => uni.showToast({ title: '广告加载失败', icon: 'none' }))
    ad.show().catch(() => ad.load().then(() => ad.show()))
    return
  }
  // #endif
  quotaStore.rewardByAd()
  uni.showToast({ title: '[测试] +1次', icon: 'success' })
}

function inviteFriend() {
  uni.showModal({
    title: '邀请好友',
    content: '将小程序分享给好友，好友首次使用后你将获得 3 次规划机会！',
    confirmText: '去分享',
    confirmColor: '#FF6B35',
    success: (res) => {
      if (res.confirm) {
        // #ifndef MP-WEIXIN
        quotaStore.rewardByInvite()
        uni.showToast({ title: '[测试] +3次', icon: 'success' })
        // #endif
      }
    }
  })
}

function clearHistory() {
  if (historyStore.isEmpty) {
    uni.showToast({ title: '暂无行程记录', icon: 'none' })
    return
  }
  uni.showModal({
    title: '清空所有行程',
    content: `确定要删除全部 ${historyStore.count} 条行程记录吗？此操作不可恢复。`,
    confirmColor: '#ef4444',
    success: (res) => {
      if (res.confirm) {
        historyStore.clearAll()
        uni.showToast({ title: '已清空', icon: 'success' })
      }
    }
  })
}

function showAbout() {
  uni.showModal({
    title: '出门啦 Chumenla',
    content: '基于多智能体 AI 的旅行规划助手\n\n版本 2.0.0\nPowered by HelloAgents',
    showCancel: false,
    confirmColor: '#FF6B35',
  })
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background-color: #F5F6FA;
  padding-bottom: 40rpx;
}

/* User */
.user-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 40rpx 40rpx;
}

.avatar-ring {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background-color: #FFFFFF;
  border: 4rpx solid #FF6B35;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.15);
}

.avatar-emoji {
  font-size: 56rpx;
}

.user-greeting {
  font-size: 36rpx;
  font-weight: 800;
  color: #1A1A2E;
  margin-bottom: 8rpx;
}

.user-sub {
  font-size: 24rpx;
  color: #9CA3AF;
}

/* Dashboard */
.quota-dashboard {
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  background-color: rgba(255, 107, 53, 0.05);
  border-radius: 32rpx;
  border: 1rpx solid rgba(255, 107, 53, 0.1);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.dashboard-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #6B7280;
}

.dashboard-reset {
  font-size: 22rpx;
  color: #9CA3AF;
}

.quota-display {
  display: flex;
  align-items: center;
  gap: 40rpx;
}

.quota-number-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.quota-number {
  font-size: 80rpx;
  font-weight: 800;
  color: #FF6B35;
  line-height: 1;
}

.quota-number.is-zero {
  color: #ef4444;
}

.quota-label-unit {
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 8rpx;
}

.quota-breakdown {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.breakdown-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
}

.free-dot { background-color: #FF6B35; }
.ad-dot { background-color: #4EADBD; }
.invite-dot { background-color: #4ade80; }

.breakdown-label {
  font-size: 24rpx;
  color: #6B7280;
  flex: 1;
}

.breakdown-value {
  font-size: 26rpx;
  font-weight: 700;
  color: #1A1A2E;
}

/* Section header */
.section-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 36rpx 32rpx 24rpx;
}

.section-line {
  flex: 1;
  height: 1rpx;
  background-color: #E8ECF2;
}

.section-title {
  font-size: 24rpx;
  color: #9CA3AF;
  font-weight: 600;
  letter-spacing: 2rpx;
  white-space: nowrap;
}

/* Action cards */
.action-card {
  margin: 0 32rpx 20rpx;
  padding: 32rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 1rpx solid #E8ECF2;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
  transition: all 0.2s;
}

.action-card:active {
  background-color: #F9FAFB;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex: 1;
}

.action-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ad-icon-bg {
  background-color: rgba(78, 173, 189, 0.1);
}

.invite-icon-bg {
  background-color: rgba(74, 222, 128, 0.1);
}

.action-icon {
  font-size: 40rpx;
}

.action-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.action-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #1A1A2E;
}

.action-desc {
  font-size: 22rpx;
  color: #9CA3AF;
}

.action-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  flex-shrink: 0;
}

.reward-pill {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #FF6B35, #FFB830);
}

.reward-pill-green {
  background: linear-gradient(135deg, #4ade80, #22c55e);
}

.reward-pill-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #FFFFFF;
}

.action-remain {
  font-size: 20rpx;
  color: #9CA3AF;
}

/* Stats */
.stats-grid {
  display: flex;
  gap: 16rpx;
  padding: 0 32rpx;
}

.stat-card {
  flex: 1;
  padding: 32rpx 16rpx;
  text-align: center;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 1rpx solid #E8ECF2;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}

.stat-value {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #FF6B35;
  margin-bottom: 8rpx;
}

.stat-label {
  display: block;
  font-size: 22rpx;
  color: #9CA3AF;
}

/* Menu */
.menu-section {
  padding: 40rpx 32rpx 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 32rpx;
  gap: 20rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 1rpx solid #E8ECF2;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}

.menu-item:active {
  background-color: #F9FAFB;
}

.menu-icon {
  font-size: 36rpx;
}

.menu-text {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #6B7280;
}

.menu-arrow {
  font-size: 28rpx;
  color: #D1D5DB;
}

/* Footer */
.footer-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0 40rpx;
  gap: 8rpx;
}

.footer-ver {
  font-size: 22rpx;
  color: #D1D5DB;
}

.footer-powered {
  font-size: 20rpx;
  color: #E5E7EB;
}
</style>
