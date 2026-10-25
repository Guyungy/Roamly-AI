<!--
  一键导航按钮（Web 触发挂载）。
  直接渲染成真实的 <a href>：点击交给浏览器新开标签页打开腾讯地图路线规划，
  无 JS / 弱网 / 弹窗拦截时浏览器照样跟随链接 —— 这就是「弱网链接兜底」的落点。
  没有坐标时父级不渲染本组件。
-->
<template>
  <a
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    class="nav-btn"
    :class="{ 'nav-btn--quiet': quiet }"
    :title="t('result.nav.buttonTitle')"
    @click="handleClick"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7-4.6-7-11a7 7 0 1 1 14 0c0 6.4-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
    <span>{{ t('result.nav.label') }}</span>
    <svg class="nav-btn__external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M19 5 9 15" />
      <path d="M14 15h2a0 0 0 0 0 0 0v0a3 3 0 0 0 2-2.8" />
    </svg>
  </a>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  url: string
  quiet?: boolean
}>()

const emit = defineEmits<{
  (e: 'clicked'): void
}>()

const { t } = useI18n()

const handleClick = () => emit('clicked')
</script>

<style scoped lang="scss">
.nav-btn {
  /* 语义上是"去导航"的动作，做成行内链接样式更贴"跳到新标签页"的心智 */
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--r-full);
  border: 1px solid var(--c-brand-300);
  background: var(--c-brand-50, rgba(255, 107, 53, 0.08));
  color: var(--c-brand-700, #e85520);
  font-size: var(--fs-xs, 12px);
  font-weight: var(--fw-medium, 500);
  line-height: 1.4;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);

  svg {
    flex: none;
    width: 14px;
    height: 14px;
  }

  &:hover,
  &:focus-visible {
    background: var(--c-brand-500, #ff6b35);
    border-color: var(--c-brand-500, #ff6b35);
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid var(--c-brand-300);
    outline-offset: 2px;
  }

  &:active {
    transform: translateY(1px);
  }

  .nav-btn__external {
    opacity: 0.7;
  }
}

/* 安静态：底纹更浅，用于不想抢视线的场景（如卡片头部） */
.nav-btn--quiet {
  background: transparent;
  border-color: var(--c-border);
  color: var(--c-ink-500, #667);
}

@media (prefers-reduced-motion: reduce) {
  .nav-btn {
    transition: none;
  }

  .nav-btn:active {
    transform: none;
  }
}
</style>