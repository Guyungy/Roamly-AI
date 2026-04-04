<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('🚀 旅途星辰小程序启动')
})
</script>

<style>
/* 全局基础样式 */
page {
  background-color: #0a0a0f;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  line-height: 1.6;
}

/* 暗色主题统一变量 */
:root {
  --color-bg-primary: #0a0a0f;
  --color-bg-secondary: #15132b;
  --color-bg-tertiary: #1a1035;
  --color-bg-card: rgba(255, 255, 255, 0.04);
  --color-bg-card-hover: rgba(255, 255, 255, 0.08);
  --color-border: rgba(255, 179, 71, 0.15);
  --color-border-light: rgba(255, 255, 255, 0.06);
  --color-brand: #FFD699;
  --color-brand-dim: rgba(255, 179, 71, 0.4);
  --color-accent: #51cbce;
  --color-text-primary: #f0f0f0;
  --color-text-secondary: rgba(255, 255, 255, 0.55);
  --color-text-muted: rgba(255, 255, 255, 0.3);
  --color-success: #4ade80;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --radius-sm: 12rpx;
  --radius-md: 20rpx;
  --radius-lg: 32rpx;
  --radius-full: 999rpx;
}

/* 玻璃卡片统一样式 */
.glass-card {
  background: var(--color-bg-card);
  border: 1rpx solid var(--color-border);
  border-radius: var(--radius-md);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* 金色渐变文字 */
.text-brand {
  background: linear-gradient(135deg, #FFD699, #FFB347);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 主按钮样式 */
.btn-primary {
  background: linear-gradient(135deg, #FFD699 0%, #FFB347 100%);
  color: #0a0a0f;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-full);
  padding: 24rpx 60rpx;
  font-size: 30rpx;
  letter-spacing: 2rpx;
  box-shadow: 0 8rpx 32rpx rgba(255, 179, 71, 0.25);
}

.btn-primary:active {
  opacity: 0.85;
  transform: scale(0.98);
}

/* 次要按钮 */
.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-brand);
  border: 1rpx solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 20rpx 48rpx;
  font-size: 28rpx;
}

/* 标签样式 */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 8rpx 24rpx;
  border-radius: var(--radius-full);
  font-size: 24rpx;
  background: rgba(255, 179, 71, 0.1);
  color: var(--color-brand);
  border: 1rpx solid rgba(255, 179, 71, 0.2);
}

.tag-active {
  background: linear-gradient(135deg, #FFD699, #FFB347);
  color: #0a0a0f;
  border-color: transparent;
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
