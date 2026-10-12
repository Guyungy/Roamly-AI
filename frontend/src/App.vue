<template>
  <n-config-provider
    :theme-overrides="themeOverrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
  >
    <n-message-provider :max="3" placement="top">
      <n-dialog-provider>
        <AppRoot />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
/**
 * 应用外壳
 * ------------------------------------------------------------------
 * 只负责两件事：
 *   1. 把 Naive UI 的主题、语言、日期语言注入下去
 *   2. 建立 message / dialog 的 provider 树
 *
 * 注意：这里刻意不再全局注册组件库（app.use(Antd) 那种全量引入）。
 * Naive UI 组件在各文件里按需 import，构建产物只含真正用到的部分。
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  dateEnUS,
  dateJaJP,
  dateZhCN,
  enUS,
  jaJP,
  zhCN,
} from 'naive-ui'
import { setAppLocale, type AppLocale } from '@/i18n'
import { themeOverrides } from '@/theme/naive'
import AppRoot from '@/components/AppRoot.vue'

const { t, locale } = useI18n()

/** 让组件库自带的文案（日期面板、空状态等）跟随站点语言 */
const naiveLocale = computed(() => {
  switch (locale.value as AppLocale) {
    case 'en-US':
      return enUS
    case 'ja-JP':
      return jaJP
    default:
      return zhCN
  }
})

const naiveDateLocale = computed(() => {
  switch (locale.value as AppLocale) {
    case 'en-US':
      return dateEnUS
    case 'ja-JP':
      return dateJaJP
    default:
      return dateZhCN
  }
})

// 语言切换后持久化，并同步浏览器标签标题
watch(
  locale,
  (nextLocale) => {
    setAppLocale(nextLocale as AppLocale)
    document.title = t('app.title')
  },
  { immediate: true }
)
</script>
