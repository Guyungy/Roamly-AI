<template>
  <view class="day-card">
    <wd-collapse v-model="collapseValue">
      <wd-collapse-item name="main">
        <template #title>
          <view class="day-header-info">
            <view class="day-title-row">
              <wd-tag type="primary" custom-style="margin-right: 12rpx; background: #FF6B35; border-color: #FF6B35;">D{{ day.day_index + 1 }}</wd-tag>
              <text class="day-date">{{ day.date }}</text>
            </view>
            <text class="day-desc">{{ day.description }}</text>
          </view>
        </template>

        <view class="day-body">
          <view class="day-info-bar">
            <wd-tag custom-style="background: #F5F6FA; color: #6B7280; border: none; padding: 10rpx 20rpx; margin-right: 16rpx;">🚗 {{ day.transportation }}</wd-tag>
            <wd-tag custom-style="background: #F5F6FA; color: #6B7280; border: none; padding: 10rpx 20rpx;">🏨 {{ day.accommodation }}</wd-tag>
          </view>

          <view class="section-label">
            <view class="label-line" /><text class="label-text">景点安排</text><view class="label-line" />
          </view>
          <AttractionCard v-for="(attr, index) in day.attractions" :key="`${attr.name}-${index}`" :attraction="attr" :order="index + 1" :image-url="getImage(attr.name)" />

          <view v-if="day.hotel" class="hotel-section">
            <view class="section-label">
              <view class="label-line" /><text class="label-text">住宿推荐</text><view class="label-line" />
            </view>
            <wd-card>
              <template #title>
                <view class="hotel-title-wrap">
                  <text class="hotel-name">{{ day.hotel.name }}</text>
                  <wd-tag type="warning" size="small">{{ day.hotel.type }}</wd-tag>
                </view>
              </template>
              <view class="hotel-details">
                <view class="hotel-detail-item">📍 {{ day.hotel.address }}</view>
                <view class="hotel-detail-item">💰 {{ day.hotel.price_range }}</view>
                <view class="hotel-detail-item">⭐ {{ day.hotel.rating }}</view>
                <view class="hotel-detail-item">📏 {{ day.hotel.distance }}</view>
              </view>
            </wd-card>
          </view>

          <view class="section-label">
            <view class="label-line" /><text class="label-text">餐饮安排</text><view class="label-line" />
          </view>
          <wd-cell-group border border-radius="16rpx">
            <wd-cell v-for="meal in day.meals" :key="meal.type" :title="meal.name" :label="meal.description">
              <template #icon>
                <view class="meal-icon-wrap">
                  <text class="meal-emoji">{{ getMealEmoji(meal.type) }}</text>
                </view>
              </template>
              <template #value>
                <text v-if="meal.estimated_cost" class="meal-cost">¥{{ meal.estimated_cost }}</text>
              </template>
            </wd-cell>
          </wd-cell-group>
        </view>
      </wd-collapse-item>
    </wd-collapse>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DayPlan } from '@/types'
import AttractionCard from './AttractionCard.vue'

const props = defineProps<{ day: DayPlan; images: Record<string, string>; defaultExpanded?: boolean }>()
const collapseValue = ref(props.defaultExpanded ? ['main'] : [])

function getImage(name: string) { return props.images[name] }
function getMealEmoji(type: string) { return ({ breakfast:'🌅', lunch:'☀️', dinner:'🌙', snack:'🍡' } as Record<string,string>)[type] || '🍽️' }
</script>

<style scoped>
.day-card { margin-bottom: 24rpx; }
.day-header-info { display: flex; flex-direction: column; gap: 4rpx; }
.day-title-row { display: flex; align-items: center; }
.day-date { font-size: 28rpx; font-weight: 600; color: #1A1A2E; }
.day-desc { font-size: 24rpx; color: #9CA3AF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400rpx; }
.day-body { padding: 12rpx 0; }
.day-info-bar { display: flex; margin-bottom: 32rpx; }
.section-label { display: flex; align-items: center; gap: 20rpx; margin: 36rpx 0 24rpx; }
.label-line { flex: 1; height: 1rpx; background: linear-gradient(90deg, transparent, #E8ECF2, transparent); }
.label-text { font-size: 26rpx; color: #FF6B35; font-weight: 600; letter-spacing: 4rpx; white-space: nowrap; }
.hotel-title-wrap { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.hotel-name { font-size: 30rpx; font-weight: 700; color: #1A1A2E; }
.hotel-details { display: flex; flex-direction: column; gap: 12rpx; }
.hotel-detail-item { font-size: 24rpx; color: #6B7280; }
.meal-icon-wrap { margin-right: 20rpx; display: flex; align-items: center; }
.meal-emoji { font-size: 36rpx; }
.meal-cost { font-size: 26rpx; color: #10B981; font-weight: 600; }
:deep(.wd-collapse-item__header) { padding: 24rpx 32rpx !important; background: #FFFFFF !important; }
:deep(.wd-collapse-item__body) { padding: 0 32rpx 32rpx !important; background: #FFFFFF !important; }
</style>
