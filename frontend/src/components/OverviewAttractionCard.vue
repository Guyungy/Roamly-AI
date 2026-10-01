<template>
  <div class="swiper-slide" :class="{ 'swiper-slide-active': active }" @mouseenter="emit('hover')" @focusin="emit('hover')">
    <div class="swiper-slide-img">
      <!--
        不要用 loading="lazy"：这是在横向轮播里，一屏外的卡片浏览器判定为「不在视口」，
        永远不加载 → 翻页过去的一瞬间是空白；而且 remote 图 404 时 @error 也不会及时触发，
        兜底插画换不上。单张图体量都很小（矢量 data URL 或缩略图），直接 eager 更稳。
      -->
      <img
        :src="imageSrc"
        :alt="item.name"
        loading="eager"
        decoding="async"
        @load="onImageLoad"
        @error="emit('image-error', $event)"
      />
      <span class="slide-day tabular-nums">{{ t('common.dayNumber', { day: item.dayNumber }) }}</span>
      <svg class="slide-wave" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25" class="shape-fill"></path>
        <path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z" opacity=".5" class="shape-fill"></path>
        <path d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z" class="shape-fill"></path>
      </svg>
    </div>

    <div class="swiper-slide-content">
      <h2 :title="item.name">{{ item.name }}</h2>
      <p class="slide-desc">{{ item.description || item.address || t('common.noData') }}</p>
      <!--
        CTA 常显：原来是 hover 才撑开，鼠标扫过时下方内容会整体跳一下，
        而且触屏没有 hover，等于这趟「跳到对应天」的入口根本点不到。
      -->
      <button
        type="button"
        class="show-more"
        :aria-label="`${t('result.side.days')} · ${t('common.dayNumber', { day: item.dayNumber })}`"
        @click="emit('select-day', item.dayArrayIndex)"
      >
        <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3"></path>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

type OverviewAttractionItem = {
  name: string
  address: string
  visit_duration: number
  description: string
  dayArrayIndex: number
  dayNumber: number
}

defineProps<{
  item: OverviewAttractionItem
  imageSrc: string
  active: boolean
}>()

const emit = defineEmits<{
  (e: 'hover'): void
  (e: 'select-day', dayArrayIndex: number): void
  (e: 'image-error', event: Event): void
}>()

const { t } = useI18n()

/*
 * 照片是异步把插画替换掉的，直接换 src 会「啪」地一跳。
 * 每次 load 重放一次淡入，替换看起来就是渐变而不是闪切。
 */
const onImageLoad = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.classList.remove('is-loaded')
  void img.offsetWidth // 强制重排：同名 class 不加这一次重排是不会重放动画的
  img.classList.add('is-loaded')
}
</script>

<style scoped lang="scss">
.swiper-slide {
  /*
   * 宽高都由外层给：宽度来自 Swiper 的 slidesPerView，高度来自
   * Result.vue 里 .overview-swiper .swiper-wrapper 的 --overview-card-height。
   * 这里保留同值，便于单独预览这个组件。
   */
  width: 10.75rem;
  height: var(--overview-card-height, 27rem);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  position: relative;
  overflow: hidden;
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  box-shadow: var(--sh-sm);
  transition: box-shadow var(--dur-base) var(--ease-out);
}

.swiper-slide-active {
  box-shadow: var(--sh-md);
}

.swiper-slide-img {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  height: 17rem;
  overflow: hidden;
  line-height: 0;
  background: var(--c-bg-sunken);

  img {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--dur-slow) var(--ease-out);

    /* 每次 load（插画首次绘制、或照片替换插画）重放一次淡入，避免「啪」地闪切 */
    &.is-loaded {
      animation: overview-image-in 0.45s var(--ease-out) both;
    }
  }
}

.swiper-slide-active:hover .swiper-slide-img img {
  transform: scale(1.06);
}

/* 「第 N 天」角标：既是信息，也让右下角的箭头按钮有了明确语义 */
.slide-day {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  padding: 4px 10px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.92);
  color: var(--c-ink-800);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  line-height: 1.4;
  backdrop-filter: blur(6px);
  box-shadow: var(--sh-xs);
}

.slide-wave {
  position: absolute;
  bottom: -1px;
  left: 0;
  z-index: 1;
  display: block;
  width: calc(300% + 1.3px);
  height: 4rem;
  transform: scaleY(-1);
}

.shape-fill {
  fill: var(--c-bg-card);
}

.swiper-slide-content {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 2px 18px 16px;
  background: var(--c-bg-card);

  h2 {
    margin: 0 0 6px;
    max-width: 100%;
    color: var(--c-ink-900);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
    line-height: 1.35;
    letter-spacing: 0.01em;
    /* nowrap + ellipsis 必须配 overflow:hidden，否则长景点名会被硬切/越界 */
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.slide-desc {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--c-ink-500);
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}

.show-more {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: auto 0 0 auto;
  padding: 0;
  border: none;
  border-radius: var(--r-full);
  background: var(--c-brand-500);
  color: #fff;
  cursor: pointer;
  box-shadow: var(--sh-brand);
  transition:
    background-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--c-brand-600);
    transform: translateX(2px);
  }

  &:focus-visible {
    outline: 2px solid var(--c-brand-300);
    outline-offset: 2px;
  }
}

@keyframes overview-image-in {
  from {
    opacity: 0.15;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .swiper-slide,
  .swiper-slide-img img,
  .show-more {
    transition: none;
    animation: none;
  }
}
</style>
