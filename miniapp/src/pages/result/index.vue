<template>
  <view class="result-page">
    <wd-navbar title="行程详情" left-arrow @click-left="goBack" fixed placeholder />

    <view v-if="tripStore.hasTripPlan" class="result-content">
      <!-- 城市头部 -->
      <wd-card class="city-hero-card" :body-style="{ padding: '40rpx' }">
        <view class="city-hero">
          <view class="hero-emoji">🎒</view>
          <view class="city-name">{{ tripPlan!.city }}</view>
          <view class="city-date-box">
            <wd-tag type="primary" plain round>
              {{ tripPlan!.start_date }} — {{ tripPlan!.end_date }}
            </wd-tag>
          </view>
          <view v-if="tripPlan!.overall_suggestions" class="city-suggestion">
            {{ tripPlan!.overall_suggestions }}
          </view>
        </view>
        <view class="action-bar">
          <wd-button size="small" plain round @click="shareTrip">
            分享行程
          </wd-button>
        </view>
      </wd-card>

      <!-- Tab 切换 -->
      <view class="tabs-container">
        <wd-tabs v-model="activeTab" sticky animated>
          <wd-tab v-for="tab in tabs" :key="tab.key" :title="tab.label" :name="tab.key">
            <view class="section-content">
              <!-- 每日行程 -->
              <template v-if="tab.key === 'days'">
                <DayCard
                  v-for="(day, index) in tripPlan!.days"
                  :key="day.day_index"
                  :day="day"
                  :images="attractionImages"
                  :default-expanded="index === 0"
                />
              </template>

              <!-- 预算 -->
              <template v-if="tab.key === 'budget'">
                <BudgetPanel v-if="tripPlan!.budget" :budget="tripPlan!.budget" />
                <wd-status-tip v-else image="content" tip="暂无预算数据" />
              </template>

              <!-- 天气 -->
              <template v-if="tab.key === 'weather'">
                <WeatherCard
                  v-if="tripPlan!.weather_info && tripPlan!.weather_info.length > 0"
                  :list="tripPlan!.weather_info"
                  :current="currentWeather"
                  :active-index="activeWeatherIndex"
                  @select="activeWeatherIndex = $event"
                />
                <wd-status-tip v-else image="content" tip="暂无天气数据" />
              </template>

              <!-- 地图 -->
              <template v-if="tab.key === 'map'">
                <view class="map-section">
                  <map v-if="mapMarkers.length > 0" id="trip-map" class="trip-map" :latitude="mapCenter.latitude" :longitude="mapCenter.longitude" :include-points="mapIncludePoints" :markers="mapMarkers" :polyline="mapPolyline" show-compass enable-zoom enable-scroll />
                  <view v-if="mapMarkers.length === 0" class="map-empty">
                    <wd-status-tip image="content" tip="暂无景点坐标数据" />
                  </view>
                </view>

                <!-- 附近站点：切换"第几天·景点"，或切到「我的位置」，展示周边地铁/公交站 + 步行可达提示 -->
                <view v-if="stationCenters.length || allowCurrentLocation" class="map-stations">
                  <view class="map-stations__head">
                    <text class="map-stations__title">附近站点</text>
                    <view class="map-stations__head-right">
                      <text v-if="stationSource === 'cache'" class="map-stations__note">已用缓存</text>
                      <text v-else-if="stationSource === 'degraded'" class="map-stations__note">后端已降级</text>
                      <text v-else-if="stationSource === 'mock'" class="map-stations__note">演示数据</text>
                      <text
                        v-if="allowCurrentLocation"
                        class="map-stations__locate"
                        :class="{ 'is-active': selectedStationCenter === CURRENT_STATION_KEY }"
                        @click="useCurrentLocation"
                      >
                        {{ locating ? '定位中…' : '我的位置' }}
                      </text>
                    </view>
                  </view>

                  <view v-if="locateErrorText" class="map-stations__locate-error">
                    <text>{{ locateErrorText }}</text>
                  </view>
                  <view v-else-if="accuracyNote" class="map-stations__accuracy">
                    <text>{{ accuracyNote }}</text>
                  </view>

                  <scroll-view scroll-x class="map-stations__switch" show-scrollbar="false">
                    <view class="map-stations__switch-inner">
                      <wd-tag
                        v-if="currentCenter"
                        round
                        size="medium"
                        :type="selectedStationCenter === CURRENT_STATION_KEY ? 'primary' : 'default'"
                        :plain="selectedStationCenter !== CURRENT_STATION_KEY"
                        custom-class="map-stations__chip"
                        @click="selectStationCenter(CURRENT_STATION_KEY)"
                      >
                        {{ currentCenter.label }}
                      </wd-tag>
                      <wd-tag
                        v-for="c in stationCenters"
                        :key="c.key"
                        round
                        size="medium"
                        :type="selectedStationCenter === c.key ? 'primary' : 'default'"
                        :plain="selectedStationCenter !== c.key"
                        custom-class="map-stations__chip"
                        @click="selectStationCenter(c.key)"
                      >
                        {{ c.label }}
                      </wd-tag>
                    </view>
                  </scroll-view>

                  <view v-if="stationsLoading" class="map-stations__state">
                    <text class="map-stations__state-text">正在检索附近站点…</text>
                  </view>
                  <wd-status-tip
                    v-else-if="stations.length === 0"
                    image="content"
                    :tip="stationSource === 'degraded' ? '后端已降级，暂时无法获取站点' : '该位置附近暂无站点'"
                  />
                  <view v-else class="map-stations__list">
                    <view
                      v-for="s in stations"
                      :key="s.id"
                      class="map-station-row"
                      @click="focusStation(s)"
                    >
                      <view class="map-station-row__type" :class="`is-${s.type}`">
                        {{ s.type === 'subway' ? '地铁' : '公交' }}
                      </view>
                      <view class="map-station-row__main">
                        <text class="map-station-row__name">{{ s.name }}</text>
                        <text class="map-station-row__address">{{ s.address || '—' }}</text>
                      </view>
                      <view class="map-station-row__meta">
                        <text class="map-station-row__distance">{{ s.distance }} 米</text>
                        <text
                          class="map-station-row__walk"
                          :class="{ 'is-far': !s.walkable }"
                        >步行约 {{ s.walkMinutes }} 分钟 · {{ s.walkKm }} 公里</text>
                      </view>
                    </view>
                  </view>
                </view>
              </template>
            </view>
          </wd-tab>
        </wd-tabs>
      </view>

      <!-- 悬浮AI按钮 -->
      <wd-fab :draggable="true" type="primary" @click="goToChat">
        <template #button>
          <view class="fab-btn">
            <text class="fab-icon">🎒</text>
            <text class="fab-text">问AI</text>
          </view>
        </template>
      </wd-fab>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <wd-status-tip image="content" tip="还没有旅行计划" />
      <view class="empty-action">
        <wd-button type="primary" round block @click="goToLanding">立即开始</wd-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { onShareAppMessage } from '@dcloudio/uni-app'
import DayCard from '@/components/DayCard.vue'
import BudgetPanel from '@/components/BudgetPanel.vue'
import WeatherCard from '@/components/WeatherCard.vue'
import { useTripStore } from '@/stores/trip'
import {
  getAttractionPhoto,
  fetchNearbyStations,
  reverseGeocode,
  type StationView,
  type StationSource,
} from '@/services/api'
import { guideShareToFriend } from '@/utils/share'

const tripStore = useTripStore()
const tripPlan = computed(() => tripStore.tripPlan)

const activeTab = ref('days')
const activeWeatherIndex = ref(0)
const attractionImages = ref<Record<string, string>>({})

const tabs = [
  { key: 'days', label: '行程' },
  { key: 'budget', label: '预算' },
  { key: 'weather', label: '天气' },
  { key: 'map', label: '地图' },
]

const currentWeather = computed(() => {
  const list = tripPlan.value?.weather_info ?? []
  if (list.length === 0) return null
  const idx = Math.min(Math.max(activeWeatherIndex.value, 0), list.length - 1)
  return list[idx]
})

// 地图数据
const mapCenter = computed(() => {
  if (!tripPlan.value?.days?.length) return { latitude: 39.9, longitude: 116.4 }
  const validAttractions = tripPlan.value.days
    .flatMap(d => d.attractions)
    .filter(a => a.location?.latitude && a.location?.longitude && a.location.latitude !== 0 && a.location.longitude !== 0)
  if (validAttractions.length === 0) return { latitude: 39.9, longitude: 116.4 }
  const avgLat = validAttractions.reduce((s, a) => s + a.location!.latitude, 0) / validAttractions.length
  const avgLng = validAttractions.reduce((s, a) => s + a.location!.longitude, 0) / validAttractions.length
  return { latitude: avgLat, longitude: avgLng }
})

const mapMarkers = computed(() => {
  if (!tripPlan.value?.days) return []
  const markers: any[] = []
  let id = 1
  tripPlan.value.days.forEach((day) => {
    day.attractions.forEach((attr, idx) => {
      if (attr.location?.latitude && attr.location?.longitude) {
        markers.push({
          id: id++,
          latitude: attr.location.latitude,
          longitude: attr.location.longitude,
          title: attr.name,
          callout: {
            content: `D${day.day_index + 1}-${idx + 1} ${attr.name}`,
            color: '#FF6B35',
            bgColor: '#FFFFFF',
            borderColor: '#FFE4D6',
            borderWidth: 1,
            borderRadius: 8,
            padding: 8,
            display: 'ALWAYS',
            fontSize: 12,
          },
          width: 28,
          height: 36,
        })
      }
    })
  })
  return markers
})

const mapIncludePoints = computed(() => {
  return mapMarkers.value
    .filter((m: any) => m.latitude && m.longitude)
    .map((m: any) => ({ latitude: m.latitude, longitude: m.longitude }))
})

const mapPolyline = computed(() => {
  if (!tripPlan.value?.days) return []
  const allPoints: { latitude: number; longitude: number }[] = []
  tripPlan.value.days.forEach((day) => {
    day.attractions.forEach((attr) => {
      if (attr.location?.latitude && attr.location?.longitude) {
        allPoints.push({
          latitude: attr.location.latitude,
          longitude: attr.location.longitude,
        })
      }
    })
  })
  if (allPoints.length < 2) return []
  return [{
    points: allPoints,
    color: '#FF6B3580',
    width: 4,
    dottedLine: true,
  }]
})

// ============ 附近站点 ============

/** 行程里所有「天 + 景点」作为可切换的附近站点查看中心 */
const stationCenters = computed(() => {
  if (!tripPlan.value?.days) return []
  const centers: { key: string; label: string; longitude: number; latitude: number }[] = []
  tripPlan.value.days.forEach((day) => {
    ;(day.attractions || []).forEach((attr, idx) => {
      const loc = attr.location
      if (!loc || !loc.latitude || !loc.longitude) return
      centers.push({
        key: `D${day.day_index + 1}-${idx + 1}`,
        label: `第${day.day_index + 1}天·${idx + 1}`,
        longitude: loc.longitude,
        latitude: loc.latitude,
      })
    })
  })
  return centers
})

const selectedStationCenter = ref('')
const stations = ref<StationView[]>([])
const stationsLoading = ref(false)
const stationSource = ref<StationSource>('live')

/*
 * 当前位置：与行程中心点并列的一个可选中心。
 * 小程序 `uni.getLocation({type:'gcj02'})` 拿到的**已经是 GCJ-02**（与后端契约一致），
 * 不像 Web 端要自己从 WGS-84 转 —— 这里不能照抄 Web 的转换，会把坐标多平移一次。
 */
const CURRENT_STATION_KEY = '__current__'
/** 小程序端「我的位置」始终可选：行程里一个坐标都没有时也能按当前位置看站点 */
const allowCurrentLocation = true
const locating = ref(false)
const locateErrorText = ref('')
/** 站点列表请求序号：并发切中心点时只让最后一次写状态 */
let loadSeq = 0
const currentPosition = ref<{ longitude: number; latitude: number; accuracy: number } | null>(null)
const currentPlace = ref('')

const currentCenter = computed(() => {
  const pos = currentPosition.value
  if (!pos) return null
  return {
    key: CURRENT_STATION_KEY,
    label: currentPlace.value ? `我的位置·${currentPlace.value}` : '我的位置',
    longitude: pos.longitude,
    latitude: pos.latitude,
  }
})

/** 定位精度提示：精度差时「附近」是失真的，必须如实说 */
const accuracyNote = computed(() => {
  if (selectedStationCenter.value !== CURRENT_STATION_KEY) return ''
  const accuracy = currentPosition.value?.accuracy ?? -1
  if (accuracy <= 0) return ''
  if (accuracy > 2000) return '当前为粗略定位（精度可能达数公里），附近站点仅供参考'
  if (accuracy > 500) return '定位精度约百米级，附近站点可能与实际有偏差'
  return ''
})

/** 定位失败分类 → 用户能看懂的说明（小程序四种失败原因，能做的事不一样） */
function describeLocateError(err: any): string {
  const msg = String(err?.errMsg || err?.message || '')
  if (msg.includes('deny') || msg.includes('auth') || msg.includes('denied')) {
    return '定位权限被拒绝，请在右上角「···」→ 设置里允许位置权限后重试'
  }
  if (msg.includes('timeout') || msg.includes('超时')) {
    return '定位超时，请重试或改选行程中的地点'
  }
  if (msg.includes('system permission') || msg.includes('系统')) {
    return '系统定位服务未开启，请在手机设置里打开定位后重试'
  }
  return '暂时无法获取位置，请改选行程中的地点'
}

/** 手动切中心点：顺手把上一次的定位失败提示收掉，否则会一直挂在新列表上方 */
function selectStationCenter(key: string) {
  selectedStationCenter.value = key
  locateErrorText.value = ''
}

/** 取当前位置（GCJ-02，小程序原生即 GCJ-02），成功后切到「我的位置」中心 */
async function useCurrentLocation() {
  if (locating.value) return
  locating.value = true
  locateErrorText.value = ''
  try {
    const res: any = await Promise.race([
      new Promise((resolve, reject) => {
        uni.getLocation({ type: 'gcj02', success: resolve, fail: reject })
      }),
      // uni.getLocation 自身有超时，但它偶发不回调（系统弹窗挂起时），自己再兜一层
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ])

    const longitude = Number(res?.longitude)
    const latitude = Number(res?.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error('invalid')
    }
    const accuracy = Number.isFinite(Number(res?.accuracy)) ? Number(res.accuracy) : -1

    currentPosition.value = { longitude, latitude, accuracy }
    // 重按是「刷新」：key 不变不会触发 watch，得自己再拉一次
    if (selectedStationCenter.value === CURRENT_STATION_KEY) {
      await loadStations({ longitude, latitude })
    } else {
      selectedStationCenter.value = CURRENT_STATION_KEY
    }

    // 地名只是锦上添花，失败就保持「我的位置」四个字，不影响已成功的定位
    reverseGeocode(latitude, longitude)
      .then((geo: any) => {
        const city = geo?.city || geo?.province || ''
        const district = geo?.district || ''
        currentPlace.value = [city, district].filter(Boolean).join('·')
      })
      .catch(() => {
        /* 地名查不到就算了 */
      })
  } catch (err) {
    locateErrorText.value = describeLocateError(err)
    uni.showToast({ title: locateErrorText.value, icon: 'none', duration: 3000 })
  } finally {
    locating.value = false
  }
}

async function loadStations(c: { longitude: number; latitude: number }) {
  // 与 Web 端同样的问题：并发切换中心点时，只让最后一次请求写状态
  const seq = ++loadSeq
  stationsLoading.value = true
  try {
    const res = await fetchNearbyStations(c.longitude, c.latitude)
    if (seq !== loadSeq) return
    stations.value = res.stations
    stationSource.value = res.source
  } catch {
    if (seq !== loadSeq) return
    stations.value = []
  } finally {
    if (seq === loadSeq) stationsLoading.value = false
  }
}

function focusStation(s: StationView) {
  const ctx = uni.createMapContext('trip-map')
  ctx.moveToLocation({
    latitude: s.location.latitude,
    longitude: s.location.longitude,
  })
  uni.showToast({ title: '已聚焦该站点', icon: 'none' })
}

watch(selectedStationCenter, (key) => {
  if (!key) return
  // 「我的位置」的坐标存在 currentPosition 里，不在 stationCenters 里
  if (key === CURRENT_STATION_KEY) {
    const pos = currentPosition.value
    if (pos) loadStations(pos)
    return
  }
  const c = stationCenters.value.find((item) => item.key === key)
  if (c) loadStations(c)
})

watch(
  () => tripPlan.value?.days,
  () => {
    // 已选「我的位置」时不要被行程重算抢走选择
    if (selectedStationCenter.value === CURRENT_STATION_KEY) return
    if (tripPlan.value?.days?.length && !selectedStationCenter.value) {
      selectedStationCenter.value = stationCenters.value[0]?.key || ''
    }
  },
  { immediate: true }
)

// 加载景点图片
async function loadAttractionImages() {
  if (!tripPlan.value) return
  const city = tripPlan.value.city
  const tasks: Promise<void>[] = []

  for (const day of tripPlan.value.days) {
    for (const attr of day.attractions) {
      if (!attractionImages.value[attr.name]) {
        tasks.push(
          getAttractionPhoto(attr.name, city).then(url => {
            if (url) attractionImages.value[attr.name] = url
          })
        )
      }
    }
  }

  // 最多 5 个并行
  const BATCH = 5
  for (let i = 0; i < tasks.length; i += BATCH) {
    await Promise.allSettled(tasks.slice(i, i + BATCH))
  }
}

function goBack() {
  uni.navigateBack()
}

function goToChat() {
  uni.navigateTo({ url: '/pages/chat/index' })
}

function goToLanding() {
  uni.switchTab({ url: '/pages/landing/index' })
}

onMounted(() => {
  if (tripStore.hasTripPlan) {
    loadAttractionImages()
  }
})

function shareTrip() {
  // 小程序无法用 JS 主动拉起分享面板，只能引导用户使用右上角菜单
  guideShareToFriend('点击右上角「···」即可分享这份行程')
}

onShareAppMessage(() => {
  const city = tripPlan.value?.city || '旅行'
  return {
    title: `出门啦 - ${city}行程规划`,
    path: '/pages/landing/index'
  }
})
</script>

<style scoped>
.result-page {
  min-height: 100vh;
  background-color: #F5F6FA;
}

.result-content {
  padding-bottom: 120rpx;
}

.city-hero-card {
  margin: 24rpx;
  border-radius: 32rpx;
  overflow: hidden;
}

.city-hero {
  text-align: center;
}

.hero-emoji {
  font-size: 80rpx;
  margin-bottom: 16rpx;
}

.city-name {
  font-size: 48rpx;
  font-weight: 800;
  color: #1A1A2E;
  margin-bottom: 16rpx;
}

.city-date-box {
  margin-bottom: 24rpx;
}

.city-suggestion {
  font-size: 26rpx;
  color: #6B7280;
  line-height: 1.6;
}

.action-bar {
  margin-top: 32rpx;
  display: flex;
  justify-content: center;
}

.tabs-container {
  margin-top: 12rpx;
}

.section-content {
  padding: 24rpx;
}

.map-section {
  padding: 0;
  margin: -24rpx;
}

.trip-map {
  width: 100%;
  height: calc(100vh - 500rpx);
}

.map-empty {
  height: 400rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 附近站点 */
.map-stations {
  margin-top: 24rpx;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 28rpx;
}

.map-stations__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.map-stations__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #1A1A2E;
}

.map-stations__head-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

/* 「我的位置」按钮：与标签同一视觉语言，选中态用主色描边 */
.map-stations__locate {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  border: 1px solid #4EADBD;
  color: #4EADBD;
  font-size: 22rpx;
  line-height: 1.6;
}

.map-stations__locate.is-active {
  background: #4EADBD;
  color: #ffffff;
}

.map-stations__locate-error,
.map-stations__accuracy {
  margin-bottom: 16rpx;
  font-size: 22rpx;
  line-height: 1.5;
}

.map-stations__locate-error {
  color: #E8833A;
}

.map-stations__accuracy {
  color: #9CA3AF;
}

.map-stations__note {
  font-size: 22rpx;
  color: #9CA3AF;
}

.map-stations__switch {
  white-space: nowrap;
  margin-bottom: 24rpx;
}

.map-stations__switch-inner {
  display: flex;
  gap: 16rpx;
  padding: 4rpx 0;
}

.map-stations__chip {
  flex-shrink: 0;
}

.map-stations__state {
  padding: 32rpx 0;
}

.map-stations__state-text {
  font-size: 26rpx;
  color: #9CA3AF;
}

.map-stations__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.map-station-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  background: #F5F6FA;
  border-radius: 16rpx;
}

.map-station-row__type {
  flex: none;
  width: 72rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
}

.map-station-row__type.is-subway {
  background: rgba(78, 173, 189, 0.12);
  color: #4EADBD;
}

.map-station-row__type.is-bus {
  background: rgba(14, 159, 138, 0.12);
  color: #0E9F8A;
}

.map-station-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.map-station-row__name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A2E;
}

.map-station-row__address {
  font-size: 22rpx;
  color: #9CA3AF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-station-row__meta {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}

.map-station-row__distance {
  font-size: 22rpx;
  color: #6B7280;
}

.map-station-row__walk {
  font-size: 22rpx;
  font-weight: 600;
  color: #0E9F8A;
}

.map-station-row__walk.is-far {
  color: #D98B0B;
}

.fab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 112rpx;
  height: 112rpx;
}

.fab-icon {
  font-size: 40rpx;
  line-height: 1;
}

.fab-text {
  font-size: 20rpx;
  color: #FFFFFF;
  font-weight: 800;
  margin-top: 4rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 200rpx;
}

.empty-action {
  margin-top: 48rpx;
  width: 320rpx;
}
</style>
