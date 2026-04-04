<template>
  <view class="profile-page">
    <wd-navbar title="我的" fixed placeholder />

    <!-- 用户区 -->
    <view class="user-section">
      <view class="avatar-ring">
        <text class="avatar-emoji">🎒</text>
      </view>
      <view class="user-greeting">出门啦用户</view>
      <view class="user-sub">探索世界的每一个角落</view>
    </view>

    <!-- 配额仪表盘 -->
    <wd-card class="quota-card">
      <view class="quota-dashboard">
        <view class="dashboard-header">
          <text class="dashboard-title">今日规划额度</text>
          <text class="dashboard-reset">每日 0:00 重置</text>
        </view>

        <view class="quota-display">
          <view class="quota-number-wrap">
            <wd-badge :value="quotaStore.totalRemaining" type="primary" class="quota-badge">
              <text class="quota-number" :class="{ 'is-zero': !quotaStore.canPlan }">
                {{ quotaStore.totalRemaining }}
              </text>
            </wd-badge>
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

        <view class="quota-progress-box">
          <wd-progress :percentage="quotaPercentage" color="#FF6B35" />
        </view>
      </view>
    </wd-card>

    <!-- 获取次数 -->
    <view class="section-title-wrap">
      <wd-divider>获取更多次数</wd-divider>
    </view>

    <wd-cell-group border class="action-cells">
      <wd-cell title="观看视频广告" label="看一段短视频即可获得规划机会" center @click="watchAd">
        <template #icon>
          <view class="cell-icon-wrap ad-icon-bg">
            <wd-icon name="video" size="40rpx" color="#4EADBD" />
          </view>
        </template>
        <template #default>
          <view class="cell-reward">
            <wd-tag type="primary" plain>+1次</wd-tag>
            <view class="cell-remain">余{{ quotaStore.adCanWatch }}次</view>
          </view>
        </template>
      </wd-cell>

      <wd-cell title="邀请好友使用" label="好友首次使用后双方各得奖励" center is-link @click="inviteFriend">
        <template #icon>
          <view class="cell-icon-wrap invite-icon-bg">
            <wd-icon name="user-add" size="40rpx" color="#4ade80" />
          </view>
        </template>
        <template #default>
          <view class="cell-reward">
            <wd-tag type="success" plain>+3次</wd-tag>
            <view class="cell-remain">已邀{{ quotaStore.data.totalInvites }}人</view>
          </view>
        </template>
      </wd-cell>
    </wd-cell-group>

    <!-- 统计 -->
    <view class="section-title-wrap">
      <wd-divider>使用统计</wd-divider>
    </view>

    <wd-card class="stats-card">
      <wd-grid :column="3" :border="false">
        <wd-grid-item>
          <view class="stat-item">
            <view class="stat-value">{{ historyStore.count }}</view>
            <view class="stat-label">行程总数</view>
          </view>
        </wd-grid-item>
        <wd-grid-item>
          <view class="stat-item">
            <view class="stat-value">{{ totalCities }}</view>
            <view class="stat-label">到访城市</view>
          </view>
        </wd-grid-item>
        <wd-grid-item>
          <view class="stat-item">
            <view class="stat-value">{{ totalDays }}</view>
            <view class="stat-label">旅行天数</view>
          </view>
        </wd-grid-item>
      </wd-grid>
    </wd-card>

    <!-- 其他操作 -->
    <view class="menu-section">
      <wd-cell-group border>
        <wd-cell title="意见反馈" icon="chat" is-link @click="submitFeedback" />
        <wd-cell title="清空所有行程" is-link icon="delete" @click="clearHistory" />
        <wd-cell title="关于出门啦" is-link icon="info-circle" @click="showAbout" />
      </wd-cell-group>
    </view>

    <view class="footer-text">
      <view class="footer-ver">出门啦 v2.0.0</view>
      <view class="footer-powered">Powered by AI 🎒</view>
    </view>

    <view class="safe-area-bottom" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useQuotaStore } from '@/stores/quota'
import { useHistoryStore } from '@/stores/history'
import { useQuotaAction } from '@/composables/useQuotaAction'

const quotaStore = useQuotaStore()
const historyStore = useHistoryStore()
const { handleWatchAd: watchAd, handleInvite: inviteFriend } = useQuotaAction()

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

const quotaPercentage = computed(() => {
  const total = 5 + 3 + 10 // 假设一个最大基数
  return Math.min(100, (quotaStore.totalRemaining / total) * 100)
})

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

function submitFeedback() {
  // #ifdef MP-WEIXIN
  // 微信小程序内置反馈入口
  if (wx.openCustomerServiceChat) {
    wx.openCustomerServiceChat({
      extInfo: { url: '' },
      corpId: '',
      fail: () => {
        uni.showModal({
          title: '意见反馈',
          editable: true,
          placeholderText: '请输入你的建议或问题...',
          confirmColor: '#FF6B35',
          success: (res: any) => {
            if (res.confirm && res.content) {
              uni.showToast({ title: '感谢反馈！', icon: 'success' })
            }
          }
        })
      }
    })
    return
  }
  // #endif
  uni.showModal({
    title: '意见反馈',
    editable: true,
    placeholderText: '请输入你的建议或问题...',
    confirmColor: '#FF6B35',
    success: (res: any) => {
      if (res.confirm && res.content) {
        uni.showToast({ title: '感谢反馈！', icon: 'success' })
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
  padding: 48rpx 40rpx 32rpx;
}

.avatar-ring {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background-color: #FFFFFF;
  border: 6rpx solid #FF6B35;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.15);
}

.avatar-emoji {
  font-size: 64rpx;
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
.quota-card {
  margin: 0 24rpx 24rpx !important;
  border-radius: 32rpx !important;
  overflow: hidden;
  background: rgba(255, 107, 53, 0.05) !important;
  border: 1rpx solid rgba(255, 107, 53, 0.1) !important;
}

.quota-dashboard {
  padding: 8rpx;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;
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
  gap: 48rpx;
}

.quota-number-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 20rpx;
}

.quota-number {
  font-size: 88rpx;
  font-weight: 800;
  color: #FF6B35;
  line-height: 1;
}

.quota-number.is-zero {
  color: #fa4350;
}

.quota-label-unit {
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 12rpx;
}

.quota-breakdown {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
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

.quota-progress-box {
  margin-top: 32rpx;
}

/* Action Cells */
.action-cells {
  margin: 0 24rpx !important;
  border-radius: 24rpx;
  overflow: hidden;
}

.cell-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.ad-icon-bg {
  background-color: rgba(78, 173, 189, 0.1);
}

.invite-icon-bg {
  background-color: rgba(74, 222, 128, 0.1);
}

.cell-reward {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}

.cell-remain {
  font-size: 20rpx;
  color: #9CA3AF;
}

.section-title-wrap {
  padding: 40rpx 40rpx 20rpx;
}

/* Stats */
.stats-card {
  margin: 0 24rpx !important;
  border-radius: 24rpx !important;
}

.stat-item {
  text-align: center;
  padding: 16rpx 0;
}

.stat-value {
  font-size: 40rpx;
  font-weight: 800;
  color: #FF6B35;
  margin-bottom: 4rpx;
}

.stat-label {
  font-size: 22rpx;
  color: #9CA3AF;
}

/* Menu */
.menu-section {
  margin-top: 40rpx;
  padding: 0 24rpx;
}

.menu-section :deep(.wd-cell-group) {
  border-radius: 24rpx;
  overflow: hidden;
}

/* Footer */
.footer-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0 40rpx;
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
