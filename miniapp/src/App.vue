<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('🎒 出门啦小程序启动')
})
</script>

<style>
/* 全局基础样式 —— 白底可爱年轻化 */
page {
  background-color: #F5F6FA;
  color: #1A1A2E;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  line-height: 1.6;
}

/* 主题变量 */
:root {
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #F5F6FA;
  --color-bg-tertiary: #EEF0F5;
  --color-bg-card: #FFFFFF;
  --color-bg-card-hover: #F9FAFB;
  --color-border: #E8ECF2;
  --color-border-light: #F0F2F5;
  --color-brand: #FF6B35;
  --color-brand-light: #FFF0E8;
  --color-brand-dim: rgba(255, 107, 53, 0.15);
  --color-accent: #FFB830;
  --color-accent-light: #FFF8E8;
  --color-text-primary: #1A1A2E;
  --color-text-secondary: #6B7280;
  --color-text-muted: #9CA3AF;
  --color-success: #10B981;
  --color-danger: #EF4444;
  --color-warning: #F59E0B;
  --radius-sm: 16rpx;
  --radius-md: 24rpx;
  --radius-lg: 32rpx;
  --radius-full: 999rpx;
}

/* 卡片 */
.glass-card {
  background: var(--color-bg-card);
  border: 1rpx solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

/* 品牌色文字 */
.text-brand {
  color: var(--color-brand);
}

/* 主按钮 */
.btn-primary {
  background: linear-gradient(135deg, #FF6B35 0%, #FF8F5E 100%);
  color: #FFFFFF;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-full);
  padding: 24rpx 60rpx;
  font-size: 30rpx;
  letter-spacing: 2rpx;
  box-shadow: 0 8rpx 24rpx rgba(255, 107, 53, 0.2);
}

.btn-primary:active {
  opacity: 0.85;
  transform: scale(0.98);
}

/* 次要按钮 */
.btn-secondary {
  background: var(--color-brand-light);
  color: var(--color-brand);
  border: 1rpx solid rgba(255, 107, 53, 0.15);
  border-radius: var(--radius-full);
  padding: 20rpx 48rpx;
  font-size: 28rpx;
}

/* 标签 */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 8rpx 24rpx;
  border-radius: var(--radius-full);
  font-size: 24rpx;
  background: var(--color-brand-light);
  color: var(--color-brand);
  border: none;
}

.tag-active {
  background: linear-gradient(135deg, #FF6B35, #FF8F5E);
  color: #FFFFFF;
  font-weight: 600;
}

/* 分隔线 */
.divider {
  height: 1rpx;
  background: var(--color-border-light);
  margin: 32rpx 0;
}

/* 安全区适配 */
.safe-area-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
