<template>
  <view class="chat-page">
    <NavBar />

    <!-- 消息区域 -->
    <scroll-view
      scroll-y
      class="chat-messages"
      :scroll-into-view="scrollToId"
      scroll-with-animation
    >
      <!-- 欢迎消息 -->
      <view class="welcome-section" v-if="messages.length === 0">
        <view class="welcome-card glass-card">
          <text class="welcome-icon">✦</text>
          <text class="welcome-title">旅途星辰 AI</text>
          <text class="welcome-desc" v-if="tripStore.hasTripPlan">
            你好！我已经了解了你的{{ tripStore.tripPlan?.city }}旅行计划，有什么想问的吗？
          </text>
          <text class="welcome-desc" v-else>
            你好！请先在首页创建旅行计划，我就能回答关于行程的问题啦~
          </text>

          <!-- 快捷问题 -->
          <view v-if="tripStore.hasTripPlan" class="quick-questions">
            <view
              v-for="q in quickQuestions"
              :key="q"
              class="quick-item"
              @tap="sendMessage(q)"
            >
              <text class="quick-text">{{ q }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 消息列表 -->
      <view
        v-for="(msg, index) in messages"
        :key="index"
        :id="'msg-' + index"
        class="message-row"
        :class="msg.role"
      >
        <view class="message-bubble" :class="msg.role">
          <!-- AI 头像 -->
          <view v-if="msg.role === 'assistant'" class="avatar avatar-ai">
            <text class="avatar-icon">✦</text>
          </view>

          <view class="bubble-content" :class="msg.role">
            <text class="bubble-text">{{ msg.content }}</text>
          </view>

          <!-- 用户头像 -->
          <view v-if="msg.role === 'user'" class="avatar avatar-user">
            <text class="avatar-icon">👤</text>
          </view>
        </view>
      </view>

      <!-- 加载指示器 -->
      <view v-if="loading" class="message-row assistant">
        <view class="message-bubble assistant">
          <view class="avatar avatar-ai">
            <text class="avatar-icon">✦</text>
          </view>
          <view class="bubble-content assistant typing-bubble">
            <view class="typing-dots">
              <view class="typing-dot" />
              <view class="typing-dot" />
              <view class="typing-dot" />
            </view>
          </view>
        </view>
      </view>

      <!-- 底部占位 -->
      <view id="msg-bottom" style="height: 20rpx;" />
    </scroll-view>

    <!-- 输入区域 -->
    <view class="chat-input-area safe-area-bottom">
      <view class="input-row">
        <input
          class="chat-input"
          v-model="inputText"
          placeholder="输入你的问题..."
          placeholder-class="input-placeholder"
          confirm-type="send"
          :disabled="loading || !tripStore.hasTripPlan"
          @confirm="handleSend"
        />
        <view
          class="send-btn"
          :class="{ 'send-disabled': !canSend }"
          @tap="handleSend"
        >
          <text class="send-icon">↑</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useTripStore } from '@/stores/trip'
import { chatWithTrip } from '@/services/api'
import type { ChatMessage } from '@/types'

const tripStore = useTripStore()

const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const loading = ref(false)
const scrollToId = ref('')

const quickQuestions = [
  '这个行程的亮点是什么？',
  '有什么美食推荐？',
  '需要注意什么？',
  '帮我优化一下行程',
]

const canSend = computed(() => {
  return inputText.value.trim() && !loading.value && tripStore.hasTripPlan
})

function scrollToBottom() {
  nextTick(() => {
    scrollToId.value = ''
    nextTick(() => {
      scrollToId.value = 'msg-bottom'
    })
  })
}

async function sendMessage(text?: string) {
  const messageText = text || inputText.value.trim()
  if (!messageText || loading.value || !tripStore.tripPlan) return

  // 添加用户消息
  messages.value.push({ role: 'user', content: messageText })
  inputText.value = ''
  loading.value = true
  scrollToBottom()

  try {
    const response = await chatWithTrip({
      message: messageText,
      trip_plan: tripStore.tripPlan as any,
      history: messages.value.slice(0, -1),
    })

    if (response.success && response.reply) {
      messages.value.push({ role: 'assistant', content: response.reply })
    } else {
      messages.value.push({
        role: 'assistant',
        content: '抱歉，我暂时无法回答这个问题，请稍后再试。',
      })
    }
  } catch (err: any) {
    messages.value.push({
      role: 'assistant',
      content: `出错了: ${err.message || '网络异常，请检查连接'}`,
    })
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

function handleSend() {
  if (canSend.value) {
    sendMessage()
  }
}
</script>

<style scoped>
.chat-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0a0a0f 0%, #15132b 50%, #1a1035 100%);
}

/* Messages area */
.chat-messages {
  flex: 1;
  padding: 24rpx 32rpx;
}

/* Welcome */
.welcome-section {
  display: flex;
  justify-content: center;
  padding: 40rpx 0;
}

.welcome-card {
  padding: 48rpx 40rpx;
  text-align: center;
  width: 100%;
}

.welcome-icon {
  font-size: 60rpx;
  color: #FFD699;
  text-shadow: 0 0 32rpx rgba(255, 179, 71, 0.5);
  display: block;
  margin-bottom: 20rpx;
}

.welcome-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #FFD699;
  display: block;
  margin-bottom: 16rpx;
  letter-spacing: 4rpx;
}

.welcome-desc {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.5);
  display: block;
  line-height: 1.6;
  margin-bottom: 32rpx;
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  justify-content: center;
}

.quick-item {
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(255, 179, 71, 0.08);
  border: 1rpx solid rgba(255, 179, 71, 0.2);
}

.quick-item:active {
  background: rgba(255, 179, 71, 0.15);
}

.quick-text {
  font-size: 24rpx;
  color: #FFD699;
}

/* Message bubbles */
.message-row {
  margin-bottom: 24rpx;
}

.message-bubble {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.message-row.user .message-bubble {
  justify-content: flex-end;
}

.avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-ai {
  background: linear-gradient(135deg, rgba(255, 214, 153, 0.15), rgba(255, 179, 71, 0.25));
  border: 1rpx solid rgba(255, 179, 71, 0.3);
}

.avatar-user {
  background: rgba(255, 255, 255, 0.08);
  border: 1rpx solid rgba(255, 255, 255, 0.1);
}

.avatar-icon {
  font-size: 28rpx;
}

.bubble-content {
  max-width: 75%;
  padding: 24rpx 32rpx;
  border-radius: 24rpx;
}

.bubble-content.assistant {
  background: rgba(255, 255, 255, 0.05);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-top-left-radius: 8rpx;
}

.bubble-content.user {
  background: linear-gradient(135deg, rgba(255, 214, 153, 0.15), rgba(255, 179, 71, 0.1));
  border: 1rpx solid rgba(255, 179, 71, 0.2);
  border-top-right-radius: 8rpx;
}

.bubble-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.7;
}

/* Typing animation */
.typing-bubble {
  padding: 28rpx 36rpx;
}

.typing-dots {
  display: flex;
  gap: 10rpx;
}

.typing-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: rgba(255, 179, 71, 0.6);
  animation: typingDot 1.4s ease-in-out infinite;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingDot {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}

/* Input area */
.chat-input-area {
  padding: 20rpx 32rpx 24rpx;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1rpx solid rgba(255, 255, 255, 0.06);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.chat-input {
  flex: 1;
  height: 80rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.08);
  border-radius: 999rpx;
  padding: 0 32rpx;
  font-size: 28rpx;
  color: #f0f0f0;
}

.chat-input:focus {
  border-color: rgba(255, 179, 71, 0.3);
}

.input-placeholder {
  color: rgba(255, 255, 255, 0.2);
}

.send-btn {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFD699, #FFB347);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.send-btn.send-disabled {
  opacity: 0.3;
}

.send-icon {
  font-size: 36rpx;
  font-weight: 700;
  color: #0a0a0f;
}
</style>
