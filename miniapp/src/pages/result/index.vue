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
                  <map
                    id="trip-map"
                    class="trip-map"
                    :latitude="mapCenter.latitude"
                    :longitude="mapCenter.longitude"
                    :scale="12"
                    :markers="mapMarkers"
                    :polyline="mapPolyline"
                    show-compass
                    enable-zoom
                    enable-scroll
                  />
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
import { ref, computed, onMounted } from 'vue'
import DayCard from '@/components/DayCard.vue'
import BudgetPanel from '@/components/BudgetPanel.vue'
import WeatherCard from '@/components/WeatherCard.vue'
import { useTripStore } from '@/stores/trip'
import { getAttractionPhoto } from '@/services/api'

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
  const allAttractions = tripPlan.value.days.flatMap(d => d.attractions)
  if (allAttractions.length === 0) return { latitude: 39.9, longitude: 116.4 }
  const avgLat = allAttractions.reduce((s, a) => s + (a.location?.latitude || 0), 0) / allAttractions.length
  const avgLng = allAttractions.reduce((s, a) => s + (a.location?.longitude || 0), 0) / allAttractions.length
  return { latitude: avgLat || 39.9, longitude: avgLng || 116.4 }
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

// 加载景点图片
async function loadAttractionImages() {
  if (!tripPlan.value) return
  const city = tripPlan.value.city
  for (const day of tripPlan.value.days) {
    for (const attr of day.attractions) {
      if (!attractionImages.value[attr.name]) {
        const url = await getAttractionPhoto(attr.name, city)
        if (url) {
          attractionImages.value[attr.name] = url
        }
      }
    }
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
