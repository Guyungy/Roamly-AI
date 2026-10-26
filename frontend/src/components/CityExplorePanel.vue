<script setup lang="ts">
/**
 * 当前城市探索面板。
 *
 * 与 NearbyStationPanel 的分工：那边是「我附近的地铁/公交站」，这边是「这座城市
 * 值得去的地方」。两者都挂四态来源（live/cache/degraded/mock），文案必须分开，
 * 因为「后端降级」和「这城市真没有」对用户来说是完全不同的两件事。
 *
 * 城市从哪来：优先用父层给的 city（行程目的地）；没有时用户可以点「定位到我的城市」，
 * 用浏览器定位反查城市名。**不猜默认城市** —— 猜错时列表看起来完全正常，用户不会察觉。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NSpin } from 'naive-ui'
import type { Location } from '@/types'
import {
  fetchCityExplore,
  EXPLORE_KINDS,
  type CityExploreSource,
  type CitySpot,
  type ExploreKind,
} from '@/services/cityExplore'
import { fetchNavLink } from '@/services/navLink'
import { hasExploreOrigin, resolveExploreOrigin } from '@/services/cityExploreOrigin'
import {
  getCurrentLocation,
  LocateFailure,
  type LocateFailureKind,
} from '@/services/geolocation'
import { reverseGeocode } from '@/services/reverseGeocode'
import { feedback } from '@/utils/feedback'

const props = defineProps<{
  /** 行程目的地城市；为空时只能靠定位或手动触发 */
  city?: string
}>()

const { t } = useI18n()

const activeKind = ref<ExploreKind>('spot')
const spots = ref<CitySpot[]>([])
const loading = ref(false)
const source = ref<CityExploreSource>('live')
const degradedReason = ref('')
const resolvedCity = ref('')
const locating = ref(false)
const locateError = ref<LocateFailureKind | null>(null)
/** 用户定位得到的城市；一旦有值就压过 props.city（用户显式表达「我要看我的城市」） */
const locatedCity = ref('')
/**
 * 定位得到的坐标。逆地理编码查不到城市名时（后端未配高德 Key）靠它兜底：
 * 后端能按坐标反查城市（契约 §5）。它与 locatedCity 互斥存在 —— 有城市名时
 * 城市名更准，不该再拿坐标去覆盖。
 */
const locatedCenter = ref<Location | null>(null)

let controller: AbortController | null = null
/** 请求序号：切类别时旧响应不得写入新列表 */
let loadSeq = 0

const origin = computed(() =>
  resolveExploreOrigin(props.city, locatedCity.value, locatedCenter.value)
)
/** 有城市名或坐标任一即可检索（规则见 services/cityExploreOrigin） */
const canExplore = computed(() => hasExploreOrigin(origin.value))
/** 是否已经定位过（城市名或坐标任一即可），只影响按钮态 */
const hasLocated = computed(() => Boolean(locatedCity.value || locatedCenter.value))

const kindOptions = computed(() =>
  EXPLORE_KINDS.map((kind) => ({ value: kind, label: t(`home.explore.kind.${kind}`) }))
)

/**
 * 来源文案：四态严格区分，不能把 mock 说成缓存、也不能把降级说成空。
 *
 * degraded 且列表为空时不显示 —— 空态那里已经说了「后端已降级，暂时无法获取」，
 * 同一件事说两遍只会让人以为出了两个问题。
 */
const sourceNoteKey = computed(() => {
  if (source.value === 'degraded' && spots.value.length === 0) return ''
  switch (source.value) {
    case 'cache':
      return 'home.explore.fromCache'
    case 'degraded':
      return 'home.explore.fromDegraded'
    case 'mock':
      return 'home.explore.fromMock'
    default:
      return ''
  }
})

const isEmpty = computed(() => !loading.value && spots.value.length === 0)

const distanceLabel = (spot: CitySpot): string => {
  if (!spot.distance) return t('home.explore.unknownDistance')
  const km = (spot.distance / 1000).toFixed(1)
  return t('home.explore.distance', { km })
}

/**
 * 上游 category 是「大类:中类:小类」的冒号串（如 `旅游景点:国家级景点`）。
 * 全串直接展示会把卡片挤满，而大类（旅游景点/文化场馆）又几乎不带信息量，
 * 所以只取末级 —— 「国家级景点」和「风景名胜」的差别正是用户要看的。
 */
const categoryLabel = (spot: CitySpot): string => {
  const parts = spot.category.split(':').map((part) => part.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

/**
 * 拉一次列表。检索原点二选一：城市名（更准）或定位坐标（地名查不到时兜底）。
 *
 * 城市名与坐标**不要同时发**：后端优先取坐标反查，多绕一跳还可能拿到
 * 与城市名不一致的结果（契约 §5 的检索原点必须是城市中心）。
 */
const load = async (kind: ExploreKind) => {
  const { city, center } = origin.value

  // 既没城市名也没坐标 → 没有检索原点：不请求、不编造，直接显示「尚未确定城市」
  if (!city && !center) {
    spots.value = []
    source.value = 'live'
    degradedReason.value = ''
    resolvedCity.value = ''
    return
  }

  const seq = ++loadSeq
  controller?.abort()
  controller = new AbortController()
  loading.value = true

  try {
    const result = await fetchCityExplore({
      city: city || undefined,
      center: center ?? undefined,
      kind,
      limit: 12,
      signal: controller.signal,
    })
    if (seq !== loadSeq) return
    spots.value = result.spots
    source.value = result.source
    degradedReason.value = result.degradedReason ?? ''
    // 后端解析出的规范城市名（「杭州」→「杭州市」）比用户输入的更适合展示
    resolvedCity.value = result.city?.name || city
  } catch (err) {
    if (seq !== loadSeq) return
    if ((err as Error).name === 'AbortError') return
    spots.value = []
    source.value = 'live'
    degradedReason.value = ''
    feedback.error(t('home.explore.loadFailed'))
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

const handleKindChange = (kind: ExploreKind) => {
  if (kind === activeKind.value) return
  activeKind.value = kind
  void load(kind)
}

/** 手动重试：空态里给一个「再试一次」，免得用户只能刷新整页 */
const reload = () => {
  void load(activeKind.value)
}

/**
 * 定位到「我的城市」。
 *
 * 定位失败不影响已有列表：用户可能只是想知道自己在哪，原来的城市数据仍然有效。
 * 逆地理编码只用于把城市名弄准；查不到城市名（后端未配高德 Key 时必然如此）
 * 就保留坐标，由后端按坐标反查城市 —— **结果一样要落到界面上**，
 * 否则等于白跑一次请求（之前只写了 resolvedCity，列表被「尚未确定城市」挡住）。
 */
const locateMyCity = async () => {
  if (locating.value) return
  locating.value = true
  locateError.value = null
  try {
    const position = await getCurrentLocation()
    const geo = await reverseGeocode(position.location.longitude, position.location.latitude)
    const city = geo?.city || geo?.province || ''
    if (city) {
      locatedCenter.value = null
      locatedCity.value = city
    } else {
      // 地名查不到，但坐标有效：交给后端按坐标解析城市（契约 §5 支持）
      locatedCity.value = ''
      locatedCenter.value = position.location
    }
    // 两个 ref 都参与 watch，改动本身会触发重拉；这里不再重复请求一次
  } catch (err) {
    const kind = err instanceof LocateFailure ? err.kind : 'unavailable'
    locateError.value = kind
    feedback.warning(t(`home.explore.locate.${kind}`))
  } finally {
    locating.value = false
  }
}

/** 导航链接由后端生成（契约 §4），前端不自行拼接 */
const openNavigation = async (spot: CitySpot) => {
  const url = await fetchNavLink(spot.name, spot.location)
  if (!url) {
    feedback.warning(t('result.station.loadFailed'))
    return
  }
  window.open(url, '_blank', 'noopener')
}

/** 城市/坐标变了（例如用户在首页改了目的地、或刚定位）就重新拉一次 */
watch(
  [() => props.city, () => locatedCity.value, () => locatedCenter.value, () => activeKind.value],
  () => {
    void load(activeKind.value)
  },
  { immediate: true }
)

onUnmounted(() => {
  controller?.abort()
})

defineExpose({ reload })
</script>

<template>
  <section class="city-explore">
    <header class="city-explore__head">
      <div class="city-explore__heading">
        <h2 class="city-explore__title">{{ t('home.explore.title') }}</h2>
        <p class="city-explore__sub">
          {{ resolvedCity || t('home.explore.cityUnknown') }} · {{ t('home.explore.subtitle') }}
        </p>
      </div>

      <n-button
        size="small"
        :loading="locating"
        :type="hasLocated ? 'primary' : 'default'"
        :ghost="!hasLocated"
        @click="locateMyCity"
      >
        {{ locating ? t('home.explore.locating') : t('home.explore.locateAction') }}
      </n-button>
    </header>

    <!-- 定位失败：按类型给不同建议，四种情况下用户能做的事完全不同 -->
    <p v-if="locateError" class="city-explore__locate-error">
      {{ t(`home.explore.locate.${locateError}`) }}
    </p>

    <div class="city-explore__kinds" role="tablist">
      <button
        v-for="option in kindOptions"
        :key="option.value"
        type="button"
        role="tab"
        class="city-explore__kind"
        :class="{ 'is-active': activeKind === option.value }"
        :aria-selected="activeKind === option.value"
        @click="handleKindChange(option.value as ExploreKind)"
      >
        {{ option.label }}
      </button>
    </div>

    <p v-if="!canExplore" class="city-explore__hint">{{ t('home.explore.cityHint') }}</p>

    <div v-else-if="loading" class="city-explore__state">
      <n-spin size="small" />
      <span class="city-explore__state-text">{{ t('home.explore.loading') }}</span>
    </div>

    <div v-else-if="isEmpty" class="city-explore__state">
      <span class="city-explore__state-text">
        {{ source === 'degraded' ? t('home.explore.degradedEmpty') : t('home.explore.empty') }}
      </span>
      <span v-if="degradedReason" class="city-explore__reason">{{ degradedReason }}</span>
      <n-button v-if="source !== 'degraded'" size="tiny" quaternary @click="reload">
        {{ t('home.explore.retry') }}
      </n-button>
    </div>

    <ul v-else class="city-explore__list">
      <li v-for="spot in spots" :key="spot.id" class="city-spot">
        <div class="city-spot__main">
          <span class="city-spot__name" :title="spot.name">{{ spot.name }}</span>
          <span class="city-spot__meta tabular-nums">
            <span v-if="categoryLabel(spot)" class="city-spot__category">{{ categoryLabel(spot) }}</span>
            <span>{{ distanceLabel(spot) }}</span>
          </span>
        </div>
        <div class="city-spot__side">
          <n-button size="tiny" quaternary @click="openNavigation(spot)">
            {{ t('home.explore.navAction') }}
          </n-button>
        </div>
      </li>
    </ul>

    <p v-if="sourceNoteKey" class="city-explore__source">{{ t(sourceNoteKey) }}</p>
  </section>
</template>

<style scoped>
.city-explore {
  width: 100%;
  max-width: 1000px;
  margin: var(--sp-6) auto 0;
  padding: var(--sp-6);
  border-radius: var(--r-xl);
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  box-shadow: 0 12px 32px rgba(22, 24, 29, 0.06);
}

.city-explore__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}

.city-explore__title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.city-explore__sub {
  margin: 6px 0 0;
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.city-explore__locate-error {
  margin: var(--sp-3) 0 0;
  font-size: var(--fs-xs);
  color: var(--c-danger);
}

.city-explore__kinds {
  display: flex;
  gap: 8px;
  margin-top: var(--sp-5);
  flex-wrap: wrap;
}

.city-explore__kind {
  padding: 6px 14px;
  border-radius: var(--r-full);
  border: 1px solid var(--c-border);
  background: var(--c-bg-soft);
  color: var(--c-ink-600);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}

.city-explore__kind:hover {
  border-color: var(--c-brand-300);
  color: var(--c-brand-700);
}

.city-explore__kind.is-active {
  background: var(--c-brand-600);
  border-color: var(--c-brand-600);
  color: #fff;
}

.city-explore__hint {
  margin: var(--sp-4) 0 0;
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.city-explore__state {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: var(--sp-5);
  padding: var(--sp-5);
  border-radius: var(--r-md);
  background: var(--c-bg-soft);
  flex-wrap: wrap;
}

.city-explore__state-text {
  font-size: var(--fs-sm);
  color: var(--c-ink-500);
}

.city-explore__reason {
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.city-explore__list {
  margin: var(--sp-4) 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.city-spot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--c-border);
  background: var(--c-bg-card);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.city-spot:hover {
  border-color: var(--c-brand-300);
}

.city-spot__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.city-spot__name {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--c-ink-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.city-spot__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
  min-width: 0;
}

/* 类别只是辅助信息，超长时截断；名称才是主信息，占满剩余宽度 */
.city-spot__category {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 10em;
  padding: 1px 6px;
  border-radius: var(--r-sm);
  background: var(--c-bg-soft);
  color: var(--c-ink-500);
}

.city-spot__meta > span:last-child {
  flex: 0 0 auto;
}

.city-spot__side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.city-explore__source {
  margin: var(--sp-4) 0 0;
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}
</style>
