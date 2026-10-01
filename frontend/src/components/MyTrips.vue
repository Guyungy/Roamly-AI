<template>
  <section class="my-trips">
    <header class="my-trips__head">
      <h2 class="my-trips__title">
        {{ t('trips.title') }}
        <span v-if="auth.isSignedIn && trips.length" class="my-trips__count">
          {{ t('trips.count', { count: trips.length }) }}
        </span>
      </h2>
      <n-button v-if="auth.isSignedIn" text type="primary" :loading="loading" @click="load">
        {{ t('trips.refresh') }}
      </n-button>
    </header>

    <n-alert v-if="errorText" type="warning" :show-icon="true" class="my-trips__alert">
      {{ errorText }}
    </n-alert>

    <!-- 未登录：行程保存在云端，必须先有身份 -->
    <div v-if="!auth.isSignedIn" class="my-trips__empty">
      <p>{{ t('trips.needLogin') }}</p>
      <n-button type="primary" @click="emit('auth-required')">{{ t('auth.login') }}</n-button>
    </div>

    <div v-else-if="loading && trips.length === 0" class="my-trips__empty">
      <n-spin size="small" />
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else-if="trips.length === 0" class="my-trips__empty">
      <p>{{ t('trips.empty') }}</p>
    </div>

    <ul v-else class="my-trips__list">
      <li v-for="item in trips" :key="item.id" class="my-trips__item">
        <div class="my-trips__item-main">
          <strong class="my-trips__item-city">{{ item.title || item.city }}</strong>
          <span class="my-trips__item-meta">
            {{ formatRange(item)
            }}<template v-if="item.travel_days"> · {{ t('common.dayCount', { count: item.travel_days }, item.travel_days) }}</template>
          </span>
        </div>
        <div class="my-trips__item-actions">
          <n-button text type="primary" size="small" @click="openTrip(item)">{{ t('trips.open') }}</n-button>
          <n-button
            text
            type="error"
            size="small"
            :loading="deletingId === item.id"
            @click="confirmDelete(item)"
          >
            {{ t('common.delete') }}
          </n-button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NAlert, NButton, NSpin } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { deleteTrip, listMyTrips, type SavedTrip } from '@/services/cloudTrips'
import { confirmDialog } from '@/utils/feedback'
import type { TripPlan } from '@/types'

const emit = defineEmits<{
  (e: 'open-trip', plan: TripPlan): void
  (e: 'auth-required'): void
}>()

const { t } = useI18n()
const auth = useAuthStore()

const trips = ref<SavedTrip[]>([])
const loading = ref(false)
const deletingId = ref<number | null>(null)
const errorText = ref('')

const signedIn = computed(() => auth.isSignedIn)

function formatRange(item: SavedTrip): string {
  if (item.start_date && item.end_date) {
    return `${item.start_date} ${t('common.to')} ${item.end_date}`
  }
  return item.start_date || item.end_date || ''
}

async function load() {
  if (!auth.isSignedIn) {
    trips.value = []
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    trips.value = await listMyTrips()
  } catch (err) {
    errorText.value =
      err instanceof Error && err.message === 'AUTH_REQUIRED' ? t('trips.needLogin') : t('trips.loadFailed')
    console.error('[cloud] 行程列表读取失败', err)
  } finally {
    loading.value = false
  }
}

function openTrip(item: SavedTrip) {
  if (!item.plan) return
  emit('open-trip', item.plan)
}

function confirmDelete(item: SavedTrip) {
  confirmDialog({
    title: t('trips.deleteTitle'),
    content: t('trips.deleteConfirm', { name: item.title || item.city }),
    okText: t('common.delete'),
    cancelText: t('common.cancel'),
    onOk: () => remove(item),
  })
}

async function remove(item: SavedTrip) {
  deletingId.value = item.id
  errorText.value = ''
  try {
    const affected = await deleteTrip(item.id)
    // 删除 0 行 = 记录不存在或不属于当前用户（被 RLS 过滤），不能当成删除成功
    if (affected === 0) {
      errorText.value = t('trips.deleteNotAllowed')
    }
    await load()
  } catch (err) {
    errorText.value =
      err instanceof Error && err.message === 'AUTH_REQUIRED' ? t('trips.needLogin') : t('trips.deleteFailed')
    console.error('[cloud] 行程删除失败', err)
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  void auth.init().then(() => load())
})

watch(signedIn, (signed) => {
  if (signed) void load()
  else trips.value = []
})

defineExpose({ load })
</script>

<style scoped>
.my-trips {
  width: 100%;
  max-width: 900px;
  margin: var(--sp-7) auto 0;
  padding: var(--sp-5) var(--sp-6);
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  box-shadow: var(--sh-sm);
  color: var(--c-ink-700);
  text-align: left;
}

.my-trips__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.my-trips__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.my-trips__count {
  padding: 2px 10px;
  border-radius: var(--r-full);
  background: var(--c-brand-50);
  color: var(--c-brand-700);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
}

.my-trips__alert {
  margin-top: var(--sp-3);
}

.my-trips__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6) 0 var(--sp-2);
  color: var(--c-ink-400);
  font-size: var(--fs-base);
}

.my-trips__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
}

.my-trips__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--c-bg-soft);
  transition: background var(--dur-fast) var(--ease-out);
}

.my-trips__item:hover {
  background: var(--c-ink-50);
}

.my-trips__item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.my-trips__item-city {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.my-trips__item-meta {
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.my-trips__item-actions {
  display: flex;
  gap: var(--sp-3);
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  .my-trips {
    padding: var(--sp-4) var(--sp-4);
  }

  .my-trips__item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }
}
</style>
