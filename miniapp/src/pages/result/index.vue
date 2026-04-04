<template>
  <view class="result-page">
    <NavBar show-back />

    <view v-if="tripStore.hasTripPlan" class="result-content">
      <!-- 城市头部 -->
      <view class="city-hero">
        <view class="hero-emoji">🎒</view>
        <text class="city-name">{{ tripPlan!.city }}</text>
        <view class="city-date-box">
          <text class="city-date">{{ tripPlan!.start_date }} — {{ tripPlan!.end_date }}</text>
        </view>
        <text v-if="tripPlan!.overall_suggestions" class="city-suggestion">
          {{ tripPlan!.overall_suggestions }}
        </text>
      </view>

      <!-- Tab 切换 -->
      <scroll-view scroll-x class="tab-scroll" :show-scrollbar="false">
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
        <text class="fab-icon">🎒</text>
        <text class="fab-text">问AI</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <text class="empty-icon">🎒</text>
      <text class="empty-title">还没有旅行计划</text>
      <text class="empty-desc">去首页让 AI 帮你规划行程吧</text>
      <button class="btn-primary" @tap="goToLanding">
        <text class="submit-text">立即开始</text>
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
  padding-bottom: 120rpx;
}

/* City Hero */
.city-hero {
  background-color: #FFFFFF;
  padding: 60rpx 40rpx 40rpx;
  text-align: center;
  border-bottom-left-radius: 48rpx;
  border-bottom-right-radius: 48rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.02);
}

.hero-emoji {
  font-size: 64rpx;
  margin-bottom: 16rpx;
}

.city-name {
  display: block;
  font-size: 56rpx;
  font-weight: 800;
  color: #1A1A2E;
  margin-bottom: 16rpx;
}

.city-date-box {
  display: inline-block;
  background-color: #FFF5F0;
  padding: 8rpx 32rpx;
  border-radius: 99rpx;
  margin-bottom: 24rpx;
}

.city-date {
  font-size: 26rpx;
  color: #FF6B35;
  font-weight: 700;
}

.city-suggestion {
  display: block;
  font-size: 28rpx;
  color: #6B7280;
  line-height: 1.6;
  padding: 0 20rpx;
}

/* Tab Bar */
.tab-scroll {
  background-color: #FFFFFF;
  margin-top: 20rpx;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-bar {
  display: inline-flex;
  padding: 0 24rpx;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  padding: 28rpx 36rpx;
  position: relative;
}

.tab-item.tab-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 36rpx;
  right: 36rpx;
  height: 6rpx;
  background-color: #FF6B35;
  border-radius: 3rpx;
}

.tab-icon {
  font-size: 30rpx;
}

.tab-text {
  font-size: 30rpx;
  color: #9CA3AF;
  font-weight: 500;
}

.tab-item.tab-active .tab-text {
  color: #1A1A2E;
  font-weight: 800;
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
  height: calc(100vh - 400rpx);
}

/* FAB */
.fab-chat {
  position: fixed;
  right: 40rpx;
  bottom: 60rpx;
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background: linear-gradient(135deg, #FF6B35, #FFB830);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 32rpx rgba(255, 107, 53, 0.3);
  z-index: 100;
}

.fab-icon {
  font-size: 40rpx;
}

.fab-text {
  font-size: 20rpx;
  color: #FFFFFF;
  font-weight: 800;
  margin-top: 4rpx;
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
  font-size: 100rpx;
  margin-bottom: 32rpx;
}

.empty-title {
  font-size: 36rpx;
  font-weight: 800;
  color: #1A1A2E;
  margin-bottom: 16rpx;
}

.empty-desc {
  font-size: 28rpx;
  color: #9CA3AF;
  margin-bottom: 60rpx;
}

.btn-primary {
  width: 320rpx;
  height: 96rpx;
  background: linear-gradient(135deg, #FF6B35, #FFB830);
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.submit-text {
  color: #FFFFFF;
  font-size: 32rpx;
  font-weight: 700;
}

.empty-section {
  padding: 120rpx 0;
  text-align: center;
}

.empty-text {
  font-size: 28rpx;
  color: #9CA3AF;
}
</style>
