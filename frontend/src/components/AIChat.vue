<template>
  <div class="ai-chat">
    <!-- 悬浮入口：只在有行程时出现，空状态页不出现以免误导 -->
    <button
      v-if="tripPlan"
      type="button"
      class="ai-chat__fab"
      :class="{ 'is-open': chatOpen }"
      :aria-label="chatOpen ? t('common.close') : t('result.chat.toggle')"
      :aria-expanded="chatOpen"
      @click="chatOpen = !chatOpen"
    >
      <svg v-if="!chatOpen" class="ai-chat__fab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else class="ai-chat__fab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span v-if="!chatOpen" class="ai-chat__fab-label">{{ t('result.chat.toggle') }}</span>
    </button>

    <!-- 对话面板：桌面右下浮层，窄屏整屏 -->
    <Transition name="chat-panel">
      <section v-if="chatOpen" class="ai-chat__panel" role="dialog" aria-modal="false" :aria-label="t('result.chat.title')">
        <header class="ai-chat__head">
          <span class="ai-chat__title">
            <span class="ai-chat__live" aria-hidden="true"></span>
            {{ t('result.chat.title') }}
          </span>
          <n-button quaternary circle size="small" :aria-label="t('common.close')" @click="chatOpen = false">
            <template #icon>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </template>
          </n-button>
        </header>

        <div ref="chatMessagesRef" class="ai-chat__stream">
          <div v-if="chatHistory.length === 0" class="chat-intro">
            <p class="chat-intro__text">{{ t('result.chat.welcome') }}</p>
            <div class="chat-intro__chips">
              <n-button
                v-for="question in quickQuestions"
                :key="question.labelKey"
                size="small"
                secondary
                :disabled="chatLoading || !tripPlan"
                @click="sendQuickQuestion(t(question.questionKey))"
              >
                {{ t(question.labelKey) }}
              </n-button>
            </div>
          </div>

          <template v-for="(msg, idx) in chatHistory" :key="`chat-${idx}`">
            <p v-if="msg.content" class="bubble" :class="`bubble--${msg.role}`">{{ msg.content }}</p>
          </template>

          <p v-if="showTyping" class="bubble bubble--assistant is-typing">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </p>
        </div>

        <footer class="ai-chat__composer">
          <n-input
            ref="inputRef"
            v-model:value="chatInput"
            type="textarea"
            class="composer__input"
            :autosize="{ minRows: 2, maxRows: 5 }"
            :placeholder="chatPlaceholder"
            :disabled="!tripPlan"
            @keydown.enter.exact.prevent="sendChatMessage"
          />
          <n-button
            :type="chatLoading ? 'warning' : 'primary'"
            :disabled="!chatLoading && (!chatInput.trim() || !tripPlan)"
            class="composer__send"
            @click="chatLoading ? stopChat() : sendChatMessage()"
          >
            {{ chatLoading ? t('result.chat.stop') : t('common.send') }}
          </n-button>
        </footer>
      </section>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NInput } from 'naive-ui'
import { chatWithTrip } from '@/services/api'
import type { ChatMessage, TripPlan } from '@/types'

const props = defineProps<{
  tripPlan: TripPlan | null
}>()

const { t } = useI18n()
const chatOpen = ref(false)
const chatInput = ref('')
const chatHistory = ref<ChatMessage[]>([])
const chatLoading = ref(false)
const chatMessagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof NInput> | null>(null)
let chatAbort: AbortController | null = null

/** 回复第一个字到达之前显示打字指示器，避免同时出现空气泡和三个点 */
const showTyping = computed(() => {
  if (!chatLoading.value) return false
  const last = chatHistory.value[chatHistory.value.length - 1]
  return !(last && last.role === 'assistant' && last.content)
})

const quickQuestions = [
  {
    labelKey: 'result.chat.quickPriceLabel',
    questionKey: 'result.chat.quickPriceQuestion',
  },
  {
    labelKey: 'result.chat.quickSuitabilityLabel',
    questionKey: 'result.chat.quickSuitabilityQuestion',
  },
  {
    labelKey: 'result.chat.quickMealLabel',
    questionKey: 'result.chat.quickMealQuestion',
  },
]

const chatPlaceholder = computed(() => {
  if (!props.tripPlan) return t('result.noTripPlanDesc')
  return t('result.chat.placeholder')
})

/** 消息流自己滚（不用 n-drawer 的内置滚动区，这样滚动容器始终受我们控制） */
const scrollChatToBottom = () => {
  nextTick(() => {
    if (chatMessagesRef.value) {
      chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
    }
  })
}

watch(chatOpen, (open) => {
  if (open) {
    scrollChatToBottom()
    nextTick(() => inputRef.value?.focus())
  }
})

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && chatOpen.value) {
    chatOpen.value = false
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const sendQuickQuestion = (q: string) => {
  chatInput.value = q
  void sendChatMessage()
}

const stopChat = () => {
  chatAbort?.abort()
}

const sendChatMessage = async () => {
  const text = chatInput.value.trim()
  if (!text || chatLoading.value || !props.tripPlan) return

  chatHistory.value.push({ role: 'user', content: text })
  chatInput.value = ''
  chatLoading.value = true
  scrollChatToBottom()

  // 先占位一条空的助手消息，流式回复逐字写入它
  const replyIndex = chatHistory.value.push({ role: 'assistant', content: '' }) - 1
  const controller = new AbortController()
  chatAbort = controller

  try {
    const res = await chatWithTrip(
      {
        message: text,
        trip_plan: props.tripPlan as any,
        history: chatHistory.value.slice(0, -2),
      },
      (partial) => {
        chatHistory.value[replyIndex].content = partial
        scrollChatToBottom()
      },
      controller.signal
    )

    if (res.success && res.reply) {
      chatHistory.value[replyIndex].content = res.reply
    }
    if (!chatHistory.value[replyIndex].content) {
      chatHistory.value[replyIndex].content = t('result.chat.replyFallback')
    }
  } catch (err) {
    console.error('Chat error:', err)
    // 已经渲染出来的内容要保留，只把失败原因补在后面
    const partial = chatHistory.value[replyIndex].content
    const reason = err instanceof Error && err.message ? err.message : t('result.chat.networkError')
    chatHistory.value[replyIndex].content = partial ? `${partial}\n\n(${reason})` : reason
  } finally {
    chatAbort = null
    chatLoading.value = false
    scrollChatToBottom()
  }
}
</script>

<style scoped lang="scss">
/* ── 悬浮球 ───────────────────────────────────────────── */
.ai-chat__fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 950;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: 52px;
  padding: 0 var(--sp-5) 0 15px;
  border: none;
  border-radius: var(--r-full);
  background: linear-gradient(135deg, var(--c-brand-400), var(--c-brand-600));
  color: #fff;
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  cursor: pointer;
  box-shadow: var(--sh-brand);
  transition:
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out),
    padding var(--dur-fast) var(--ease-out);

  &:hover {
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 2px solid var(--c-brand-300);
    outline-offset: 2px;
  }

  /* 展开态收成纯图标圆钮，方便再点一次关掉 */
  &.is-open {
    width: 44px;
    height: 44px;
    padding: 0;
    justify-content: center;
    gap: 0;
  }
}

.ai-chat__fab-icon {
  width: 20px;
  height: 20px;
  flex: none;
}

/* ── 面板 ─────────────────────────────────────────────── */
.ai-chat__panel {
  position: fixed;
  right: 28px;
  bottom: 96px;
  z-index: 950;
  display: flex;
  flex-direction: column;
  width: 400px;
  max-width: calc(100vw - 56px);
  height: min(620px, calc(100vh - 148px));
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-lg);
  overflow: hidden;
}

.chat-panel-enter-active,
.chat-panel-leave-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.chat-panel-enter-from,
.chat-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.ai-chat__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex: none;
  padding: var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--c-border);
}

.ai-chat__title {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.ai-chat__live {
  width: 7px;
  height: 7px;
  border-radius: var(--r-full);
  background: var(--c-success);
  box-shadow: 0 0 0 3px var(--c-success-soft);
}

.ai-chat__stream {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-5);
}

/* ── 开场与气泡 ───────────────────────────────────────── */
.chat-intro {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-2) 0;
}

.chat-intro__text {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  color: var(--c-ink-600);
}

.chat-intro__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.bubble {
  margin: 0;
  max-width: 86%;
  padding: 10px 14px;
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.bubble--user {
  align-self: flex-end;
  background: var(--c-brand-600);
  color: #fff;
  border-radius: var(--r-md) var(--r-md) var(--r-xs) var(--r-md);
}

.bubble--assistant {
  align-self: flex-start;
  background: var(--c-bg-soft);
  border: 1px solid var(--c-border);
  color: var(--c-ink-800);
  border-radius: var(--r-md) var(--r-md) var(--r-md) var(--r-xs);
}

.is-typing {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 12px 14px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  background: var(--c-ink-300);
  animation: chat-dot 1.2s var(--ease-in-out) infinite;

  &:nth-child(2) {
    animation-delay: 0.15s;
  }

  &:nth-child(3) {
    animation-delay: 0.3s;
  }
}

@keyframes chat-dot {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* ── 输入区 ───────────────────────────────────────────── */
.ai-chat__composer {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
  border-top: 1px solid var(--c-border);
  background: var(--c-bg-card);
}

.composer__input {
  flex: 1;
  min-width: 0;
}

.composer__send {
  flex: none;
  min-width: 68px;
}

/* ── 窄屏：面板整屏 ───────────────────────────────────── */
@media (max-width: 560px) {
  .ai-chat__fab {
    right: 18px;
    bottom: 24px;
    height: 48px;
    padding: 0 16px;

    /* 面板已占满屏，球收起来免得压在上面 */
    &.is-open {
      display: none;
    }
  }

  .ai-chat__fab-label {
    display: none;
  }

  .ai-chat__panel {
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 100%;
    height: 100%;
    height: 100dvh;
    border: none;
    border-radius: 0;
  }

  .chat-panel-enter-from,
  .chat-panel-leave-to {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-chat__fab,
  .chat-panel-enter-active,
  .chat-panel-leave-active,
  .dot {
    transition: none;
    animation: none;
  }
}
</style>
