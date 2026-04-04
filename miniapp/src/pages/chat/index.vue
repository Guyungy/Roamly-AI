<template>
  <view class="chat-page">
    <NavBar show-back />

    <!-- 消息区域 -->
    <scroll-view
      scroll-y
      class="chat-messages"
      :scroll-into-view="scrollToId"
      scroll-with-animation
    >
      <!-- 欢迎消息 -->
      <view class="welcome-section" v-if="messages.length === 0">
        <view class="welcome-card">
          <text class="welcome-emoji">🎒</text>
          <text class="welcome-title">出门啦 AI</text>
          <text class="welcome-desc" v-if="tripStore.hasTripPlan">
            你好！我已经了解了你的{{ tripStore.tripPlan?.city }}旅行计划，关于行程有任何疑问都可以问我哦~
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
            <text class="avatar-icon">🎒</text>
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
            <text class="avatar-icon">🎒</text>
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
      <view id="msg-bottom" style="height: 40rpx;" />
    </scroll-view>

    <!-- 输入区域 -->
    <view class="chat-input-area safe-area-bottom">
      <view class="input-row">
        <input
          class="chat-input"
          v-model="inputText"
          placeholder="有什么想问的？"
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
  '有什么必吃的美食吗？',
  '当地天气如何？',
  '帮我精简一下行程',
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
  background-color: #F5F6FA;
}

/* Messages area */
.chat-messages {
  flex: 1;
  padding: 32rpx;
  box-sizing: border-box;
}

/* Welcome */
.welcome-section {
  padding: 40rpx 0;
}

.welcome-card {
  background-color: #FFFFFF;
  border-radius: 40rpx;
  padding: 60rpx 40rpx;
  text-align: center;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.03);
  border: 1rpx solid #E8ECF2;
}

.welcome-emoji {
  font-size: 80rpx;
  display: block;
  margin-bottom: 24rpx;
}

.welcome-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #1A1A2E;
  display: block;
  margin-bottom: 20rpx;
}

.welcome-desc {
  font-size: 28rpx;
  color: #6B7280;
  display: block;
  line-height: 1.6;
  margin-bottom: 40rpx;
  padding: 0 20rpx;
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  justify-content: center;
}

.quick-item {
  padding: 16rpx 32rpx;
  border-radius: 999rpx;
  background-color: #FFF5F0;
  border: 1rpx solid #FFE4D6;
}

.quick-item:active {
  background-color: #FFE4D6;
}

.quick-text {
  font-size: 24rpx;
  color: #FF6B35;
  font-weight: 600;
}

/* Message bubbles */
.message-row {
  margin-bottom: 32rpx;
}

.message-bubble {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}

.message-row.user .message-bubble {
  justify-content: flex-end;
}

.avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-ai {
  background-color: #FFFFFF;
  border: 1rpx solid #E8ECF2;
}

.avatar-user {
  background-color: #FF6B35;
}

.avatar-icon {
  font-size: 36rpx;
}

.bubble-content {
  max-width: 70%;
  padding: 24rpx 32rpx;
  border-radius: 32rpx;
  position: relative;
}

.bubble-content.assistant {
  background-color: #FFFFFF;
  border: 1rpx solid #E8ECF2;
  border-top-left-radius: 8rpx;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.02);
}

.bubble-content.user {
  background-color: #FF6B35;
  border-top-right-radius: 8rpx;
  box-shadow: 0 4rpx 12rpx rgba(255, 107, 53, 0.2);
}

.bubble-text {
  font-size: 30rpx;
  line-height: 1.6;
}

.assistant .bubble-text {
  color: #1A1A2E;
}

.user .bubble-text {
  color: #FFFFFF;
  font-weight: 500;
}

/* Typing animation */
.typing-bubble {
  padding: 32rpx 40rpx;
}

.typing-dots {
  display: flex;
  gap: 12rpx;
}

.typing-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: #FF6B35;
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
  padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  background-color: #FFFFFF;
  border-top: 1rpx solid #E8ECF2;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.chat-input {
  flex: 1;
  height: 88rpx;
  background-color: #F5F6FA;
  border-radius: 44rpx;
  padding: 0 36rpx;
  font-size: 30rpx;
  color: #1A1A2E;
}

.input-placeholder {
  color: #9CA3AF;
}

.send-btn {
  width: 88rpx;
  height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, #FF6B35, #FFB830);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 8rpx 20rpx rgba(255, 107, 53, 0.2);
}

.send-btn:active {
  transform: scale(0.95);
}

.send-btn.send-disabled {
  opacity: 0.4;
  box-shadow: none;
}

.send-icon {
  font-size: 40rpx;
  font-weight: 700;
  color: #FFFFFF;
}
</style>
