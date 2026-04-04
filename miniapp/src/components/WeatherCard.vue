<template>
  <view class="weather-section">
    <!-- 主天气卡 -->
    <view v-if="current" class="weather-main glass-card" :style="{ background: getGradient(current.day_weather) }">
      <view class="weather-main-left">
        <text class="weather-emoji">{{ getEmoji(current.day_weather) }}</text>
        <text class="weather-temp">{{ formatT(current.day_temp) }}</text>
        <text class="weather-desc-text">{{ current.day_weather }}</text>
      </view>
      <view class="weather-main-right">
        <text class="weather-date">{{ formatD(current.date) }}</text>
        <text class="weather-weekday">{{ formatW(current.date) }}</text>
        <view class="weather-detail-grid">
          <view class="detail-item">
            <text class="detail-label">夜间</text>
            <text class="detail-value">{{ current.night_weather }} {{ formatT(current.night_temp) }}</text>
          </view>
          <view class="detail-item">
            <text class="detail-label">风向</text>
            <text class="detail-value">{{ current.wind_direction }} {{ current.wind_power }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 多日天气列表 -->
    <scroll-view v-if="list.length > 1" scroll-x class="weather-scroll">
      <view class="weather-day-list">
        <view
          v-for="(item, index) in list"
          :key="item.date"
          class="weather-day-item"
          :class="{ 'is-active': index === activeIndex }"
          @tap="$emit('select', index)"
        >
          <text class="wd-weekday">{{ formatW(item.date, true) }}</text>
          <text class="wd-emoji">{{ getEmoji(item.day_weather) }}</text>
          <text class="wd-temp">{{ formatT(item.day_temp) }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import type { WeatherInfo } from '@/types'
import { formatDateShort, formatWeekday, formatTemp, getWeatherEmoji } from '@/utils/format'

defineProps<{
  list: WeatherInfo[]
  current: WeatherInfo | null
  activeIndex: number
}>()

defineEmits<{
  (e: 'select', index: number): void
}>()

function formatT(temp: number | null | undefined) { return formatTemp(temp) }
function formatD(date: string) { return formatDateShort(date) }
function formatW(date: string, short = false) { return formatWeekday(date, short) }
function getEmoji(text: string) { return getWeatherEmoji(text) }

function getGradient(weatherText: string): string {
  const t = (weatherText || '').toLowerCase()
  if (/(雷|thunder)/.test(t)) return 'linear-gradient(140deg, #3a4a86 0%, #5b3b8a 100%)'
  if (/(雪|snow)/.test(t)) return 'linear-gradient(140deg, #8bc6ec 0%, #d9afd9 100%)'
  if (/(雨|rain)/.test(t)) return 'linear-gradient(140deg, #4b6cb7 0%, #182848 100%)'
  if (/(阴|cloud)/.test(t)) return 'linear-gradient(140deg, #6d7f92 0%, #3f4c6b 100%)'
  return 'linear-gradient(140deg, #1a1035 0%, #2d1b69 50%, #0a0a0f 100%)'
}
</script>

<style scoped>
.weather-main {
  display: flex;
  padding: 40rpx;
  border-radius: 24rpx;
  margin-bottom: 24rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}

.weather-main::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 50%, rgba(255, 255, 255, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.weather-main-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 240rpx;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.weather-emoji {
  font-size: 80rpx;
  margin-bottom: 8rpx;
}

.weather-temp {
  font-size: 64rpx;
  font-weight: 800;
  color: #ffffff;
  line-height: 1;
}

.weather-desc-text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 8rpx;
}

.weather-main-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-left: 32rpx;
  position: relative;
  z-index: 1;
}

.weather-date {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.7);
}

.weather-weekday {
  font-size: 36rpx;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 20rpx;
}

.weather-detail-grid {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.detail-item {
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.detail-label {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.45);
  width: 60rpx;
}

.detail-value {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

/* 横向滚动天气列表 */
.weather-scroll {
  white-space: nowrap;
}

.weather-day-list {
  display: inline-flex;
  gap: 16rpx;
  padding: 8rpx 0;
}

.weather-day-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(255, 255, 255, 0.06);
  min-width: 120rpx;
}

.weather-day-item.is-active {
  background: rgba(255, 179, 71, 0.12);
  border-color: rgba(255, 179, 71, 0.3);
}

.wd-weekday {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.5);
}

.weather-day-item.is-active .wd-weekday {
  color: #FFD699;
}

.wd-emoji {
  font-size: 40rpx;
}

.wd-temp {
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.weather-day-item.is-active .wd-temp {
  color: #FFD699;
}
</style>
