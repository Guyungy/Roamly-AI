<template>
  <view class="weather-section">
    <view v-if="current" class="weather-main" :style="{ background: getGradient(current.day_weather) }">
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
    <scroll-view v-if="list.length > 1" scroll-x class="weather-scroll">
      <view class="weather-day-list">
        <view v-for="(item, index) in list" :key="item.date" class="weather-day-item" :class="{ 'is-active': index === activeIndex }" @tap="$emit('select', index)">
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
defineProps<{ list: WeatherInfo[]; current: WeatherInfo | null; activeIndex: number }>()
defineEmits<{ (e: 'select', index: number): void }>()
function formatT(temp: number | null | undefined) { return formatTemp(temp) }
function formatD(date: string) { return formatDateShort(date) }
function formatW(date: string, short = false) { return formatWeekday(date, short) }
function getEmoji(text: string) { return getWeatherEmoji(text) }
function getGradient(weatherText: string): string {
  const t = (weatherText || '').toLowerCase()
  if (/(雷|thunder)/.test(t)) return 'linear-gradient(140deg, #B8C6DB 0%, #9EAFC2 100%)'
  if (/(雪|snow)/.test(t)) return 'linear-gradient(140deg, #E8EDF5 0%, #D5DEE7 100%)'
  if (/(雨|rain)/.test(t)) return 'linear-gradient(140deg, #C9D6DF 0%, #A7BCC7 100%)'
  if (/(阴|cloud)/.test(t)) return 'linear-gradient(140deg, #DDE4EA 0%, #C8D0D8 100%)'
  return 'linear-gradient(140deg, #FFF0E8 0%, #FFE4D0 50%, #FFF8E8 100%)'
}
</script>

<style scoped>
.weather-main {
  display: flex; padding: 40rpx; border-radius: 24rpx; margin-bottom: 24rpx;
  border: 1rpx solid #E8ECF2; position: relative; overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}
.weather-main-left { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 240rpx; flex-shrink: 0; }
.weather-emoji { font-size: 80rpx; margin-bottom: 8rpx; }
.weather-temp { font-size: 64rpx; font-weight: 800; color: #1A1A2E; line-height: 1; }
.weather-desc-text { font-size: 26rpx; color: #6B7280; margin-top: 8rpx; }
.weather-main-right { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-left: 32rpx; }
.weather-date { font-size: 28rpx; color: #6B7280; }
.weather-weekday { font-size: 36rpx; font-weight: 700; color: #1A1A2E; margin-bottom: 20rpx; }
.weather-detail-grid { display: flex; flex-direction: column; gap: 12rpx; }
.detail-item { display: flex; gap: 12rpx; align-items: center; }
.detail-label { font-size: 22rpx; color: #9CA3AF; width: 60rpx; }
.detail-value { font-size: 24rpx; color: #6B7280; }
.weather-scroll { white-space: nowrap; }
.weather-day-list { display: inline-flex; gap: 16rpx; padding: 8rpx 0; }
.weather-day-item {
  display: inline-flex; flex-direction: column; align-items: center; gap: 12rpx;
  padding: 20rpx 24rpx; border-radius: 20rpx;
  background: #FFFFFF; border: 1rpx solid #E8ECF2; min-width: 120rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.03);
}
.weather-day-item.is-active { background: #FFF0E8; border-color: rgba(255, 107, 53, 0.2); }
.wd-weekday { font-size: 22rpx; color: #9CA3AF; }
.weather-day-item.is-active .wd-weekday { color: #FF6B35; }
.wd-emoji { font-size: 40rpx; }
.wd-temp { font-size: 26rpx; font-weight: 600; color: #1A1A2E; }
.weather-day-item.is-active .wd-temp { color: #FF6B35; }
</style>
