<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NSelect, NSpin, NEmpty, type SelectOption } from 'naive-ui'
import {
  fetchNearbyStations,
  type NearbyStationSource,
  type StationView,
} from '@/services/nearbyStation'
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

const props = defineProps<{
  /** 可切换的查看中心点（行程里的天/景点组合） */
  centers: StationCenter[]
}>()

const emit = defineEmits<{
  /** 点击某站点时上抛，供父层把地图镜头移过去 */
  (e: 'focus', station: StationView): void
}>()

const { t } = useI18n()

const selectedKey = ref<string>('')
const stations = ref<StationView[]>([])
const loading = ref(false)
const source = ref<NearbyStationSource>('live')
const degradedReason = ref('')
const failed = ref(false)
let controller: AbortController | null = null

const centerOptions = computed<SelectOption[]>(() =>
  props.centers.map((c) => ({ label: c.label, value: c.key }))
)

const activeCenter = computed<StationCenter | null>(() => {
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
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  failed.value = false
  try {
    const result = await fetchNearbyStations(
      { longitude: center.longitude, latitude: center.latitude },
      { signal: controller.signal }
    )
    stations.value = result.stations
    source.value = result.source
    degradedReason.value = result.degradedReason ?? ''
  } catch (err) {
    // 只有「取消」会走到这里（fetchNearbyStations 内部已把其余失败降级），
    // 切中心点时旧请求被取消，必须原样丢弃，不能把列表清空
    if ((err as Error).name === 'AbortError') return
    stations.value = []
    source.value = 'live'
    degradedReason.value = ''
    failed.value = true
  } finally {
    loading.value = false
  }
}

const handleClick = (station: StationView) => {
  emit('focus', station)
}

watch(
  () => props.centers,
  (centers) => {
    // 中心点列表变化时：默认选中第一个，确保列表一开始就有内容
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
      <div>
        <p class="station-panel__title">{{ t('result.station.title') }}</p>
        <p v-if="activeCenter" class="station-panel__center">{{ activeCenter.label }}</p>
      </div>
      <n-select
        :value="selectedKey"
        :options="centerOptions"
        size="small"
        class="station-panel__select"
        @update:value="selectedKey = $event as string"
      />
    </div>

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