<template>
  <div class="app-shell">
    <router-view />
  </div>
</template>

<script setup lang="ts">
/**
 * AppRoot —— 位于 message / dialog provider 的「内层」。
 * 只做一件事：把 provider 提供的实例注册到全局反馈桥，
 * 让任意业务代码（含异步函数）都能弹提示。
 */
import { useDialog, useMessage } from 'naive-ui'
import { registerFeedback } from '@/utils/feedback'

registerFeedback(useMessage(), useDialog())
</script>
