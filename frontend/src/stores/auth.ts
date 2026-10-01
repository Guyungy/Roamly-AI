import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { cloud } from '@/services/cloud'

/** 已登录用户的最小信息 */
export interface CloudUser {
  id: string
  email: string
}

/** 「获取验证码」返回的挑战，必须跨事件保存，不能每次登录都重新发码 */
interface PendingOtp {
  email: string
  verificationId: string
  isExistingUser: boolean
}

interface PendingReset {
  email: string
  updateUser: (payload: { nonce: string; password: string }) => Promise<{ error: unknown }>
}

/** 把 SDK 返回的 session 收敛成前端要用的形状 */
function readUser(session: unknown): CloudUser | null {
  const user = (session as { user?: { id?: string; email?: string } } | null | undefined)?.user
  if (!user?.id) return null
  return { id: String(user.id), email: user.email ?? '' }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CloudUser | null>(null)
  /** 首次会话检查是否完成 —— 完成前不要根据 isSignedIn 做「未登录」的判断 */
  const ready = ref(false)
  const busy = ref(false)

  let pendingOtp: PendingOtp | null = null
  let pendingReset: PendingReset | null = null
  let unsubscribe: (() => void) | null = null

  const isSignedIn = computed(() => user.value !== null)
  /** 邮箱前缀，用于导航栏展示 */
  const displayName = computed(() => (user.value?.email ? user.value.email.split('@')[0] : ''))

  function applySession(session: unknown) {
    user.value = readUser(session)
  }

  /** 订阅会话变化：刷新/过期/登出都会同步到这里的 user */
  async function init() {
    if (!ready.value) {
      try {
        const { data, error } = await cloud.auth.getSession()
        if (!error) applySession(data)
      } catch (err) {
        console.error('[cloud] 会话检查失败', err)
      }
      if (!unsubscribe) {
        try {
          unsubscribe = cloud.auth.onAuthStateChange((_event, session) => {
            applySession(session)
          })
        } catch (err) {
          console.error('[cloud] 会话订阅失败', err)
        }
      }
      ready.value = true
    }
    return user.value
  }

  /** 邮箱 + 密码登录 */
  async function signInWithPassword(email: string, password: string) {
    busy.value = true
    try {
      const { data, error } = await cloud.auth.signInWithPassword({ email, password })
      if (error) throw error
      applySession(data)
      return user.value
    } finally {
      busy.value = false
    }
  }

  /** 发送邮箱验证码（登录 / 注册共用）。成功后把挑战留在 store 里等提交 */
  async function sendEmailCode(email: string) {
    const sent = await cloud.auth.sendOtp({ email })
    if (sent.error) throw sent.error
    pendingOtp = {
      email,
      verificationId: sent.data.verificationId,
      isExistingUser: sent.data.isExistingUser,
    }
    return {
      isExistingUser: sent.data.isExistingUser,
    }
  }

  /**
   * 提交邮箱验证码。
   * 已有账号 → 直接登录；新账号 → 必须同时带上密码完成注册。
   */
  async function submitEmailCode(email: string, token: string, password?: string) {
    const pending = pendingOtp
    if (!pending || pending.email !== email) {
      throw new Error('OTP_NOT_SENT')
    }
    const completed = await cloud.auth.verifyOtp({
      email: pending.email,
      verificationId: pending.verificationId,
      isExistingUser: pending.isExistingUser,
      token,
      password: pending.isExistingUser ? undefined : password,
    })
    if (completed.error) throw completed.error
    pendingOtp = null
    applySession(completed.data)
    return user.value
  }

  /** 忘记密码第一步：给邮箱发一条重置验证码 */
  async function requestPasswordReset(email: string) {
    const started = await cloud.auth.resetPasswordForEmail(email)
    if (started.error) throw started.error
    pendingReset = {
      email,
      updateUser: started.data.updateUser.bind(started.data),
    }
  }

  /** 忘记密码第二步：用验证码换新密码，成功后 SDK 会自动登录 */
  async function confirmPasswordReset(email: string, nonce: string, password: string) {
    const pending = pendingReset
    if (!pending || pending.email !== email) {
      throw new Error('RESET_NOT_STARTED')
    }
    const completed = await pending.updateUser({ nonce, password })
    if (completed.error) throw completed.error
    pendingReset = null
    await init()
  }

  async function signOut() {
    busy.value = true
    try {
      await cloud.auth.signOut()
    } finally {
      user.value = null
      pendingOtp = null
      pendingReset = null
      busy.value = false
    }
  }

  /** 是否有已发送但未使用的验证码 / 重置挑战（用于禁用提交按钮） */
  function hasPendingOtp(email: string) {
    return Boolean(pendingOtp && pendingOtp.email === email)
  }

  function hasPendingReset(email: string) {
    return Boolean(pendingReset && pendingReset.email === email)
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
  }

  return {
    user,
    ready,
    busy,
    isSignedIn,
    displayName,
    init,
    signInWithPassword,
    sendEmailCode,
    submitEmailCode,
    requestPasswordReset,
    confirmPasswordReset,
    signOut,
    hasPendingOtp,
    hasPendingReset,
    dispose,
  }
})
