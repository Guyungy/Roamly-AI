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

                <!-- 附近站点：切换"第几天·景点"，展示其周边地铁/公交站 + 步行可达提示 -->
                <view v-if="stationCenters.length" class="map-stations">
                  <view class="map-stations__head">
                    <text class="map-stations__title">附近站点</text>
                    <text v-if="stationSource === 'cache'" class="map-stations__note">已用缓存</text>
                    <text v-else-if="stationSource === 'mock'" class="map-stations__note">演示数据</text>
                  </view>

                  <scroll-view scroll-x class="map-stations__switch" show-scrollbar="false">
                    <view class="map-stations__switch-inner">
                      <wd-tag
                        v-for="c in stationCenters"
                        :key="c.key"
                        round
                        size="medium"
                        :type="selectedStationCenter === c.key ? 'primary' : 'default'"
                        :plain="selectedStationCenter !== c.key"
                        custom-class="map-stations__chip"
                        @click="selectedStationCenter = c.key"
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
                    tip="该位置附近暂无站点"
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
import { getAttractionPhoto, fetchNearbyStations, type StationView } from '@/services/api'
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
const stationSource = ref<'live' | 'cache' | 'mock'>('live')

async function loadStations(c: { longitude: number; latitude: number }) {
  stationsLoading.value = true
  try {
    const res = await fetchNearbyStations(c.longitude, c.latitude)
    stations.value = res.stations
    stationSource.value = res.source
  } catch {
    stations.value = []
  } finally {
    stationsLoading.value = false
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
  const c = stationCenters.value.find((item) => item.key === key)
  if (c) loadStations(c)
})

watch(
  () => tripPlan.value?.days,
  () => {
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
