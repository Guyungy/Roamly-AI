<template>
  <n-modal
    :show="open"
    :mask-closable="false"
    :auto-focus="false"
    display-directive="if"
    @update:show="handleShowChange"
  >
    <div class="auth-card">
      <header class="auth-head">
        <h2 class="auth-title">{{ modalTitle }}</h2>
        <button class="auth-close" type="button" :aria-label="t('common.close')" @click="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <p class="auth-desc">{{ t('auth.subtitle') }}</p>

      <!-- 分段控件替掉原来的 radio button 组：同样表达「选一个」，但视觉更轻 -->
      <n-tabs
        v-if="mode !== 'reset'"
        v-model:value="tabValue"
        type="segment"
        class="auth-tabs"
      >
        <n-tab name="password">{{ t('auth.tabPassword') }}</n-tab>
        <n-tab name="otp">{{ t('auth.tabOtp') }}</n-tab>
        <n-tab name="signup">{{ t('auth.tabSignup') }}</n-tab>
      </n-tabs>

      <n-alert v-if="errorText" type="error" class="auth-alert" :show-icon="true">
        {{ errorText }}
      </n-alert>
      <n-alert v-if="noticeText" type="success" class="auth-alert" :show-icon="true">
        {{ noticeText }}
      </n-alert>

      <!-- 密码登录 -->
      <template v-if="mode === 'password'">
        <div class="auth-field">
          <label class="auth-label">{{ t('auth.email') }}</label>
          <n-input
            v-model:value="email"
            type="text"
            clearable
            :placeholder="t('auth.emailPlaceholder')"
            @keyup.enter="submitPassword"
          />
        </div>
        <div class="auth-field">
          <label class="auth-label">{{ t('auth.password') }}</label>
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.passwordPlaceholder')"
            @keyup.enter="submitPassword"
          />
        </div>

        <div class="auth-links">
          <button class="auth-link" type="button" @click="switchTo('reset')">{{ t('auth.forgot') }}</button>
          <button class="auth-link" type="button" @click="switchTo('otp')">{{ t('auth.useOtp') }}</button>
        </div>
        <n-button type="primary" block :loading="auth.busy" @click="submitPassword">
          {{ t('auth.login') }}
        </n-button>
      </template>

      <!-- 验证码登录 / 注册（共用发码流程） -->
      <template v-else-if="mode === 'otp' || mode === 'signup'">
        <div class="auth-field">
          <label class="auth-label">{{ t('auth.email') }}</label>
          <n-input
            v-model:value="email"
            type="text"
            clearable
            :placeholder="t('auth.emailPlaceholder')"
            @update:value="onEmailChange"
          />
        </div>
        <div class="auth-field">
          <label class="auth-label">{{ t('auth.code') }}</label>
          <div class="auth-code-row">
            <n-input
              v-model:value="code"
              :placeholder="t('auth.codePlaceholder')"
              :maxlength="8"
              @keyup.enter="submitOtp"
            />
            <n-button :disabled="countdown > 0 || sending" :loading="sending" @click="sendCode">
              {{ countdown > 0 ? t('auth.resendIn', { seconds: countdown }) : t('auth.sendCode') }}
            </n-button>
          </div>
        </div>
        <div v-if="mode === 'signup'" class="auth-field">
          <label class="auth-label">{{ t('auth.password') }}</label>
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.passwordForSignup')"
          />
        </div>

        <p class="auth-hint">{{ mode === 'signup' ? t('auth.signupHint') : t('auth.otpHint') }}</p>
        <n-button type="primary" block :loading="auth.busy" @click="submitOtp">
          {{ mode === 'signup' ? t('auth.signup') : t('auth.login') }}
        </n-button>
        <div class="auth-links auth-links--center">
          <button class="auth-link" type="button" @click="switchTo('password')">{{ t('auth.usePassword') }}</button>
        </div>
      </template>

      <!-- 找回密码 -->
      <template v-else>
        <div class="auth-field">
          <label class="auth-label">{{ t('auth.email') }}</label>
          <n-input
            v-model:value="email"
            type="text"
            clearable
            :placeholder="t('auth.emailPlaceholder')"
          />
        </div>
        <template v-if="resetSent">
          <div class="auth-field">
            <label class="auth-label">{{ t('auth.resetCode') }}</label>
            <n-input v-model:value="code" :placeholder="t('auth.codePlaceholder')" :maxlength="8" />
          </div>
          <div class="auth-field">
            <label class="auth-label">{{ t('auth.newPassword') }}</label>
            <n-input
              v-model:value="password"
              type="password"
              show-password-on="click"
              :placeholder="t('auth.passwordForSignup')"
            />
          </div>
        </template>

        <p class="auth-hint">{{ t('auth.resetHint') }}</p>
        <n-button v-if="!resetSent" type="primary" block :loading="sending" @click="sendResetCode">
          {{ t('auth.sendResetCode') }}
        </n-button>
        <n-button v-else type="primary" block :loading="auth.busy" @click="submitReset">
          {{ t('auth.resetSubmit') }}
        </n-button>
        <div class="auth-links auth-links--center">
          <button class="auth-link" type="button" @click="switchTo('password')">
            {{ t('auth.backToLogin') }}
          </button>
        </div>
      </template>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NAlert, NButton, NInput, NModal, NTab, NTabs } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

const { t } = useI18n()
const auth = useAuthStore()

type Mode = 'password' | 'otp' | 'signup' | 'reset'
const mode = ref<Mode>('password')
/** NTabs 只认三种可切换的模式；reset 是独立流程，不进 tab 组 */
const tabValue = computed<string>({
  get: () => mode.value,
  set: (next: string) => switchTo(next as Mode),
})

const email = ref('')
const password = ref('')
const code = ref('')
const errorText = ref('')
const noticeText = ref('')
const sending = ref(false)
const countdown = ref(0)
const resetSent = ref(false)

let timer: ReturnType<typeof setInterval> | null = null

const modalTitle = computed(() => {
  if (mode.value === 'reset') return t('auth.resetTitle')
  if (mode.value === 'signup') return t('auth.signupTitle')
  return t('auth.title')
})

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startCountdown() {
  stopTimer()
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) stopTimer()
  }, 1000)
}

function resetFeedback() {
  errorText.value = ''
  noticeText.value = ''
}

function switchTo(next: Mode) {
  mode.value = next
  code.value = ''
  password.value = ''
  resetSent.value = false
  resetFeedback()
}

/** 换邮箱后之前那份验证码挑战就失效了，必须重新获取 */
function onEmailChange() {
  if (countdown.value > 0 && !auth.hasPendingOtp(email.value.trim())) {
    stopTimer()
    countdown.value = 0
  }
}

function validateEmail(): string | null {
  const value = email.value.trim()
  if (!value) {
    errorText.value = t('auth.errors.emailRequired')
    return null
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    errorText.value = t('auth.errors.emailInvalid')
    return null
  }
  return value
}

function close() {
  stopTimer()
  countdown.value = 0
  resetFeedback()
  emit('update:open', false)
}

/** 遮罩点击 / Esc 关闭时统一走 close()，保证计时器被清掉 */
function handleShowChange(show: boolean) {
  if (!show) close()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      mode.value = 'password'
      code.value = ''
      password.value = ''
      resetSent.value = false
      resetFeedback()
    } else {
      stopTimer()
    }
  },
  { immediate: true }
)

function reportError(err: unknown, fallbackKey: string) {
  const message = err instanceof Error ? err.message : ''
  if (message === 'OTP_NOT_SENT') {
    errorText.value = t('auth.errors.otpNotSent')
    return
  }
  if (message === 'RESET_NOT_STARTED') {
    errorText.value = t('auth.errors.resetNotStarted')
    return
  }
  const shaped = err as { message?: string } | undefined
  errorText.value = shaped?.message ? shaped.message : t(fallbackKey)
}

async function submitPassword() {
  resetFeedback()
  const value = validateEmail()
  if (!value) return
  if (!password.value) {
    errorText.value = t('auth.errors.passwordRequired')
    return
  }
  try {
    await auth.signInWithPassword(value, password.value)
    emit('success')
    close()
  } catch (err) {
    // 不暴露"邮箱是否已注册"，统一按凭据错误提示
    errorText.value = t('auth.errors.loginFailed')
    console.error('[cloud] 密码登录失败', err)
  }
}

async function sendCode() {
  resetFeedback()
  const value = validateEmail()
  if (!value) return
  if (mode.value === 'signup' && password.value.length > 0 && password.value.length < 8) {
    errorText.value = t('auth.errors.passwordTooShort')
    return
  }
  sending.value = true
  try {
    const { isExistingUser } = await auth.sendEmailCode(value)
    // 注册页遇到已注册邮箱：中性文案引导去登录，不透露账号存在性细节
    noticeText.value = isExistingUser && mode.value === 'signup' ? t('auth.notice.existingUser') : t('auth.notice.codeSent')
    startCountdown()
  } catch (err) {
    // 发码失败：不进入验证、不声称已发送
    errorText.value = t('auth.errors.sendCodeFailed')
    console.error('[cloud] 验证码发送失败', err)
    stopTimer()
    countdown.value = 0
  } finally {
    sending.value = false
  }
}

async function submitOtp() {
  resetFeedback()
  const value = validateEmail()
  if (!value) return
  if (!code.value.trim()) {
    errorText.value = t('auth.errors.codeRequired')
    return
  }
  // 提交前先确认这份验证码挑战属于当前邮箱，否则不发起鉴权请求
  if (!auth.hasPendingOtp(value)) {
    errorText.value = t('auth.errors.otpNotSent')
    return
  }
  if (mode.value === 'signup' && password.value.length < 8) {
    errorText.value = t('auth.errors.passwordTooShort')
    return
  }
  try {
    await auth.submitEmailCode(value, code.value.trim(), mode.value === 'signup' ? password.value : undefined)
    emit('success')
    close()
  } catch (err) {
    reportError(err, 'auth.errors.codeFailed')
    console.error('[cloud] 验证码校验失败', err)
  }
}

async function sendResetCode() {
  resetFeedback()
  const value = validateEmail()
  if (!value) return
  sending.value = true
  try {
    await auth.requestPasswordReset(value)
    resetSent.value = true
    noticeText.value = t('auth.notice.resetCodeSent')
  } catch (err) {
    errorText.value = t('auth.errors.sendCodeFailed')
    console.error('[cloud] 重置验证码发送失败', err)
  } finally {
    sending.value = false
  }
}

async function submitReset() {
  resetFeedback()
  const value = validateEmail()
  if (!value) return
  if (!code.value.trim()) {
    errorText.value = t('auth.errors.codeRequired')
    return
  }
  if (password.value.length < 8) {
    errorText.value = t('auth.errors.passwordTooShort')
    return
  }
  if (!auth.hasPendingReset(value)) {
    errorText.value = t('auth.errors.resetNotStarted')
    return
  }
  try {
    await auth.confirmPasswordReset(value, code.value.trim(), password.value)
    emit('success')
    close()
  } catch (err) {
    reportError(err, 'auth.errors.resetFailed')
    console.error('[cloud] 重置密码失败', err)
  }
}
</script>

<style scoped>
.auth-card {
  width: min(440px, calc(100vw - 32px));
  padding: 26px 28px 28px;
  border-radius: var(--r-xl);
  background: var(--c-bg-card);
  box-shadow: 0 24px 60px rgba(22, 24, 29, 0.18), 0 8px 20px rgba(22, 24, 29, 0.08);
}

.auth-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
}

.auth-title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.auth-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  margin: -4px -6px 0 0;
  border-radius: var(--r-full);
  color: var(--c-ink-400);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.auth-close:hover {
  background: var(--c-ink-50);
  color: var(--c-ink-700);
}

.auth-close svg {
  width: 16px;
  height: 16px;
}

.auth-desc {
  margin: 6px 0 18px;
  font-size: var(--fs-sm);
  line-height: var(--lh-snug);
  color: var(--c-ink-400);
}

.auth-tabs {
  margin-bottom: 18px;
}

.auth-alert {
  margin-bottom: var(--sp-4);
}

.auth-field {
  margin-bottom: var(--sp-4);
}

.auth-label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--c-ink-700);
}

.auth-code-row {
  display: flex;
  gap: var(--sp-2);
}

.auth-code-row :deep(.n-button) {
  flex: 0 0 auto;
}

.auth-links {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  margin: 2px 0 var(--sp-4);
  font-size: var(--fs-sm);
}

.auth-links--center {
  justify-content: center;
  margin: var(--sp-4) 0 0;
}

.auth-link {
  color: var(--c-brand-600);
  font-size: var(--fs-sm);
  transition: color var(--dur-fast) var(--ease-out);
}

.auth-link:hover {
  color: var(--c-brand-700);
}

.auth-hint {
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-xs);
  line-height: var(--lh-snug);
  color: var(--c-ink-400);
}
</style>
