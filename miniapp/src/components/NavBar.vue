<template>
  <wd-navbar
    :title="title || '出门啦'"
    :left-arrow="showBack"
    :safe-area-inset-top="true"
    :fixed="true"
    :placeholder="true"
    :bordered="true"
    custom-style="background: var(--color-bg-primary, #FFFFFF);"
    @click-left="handleBack"
  >
    <template #title>
      <view class="nav-brand">
        <text class="brand-emoji">🎒</text>
        <text class="brand-name">{{ title || '出门啦' }}</text>
      </view>
    </template>
    <template v-if="$slots.right" #right>
      <slot name="right" />
    </template>
  </wd-navbar>
</template>

<script setup lang="ts">
defineProps<{
  showBack?: boolean
  title?: string
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

function handleBack() {
  emit('back')
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/landing/index' }) })
}
</script>

<style scoped>
.nav-brand {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.brand-emoji {
  font-size: 36rpx;
}
.brand-name {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--color-brand, #FF6B35);
}
</style>
