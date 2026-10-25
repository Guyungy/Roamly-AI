<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NSelect, NSpin, NEmpty, type SelectOption } from 'naive-ui'
import {
  fetchNearbyStations,
  type NearbyStationSource,
  type StationView,
} from '@/services/nearbyStation'
import {
  getCurrentLocation,
  LocateFailure,
  type CurrentPosition,
  type LocateFailureKind,
} from '@/services/geolocation'
import { formatPlaceLabel, reverseGeocode } from '@/services/reverseGeocode'
import { feedback } from '@/utils/feedback'
import {
  infoColor,
  successColor,
} from '@/utils/designToken'

export interface StationCenter {
  /** 唯一定位（dayIndex-attractionIndex） */
  key: string
  label: string
  longitude: number
  latitude: number
}

/** 「我的位置」伪中心点的 key，不与行程中心点（`天-序号`）冲突 */
const CURRENT_KEY = '__current__'

const props = defineProps<{
  /** 可切换的查看中心点（行程里的天/景点组合） */
  centers: StationCenter[]
  /** 是否提供「我的位置」选项；行程里一个坐标都没有时父层仍可只按当前位置看站点 */
  allowCurrentLocation?: boolean
}>()

const emit = defineEmits<{
  /** 点击某站点时上抛，供父层把地图镜头移过去 */
  (e: 'focus', station: StationView): void
  /** 定位成功时上抛，供父层在地图上落一个「我的位置」标记 */
  (e: 'locate', position: CurrentPosition): void
}>()

const { t } = useI18n()

const selectedKey = ref<string>('')
const stations = ref<StationView[]>([])
const loading = ref(false)
const source = ref<NearbyStationSource>('live')
const degradedReason = ref('')
const failed = ref(false)
let controller: AbortController | null = null
/** 列表请求序号：只有最后一次请求有权写 stations/loading */
let loadSeq = 0

/*
 * 当前位置：独立于行程中心点。
 * 定位结果单独存（不塞进 props.centers），因为它是运行时才知道的、且可能失败；
 * 塞进 centers 会让父层的 computed 每次定位都要重算一遍行程坐标。
 */
const currentPosition = ref<CurrentPosition | null>(null)
const currentPlace = ref('')
const locating = ref(false)
const locateError = ref<LocateFailureKind | null>(null)

/** 可选项 = 行程中心点 +（可选）「我的位置」 */
const centerOptions = computed<SelectOption[]>(() => {
  const options: SelectOption[] = props.centers.map((c) => ({ label: c.label, value: c.key }))
  if (props.allowCurrentLocation) {
    options.unshift({
      label: currentPlace.value
        ? t('result.station.currentLocationNamed', { place: currentPlace.value })
        : t('result.station.currentLocation'),
      value: CURRENT_KEY,
    })
  }
  return options
})

const isCurrentSelected = computed(() => selectedKey.value === CURRENT_KEY)

/** 当前列表的中心坐标（行程点或我的位置） */
const activeCenter = computed<{ key: string; label: string; longitude: number; latitude: number } | null>(() => {
  if (isCurrentSelected.value) {
    const pos = currentPosition.value
    if (!pos) return null
    return {
      key: CURRENT_KEY,
      label: currentPlace.value || t('result.station.currentLocation'),
      longitude: pos.location.longitude,
      latitude: pos.location.latitude,
    }
  }
  const found = props.centers.find((c) => c.key === selectedKey.value)
  return found ?? null
})

/** 数据是否来自降级（缓存 / 后端降级 / 内置兜底）——三者文案不同，不能混说 */
const isFallback = computed(() => source.value !== 'live')

/** 降级文案的 i18n key，按来源严格区分 */
const fallbackNoteKey = computed(() => {
  switch (source.value) {
    case 'cache':
      return 'result.station.fromCache'
    case 'degraded':
      return 'result.station.fromDegraded'
    case 'mock':
      return 'result.station.fromMock'
    default:
      return ''
  }
})

const hasViewableStations = computed(() => stations.value.length > 0 && loading.value === false)

// 每个中心点会配一个地图 marker 的颜色，用于列表行与地图呼应
const typeMeta = (type: 'subway' | 'bus') =>
  type === 'subway'
    ? { label: t('result.station.subway'), color: infoColor() }
    : { label: t('result.station.bus'), color: successColor() }

const loadStations = async (center: StationCenter) => {
  // 并发保护：取消上一个请求后它仍会在 finally 里把 loading 置回 false，
  // 会把新请求的 loading 提前关掉。用序号只让最后一次请求写状态。
  const seq = ++loadSeq
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  failed.value = false
  try {
    const result = await fetchNearbyStations(
      { longitude: center.longitude, latitude: center.latitude },
      { signal: controller.signal }
    )
    if (seq !== loadSeq) return
    stations.value = result.stations
    source.value = result.source
    degradedReason.value = result.degradedReason ?? ''
  } catch (err) {
    if (seq !== loadSeq) return
    // 只有「取消」会走到这里（fetchNearbyStations 内部已把其余失败降级），
    // 切中心点时旧请求被取消，必须原样丢弃，不能把列表清空
    if ((err as Error).name === 'AbortError') return
    stations.value = []
    source.value = 'live'
    degradedReason.value = ''
    failed.value = true
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

const handleClick = (station: StationView) => {
  emit('focus', station)
}

/**
 * 定位到当前位置并切换列表中心。
 *
 * 两件事分开做：定位成功后立刻按该坐标拉站点（这是用户点按钮的意图），
 * 地名（逆地理编码）只是锦上添花 —— 它失败了就退回「当前位置」四个字，
 * 不能因为它把已经成功的定位判成失败。
 */
const locateCurrent = async () => {
  if (locating.value) return
  locating.value = true
  locateError.value = null
  try {
    const position = await getCurrentLocation()
    currentPosition.value = position
    emit('locate', position)
    // 先切中心点，watch 会带着新坐标去拉站点；地名回来后只更新标签。
    // 已经是「我的位置」时 key 不变、watch 不触发 —— 用户重按是想刷新，得自己再拉一次。
    if (selectedKey.value === CURRENT_KEY) {
      loadStations({
        key: CURRENT_KEY,
        label: currentPlace.value || t('result.station.currentLocation'),
        longitude: position.location.longitude,
        latitude: position.location.latitude,
      })
    } else {
      selectedKey.value = CURRENT_KEY
    }
    void reverseGeocode(position.location.longitude, position.location.latitude)
      .then((geo) => {
        // 期间又定位了一次，旧结果不要覆盖新地名
        if (currentPosition.value !== position) return
        currentPlace.value = formatPlaceLabel(geo)
      })
      .catch(() => {
        /* reverseGeocode 自身已吞错，这里只是兜住意外 */
      })
  } catch (err) {
    const kind = err instanceof LocateFailure ? err.kind : 'unavailable'
    locateError.value = kind
    feedback.warning(t(`result.station.locate.${kind}`))
  } finally {
    locating.value = false
  }
}

/** 定位精度提示：桌面浏览器常是 IP 定位，几千米的精度说「附近」会误导 */
const accuracyNote = computed(() => {
  const accuracy = currentPosition.value?.accuracy ?? -1
  if (!isCurrentSelected.value || accuracy <= 0) return ''
  if (accuracy > 2000) return t('result.station.accuracyLow')
  if (accuracy > 500) return t('result.station.accuracyMedium')
  return ''
})

/** 手动切走中心点时把上一次的定位失败提示收掉，否则它会一直挂在新列表上方 */
const handleCenterChange = (key: string) => {
  selectedKey.value = key
  locateError.value = null
}

watch(
  () => props.centers,
  (centers) => {
    // 中心点列表变化时：默认选中第一个，确保列表一开始就有内容。
    // 已选「我的位置」时不要抢走用户的选择（重算行程会触发这里）。
    if (selectedKey.value === CURRENT_KEY) return
    if (centers.length && !centers.some((c) => c.key === selectedKey.value)) {
      selectedKey.value = centers[0].key
    }
  },
  { immediate: true }
)

watch(
  activeCenter,
  (center) => {
    if (center && !loading.value) loadStations(center)
  },
  { immediate: true }
)

onUnmounted(() => {
  controller?.abort()
})
</script>

<template>
  <div class="station-panel">
    <div class="station-panel__head">
      <div class="station-panel__heading">
        <p class="station-panel__title">{{ t('result.station.title') }}</p>
        <p v-if="activeCenter" class="station-panel__center">{{ activeCenter.label }}</p>
      </div>
      <div class="station-panel__actions">
        <n-button
          v-if="allowCurrentLocation"
          size="small"
          :loading="locating"
          :type="isCurrentSelected ? 'primary' : 'default'"
          :ghost="!isCurrentSelected"
          @click="locateCurrent"
        >
          {{ locating ? t('result.station.locating') : t('result.station.locateAction') }}
        </n-button>
        <n-select
          v-if="centerOptions.length > 1"
          :value="selectedKey"
          :options="centerOptions"
          size="small"
          class="station-panel__select"
          @update:value="handleCenterChange($event as string)"
        />
      </div>
    </div>

    <!-- 定位失败：按失败类型给不同说明，用户能做的事不一样 -->
    <p v-if="locateError" class="station-panel__locate-error">
      {{ t(`result.station.locate.${locateError}`) }}
    </p>

    <!-- 精度提示：桌面浏览器常是 IP 定位（几千米），此时「附近」这个词是失真的 -->
    <p v-if="accuracyNote" class="station-panel__accuracy">{{ accuracyNote }}</p>

    <div v-if="loading" class="station-panel__state">
      <n-spin size="small" />
      <span class="station-panel__state-text">{{ t('result.station.loading') }}</span>
    </div>

    <div v-else-if="failed" class="station-panel__state">
      <span class="station-panel__state-text station-panel__state-text--error">
        {{ t('result.station.loadFailed') }}
      </span>
    </div>

    <n-empty
      v-else-if="!hasViewableStations"
      class="station-panel__empty"
      :description="source === 'degraded' ? t('result.station.degradedEmpty') : t('result.station.empty')"
    >
      <template #icon>
        <span aria-hidden="true">🚌</span>
      </template>
    </n-empty>

    <ul v-else class="station-panel__list">
      <li
        v-for="station in stations"
        :key="station.id"
        class="station-row"
        role="button"
        tabindex="0"
        @click="handleClick(station)"
        @keydown.enter.prevent="handleClick(station)"
        @keydown.space.prevent="handleClick(station)"
      >
        <span
          class="station-row__dot"
          :style="{ background: typeMeta(station.type).color }"
          aria-hidden="true"
        />
        <span class="station-row__main">
          <span class="station-row__name">
            {{ station.name }}
            <span
              class="station-row__tag"
              :style="{
                background: `${typeMeta(station.type).color}1a`,
                color: typeMeta(station.type).color,
              }"
            >
              {{ typeMeta(station.type).label }}
            </span>
          </span>
          <span class="station-row__address">{{ station.address || '—' }}</span>
        </span>
        <span class="station-row__meta">
          <span class="station-row__distance tabular-nums">
            {{ t('result.station.meters', { value: station.distance }) }}
          </span>
          <span
            class="station-row__walk"
            :class="{ 'is-far': !station.walkable }"
            :title="t('result.station.walkTitle')"
          >
            {{ t('result.station.walkHint', { minutes: station.walkMinutes, km: station.walkKm }) }}
          </span>
        </span>
      </li>
    </ul>

    <p
      v-if="isFallback && !loading && (hasViewableStations || source === 'degraded')"
      class="station-panel__note"
    >
      {{ t(fallbackNoteKey) }}
      <span v-if="source === 'degraded' && degradedReason" class="station-panel__reason">
        {{ degradedReason }}
      </span>
    </p>
  </div>
</template>

<style scoped>
.station-panel {
  border-top: 1px solid var(--c-border);
  padding: var(--sp-4) var(--sp-5) var(--sp-5);
  background: var(--c-bg-card);
}

.station-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

.station-panel__heading {
  min-width: 0;
}

.station-panel__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}

.station-panel__locate-error,
.station-panel__accuracy {
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-xs);
}

.station-panel__locate-error {
  color: var(--c-warning);
}

.station-panel__accuracy {
  color: var(--c-ink-400);
}

.station-panel__title {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.station-panel__center {
  margin: 2px 0 0;
  font-size: var(--fs-xs);
  color: var(--c-ink-500);
}

.station-panel__select {
  width: 180px;
}

.station-panel__state {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-5) 0;
}

.station-panel__state-text {
  font-size: var(--fs-sm);
  color: var(--c-ink-500);
}

.station-panel__state-text--error {
  color: var(--c-warning);
}

.station-panel__empty {
  padding: var(--sp-5) 0;
}

.station-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.station-row {
  --row-gap: var(--sp-2);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--c-bg-soft);
  cursor: pointer;
  transition: background 0.15s ease;
}

.station-row:hover {
  background: var(--c-bg-sunken);
}

.station-row:focus-visible {
  outline: 2px solid var(--c-brand-500);
  outline-offset: 2px;
}

.station-row__dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: var(--r-full);
}

.station-row__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.station-row__name {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--c-ink-800);
}

.station-row__tag {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: var(--fw-medium);
}

.station-row__address {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.station-row__meta {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.station-row__distance {
  font-size: var(--fs-xs);
  color: var(--c-ink-500);
}

.station-row__walk {
  font-size: var(--fs-xs);
  color: var(--c-success);
  font-weight: var(--fw-medium);
}

.station-row__walk.is-far {
  color: var(--c-warning);
}

.station-panel__note {
  margin: var(--sp-3) 0 0;
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

/* 后端降级原因（如「Key 未配置」）：附在文案后面，用小一号字弱化，但必须可见 */
.station-panel__reason {
  display: block;
  margin-top: 2px;
  color: var(--c-ink-500);
  opacity: 0.85;
}
</style>