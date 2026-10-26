<template>
  <div class="landing-page">
    <NavBar
      @brand-click="scrollToTop"
      @cta-click="scrollToForm"
      @auth-click="openAuth"
      @sign-out="handleSignOut"
    />

    <!-- 主视觉：三层信息（标签 / 主张 / 说明），不再有一个占满整屏的英文大标题 -->
    <section class="hero">
      <div class="hero__glow hero__glow--a" aria-hidden="true"></div>
      <div class="hero__glow hero__glow--b" aria-hidden="true"></div>

      <div class="hero__inner">
        <span class="hero__eyebrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
            <circle cx="12" cy="12" r="3.4" />
          </svg>
          {{ t('home.heroBadge') }}
        </span>

        <h1 class="hero__title">{{ t('home.titleLine') }}</h1>
        <p class="hero__sub">{{ t('home.heroDesc') }}</p>
      </div>
    </section>

    <!-- 表单 -->
    <section ref="formRef" class="form-section">
      <div
        class="form-panel"
        :style="{ minHeight: panelHeight === 'auto' ? 'auto' : panelHeight + 'px' }"
        ref="panelRef"
      >
        <form v-show="!loading" class="steps" @submit.prevent="handleSubmit">
          <!-- 01 目的地与日期 -->
          <div class="step">
            <div class="step__head">
              <span class="step__num">01</span>
              <h2 class="step__title">{{ t('home.step1') }}</h2>
            </div>

            <div class="step__grid step__grid--4">
              <div class="field">
                <label class="field__label">{{ t('home.cityLabel') }}</label>
                <!--
                  城市输入接高德 AutoComplete：直接输入「杭」就能列出杭州市等选项，
                  省得用户手打全称（城市规划服务对「杭州」和「杭州市」的命中率不一样）。
                  menu-props 放开菜单最小宽度：候选是「名称 · 省市区」，跟输入框等宽会被截在
                  省市区前，几条候选看起来几乎一样。菜单是 teleport 到 body 的，
                  组件里的 scoped 样式（含 :deep）够不到它，只能用这个属性下发。
                -->
                <n-auto-complete
                  v-model:value="formData.city"
                  size="large"
                  clearable
                  :options="citySuggestOptions"
                  :loading="citySuggestLoading"
                  :placeholder="t('home.cityPlaceholder')"
                  :menu-props="{ style: 'min-width: 320px' }"
                  @select="handleCitySelect"
                  @update:value="handleCityInput"
                />
              </div>

              <div class="field">
                <label class="field__label">{{ t('home.startDateLabel') }}</label>
                <n-date-picker
                  v-model:value="formData.start_date"
                  type="date"
                  size="large"
                  clearable
                  :placeholder="t('home.startDatePlaceholder')"
                />
              </div>

              <div class="field">
                <label class="field__label">{{ t('home.endDateLabel') }}</label>
                <n-date-picker
                  v-model:value="formData.end_date"
                  type="date"
                  size="large"
                  clearable
                  :placeholder="t('home.endDatePlaceholder')"
                />
              </div>

              <div class="field">
                <label class="field__label">{{ t('home.travelDaysLabel') }}</label>
                <div class="days-chip">
                  <span class="days-chip__num">{{ formData.travel_days }}</span>
                  <span class="days-chip__unit">{{ t('home.travelDaysUnit', {}, formData.travel_days) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 02 偏好设置 -->
          <div class="step">
            <div class="step__head">
              <span class="step__num">02</span>
              <h2 class="step__title">{{ t('home.step2') }}</h2>
            </div>

            <div class="step__grid step__grid--2">
              <div class="field">
                <label class="field__label">{{ t('home.transportationLabel') }}</label>
                <n-select
                  v-model:value="formData.transportation"
                  size="large"
                  :options="transportationOptions"
                />
              </div>

              <div class="field">
                <label class="field__label">{{ t('home.accommodationLabel') }}</label>
                <n-select
                  v-model:value="formData.accommodation"
                  size="large"
                  :options="accommodationOptions"
                />
              </div>
            </div>

            <div class="field field--block">
              <label class="field__label">{{ t('home.interestsLabel') }}</label>
              <div class="interest-grid">
                <button
                  v-for="item in interestOptions"
                  :key="item.value"
                  type="button"
                  class="interest-pill"
                  :class="{ 'is-active': formData.preferences.includes(item.value) }"
                  :aria-pressed="formData.preferences.includes(item.value)"
                  @click="togglePreference(item.value)"
                >
                  {{ t(item.labelKey) }}
                </button>
              </div>
            </div>
          </div>

          <!-- 03 特殊需求 -->
          <div class="step">
            <div class="step__head">
              <span class="step__num">03</span>
              <h2 class="step__title">{{ t('home.step3') }}</h2>
            </div>
            <div class="field field--block">
              <n-input
                v-model:value="formData.free_text_input"
                type="textarea"
                :rows="4"
                :placeholder="t('home.specialNeedsPlaceholder')"
                :resizable="false"
              />
            </div>
          </div>

          <div class="submit-row">
            <n-button
              attr-type="submit"
              type="primary"
              size="large"
              block
              :loading="loading"
              class="submit-btn"
            >
              {{ loading ? t('home.submitting') : t('home.submit') }}
            </n-button>
          </div>
        </form>

        <!-- 生成过程面板 -->
        <div v-show="loading" class="loading">
          <header class="loading__head">
            <h2 class="loading__title">{{ t('home.loading.planCode', { code: planCode }) }}</h2>
            <p class="loading__sub">{{ t('home.loading.preparing') }}</p>
          </header>

          <!--
            云服务模式：整份行程由单次模型调用产出。
            阶段不是编的 —— days / weather_info / budget 是模型按顺序输出的 JSON 字段，
            扫一遍已到达的文本就知道它此刻在写哪一段、已经排到第几天（cloudLLM.analyzeStream）。
          -->
          <div v-if="!hasOwnBackend" class="progress">
            <div class="progress__bar">
              <div class="progress__fill" :style="{ width: `${loadingProgress}%` }"></div>
            </div>
            <div class="progress__meta">
              <span class="progress__percent tabular-nums">{{ loadingProgress }}%</span>
              <span class="progress__elapsed tabular-nums">{{ t('home.loading.elapsed', { sec: elapsedSec }) }}</span>
            </div>

            <ul class="stage-list">
              <li
                v-for="stage in cloudStages"
                :key="stage.key"
                class="stage"
                :class="`stage--${stage.state}`"
              >
                <span class="stage__mark">
                  <svg
                    v-if="stage.state === 'done'"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span v-else-if="stage.state === 'active'" class="spinner spinner--sm"></span>
                  <span v-else class="stage__dot"></span>
                </span>
                <span class="stage__body">
                  <span class="stage__label">{{ stage.label }}</span>
                  <span v-if="stage.detail" class="stage__detail">{{ stage.detail }}</span>
                </span>
              </li>
            </ul>

            <p v-if="whisper" class="whisper">{{ whisper }}</p>
            <p class="loading__note">{{ t('home.loading.honestNote') }}</p>
          </div>

          <!-- 自建后端模式：多智能体分步执行，四个节点对应四个真实步骤 -->
          <div v-else class="node-track">
            <div
              v-for="(node, index) in backendNodes"
              :key="node.key"
              class="node"
              :class="{ 'node--active': node.state === 'active', 'node--done': node.state === 'done' }"
            >
              <span class="node__icon">
                <span v-if="node.state === 'active'" class="spinner spinner--sm"></span>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span class="node__text">{{ node.label }}</span>
              <span v-if="index < backendNodes.length - 1" class="node__line" :class="{ 'node__line--done': node.state === 'done' }"></span>
            </div>
          </div>

          <footer class="loading__foot">
            <h3 v-if="hasOwnBackend || loadingProgress >= 100">{{ loadingStatus }}</h3>
            <p v-if="loadingProgress >= 100">{{ t('home.loading.donePrepare') }}</p>
            <p v-else-if="hasOwnBackend">{{ t('home.loading.workingTogether') }}</p>
          </footer>
        </div>
      </div>
    </section>

    <!--
      当前城市探索：按类别看这座城市值得去的地方。
      城市取首页填的目的地；用户也可以点面板里的「定位到我的城市」改用当前位置。
      数据走 /api/map/city-explore（契约 §5），失败时降级到缓存或内置演示数据并如实标注。
    -->
    <CityExplorePanel :city="formData.city" />

    <MyTrips ref="myTripsRef" @open-trip="handleOpenTrip" @auth-required="openAuth" />

    <CloudAuthModal v-model:open="authOpen" @success="handleAuthSuccess" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { NAutoComplete, NButton, NDatePicker, NInput, NSelect } from 'naive-ui'
import { generateTripPlan } from '@/services/api'
import { saveTrip } from '@/services/cloudTrips'
import { hasOwnBackend } from '@/config/cloud'
import { loadAMap } from '@/services/amap'
import { useTripStore } from '@/stores/trip'
import { useAuthStore } from '@/stores/auth'
import { confirmDialog, feedback } from '@/utils/feedback'
import NavBar from '@/components/NavBar.vue'
import CityExplorePanel from '@/components/CityExplorePanel.vue'
import MyTrips from '@/components/MyTrips.vue'
import CloudAuthModal from '@/components/CloudAuthModal.vue'
import type { TripFormData, TripPlan } from '@/types'
import type { PlanProgressMeta } from '@/services/cloudLLM'

/**
 * 日期改用时间戳（Naive 的 NDatePicker 原生类型）。
 * 好处：拿到的是「当天 00:00 的本地时间」，不会像 toISOString 那样被时区推前一天。
 */
type LandingFormData = Omit<TripFormData, 'start_date' | 'end_date'> & {
  start_date: number | null
  end_date: number | null
}

const router = useRouter()
const { t, tm, locale } = useI18n()
const tripStore = useTripStore()
const authStore = useAuthStore()

const authOpen = ref(false)
const myTripsRef = ref<InstanceType<typeof MyTrips> | null>(null)

const openAuth = () => {
  authOpen.value = true
}

const handleAuthSuccess = () => {
  feedback.success(t('auth.notice.signedIn'))
  void authStore.init().then(() => myTripsRef.value?.load())
}

const handleSignOut = () => {
  confirmDialog({
    title: t('auth.signOutTitle'),
    okText: t('auth.signOut'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      await authStore.signOut()
      feedback.success(t('auth.notice.signedOut'))
    },
  })
}

/** 打开一份云端保存的行程：直接塞进 store 再跳结果页 */
const handleOpenTrip = (plan: TripPlan) => {
  tripStore.setTripPlan(plan)
  void router.push('/result')
}

const loading = ref(false)
const loadingProgress = ref(0)
const loadingStatus = ref('')
/** 云模式的结构化阶段：来自流式文本的真实结构，见 cloudLLM.ts 的 analyzeStream */
const progressMeta = ref<PlanProgressMeta | null>(null)
const elapsedSec = ref(0)
const whisperIndex = ref(0)
const formRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelHeight = ref<number | string>('auto')
const planCode = ref(`PLAN${Math.floor(100000 + Math.random() * 900000)}`)

/* ---------------- 云模式：生成过程的可视化 ---------------- */

/** 与 cloudLLM.ts 的 PlanProgressMeta.stage 一一对应，顺序即流程顺序 */
const CLOUD_STAGES = ['understand', 'days', 'weather', 'budget', 'finalize'] as const

const cloudStages = computed(() => {
  const currentStage = progressMeta.value?.stage ?? 'understand'
  const currentIndex = CLOUD_STAGES.indexOf(currentStage)
  const total = Math.max(1, progressMeta.value?.daysTotal ?? formData.travel_days ?? 1)
  const seen = Math.min(progressMeta.value?.daysSeen ?? 0, total)

  return CLOUD_STAGES.map((key, index) => {
    const state: 'done' | 'active' | 'pending' =
      index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending'
    // 只有 days 这一阶段有可量化的子进度；没排到任何一天时不报数，避免「第 0 / 3 天」这种没信息量的话
    const detail =
      key === 'days' && state !== 'pending' && seen > 0
        ? t('home.loading.daysCount', { done: seen, total })
        : ''
    return { key, state, label: t(`home.loading.stage.${key}`), detail }
  })
})

/** 自建后端模式的四段式节点（与进度阈值绑定） */
const backendNodes = computed(() => {
  const p = loadingProgress.value
  const mk = (key: string, active: boolean, done: boolean, doneKey: string, activeKey: string) => ({
    key,
    state: done ? 'done' : active ? 'active' : 'pending',
    label: done ? t(`home.loading.${doneKey}`) : t(`home.loading.${activeKey}`),
  })
  return [
    mk('attractions', p >= 0 && p <= 30, p > 30, 'searchedAttractions', 'searchingAttractions'),
    mk('weather', p > 30 && p <= 50, p > 50, 'queriedWeather', 'queryingWeather'),
    mk('hotels', p > 50 && p <= 70, p > 70, 'recommendedHotels', 'recommendingHotels'),
    mk('plan', p > 70 && p < 100, p >= 100, 'done', 'generatingPlan'),
  ]
})

/** 陪伴文案：用户明确要的「情绪价值」，与真实进度无关，只负责让等待不那么干 */
const whispers = computed<string[]>(() => {
  void locale.value // 让 computed 跟着语言切换重算
  const raw = tm('home.loading.whispers') as unknown
  return Array.isArray(raw) ? raw.map((item) => String(item)) : []
})

const whisper = computed(() => {
  const list = whispers.value
  if (list.length === 0) return ''
  return list[whisperIndex.value % list.length]
})

const transportationOptions = computed(() => [
  { value: '公共交通', label: t('home.transportation.public') },
  { value: '自驾', label: t('home.transportation.drive') },
  { value: '步行', label: t('home.transportation.walk') },
  { value: '混合', label: t('home.transportation.mixed') },
])

const accommodationOptions = computed(() => [
  { value: '经济型酒店', label: t('home.accommodation.budget') },
  { value: '舒适型酒店', label: t('home.accommodation.comfort') },
  { value: '豪华酒店', label: t('home.accommodation.luxury') },
  { value: '民宿', label: t('home.accommodation.homestay') },
])

const interestOptions = [
  { value: '历史文化', labelKey: 'home.interests.history' },
  { value: '自然风光', labelKey: 'home.interests.nature' },
  { value: '美食', labelKey: 'home.interests.food' },
  { value: '购物', labelKey: 'home.interests.shopping' },
  { value: '艺术', labelKey: 'home.interests.art' },
  { value: '休闲', labelKey: 'home.interests.leisure' },
]

const formData = reactive<LandingFormData>({
  city: '',
  start_date: null,
  end_date: null,
  travel_days: 1,
  transportation: '公共交通',
  accommodation: '经济型酒店',
  preferences: [],
  free_text_input: '',
})

/* ---------- 目的地城市：高德输入联想 ---------- */

type CitySuggestion = { label: string; value: string }

const citySuggestOptions = ref<CitySuggestion[]>([])
const citySuggestLoading = ref(false)

/** AutoComplete 实例只建一次；高德这个服务的构造开销不值当每次输入都重建 */
let cityAutoComplete: any = null
let cityDebounceTimer: ReturnType<typeof setTimeout> | null = null
/** 输入是异步回调，用一个自增序号丢弃过期结果 —— 否则慢的那次会覆盖新的联想列表 */
let cityRequestSeq = 0

const ensureCityAutoComplete = async () => {
  if (cityAutoComplete) return cityAutoComplete
  const AMap = await loadAMap().catch(() => null)
  if (!AMap || typeof AMap.AutoComplete !== 'function') return null
  cityAutoComplete = new AMap.AutoComplete({ city: '全国' })
  return cityAutoComplete
}

const fetchCitySuggestions = async (keyword: string) => {
  const service = await ensureCityAutoComplete()
  // 没配高德 Key 就静默降级：用户照样能手打城市名
  if (!service) return

  const seq = ++cityRequestSeq
  citySuggestLoading.value = true

  service.search(keyword, (status: string, result: unknown) => {
    if (seq !== cityRequestSeq) return
    citySuggestLoading.value = false

    if (status !== 'complete') {
      citySuggestOptions.value = []
      return
    }

    const tips = (result as { tips?: Array<{ name?: string; district?: string }> })?.tips ?? []
    citySuggestOptions.value = tips
      .map((tip) => {
        const name = String(tip?.name || '').trim()
        // district 形如「中国浙江省杭州市西湖区」，截掉国家名更好读
        const district = String(tip?.district || '').replace(/^中国/, '').trim()
        return { label: district ? `${name} · ${district}` : name, value: name }
      })
      .filter((option) => option.value)
  })
}

const handleCityInput = (value: string) => {
  const keyword = (value || '').trim()

  if (cityDebounceTimer) clearTimeout(cityDebounceTimer)

  if (!keyword) {
    cityRequestSeq += 1 // 清空时让在途请求作废，否则它回来又会把列表填上
    citySuggestOptions.value = []
    citySuggestLoading.value = false
    return
  }

  // 防抖：逐字请求会打到高德限流，联想列表也会跳来跳去
  cityDebounceTimer = setTimeout(() => {
    void fetchCitySuggestions(keyword)
  }, 260)
}

const handleCitySelect = () => {
  // 选中之后把列表收掉，不然下拉会挡着下一格「出发日期」
  citySuggestOptions.value = []
}

const togglePreference = (value: string) => {
  const index = formData.preferences.indexOf(value)
  if (index === -1) formData.preferences.push(value)
  else formData.preferences.splice(index, 1)
}

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
const scrollToForm = () => {
  if (formRef.value) {
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 64
    const y = formRef.value.getBoundingClientRect().top + window.scrollY - navH
    window.scrollTo({ top: y, behavior: 'smooth' })
  }
}

watch([() => formData.start_date, () => formData.end_date], ([start, end]) => {
  if (start && end) {
    const days = dayjs(end).diff(dayjs(start), 'day') + 1
    if (days > 0 && days <= 30) formData.travel_days = days
    else if (days > 30) {
      feedback.warning(t('home.messages.travelDaysTooLong'))
      formData.end_date = null
    } else {
      feedback.warning(t('home.messages.endDateEarlier'))
      formData.end_date = null
    }
  }
})

/** 生成成功后写入云端行程库；未登录不打断主流程，只是不保存 */
const persistTrip = async (plan: TripPlan) => {
  if (!authStore.isSignedIn) return
  try {
    await saveTrip(plan, `${plan.city} · ${plan.start_date} ~ ${plan.end_date}`)
    feedback.success(t('trips.saved'))
    void myTripsRef.value?.load()
  } catch (err) {
    console.error('[cloud] 行程保存失败', err)
    feedback.warning(
      err instanceof Error && err.message === 'AUTH_REQUIRED' ? t('trips.needLogin') : t('trips.saveFailed'),
    )
  }
}

const handleSubmit = async () => {
  if (!formData.start_date || !formData.end_date) {
    feedback.error(t('home.messages.selectDate'))
    return
  }

  if (panelRef.value) {
    panelHeight.value = panelRef.value.offsetHeight
  }

  loading.value = true
  loadingProgress.value = 0
  loadingStatus.value = t('home.loading.initializing')
  progressMeta.value = null
  elapsedSec.value = 0
  whisperIndex.value = 0
  planCode.value = `${Math.floor(1000 + Math.random() * 9000)}`

  // 进度来源分两种，不能混：
  // - 云服务模式：整份行程由单次模型调用产出。阶段与百分比都从"已到达的流式文本结构"里
  //   真实推出来（days / weather_info / budget 是模型顺序输出的字段，见 cloudLLM.analyzeStream）；
  //   首字到达前只缓慢爬到 10%，不伪造中间步骤。
  // - 自建后端模式：四个节点各自有真实任务，沿用按节拍的推进来点亮节点。
  let firstChunkArrived = false
  const progressTimer = setInterval(() => {
    if (!hasOwnBackend) {
      if (!firstChunkArrived && loadingProgress.value < 10) loadingProgress.value += 1
    } else if (loadingProgress.value < 90) {
      loadingProgress.value += 10
    }
  }, hasOwnBackend ? 1000 : 700)

  // 秒表与陪伴文案轮播：纯粹给等待感兜底，不参与进度计算
  const elapsedTimer = setInterval(() => {
    elapsedSec.value += 1
  }, 1000)
  const whisperTimer = setInterval(() => {
    whisperIndex.value += 1
  }, 3600)

  const stopTickers = () => {
    clearInterval(progressTimer)
    clearInterval(elapsedTimer)
    clearInterval(whisperTimer)
  }

  const onProgress = (text: string, percent?: number, meta?: PlanProgressMeta) => {
    firstChunkArrived = true
    // 云模式的 text 是服务层内部文案，界面统一用 i18n；后端模式的 text 是任务真实阶段，直接展示
    loadingStatus.value = hasOwnBackend
      ? text || t('home.loading.generatingPlan')
      : t('home.loading.generatingPlan')
    if (meta) progressMeta.value = meta
    if (typeof percent === 'number') {
      loadingProgress.value = Math.max(loadingProgress.value, Math.min(99, percent))
    }
  }

  try {
    const requestData: TripFormData = {
      city: formData.city,
      start_date: dayjs(formData.start_date).format('YYYY-MM-DD'),
      end_date: dayjs(formData.end_date).format('YYYY-MM-DD'),
      travel_days: formData.travel_days,
      transportation: formData.transportation,
      accommodation: formData.accommodation,
      preferences: formData.preferences,
      free_text_input: formData.free_text_input,
    }

    const response = await generateTripPlan(requestData, onProgress)
    loadingProgress.value = 100
    loadingStatus.value = t('home.loading.done')

    if (response.success && response.data) {
      tripStore.setTripPlan(response.data, response.graph_data)
      feedback.success(t('home.messages.generateSuccess'))
      void persistTrip(response.data)
      setTimeout(() => router.push('/result'), 500)
    } else {
      feedback.error(response.message || t('home.messages.generateFailed'))
    }
  } catch (error: any) {
    feedback.error(error.message || t('home.messages.generateRetry'))
  } finally {
    stopTickers()
    setTimeout(() => {
      loading.value = false
      loadingProgress.value = 0
      loadingStatus.value = ''
      progressMeta.value = null
      elapsedSec.value = 0
      panelHeight.value = 'auto'
    }, 1000)
  }
}
</script>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: var(--c-bg-app);
}

/* ============================================================
   主视觉
   ============================================================ */
.hero {
  position: relative;
  overflow: hidden;
  padding: calc(var(--nav-h) + 56px) 0 52px;
  background: linear-gradient(180deg, #fff8f4 0%, #ffffff 100%);
}

.hero__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(64px);
  pointer-events: none;
}

/* 只留品牌色系的柔光，去掉原来那片蓝紫（与暖橙主色相互打架） */
.hero__glow--a {
  width: 520px;
  height: 520px;
  top: -240px;
  left: -140px;
  background: radial-gradient(circle, rgba(255, 107, 53, 0.2), transparent 70%);
}

.hero__glow--b {
  width: 460px;
  height: 460px;
  right: -160px;
  bottom: -260px;
  background: radial-gradient(circle, rgba(232, 85, 32, 0.13), transparent 70%);
}

.hero__inner {
  position: relative;
  z-index: 1;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 var(--layout-gutter);
  text-align: center;
}

.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px 5px 10px;
  border-radius: var(--r-full);
  background: var(--c-brand-50);
  border: 1px solid var(--c-brand-100);
  color: var(--c-brand-700);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  letter-spacing: 0.01em;
}

.hero__eyebrow svg {
  width: 14px;
  height: 14px;
}

.hero__title {
  margin: 20px 0 0;
  font-size: clamp(30px, 5vw, 46px);
  font-weight: var(--fw-semibold);
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--c-ink-900);
}

.hero__sub {
  max-width: 620px;
  margin: 18px auto 0;
  font-size: var(--fs-md);
  line-height: var(--lh-normal);
  color: var(--c-ink-400);
}

/* ============================================================
   表单
   ============================================================ */
.form-section {
  position: relative;
  z-index: 2;
  padding: 0 var(--layout-gutter) var(--sp-9);
}

.form-panel {
  width: 100%;
  max-width: 1000px;
  margin: -8px auto 0;
  padding: var(--sp-8);
  border-radius: var(--r-xl);
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  box-shadow: 0 20px 50px rgba(22, 24, 29, 0.08), 0 4px 12px rgba(22, 24, 29, 0.04);
  transition: min-height var(--dur-base) var(--ease-out);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--sp-7);
}

.step__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--sp-5);
}

.step__num {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: var(--r-sm);
  background: var(--c-brand-50);
  color: var(--c-brand-700);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
}

.step__title {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.step__grid {
  display: grid;
  gap: var(--sp-5);
}

.step__grid--4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.step__grid--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.field--block {
  margin-top: var(--sp-5);
}

.field__label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--c-ink-700);
}

/* 天数：与 large 尺寸的输入控件对齐（Naive large = 44px） */
.days-chip {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 5px;
  height: 44px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--c-brand-50);
  border: 1px solid var(--c-brand-100);
}

.days-chip__num {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--c-brand-700);
  font-variant-numeric: tabular-nums;
}

.days-chip__unit {
  font-size: var(--fs-sm);
  color: var(--c-brand-600);
}

.interest-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.interest-pill {
  padding: 9px 17px;
  border-radius: var(--r-full);
  border: 1px solid var(--c-border);
  background: #fff;
  color: var(--c-ink-600);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.interest-pill:hover {
  border-color: var(--c-brand-300);
  color: var(--c-brand-700);
}

.interest-pill.is-active {
  background: var(--c-brand-50);
  border-color: var(--c-brand-400);
  color: var(--c-brand-700);
}

.submit-row {
  margin-top: var(--sp-2);
}

.submit-btn {
  height: 48px;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

/* ============================================================
   生成过程面板
   ============================================================ */
.loading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  padding: var(--sp-2) 0;
}

.loading__head {
  text-align: center;
}

.loading__title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.loading__sub {
  margin-top: 6px;
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.loading__note {
  font-size: var(--fs-xs);
  line-height: var(--lh-snug);
  color: var(--c-ink-300);
  text-align: center;
}

.loading__foot {
  text-align: center;
}

.loading__foot h3 {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.loading__foot p {
  margin-top: 4px;
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

/* ---- 云模式：进度条 + 阶段清单 ---- */
.progress {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.progress__bar {
  height: 6px;
  border-radius: var(--r-full);
  background: var(--c-bg-sunken);
  overflow: hidden;
}

.progress__fill {
  height: 100%;
  border-radius: var(--r-full);
  background: linear-gradient(90deg, var(--c-brand-400), var(--c-brand-600));
  transition: width var(--dur-slow) var(--ease-out);
}

.progress__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}

.progress__percent {
  font-weight: var(--fw-semibold);
  color: var(--c-brand-600);
}

.progress__elapsed {
  color: var(--c-ink-400);
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stage {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 9px 12px;
  border-radius: var(--r-md);
  transition: background var(--dur-base) var(--ease-out);
}

.stage--active {
  background: var(--c-brand-50);
}

.stage__mark {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin-top: 2px;
}

.stage__mark svg {
  width: 15px;
  height: 15px;
  color: var(--c-brand-600);
}

.stage__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-ink-200);
}

.stage__body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.stage__label {
  font-size: var(--fs-base);
  color: var(--c-ink-300);
  transition: color var(--dur-base) var(--ease-out);
}

.stage--active .stage__label {
  color: var(--c-ink-800);
  font-weight: var(--fw-medium);
}

.stage--done .stage__label {
  color: var(--c-ink-600);
}

.stage__detail {
  font-size: var(--fs-xs);
  color: var(--c-brand-600);
  font-variant-numeric: tabular-nums;
}

.whisper {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-soft);
  color: var(--c-ink-500);
  font-size: var(--fs-sm);
  text-align: center;
}

.spinner {
  display: inline-block;
  width: 15px;
  height: 15px;
  border: 2px solid var(--c-brand-200);
  border-top-color: var(--c-brand-600);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

.spinner--sm {
  width: 14px;
  height: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- 后端模式：四节点串联 ---- */
.node-track {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.node {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  border: 1px solid var(--c-border);
  background: var(--c-bg-card);
  transition: border-color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out);
}

.node--active {
  border-color: var(--c-brand-300);
  background: var(--c-brand-50);
}

.node--done {
  border-color: var(--c-success-soft);
  background: var(--c-success-soft);
}

.node__icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  color: var(--c-ink-300);
}

.node--done .node__icon {
  color: var(--c-success);
}

.node__icon svg {
  width: 18px;
  height: 18px;
}

.node__text {
  font-size: var(--fs-base);
  color: var(--c-ink-400);
}

.node--active .node__text {
  color: var(--c-ink-800);
  font-weight: var(--fw-medium);
}

.node--done .node__text {
  color: var(--c-ink-700);
}

.node__line {
  display: none;
}

/* ============================================================
   响应式
   ============================================================ */
@media (max-width: 900px) {
  .form-panel {
    padding: var(--sp-6);
  }

  .step__grid--4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .hero {
    padding: calc(var(--nav-h) + 36px) 0 36px;
  }

  .hero__title {
    font-size: clamp(26px, 8vw, 34px);
  }

  .hero__sub {
    font-size: var(--fs-base);
  }

  .form-panel {
    padding: var(--sp-5) var(--sp-4);
    border-radius: var(--r-lg);
  }

  .steps {
    gap: var(--sp-6);
  }

  .step__grid--4,
  .step__grid--2 {
    grid-template-columns: minmax(0, 1fr);
  }

  .days-chip {
    width: 100%;
  }
}
</style>
