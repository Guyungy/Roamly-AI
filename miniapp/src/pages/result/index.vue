<template>
  <view class="result-page">
    <NavBar show-back />

    <view v-if="tripStore.hasTripPlan" class="result-content">
      <!-- 城市头部 -->
      <view class="city-hero">
        <view class="city-hero-glow" />
        <text class="city-name">{{ tripPlan!.city }}</text>
        <text class="city-date">{{ tripPlan!.start_date }} — {{ tripPlan!.end_date }}</text>
        <text v-if="tripPlan!.overall_suggestions" class="city-suggestion">
          {{ tripPlan!.overall_suggestions }}
        </text>
      </view>

      <!-- Tab 切换 -->
      <scroll-view scroll-x class="tab-scroll">
        <view class="tab-bar">
          <view
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-item"
            :class="{ 'tab-active': activeTab === tab.key }"
            @tap="activeTab = tab.key"
          >
            <text class="tab-icon">{{ tab.icon }}</text>
            <text class="tab-text">{{ tab.label }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- 每日行程 -->
      <view v-show="activeTab === 'days'" class="section-content">
        <DayCard
          v-for="(day, index) in tripPlan!.days"
          :key="day.day_index"
          :day="day"
          :images="attractionImages"
          :default-expanded="index === 0"
        />
      </view>

      <!-- 预算 -->
      <view v-show="activeTab === 'budget'" class="section-content">
        <BudgetPanel v-if="tripPlan!.budget" :budget="tripPlan!.budget" />
        <view v-else class="empty-section">
          <text class="empty-text">暂无预算数据</text>
        </view>
      </view>

      <!-- 天气 -->
      <view v-show="activeTab === 'weather'" class="section-content">
        <WeatherCard
          v-if="tripPlan!.weather_info && tripPlan!.weather_info.length > 0"
          :list="tripPlan!.weather_info"
          :current="currentWeather"
          :active-index="activeWeatherIndex"
          @select="activeWeatherIndex = $event"
        />
        <view v-else class="empty-section">
          <text class="empty-text">暂无天气数据</text>
        </view>
      </view>

      <!-- 地图 -->
      <view v-show="activeTab === 'map'" class="section-content map-section">
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

      <!-- 悬浮AI按钮 -->
      <view class="fab-chat" @tap="goToChat">
        <text class="fab-icon">✦</text>
        <text class="fab-text">问AI</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <text class="empty-icon">✦</text>
      <text class="empty-title">还没有旅行计划</text>
      <text class="empty-desc">去首页创建你的第一个 AI 旅行计划吧</text>
      <button class="btn-primary" @tap="goToLanding">
        <text class="submit-text">开始规划</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
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

const tabs = computed(() => {
  const list = [
    { key: 'days', icon: '📋', label: '行程' },
    { key: 'budget', icon: '💰', label: '预算' },
    { key: 'weather', icon: '🌤', label: '天气' },
    { key: 'map', icon: '🗺', label: '地图' },
  ]
  return list
})

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
            color: '#FFD699',
            bgColor: '#1a1035',
            borderColor: 'rgba(255,179,71,0.3)',
            borderWidth: 1,
            borderRadius: 8,
            padding: 6,
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
    color: '#FFD69980',
    width: 3,
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

function goToChat() {
  uni.switchTab({ url: '/pages/chat/index' })
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
  background: linear-gradient(180deg, #0a0a0f 0%, #15132b 50%, #1a1035 100%);
  padding-bottom: 120rpx;
}

/* City Hero */
.city-hero {
  position: relative;
  padding: 48rpx 40rpx;
  text-align: center;
  overflow: hidden;
}

.city-hero-glow {
  position: absolute;
  top: -80rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 500rpx;
  height: 400rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 179, 71, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.city-name {
  display: block;
  font-size: 52rpx;
  font-weight: 800;
  background: linear-gradient(135deg, #FFD699, #FFB347);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 8rpx;
  position: relative;
  z-index: 1;
}

.city-date {
  display: block;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 12rpx;
  letter-spacing: 2rpx;
  position: relative;
  z-index: 1;
}

.city-suggestion {
  display: block;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 16rpx;
  line-height: 1.6;
  position: relative;
  z-index: 1;
}

/* Tab Bar */
.tab-scroll {
  white-space: nowrap;
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.06);
}

.tab-bar {
  display: inline-flex;
  padding: 0 32rpx;
  gap: 8rpx;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 24rpx 32rpx;
  border-bottom: 3rpx solid transparent;
  white-space: nowrap;
}

.tab-item.tab-active {
  border-bottom-color: #FFD699;
}

.tab-icon {
  font-size: 28rpx;
}

.tab-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.45);
  font-weight: 500;
}

.tab-item.tab-active .tab-text {
  color: #FFD699;
  font-weight: 700;
}

/* Section content */
.section-content {
  padding: 32rpx;
}

/* Map */
.map-section {
  padding: 0;
}

.trip-map {
  width: 100%;
  height: 80vh;
}

/* FAB */
.fab-chat {
  position: fixed;
  right: 32rpx;
  bottom: 200rpx;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFD699, #FFB347);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 40rpx rgba(255, 179, 71, 0.4);
  z-index: 100;
}

.fab-icon {
  font-size: 32rpx;
  color: #0a0a0f;
}

.fab-text {
  font-size: 20rpx;
  color: #0a0a0f;
  font-weight: 700;
  margin-top: 2rpx;
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 60rpx;
}

.empty-icon {
  font-size: 80rpx;
  color: rgba(255, 179, 71, 0.3);
  margin-bottom: 32rpx;
}

.empty-title {
  font-size: 36rpx;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 16rpx;
}

.empty-desc {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 48rpx;
}

.empty-section {
  padding: 80rpx 0;
  text-align: center;
}

.empty-text {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.3);
}
</style>
