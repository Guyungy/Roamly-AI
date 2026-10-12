<template>
  <header class="app-nav" :class="{ 'app-nav--solid': scrolled }">
    <div class="app-nav__inner layout-container">
      <!-- 品牌：文案走 i18n（zh 出门啦 / en·ja Chumenla），避免英文界面里混着中文品牌名 -->
      <button class="app-nav__brand" type="button" @click="emit('brand-click')">
        <span class="app-nav__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 3.5 2.8 10.7c-.9.34-.83 1.63.1 1.87l7.1 1.84 1.84 7.1c.24.93 1.53 1 1.87.1L21.5 3.5Z" />
            <path d="m10 13.5 5-5" />
          </svg>
        </span>
        <span class="app-nav__name">{{ t('app.brand') }}</span>
      </button>

      <nav class="app-nav__actions">
        <!-- 已登录：用户菜单 -->
        <n-dropdown
          v-if="auth.isSignedIn"
          trigger="click"
          placement="bottom-end"
          :options="userMenuOptions"
          @select="handleUserMenuSelect"
        >
          <button class="nav-pill" type="button">
            <span class="nav-pill__dot" aria-hidden="true"></span>
            <span class="nav-pill__text">{{ auth.displayName || t('auth.signedIn') }}</span>
            <svg class="nav-pill__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </n-dropdown>

        <!-- 未登录：登录入口 -->
        <button v-else class="nav-pill" type="button" @click="emit('auth-click')">
          <span class="nav-pill__text">{{ t('auth.login') }}</span>
        </button>

        <n-select
          v-model:value="locale"
          class="nav-lang"
          size="small"
          :options="localeOptions"
          :consistent-menu-width="false"
          :aria-label="t('app.language.label')"
        />

        <n-button class="nav-cta" type="primary" size="small" @click="handleCtaClick">
          {{ t('home.nav.cta') }}
        </n-button>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NSelect, type DropdownOption } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const auth = useAuthStore()

const emit = defineEmits<{
  (e: 'brand-click'): void
  (e: 'cta-click'): void
  (e: 'auth-click'): void
  (e: 'sign-out'): void
}>()

const handleCtaClick = () => emit('cta-click')

const localeOptions = computed(() => [
  { label: t('app.language.zh'), value: 'zh-CN' },
  { label: t('app.language.ja'), value: 'ja-JP' },
  { label: t('app.language.en'), value: 'en-US' },
])

const userMenuOptions = computed<DropdownOption[]>(() => [
  { key: 'email', label: auth.user?.email ?? '', disabled: true },
  { type: 'divider', key: 'divider' },
  { key: 'sign-out', label: t('auth.signOut') },
])

const handleUserMenuSelect = (key: string) => {
  if (key === 'sign-out') emit('sign-out')
}

/**
 * 滚动后给导航加实底与描边。
 * 之前是「永远透明」，压在内容上时字与图会糊在一起；
 * 现在滚过 8px 就落到白底，保证任何位置都读得清。
 */
const scrolled = ref(false)
const handleScroll = () => {
  scrolled.value = window.scrollY > 8
}

onMounted(() => {
  handleScroll()
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', handleScroll))
</script>

<style scoped>
.app-nav {
  position: fixed;
  inset: 0 0 auto;
  z-index: var(--z-sticky);
  height: var(--nav-h);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid transparent;
  transition: background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

.app-nav--solid {
  background: rgba(255, 255, 255, 0.92);
  border-bottom-color: var(--c-border);
  box-shadow: var(--sh-xs);
}

.app-nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  height: 100%;
}

/* ---------------- 品牌 ---------------- */
.app-nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  min-width: 0;
  color: var(--c-ink-900);
  transition: opacity var(--dur-fast) var(--ease-out);
}

.app-nav__brand:hover {
  opacity: 0.78;
}

.app-nav__logo {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(135deg, var(--c-brand-400), var(--c-brand-600));
  box-shadow: 0 2px 8px rgba(232, 85, 32, 0.28);
}

.app-nav__logo svg {
  width: 16px;
  height: 16px;
}

.app-nav__name {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* ---------------- 右侧动作区 ---------------- */
.app-nav__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 13px;
  max-width: 172px;
  border-radius: var(--r-full);
  border: 1px solid var(--c-border);
  background: #fff;
  color: var(--c-ink-700);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.nav-pill:hover {
  border-color: var(--c-brand-300);
  color: var(--c-brand-700);
  box-shadow: var(--sh-xs);
}

.nav-pill__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.16);
}

.nav-pill__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-pill__caret {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  color: var(--c-ink-400);
}

.nav-lang {
  width: 104px;
}

/* Naive 的圆角走 CSS 变量，在根元素上改就能被内部元素继承（比逐个 :deep 覆盖稳） */
.nav-lang :deep(.n-base-selection) {
  --n-border-radius: var(--r-full) !important;
}

.nav-cta {
  --n-border-radius: var(--r-full) !important;
  font-weight: var(--fw-medium);
  padding: 0 16px;
}

/* ---------------- 窄屏收口 ---------------- */
@media (max-width: 640px) {
  .app-nav__inner {
    gap: var(--sp-2);
  }

  .app-nav__actions {
    gap: var(--sp-2);
  }

  .nav-lang {
    width: 88px;
  }

  .nav-pill {
    max-width: 108px;
    padding: 0 10px;
  }
}

@media (max-width: 430px) {
  .app-nav__name {
    display: none; /* 只留 logo，给右侧动作让位 */
  }

  .nav-lang {
    width: 80px;
  }

  .nav-cta {
    padding: 0 12px;
    font-size: var(--fs-xs);
  }
}
</style>
