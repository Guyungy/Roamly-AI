<template>
  <!--
    custom-style 里**不能**写 display：wd-overlay 隐藏时靠注入 display:none 收起，
    内联样式优先级更高会把它盖掉，于是遮罩常驻、整页被白色蒙层糊住（实测踩过）。
    居中改用 flex 容器的子元素 margin:auto，效果一样但不碰 display。
  -->
  <wd-overlay :show="visible" custom-style="background: rgba(255,255,255,0.92);">
    <view class="loading-content" @tap.stop>
      <wd-loading size="60px" color="#FF6B35" />
      <text class="loading-title">正在为你规划旅程~</text>
      <text class="loading-progress">{{ progress || '正在初始化...' }}</text>
    </view>
  </wd-overlay>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean; progress?: string }>()
</script>

<style scoped>
/* 用 margin:auto 居中，不依赖父层的 display —— 见模板里的注释 */
.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: auto;
  padding: 60rpx;
}
.loading-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A2E;
  margin-top: 32rpx;
  margin-bottom: 12rpx;
}
.loading-progress {
  font-size: 26rpx;
  color: #9CA3AF;
  text-align: center;
}
</style>
