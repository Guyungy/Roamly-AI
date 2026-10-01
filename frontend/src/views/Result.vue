<template>
  <div class="result-container">
    <NavBar
      @brand-click="goBack"
      @cta-click="goBack"
      @auth-click="openAuth"
      @sign-out="handleSignOut"
    />

    <main class="result-main">
      <div v-if="tripPlan" class="content-wrapper">
        <div class="section-nav">
          <nav class="section-nav__list">
            <button
              v-for="item in sectionNavItems"
              :key="item.key"
              type="button"
              class="section-nav__item"
              :class="{ 'is-active': activeSection === item.key }"
              @click="scrollToSection(item.key)"
            >
              {{ t(item.labelKey) }}
            </button>
          </nav>

          <div class="section-nav__actions">
            <n-button v-if="!editMode" size="small" @click="toggleEditMode">
              {{ t('result.editTrip') }}
            </n-button>
            <n-button v-else size="small" type="primary" @click="saveChanges">
              {{ t('result.saveChanges') }}
            </n-button>
            <n-button v-if="editMode" size="small" @click="cancelEdit">
              {{ t('result.cancelEdit') }}
            </n-button>

            <n-dropdown
              v-if="!editMode"
              trigger="click"
              placement="bottom-end"
              :options="exportOptions"
              @select="handleExportSelect"
            >
              <n-button size="small">
                {{ t('result.exportTrip') }}
                <template #icon>
                  <svg class="btn-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </template>
              </n-button>
            </n-dropdown>
          </div>
        </div>

      <!-- 主内容区：六个区块全部展开，顶部导航做锚点跳转 -->
        <section id="overview" class="result-section">
          <div class="overview-head">
            <h2 class="section-title">{{ t('result.side.overview') }}</h2>
            <!-- 桌面端 4 张卡正好占满一行，后面几张卡没有任何视觉入口 → 必须给出可点的翻页按钮 -->
            <div v-if="overviewScrollable" class="overview-nav">
              <button
                type="button"
                class="overview-nav-btn"
                :disabled="overviewAtStart"
                :aria-label="t('result.prevAttraction')"
                @click="slideOverview(-1)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                class="overview-nav-btn"
                :disabled="overviewAtEnd"
                :aria-label="t('result.nextAttraction')"
                @click="slideOverview(1)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
          <div class="panel overview-card">
            <div v-if="overviewAttractions.length > 0" ref="overviewSwiperContainerRef" class="overview-swiper">
            <div class="swiper">
              <div class="swiper-wrapper">
                <OverviewAttractionCard
                  v-for="(item, index) in overviewAttractions"
                  :key="`${item.dayArrayIndex}-${item.order}-${item.name}`"
                  :item="item"
                  :image-src="getAttractionImage(item.name, item.category, 'card')"
                  :active="activeOverviewCard === index"
                  @hover="setActiveOverviewCard(index)"
                  @image-error="handleImageError"
                  @select-day="goToDayFromOverview"
                />
              </div>
            </div>
          </div>
          <n-empty v-else :description="t('common.noData')" />
          <div class="overview-meta">
            <span class="overview-meta__date tabular-nums">
              {{ t('result.dateRange', { start: tripPlan.start_date, end: tripPlan.end_date }) }}
            </span>
            <span v-if="tripPlan.overall_suggestions" class="overview-meta__text">
              {{ tripPlan.overall_suggestions }}
            </span>
          </div>
          </div>
        </section>

        <!-- 预算明细 -->
        <section v-if="tripPlan.budget" id="budget" class="result-section">
          <h2 class="section-title">{{ t('result.side.budget') }}</h2>
                    <!-- 总览：总预算 + 四类拆分 + 待定项，横向一条，不再和明细卡打架 -->
          <div class="budget-overview panel">
            <div class="budget-overview__total">
              <span class="budget-overview__label">{{ t('result.budget.title') }}</span>
              <span class="budget-overview__amount tabular-nums">
                <span class="budget-overview__currency">¥</span>{{ formatBudgetAmount(tripPlan.budget?.total ?? 0) }}
              </span>
            </div>

            <div class="budget-overview__split">
              <div v-for="cat in budgetCategories" :key="cat.type" class="budget-chip">
                <span class="budget-chip__value tabular-nums">¥{{ formatBudgetAmount(cat.amount) }}</span>
                <span class="budget-chip__label">{{ t(cat.labelKey) }}</span>
              </div>
            </div>

            <div class="budget-pending">
              <span class="budget-pending__title">{{ t('result.budget.pendingTitle') }}</span>
              <span v-if="pendingBudgetItems.length === 0" class="budget-pending__empty">
                {{ t('result.budget.pendingEmpty') }}
              </span>
              <div v-else class="budget-pending__list">
                <div
                  v-for="pendingItem in pendingBudgetItems"
                  :key="pendingItem.uid"
                  class="budget-pending__item"
                >
                  <span class="budget-pending__name">{{ pendingItem.base.name }}</span>
                  <n-button text type="primary" size="tiny" @click="restoreBudgetItem(pendingItem)">
                    {{ t('result.budget.restore') }}
                  </n-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 明细：仍用行式布局（金额要对齐），但换成卡片内分栏，不再是裸露的表格 -->
          <div class="panel budget-detail">
            <div class="budget-toolbar">
              <div class="budget-toolbar__item">
                <span class="budget-toolbar__label">{{ t('result.budget.filterLabel') }}</span>
                <n-select
                  v-model:value="budgetFilterType"
                  size="small"
                  class="budget-select"
                  :options="budgetFilterOptions"
                />
              </div>
              <div class="budget-toolbar__item">
                <span class="budget-toolbar__label">{{ t('result.budget.sortLabel') }}</span>
                <n-select
                  v-model:value="budgetSortMode"
                  size="small"
                  class="budget-select"
                  :options="budgetSortOptions"
                />
              </div>
            </div>

            <div v-if="filteredBudgetItems.length > 0" class="budget-rows">
              <div class="budget-row budget-row--head">
                <span>{{ t('result.budget.detailType') }}</span>
                <span>{{ t('result.budget.detailDay') }}</span>
                <span>{{ t('result.budget.detailName') }}</span>
                <span class="budget-row__amount">{{ t('result.budget.detailAmount') }}</span>
                <span class="budget-row__actions">{{ t('result.budget.detailAction') }}</span>
              </div>
              <div
                v-for="item in filteredBudgetItems"
                :key="item.id"
                class="budget-row"
              >
                <span class="budget-type" :data-type="item.type">{{ getBudgetTypeLabel(item.type) }}</span>
                <span class="budget-day">
                  {{ item.dayNumber ? t('common.dayNumber', { day: item.dayNumber }) : '--' }}
                </span>
                <span class="budget-name">{{ item.name }}</span>
                <span class="budget-amount tabular-nums">¥{{ formatBudgetAmount(item.amount) }}</span>
                <span class="budget-row__actions">
                  <button
                    type="button"
                    class="icon-btn"
                    :title="t('result.budget.editPrice')"
                    @click="editBudgetItemAmount(item)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn--danger"
                    :title="t('common.delete')"
                    @click="deleteBudgetItem(item)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </span>
              </div>
            </div>
            <n-empty v-else :description="t('result.budget.noDetails')" />
          </div>
        </section>

        <!-- 景点地图 -->
        <section id="map" class="result-section">
          <h2 class="section-title">{{ t('result.side.map') }}</h2>
          <div class="panel map-card">
            <div id="amap-container" class="map-canvas"></div>
            <div v-if="mapStatus !== 'ready'" class="map-placeholder">
              <n-spin v-if="mapStatus === 'loading'" size="large" />
              <template v-else>
                <p class="map-placeholder__text">
                  {{ mapStatus === 'unavailable' ? t('result.messages.mapUnavailable') : t('result.messages.mapLoadFailed') }}
                </p>
                <n-button v-if="mapStatus === 'error'" size="small" @click="initMap(true)">
                  {{ t('result.messages.mapRetry') }}
                </n-button>
              </template>
            </div>

            <!--
              路线概览：里程与耗时都是高德路线规划接口返回的真实值。
              规划失败的那几段不会混进来充数，而是在下面单独说明有几段是直线。
            -->
            <div v-if="mapStatus === 'ready' && routeSummaryRows.length" class="map-routes">
              <div class="map-routes__head">
                <span class="map-routes__title">{{ t('result.mapInfo.routeTitle') }}</span>
                <ul v-if="routeModeLegend.length" class="map-routes__legend">
                  <li v-for="legend in routeModeLegend" :key="legend.mode" class="map-legend">
                    <span class="map-legend__stroke" :data-mode="legend.mode" aria-hidden="true"></span>
                    {{ legend.label }}
                  </li>
                </ul>
              </div>

              <ul class="map-routes__list">
                <li v-for="row in routeSummaryRows" :key="row.dayIndex" class="map-route">
                  <span class="map-route__day">{{ t('common.dayNumber', { day: row.dayNumber }) }}</span>
                  <span class="map-route__mode" :data-mode="row.mode">{{ row.modeLabel }}</span>
                  <span class="map-route__text tabular-nums">{{ row.text }}</span>
                </li>
              </ul>

              <p v-if="routeFallbackCount" class="map-routes__note">
                {{ t('result.mapInfo.routeFallback', { count: routeFallbackCount }) }}
              </p>
            </div>

            <!--
              附近站点：按"第几天 · 景点"切换查看中心，列出该点附近的
              地铁/公交站 + 步行可达提示；点击站点会把地图镜头移过去。
              数据走后端 /api/map/nearby-station，失败时降级到缓存或内置演示数据。
            -->
            <NearbyStationPanel
              v-if="tripPlan && stationCenters.length"
              :centers="stationCenters"
              class="map-stations"
              @focus="handleStationFocus"
            />
          </div>
        </section>

        <!-- 每日行程：全部展开 -->
                <!-- 每日行程：全部展开，不再折叠（原来也是挂载后全展开，折叠反而多一层壳） -->
        <section id="days" class="result-section">
          <h2 class="section-title">{{ t('result.side.days') }}</h2>

          <div class="days-list">
            <article
              v-for="(day, dayIndex) in tripPlan.days"
              :key="dayIndex"
              class="panel day-card"
            >
              <header class="day-card__head" :id="`day-${dayIndex}`">
                <div class="day-card__heading">
                  <span class="day-card__badge tabular-nums">{{ day.day_index + 1 }}</span>
                  <div class="day-card__titles">
                    <span class="day-card__name">{{ t('common.dayNumber', { day: day.day_index + 1 }) }}</span>
                    <span class="day-card__date tabular-nums">{{ day.date }}</span>
                  </div>
                </div>
                <p class="day-card__desc">{{ day.description }}</p>
              </header>

              <!-- 行程基本信息 -->
              <div class="day-meta">
                <div class="day-meta__item">
                  <span class="day-meta__label">{{ t('result.dayTransport') }}</span>
                  <span class="day-meta__value">{{ day.transportation }}</span>
                </div>
                <div class="day-meta__item">
                  <span class="day-meta__label">{{ t('result.dayAccommodation') }}</span>
                  <span class="day-meta__value">{{ day.accommodation }}</span>
                </div>
              </div>

              <!-- 景点安排 -->
              <h3 class="block-title">{{ t('result.attractionTitle') }}</h3>
              <div class="attraction-grid">
                <article
                  v-for="(item, itemIndex) in day.attractions"
                  :key="`${item.name}-${itemIndex}`"
                  class="attraction-card"
                >
                  <div class="attraction-image-wrapper">
                    <img
                      :src="getAttractionImage(item.name, item.category, 'wide')"
                      :alt="item.name"
                      class="attraction-image"
                      @load="handleImageLoad"
                      @error="handleImageError"
                    />
                    <span class="attraction-badge tabular-nums">{{ itemIndex + 1 }}</span>
                    <span v-if="item.ticket_price" class="price-tag tabular-nums">¥{{ item.ticket_price }}</span>
                  </div>

                  <div class="attraction-body">
                    <div class="attraction-body__head">
                      <h4 class="attraction-name">{{ item.name }}</h4>
                      <div v-if="editMode" class="attraction-actions">
                        <n-button size="tiny" :disabled="itemIndex === 0" @click="moveAttraction(day.day_index, itemIndex, 'up')">
                          ↑
                        </n-button>
                        <n-button
                          size="tiny"
                          :disabled="itemIndex === day.attractions.length - 1"
                          @click="moveAttraction(day.day_index, itemIndex, 'down')"
                        >
                          ↓
                        </n-button>
                        <n-button size="tiny" type="error" @click="deleteAttraction(day.day_index, itemIndex)">
                          {{ t('common.delete') }}
                        </n-button>
                      </div>
                    </div>

                    <!-- 编辑模式 -->
                    <div v-if="editMode" class="attraction-edit">
                      <label class="attraction-edit__label">{{ t('result.fieldAddress') }}</label>
                      <n-input v-model:value="item.address" size="small" />
                      <label class="attraction-edit__label">{{ t('result.fieldVisitDurationMinutes') }}</label>
                      <n-input-number v-model:value="item.visit_duration" :min="10" :max="480" size="small" />
                      <label class="attraction-edit__label">{{ t('result.fieldDescription') }}</label>
                      <n-input v-model:value="item.description" type="textarea" :rows="2" size="small" />
                    </div>

                    <!-- 查看模式：换成键值对列表，字号从 10.5px 提到 13px -->
                    <dl v-else class="attraction-facts">
                      <div class="attraction-fact">
                        <dt>{{ t('result.fieldAddress') }}</dt>
                        <dd>{{ item.address }}</dd>
                      </div>
                      <div class="attraction-fact">
                        <dt>{{ t('result.fieldVisitDuration') }}</dt>
                        <dd>{{ item.visit_duration }}{{ t('result.minuteUnit') }}</dd>
                      </div>
                      <div v-if="item.rating" class="attraction-fact">
                        <dt>{{ t('result.fieldRating') }}</dt>
                        <dd>{{ item.rating }}</dd>
                      </div>
                      <p class="attraction-desc">{{ item.description }}</p>
                    </dl>
                  </div>
                </article>
              </div>

              <!-- 酒店推荐 -->
              <template v-if="day.hotel">
                <h3 class="block-title">{{ t('result.hotelTitle') }}</h3>
                <div class="hotel-card">
                  <div class="hotel-card__head">
                    <span class="hotel-card__name">{{ day.hotel.name }}</span>
                  </div>
                  <dl class="hotel-facts">
                    <div class="hotel-fact">
                      <dt>{{ t('result.fieldAddress') }}</dt>
                      <dd>{{ day.hotel.address }}</dd>
                    </div>
                    <div class="hotel-fact">
                      <dt>{{ t('result.fieldType') }}</dt>
                      <dd>{{ day.hotel.type }}</dd>
                    </div>
                    <div class="hotel-fact">
                      <dt>{{ t('result.fieldPriceRange') }}</dt>
                      <dd>{{ day.hotel.price_range }}</dd>
                    </div>
                    <div class="hotel-fact">
                      <dt>{{ t('result.fieldRating') }}</dt>
                      <dd>{{ day.hotel.rating }}</dd>
                    </div>
                    <div class="hotel-fact hotel-fact--wide">
                      <dt>{{ t('result.fieldDistance') }}</dt>
                      <dd>{{ day.hotel.distance }}</dd>
                    </div>
                  </dl>
                </div>
              </template>

              <!-- 餐饮安排 -->
              <h3 class="block-title">{{ t('result.mealsTitle') }}</h3>
              <ul class="meal-list">
                <li v-for="meal in day.meals" :key="meal.type" class="meal-item">
                  <span class="meal-item__type">{{ getMealLabel(meal.type) }}</span>
                  <span class="meal-item__name">{{ meal.name }}</span>
                  <span v-if="meal.description" class="meal-item__desc">{{ meal.description }}</span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <!-- 知识图谱 -->
        <section v-if="graphData" id="knowledge-graph" class="result-section">
          <h2 class="section-title">{{ t('result.side.graph') }}</h2>
          <div class="panel kg-card">
            <div id="kg-chart-container" class="kg-chart"></div>
            <div class="kg-legend">
              <span v-for="cat in graphCategories" :key="cat.name" class="kg-legend-item">
                <span class="kg-legend-dot" :style="getKgLegendDotStyle(cat.name)"></span>
                {{ getCategoryLabel(cat.name) }}
              </span>
            </div>
          </div>
        </section>

        <!-- 天气信息 -->
        <section
          v-if="tripPlan.weather_info && tripPlan.weather_info.length > 0"
          id="weather"
          class="result-section"
        >
          <h2 class="section-title">{{ t('result.side.weather') }}</h2>
          <div class="panel weather-section-card">
          <div v-if="selectedWeather" class="weather-dashboard">
            <section class="weather-side" :style="weatherSideStyle">
              <div class="weather-gradient"></div>

              <div class="date-container">
                <h2 class="date-dayname">{{ formatWeatherWeekday(selectedWeather.date) }}</h2>
                <span class="date-day">{{ formatWeatherDate(selectedWeather.date) }}</span>
                <span class="location">
                  <span class="location-icon">
                    <svg width="16px" height="16px" viewBox="-3 0 20 20" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                        <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                            <g id="Dribbble-Light-Preview" transform="translate(-223.000000, -5439.000000)" fill="currentColor">
                                <g id="icons" transform="translate(56.000000, 160.000000)">
                                    <path d="M176,5286.219 C176,5287.324 175.105,5288.219 174,5288.219 C172.895,5288.219 172,5287.324 172,5286.219 C172,5285.114 172.895,5284.219 174,5284.219 C175.105,5284.219 176,5285.114 176,5286.219 M174,5296 C174,5296 169,5289 169,5286 C169,5283.243 171.243,5281 174,5281 C176.757,5281 179,5283.243 179,5286 C179,5289 174,5296 174,5296 M174,5279 C170.134,5279 167,5282.134 167,5286 C167,5289.866 174,5299 174,5299 C174,5299 181,5289.866 181,5286 C181,5282.134 177.866,5279 174,5279" id="pin_sharp_circle-[#624]"></path>
                                </g>
                            </g>
                        </g>
                    </svg>
                  </span>
                  {{ tripPlan.city }}
                </span>
              </div>

              <div class="weather-container">
                <div class="weather-hero-icon weather-icon" :class="selectedWeatherIconKind">
                  <template v-if="selectedWeatherIconKind === 'sun-shower'">
                    <div class="cloud"></div>
                    <div class="sun">
                      <div class="rays"></div>
                    </div>
                    <div class="rain"></div>
                  </template>
                  <template v-else-if="selectedWeatherIconKind === 'thunder-storm'">
                    <div class="cloud"></div>
                    <div class="lightning">
                      <div class="bolt"></div>
                      <div class="bolt"></div>
                    </div>
                  </template>
                  <template v-else-if="selectedWeatherIconKind === 'cloudy'">
                    <div class="cloud"></div>
                    <div class="cloud"></div>
                  </template>
                  <template v-else-if="selectedWeatherIconKind === 'flurries'">
                    <div class="cloud"></div>
                    <div class="snow">
                      <div class="flake"></div>
                      <div class="flake"></div>
                    </div>
                  </template>
                  <template v-else-if="selectedWeatherIconKind === 'rainy'">
                    <div class="cloud"></div>
                    <div class="rain"></div>
                  </template>
                  <template v-else>
                    <div class="sun">
                      <div class="rays"></div>
                    </div>
                  </template>
                </div>
                <h1 class="weather-temp">{{ formatWeatherTemp(selectedWeather.day_temp) }}</h1>
                <h3 class="weather-desc">{{ selectedWeather.day_weather }}</h3>
              </div>
            </section>

            <section class="weather-info-side">
              <div class="week-container week-container--top">
                <ul class="week-list">
                  <li
                    v-for="(weatherItem, weatherIndex) in weatherDisplayList"
                    :key="`${weatherItem.date}-${weatherIndex}`"
                    :class="{ active: weatherIndex === activeWeatherIndex }"
                    @mouseenter="selectWeatherDay(weatherIndex)"
                    @click="selectWeatherDay(weatherIndex)"
                  >
                    <div class="day-icon weather-icon weather-icon--small" :class="weatherItem._iconKind">
                      <template v-if="weatherItem._iconKind === 'sun-shower'">
                        <div class="cloud"></div>
                        <div class="sun">
                          <div class="rays"></div>
                        </div>
                        <div class="rain"></div>
                      </template>
                      <template v-else-if="weatherItem._iconKind === 'thunder-storm'">
                        <div class="cloud"></div>
                        <div class="lightning">
                          <div class="bolt"></div>
                          <div class="bolt"></div>
                        </div>
                      </template>
                      <template v-else-if="weatherItem._iconKind === 'cloudy'">
                        <div class="cloud"></div>
                        <div class="cloud"></div>
                      </template>
                      <template v-else-if="weatherItem._iconKind === 'flurries'">
                        <div class="cloud"></div>
                        <div class="snow">
                          <div class="flake"></div>
                          <div class="flake"></div>
                        </div>
                      </template>
                      <template v-else-if="weatherItem._iconKind === 'rainy'">
                        <div class="cloud"></div>
                        <div class="rain"></div>
                      </template>
                      <template v-else>
                        <div class="sun">
                          <div class="rays"></div>
                        </div>
                      </template>
                    </div>
                    <span class="day-name">{{ formatWeatherWeekday(weatherItem.date, true) }}</span>
                    <span class="day-temp">{{ formatWeatherTemp(weatherItem.day_temp) }}</span>
                  </li>
                </ul>
              </div>

              <div class="today-info-container">
                <div class="today-info">
                  <div class="today-info-item">
                    <span class="wea-title">{{ t('result.weatherDay') }}</span>
                    <span class="value">{{ selectedWeather.day_weather }} · {{ formatWeatherTemp(selectedWeather.day_temp) }}</span>
                  </div>
                  <div class="today-info-item">
                    <span class="wea-title">{{ t('result.weatherNight') }}</span>
                    <span class="value">{{ selectedWeather.night_weather }} · {{ formatWeatherTemp(selectedWeather.night_temp) }}</span>
                  </div>
                  <div class="today-info-item">
                    <span class="wea-title">{{ t('result.weatherPrecipitation') }}</span>
                    <span class="value">{{ getWeatherPrecipitation(selectedWeather.day_weather) }}</span>
                  </div>
                  <div class="today-info-item">
                    <span class="wea-title">{{ t('result.weatherHumidity') }}</span>
                    <span class="value">{{ getWeatherHumidity(selectedWeather.day_weather) }}</span>
                  </div>
                  <div class="today-info-item">
                    <span class="wea-title">{{ t('result.weatherWind') }}</span>
                    <span class="value">{{ getWeatherWind(selectedWeather) }}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
          </div>
        </section>
      </div>

      <div v-else class="empty-state-panel">
        <n-empty :description="t('result.noTripPlan')">
          <template #extra>
            <n-button type="primary" @click="goBack">{{ t('result.backCreateTrip') }}</n-button>
          </template>
        </n-empty>
        <p class="empty-desc">{{ t('result.noTripPlanDesc') }}</p>
      </div>
    </main>

    <!-- 回到顶部：让出右下角的 AI 悬浮球位置 -->
    <n-back-top :right="28" :bottom="96" :visibility-height="400">
      <div class="back-top-button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </div>
    </n-back-top>

    <AIChat :trip-plan="tripPlan" />

    <!-- 预算改价弹窗 -->
    <n-modal
      v-model:show="budgetEditVisible"
      preset="card"
      class="budget-edit-modal"
      :title="budgetEditTitle"
      :bordered="false"
      :style="{ width: '420px' }"
      @after-leave="closeBudgetEdit"
    >
      <n-input-number
        v-model:value="budgetEditValue"
        :min="0"
        :precision="2"
        :step="10"
        class="budget-edit-input"
        @keyup.enter="confirmBudgetEdit"
      >
        <template #prefix>¥</template>
      </n-input-number>
      <template #footer>
        <div class="budget-edit-footer">
          <n-button @click="closeBudgetEdit">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmBudgetEdit">{{ t('common.save') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 结果页也要能登录：导航栏的「登录」按钮此前没有接任何处理器，点了没反应 -->
    <CloudAuthModal v-model:open="authOpen" @success="handleAuthSuccess" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NBackTop,
  NButton,
  NDropdown,
  NEmpty,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpin,
  type DropdownOption,
  type SelectOption,
} from 'naive-ui'
import * as echarts from 'echarts'
import Swiper from 'swiper'
import { Keyboard, Mousewheel } from 'swiper/modules'
import NavBar from '@/components/NavBar.vue'
import OverviewAttractionCard from '@/components/OverviewAttractionCard.vue'
import NearbyStationPanel from '@/components/NearbyStationPanel.vue'
import type { StationView } from '@/services/nearbyStation'
import AIChat from '@/components/AIChat.vue'
import {
  AMAP_MAP_FEATURES,
  AMAP_MAP_STYLE,
  hasAmapKey,
  loadAMap,
} from '@/services/amap'
import {
  brandColor,
  brandRgba,
  brandStrongColor,
  infoColor,
  inkRgba,
  successColor,
  token,
  warningColor,
} from '@/utils/designToken'
import CloudAuthModal from '@/components/CloudAuthModal.vue'
import { useTripStore } from '@/stores/trip'
import { useAuthStore } from '@/stores/auth'
import { hasOwnBackend } from '@/config/cloud'
import { confirmDialog, feedback } from '@/utils/feedback'
import { buildKnowledgeGraphFromPlan } from '@/utils/knowledgeGraph'
import { buildAttractionArtwork, type ArtworkVariant } from '@/utils/attractionArtwork'
import type { TripPlan, KnowledgeGraphData, GraphCategory, Attraction, Meal, Hotel, WeatherInfo } from '@/types'

const router = useRouter()
const { t, locale } = useI18n()
const tripStore = useTripStore()
const authStore = useAuthStore()
const authOpen = ref(false)
const tripPlan = ref<TripPlan | null>(null)
const editMode = ref(false)
const originalPlan = ref<TripPlan | null>(null)
const attractionPhotos = ref<Record<string, string>>({})
const activeSection = ref('overview')
const activeOverviewCard = ref(1)
const mapStatus = ref<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle')
/**
 * 每天的真实路线汇总（里程/耗时/交通方式），来自高德路线规划接口。
 * 规划失败的段会退化成直线，用 fallbackSegments 记下来，在 UI 上如实说明，
 * 而不是把直线当真实路线展示。
 */
const dayRouteSummaries = ref<DayRouteSummary[]>([])
const overviewSwiperContainerRef = ref<HTMLElement | null>(null)
// 概览轮播的翻页状态：卡片数超过一屏时才有必要显示翻页按钮
const overviewScrollable = ref(false)
const overviewAtStart = ref(true)
const overviewAtEnd = ref(false)
let map: any = null
let overviewSwiper: Swiper | null = null

/* 站点聚焦留下的临时标记/信息窗：销毁或下一次聚焦时清掉 */
let stationOverlays: any[] = []
let stationWindow: any = null
const STATION_FOCUS_ZOOM = 15

/**
 * 销毁地图实例。
 * 顺便清掉路线汇总：改预算/删条目会重建地图，残留的旧里程会和新的对不上。
 */
const destroyMap = () => {
  if (map) {
    map.destroy()
    map = null
  }
  // 同时摘掉调试句柄，别让它指向一个已经销毁的实例
  delete (window as unknown as { __wbAmapDebug?: unknown }).__wbAmapDebug
  // 站点聚焦留下的临时标记/信息窗也一并清掉
  stationOverlays = []
  stationWindow = null
  dayRouteSummaries.value = []
}

/* ---------- 路线概览：把高德规划的里程/耗时如实呈现出来 ---------- */

const formatRouteDistance = (meters: number): string =>
  meters >= 1000
    ? t('result.mapInfo.kilometers', { value: (meters / 1000).toFixed(1) })
    : t('result.mapInfo.meters', { value: Math.round(meters) })

const formatRouteDuration = (seconds: number): string => {
  // 不足一分钟也显示 1 分钟：显示 "0 分钟" 看起来像没规划成功
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return t('result.mapInfo.minutes', { minutes })
  return t('result.mapInfo.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

const routeSummaryRows = computed(() =>
  dayRouteSummaries.value.map((item) => ({
    dayIndex: item.dayIndex,
    dayNumber: item.dayIndex + 1,
    mode: item.mode,
    modeLabel: t(`result.routeMode.${item.mode}`),
    text: t(
      'result.mapInfo.routeRow',
      {
        segments: item.segments,
        distance: formatRouteDistance(item.distance),
        duration: formatRouteDuration(item.duration),
      },
      // 第三个参数给 vue-i18n 判断单复数（英文 "1 leg" vs "2 legs"）
      item.segments
    ),
  }))
)

/** 图例只列真的用上的交通方式，别摆一排用不到的颜色 */
const routeModeLegend = computed(() => {
  const seen = new Set<RouteMode>()
  dayRouteSummaries.value.forEach((item) => {
    if (item.segments > item.fallbackSegments) seen.add(item.mode)
  })
  return [...seen].map((mode) => ({ mode, label: t(`result.routeMode.${mode}`) }))
})

/** 有几段没规划成功（退化成直线），需要在 UI 上如实说明 */
const routeFallbackCount = computed(() =>
  dayRouteSummaries.value.reduce((total, item) => total + item.fallbackSegments, 0)
)

/*
 * 附近站点的查看中心：把行程里每个「天 + 景点」都收进来，作为可切换的列表中心。
 * 有坐标的景点才进列表；标签用"第 N 天 · 景点名"，与概览编号口径一致。
 */
const stationCenters = computed(() => {
  if (!tripPlan.value) return []
  const centers: {
    key: string
    label: string
    longitude: number
    latitude: number
  }[] = []
  tripPlan.value.days.forEach((day, dayIndex) => {
    day.attractions.forEach((attraction, attrIndex) => {
      const loc = attraction.location
      if (!loc || !Number.isFinite(loc.longitude) || !Number.isFinite(loc.latitude)) return
      centers.push({
        key: `${dayIndex}-${attrIndex}`,
        label: t('result.mapInfo.dayAttraction', { day: dayIndex + 1, index: attrIndex + 1 }),
        longitude: loc.longitude,
        latitude: loc.latitude,
      })
    })
  })
  return centers
})

/*
 * 站点 list 上抛的「聚焦」事件：把地图镜头平移/放大到该站点，
 * 并挂一个临时的站点标记 + 信息窗，方便在地图上看到它的位置。
 * 临时标记/窗口清理由顶部的 stationOverlays/stationWindow 管理。
 */
const handleStationFocus = (station: StationView) => {
  if (!map) {
    feedback.info(t('result.station.focus'))
    return
  }
  // 清掉上一次留下的站点标记与信息窗，避免越盯越多
  stationOverlays.forEach((o) => {
    try {
      o.setMap(null)
    } catch {
      map.remove(o)
    }
  })
  stationOverlays = []
  try {
    stationWindow?.setMap(null)
  } catch {
    /* 窗口可能已经随地图销毁，忽略 */
  }
  stationWindow = null

  const pos = [station.location.longitude, station.location.latitude]
  const AMapGlobal = (window as unknown as { AMap?: any }).AMap
  if (AMapGlobal) {
    const marker = new AMapGlobal.Marker({
      position: pos,
      anchor: 'center',
      zIndex: 300,
    })
    map.add(marker)
    stationOverlays.push(marker)

    const win = new AMapGlobal.InfoWindow({
      isCustom: true,
      offset: new AMapGlobal.Pixel(0, -20),
      closeWhenClickMap: true,
    })
    win.setContent(buildStationBubble(station))
    win.open(map, pos)
    stationWindow = win
  }

  map.setZoomAndCenter(STATION_FOCUS_ZOOM, pos, false, 300)
  feedback.info(t('result.station.focus'))
}

const buildStationBubble = (station: StationView): string => {
  const typeLabel = station.type === 'subway' ? t('result.station.subway') : t('result.station.bus')
  return `
    <div class="station-bubble">
      <span class="station-bubble__tag">${typeLabel}</span>
      <span class="station-bubble__name">${station.name}</span>
      <span class="station-bubble__meta">${t('result.station.walkHint', {
        minutes: station.walkMinutes,
        km: station.walkKm,
      })}</span>
    </div>
  `
}

type OverviewAttractionItem = {
  name: string
  address: string
  visit_duration: number
  description: string
  ticket_price?: number
  category?: string
  dayNumber: number
  dayArrayIndex: number
  order: number
}

type BudgetItemType = 'attraction' | 'hotel' | 'meal' | 'transport'
type BudgetSortMode = 'amountDesc' | 'amountAsc' | 'dayAsc' | 'dayDesc'

type BudgetDetailItem = {
  id: string
  type: BudgetItemType
  dayIndex: number | null
  dayNumber: number | null
  name: string
  amount: number
  sourceIndex?: number
}

type BudgetRestorePayload =
  | {
      type: 'attraction'
      attraction: Attraction
      insertIndex: number
    }
  | {
      type: 'meal'
      meal: Meal
      insertIndex: number
    }
  | {
      type: 'hotel'
      hotel: Hotel
      accommodation: string
    }
  | {
      type: 'transport'
      transportation: string
    }

type BudgetRestoreItem = {
  uid: string
  base: BudgetDetailItem
  payload: BudgetRestorePayload
}

const budgetFilterType = ref<'all' | BudgetItemType>('all')
const budgetSortMode = ref<BudgetSortMode>('amountDesc')
const pendingBudgetItems = ref<BudgetRestoreItem[]>([])
const activeWeatherIndex = ref(0)

/* ---------------- 展示型派生数据（顶部导航 / 预算总览 / 下拉选项） ---------------- */

/** 顶部区块导航：预算与天气是条件出现的，按 plan 实际内容算 */
const sectionNavItems = computed(() => {
  const plan = tripPlan.value
  const items: Array<{ key: string; labelKey: string }> = [
    { key: 'overview', labelKey: 'result.side.overview' },
  ]
  if (plan?.budget) items.push({ key: 'budget', labelKey: 'result.side.budget' })
  items.push({ key: 'map', labelKey: 'result.side.map' })
  items.push({ key: 'days', labelKey: 'result.side.days' })
  items.push({ key: 'knowledge-graph', labelKey: 'result.side.graph' })
  if (plan?.weather_info && plan.weather_info.length > 0) {
    items.push({ key: 'weather', labelKey: 'result.side.weather' })
  }
  return items
})

/** 预算总览的四类拆分 */
const budgetCategories = computed(() => [
  {
    type: 'attraction',
    labelKey: 'result.budget.attraction',
    amount: tripPlan.value?.budget?.total_attractions ?? 0,
  },
  { type: 'hotel', labelKey: 'result.budget.hotel', amount: tripPlan.value?.budget?.total_hotels ?? 0 },
  { type: 'meal', labelKey: 'result.budget.meal', amount: tripPlan.value?.budget?.total_meals ?? 0 },
  {
    type: 'transport',
    labelKey: 'result.budget.transport',
    amount: tripPlan.value?.budget?.total_transportation ?? 0,
  },
])

const budgetFilterOptions = computed<SelectOption[]>(() => [
  { value: 'all', label: t('result.budget.filterAll') },
  { value: 'attraction', label: t('result.budget.attraction') },
  { value: 'hotel', label: t('result.budget.hotel') },
  { value: 'meal', label: t('result.budget.meal') },
  { value: 'transport', label: t('result.budget.transport') },
])

const budgetSortOptions = computed<SelectOption[]>(() => [
  { value: 'amountDesc', label: t('result.budget.sortAmountDesc') },
  { value: 'amountAsc', label: t('result.budget.sortAmountAsc') },
  { value: 'dayAsc', label: t('result.budget.sortDayAsc') },
  { value: 'dayDesc', label: t('result.budget.sortDayDesc') },
])

/** 导出下拉 */
const exportOptions = computed<DropdownOption[]>(() => [
  { key: 'image', label: t('result.exportImage') },
  { key: 'pdf', label: t('result.exportPdf') },
])

const handleExportSelect = (key: string) => {
  if (key === 'image') void exportAsImage()
  else if (key === 'pdf') void exportAsPDF()
}

const localeTag = computed(() => {
  const currentLocale = String(locale.value || 'en').toLowerCase()
  if (currentLocale.startsWith('zh')) return 'zh-CN'
  if (currentLocale.startsWith('ja')) return 'ja-JP'
  return 'en-US'
})

const weatherList = computed<WeatherInfo[]>(() => tripPlan.value?.weather_info ?? [])

const selectedWeather = computed<WeatherInfo | null>(() => {
  const list = weatherList.value
  if (list.length === 0) return null
  const safeIndex = Math.min(Math.max(activeWeatherIndex.value, 0), list.length - 1)
  return list[safeIndex]
})

const parseWeatherDate = (rawDate: string): Date | null => {
  if (!rawDate) return null

  const normalized = rawDate
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/[./]/g, '-')
    .trim()

  // "YYYY-MM-DD" 会被 JS 当成 UTC 午夜解析，在 UTC 以西的时区会显示成前一天（连星期也错）。
  // 纯日期一律按本地时间构造，和用户看到的日期保持一致。
  const dateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized)
  const parsedDate = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(normalized)
  if (!Number.isNaN(parsedDate.getTime())) return parsedDate

  const matched = rawDate.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!matched) return null
  const [, year, month, day] = matched
  const fallbackDate = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate
}

const formatWeatherDate = (rawDate: string): string => {
  const date = parseWeatherDate(rawDate)
  if (!date) return rawDate || '--'
  return new Intl.DateTimeFormat(localeTag.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

const formatWeatherWeekday = (rawDate: string, short = false): string => {
  const date = parseWeatherDate(rawDate)
  if (!date) return rawDate || '--'
  return new Intl.DateTimeFormat(localeTag.value, {
    weekday: short ? 'short' : 'long',
  }).format(date)
}

const formatWeatherTemp = (temperature: number | null | undefined): string => {
  if (!Number.isFinite(Number(temperature))) return '--'
  return `${Math.round(Number(temperature))}°C`
}

type WeatherIconKind = 'sun-shower' | 'thunder-storm' | 'cloudy' | 'flurries' | 'sunny' | 'rainy'

const getWeatherIconKind = (weatherText: string): WeatherIconKind => {
  const text = (weatherText || '').trim()
  const hasRain = /(雨|rain|shower|drizzle|sprinkle|阵雨|小雨|中雨|大雨|暴雨)/i.test(text)
  const hasSun = /(晴|sun|clear)/i.test(text)

  if (/(雷|thunder|storm|lightning|雷暴|雷阵雨)/i.test(text)) return 'thunder-storm'
  if (/(雪|snow|sleet|hail|冰雹|冻雨|雨夹雪)/i.test(text)) return 'flurries'
  if (hasRain && hasSun) return 'sun-shower'
  if (hasRain) return 'rainy'
  if (/(云|阴|cloud|overcast|雾|霾|fog|mist|haze|wind|breeze|gale)/i.test(text)) return 'cloudy'
  return 'sunny'
}

const selectedWeatherIconKind = computed<WeatherIconKind>(() => {
  if (!selectedWeather.value) return 'sunny'
  return getWeatherIconKind(`${selectedWeather.value.day_weather || ''} ${selectedWeather.value.night_weather || ''}`)
})

type WeatherDisplayItem = WeatherInfo & {
  _iconKind: WeatherIconKind
}

const weatherDisplayList = computed<WeatherDisplayItem[]>(() => {
  return weatherList.value.map((item) => ({
    ...item,
    _iconKind: getWeatherIconKind(`${item.day_weather || ''} ${item.night_weather || ''}`),
  }))
})

/*
 * 天气卡是「压在渐变上的白字」。
 * 原来六档全是高饱和霓虹，而且最常用的「晴」没被任何规则命中、落到兜底的
 * #72edf2→#5151e5（青蓝），整个页面里最扎眼的就是它，和暖橙主色是两套语言。
 *
 * 现在统一压到低饱和：晴天直接落品牌暖色（天气卡成为品牌色的一处落点），
 * 其余天气按色相区分但都压暗，配合下面那层深色蒙层保证白字过 AA。
 */
const WEATHER_GRADIENTS: Array<{ test: RegExp; css: string }> = [
  { test: /(雷|thunder)/, css: 'linear-gradient(140deg, #5b5470 0%, #322c45 100%)' },
  { test: /(雪|snow|sleet|hail)/, css: 'linear-gradient(140deg, #a3b3c4 0%, #64748b 100%)' },
  { test: /(雨|rain|shower|drizzle)/, css: 'linear-gradient(140deg, #5a6b85 0%, #33405a 100%)' },
  { test: /(雾|霾|fog|mist|haze)/, css: 'linear-gradient(140deg, #8d949e 0%, #545b66 100%)' },
  { test: /(阴|overcast|cloud)/, css: 'linear-gradient(140deg, #78818f 0%, #454d5b 100%)' },
  { test: /(晴|clear|sun)/, css: 'linear-gradient(140deg, #ff8f52 0%, #b8431a 100%)' },
]

const WEATHER_GRADIENT_FALLBACK = 'linear-gradient(140deg, #78818f 0%, #454d5b 100%)'

const getWeatherGradient = (weatherText: string): string => {
  const text = (weatherText || '').toLowerCase()
  return WEATHER_GRADIENTS.find((item) => item.test.test(text))?.css ?? WEATHER_GRADIENT_FALLBACK
}

const getWeatherPrecipitation = (weatherText: string): string => {
  const text = (weatherText || '').toLowerCase()
  if (/(雷|thunder|暴雨|storm)/.test(text)) return '85%'
  if (/(雨|rain|shower|drizzle)/.test(text)) return '65%'
  if (/(雪|snow|sleet|hail)/.test(text)) return '55%'
  if (/(阴|cloud|overcast)/.test(text)) return '30%'
  return '10%'
}

const getWeatherHumidity = (weatherText: string): string => {
  const text = (weatherText || '').toLowerCase()
  if (/(雷|thunder|暴雨|storm)/.test(text)) return '88%'
  if (/(雨|rain|shower|drizzle)/.test(text)) return '78%'
  if (/(雪|snow|sleet|hail)/.test(text)) return '72%'
  if (/(阴|cloud|overcast|雾|霾|fog|mist|haze)/.test(text)) return '62%'
  return '42%'
}

const getWeatherWind = (weather: WeatherInfo | null): string => {
  if (!weather) return '--'
  const direction = weather.wind_direction?.trim() || '--'
  const power = weather.wind_power?.trim() || '--'
  return `${direction} ${power}`.trim()
}

const selectWeatherDay = (index: number) => {
  if (index < 0 || index >= weatherList.value.length) return
  activeWeatherIndex.value = index
}

const weatherSideStyle = computed<Record<string, string>>(() => ({
  '--weather-gradient': getWeatherGradient(selectedWeather.value?.day_weather || ''),
}))

watch(
  weatherList,
  (list) => {
    if (list.length === 0) {
      activeWeatherIndex.value = 0
      return
    }

    if (activeWeatherIndex.value > list.length - 1) {
      activeWeatherIndex.value = 0
    }
  },
  { immediate: true }
)

const overviewAttractions = computed<OverviewAttractionItem[]>(() => {
  if (!tripPlan.value) return []

  const items: OverviewAttractionItem[] = []
  /*
   * 模型偶尔会把同一个景点排进两天的动线（回访、顺路再逛），概览是「这一趟都去哪」的汇总，
   * 同名景点铺两张一样的卡只是噪音，按名字去重、保留第一次出现的那张。
   */
  const seen = new Set<string>()
  tripPlan.value.days.forEach((day, dayArrayIndex) => {
    const dayNumber =
      typeof day.day_index === 'number' && Number.isFinite(day.day_index)
        ? day.day_index + 1
        : dayArrayIndex + 1

    day.attractions.forEach((attraction, order) => {
      const key = normalizePoiName(attraction.name) || attraction.name
      if (seen.has(key)) return
      seen.add(key)

      items.push({
        name: attraction.name,
        address: attraction.address,
        visit_duration: attraction.visit_duration,
        description: attraction.description,
        ticket_price: attraction.ticket_price,
        category: attraction.category,
        dayNumber,
        dayArrayIndex,
        order,
      })
    })
  })
  return items
})

const destroyOverviewSwiper = () => {
  if (overviewSwiper) {
    overviewSwiper.destroy(true, true)
    overviewSwiper = null
  }
}

const initOverviewSwiper = async () => {
  await nextTick()

  if (!overviewSwiperContainerRef.value || overviewAttractions.value.length === 0) {
    destroyOverviewSwiper()
    overviewScrollable.value = false
    return
  }

  const root = overviewSwiperContainerRef.value.querySelector('.swiper') as HTMLElement | null
  if (!root) return

  destroyOverviewSwiper()
  /*
   * 用平铺等距的一行，不用 coverflow：
   * coverflow + centeredSlides 会把 wrapper 整体右移半个 slide，
   * 左侧留出 ~200px 空白、右侧有两张卡被裁掉，卡片之间的缩放叠压还会挡住标题。
   * 平铺后间距可预期，与结果页其它区块的卡片风格一致。
   */
  overviewSwiper = new Swiper(root, {
    modules: [Keyboard, Mousewheel],
    slidesPerView: 4,
    spaceBetween: 20,
    grabCursor: true,
    watchSlidesProgress: true,
    keyboard: {
      enabled: true,
    },
    mousewheel: {
      thresholdDelta: 70,
      forceToAxis: true,
    },
    loop: false,
    breakpoints: {
      0: { slidesPerView: 1.3 },
      640: { slidesPerView: 2.3 },
      1024: { slidesPerView: 3.3 },
      1440: { slidesPerView: 4 },
    },
    on: {
      slideChange: (swiper) => {
        activeOverviewCard.value = swiper.activeIndex
        syncOverviewNav()
      },
      resize: () => syncOverviewNav(),
      observerUpdate: () => syncOverviewNav(),
    },
  })

  activeOverviewCard.value = 0
  overviewSwiper.slideTo(0, 0, false)
  syncOverviewNav()
}

const syncOverviewNav = () => {
  const swiper = overviewSwiper
  if (!swiper) {
    overviewScrollable.value = false
    return
  }
  // isLocked = 所有 slide 能一屏放下，此时没有任何可翻的内容
  overviewScrollable.value = !swiper.isLocked
  overviewAtStart.value = swiper.isBeginning
  overviewAtEnd.value = swiper.isEnd
}

const slideOverview = (delta: number) => {
  if (!overviewSwiper) return
  if (delta < 0) overviewSwiper.slidePrev()
  else overviewSwiper.slideNext()
}

// 知识图谱相关
const graphData = ref<KnowledgeGraphData | null>(null)
const graphCategories = ref<GraphCategory[]>([])
let kgChart: echarts.ECharts | null = null
let kgResizeHandler: (() => void) | null = null

const ensureMapReady = async () => {
  await nextTick()
  if (!map) {
    await initMap()
    return
  }

  if (typeof map.resize === 'function') {
    map.resize()
  }
}

const ensureGraphReady = async () => {
  if (!graphData.value) return
  await nextTick()
  if (!kgChart) {
    initKnowledgeGraph()
    return
  }
  kgChart.resize()
}

const CATEGORY_KEY_MAP: Record<string, string> = {
  '城市': 'city',
  '都市': 'city',
  'city': 'city',
  '日程': 'schedule',
  '行程': 'schedule',
  'schedule': 'schedule',
  '景点': 'attraction',
  '観光地': 'attraction',
  'attraction': 'attraction',
  '酒店': 'hotel',
  'ホテル': 'hotel',
  'hotel': 'hotel',
  '餐饮': 'meal',
  '食事': 'meal',
  'meal': 'meal',
  '天气': 'weather',
  '天気': 'weather',
  'weather': 'weather',
  '预算': 'budget',
  '予算': 'budget',
  'budget': 'budget',
  '偏好/建议': 'suggestion',
  '好み/提案': 'suggestion',
  'preference/suggestion': 'suggestion',
}

const CATEGORY_COLORS: Record<string, string> = {
  city: '#4A90D9',
  schedule: '#5B8FF9',
  attraction: '#5AD8A6',
  hotel: '#F6BD16',
  meal: '#E8684A',
  weather: '#6DC8EC',
  budget: '#FF9845',
  suggestion: '#B37FEB',
}

const normalizeCategoryKey = (name: string): string => {
  const key = name.toLowerCase()
  return CATEGORY_KEY_MAP[name] || CATEGORY_KEY_MAP[key] || name
}

const getCategoryColor = (name: string): string => {
  const key = normalizeCategoryKey(name)
  return CATEGORY_COLORS[key] || '#999'
}

const getCategoryLabel = (name: string): string => {
  const key = normalizeCategoryKey(name)
  if (key in CATEGORY_COLORS) {
    return t(`result.graph.categories.${key}`)
  }
  return name
}

type KgNodeVisualPreset = {
  size: number
  gradientStart: string
  gradientEnd: string | null
}

const KG_NODE_CATEGORY_COLORS: Record<string, { start: string; end: string | null }> = {
  city: { start: '#0B3D91', end: '#5EEAD4' },
  schedule: { start: '#0000FF', end: '#E06BE0' },
  attraction: { start: '#0F7A32', end: '#C8FF6A' },
  hotel: { start: '#f59e0b', end: '#fde68a' },
  meal: { start: '#B91C1C', end: '#FDBA74' },
  weather: { start: '#0369A1', end: '#BFDBFE' },
  budget: { start: '#ea580c', end: '#fdba74' },
  suggestion: { start: '#9333ea', end: '#f0abfc' },
}

const getKgCategoryPalette = (categoryName: string): { start: string; end: string | null } => {
  const categoryKey = normalizeCategoryKey(categoryName || '')
  return KG_NODE_CATEGORY_COLORS[categoryKey] || { start: getCategoryColor(categoryName), end: null }
}

const KG_NODE_SIZE_SCALE = 1.25

const getKgNodeVisualPreset = (rawSize: number, categoryName: string): KgNodeVisualPreset => {
  const baseSize = rawSize >= 70 ? 100 : rawSize >= 45 ? 80 : 60
  const size = Math.round(baseSize * KG_NODE_SIZE_SCALE)
  const palette = getKgCategoryPalette(categoryName)

  return {
    size,
    gradientStart: palette.start,
    gradientEnd: palette.end,
  }
}

const kgNodeSymbolCache = new Map<string, string>()
const kgLegendDotStyleCache = new Map<string, Record<string, string>>()

const buildFeatherCircleSvgDataUrl = (size: number, start: string, end: string | null): string => {
  const center = size / 2
  const radius = Math.round(size * 0.34)
  const gradientDef = end
    ? `<linearGradient id="kgNodeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
         <stop offset="0%" stop-color="${start}" />
         <stop offset="100%" stop-color="${end}" />
       </linearGradient>`
    : ''
  const fillColor = end ? 'url(#kgNodeGradient)' : start

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      ${gradientDef}
      <filter id="kgNodeBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
    </defs>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="${fillColor}" filter="url(#kgNodeBlur)" />
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const getKgNodeSymbol = (visual: KgNodeVisualPreset): string => {
  const cacheKey = `${visual.size}-${visual.gradientStart}-${visual.gradientEnd ?? 'solid'}`
  const cachedSymbol = kgNodeSymbolCache.get(cacheKey)
  if (cachedSymbol) return cachedSymbol

  const symbol = `image://${buildFeatherCircleSvgDataUrl(visual.size, visual.gradientStart, visual.gradientEnd)}`
  kgNodeSymbolCache.set(cacheKey, symbol)
  return symbol
}

const getKgLegendDotStyle = (categoryName: string): Record<string, string> => {
  const palette = getKgCategoryPalette(categoryName)
  const cacheKey = `${palette.start}-${palette.end ?? 'solid'}`
  const cachedStyle = kgLegendDotStyleCache.get(cacheKey)
  if (cachedStyle) return cachedStyle

  const dataUrl = buildFeatherCircleSvgDataUrl(24, palette.start, palette.end)
  const style = { backgroundImage: `url("${dataUrl}")` }
  kgLegendDotStyleCache.set(cacheKey, style)
  return style
}

const buildKgBoundaryPositionMap = (
  nodes: any[],
  edges: any[],
  categories: GraphCategory[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> => {
  const nodeKey = (id: unknown): string => String(id)
  const degreeMap = new Map<string, number>()

  nodes.forEach((node) => degreeMap.set(nodeKey(node.id), 0))
  edges.forEach((edge) => {
    const sourceKey = nodeKey(edge.source)
    const targetKey = nodeKey(edge.target)
    degreeMap.set(sourceKey, (degreeMap.get(sourceKey) || 0) + 1)
    degreeMap.set(targetKey, (degreeMap.get(targetKey) || 0) + 1)
  })

  let rootNodeKey = nodes.length > 0 ? nodeKey(nodes[0].id) : ''
  let maxDegree = -1
  nodes.forEach((node) => {
    const key = nodeKey(node.id)
    const degree = degreeMap.get(key) || 0
    if (degree > maxDegree) {
      maxDegree = degree
      rootNodeKey = key
    }
  })

  const groupedNodes = new Map<string, any[]>()
  nodes.forEach((node) => {
    const key = nodeKey(node.id)
    if (key === rootNodeKey) return

    const categoryName = categories?.[Number(node.category)]?.name || ''
    const categoryKey = normalizeCategoryKey(categoryName || 'misc')
    if (!groupedNodes.has(categoryKey)) groupedNodes.set(categoryKey, [])
    groupedNodes.get(categoryKey)!.push(node)
  })

  const orderedGroupKeys = Array.from(groupedNodes.keys()).sort((a, b) => {
    return (groupedNodes.get(b)?.length || 0) - (groupedNodes.get(a)?.length || 0)
  })

  const cx = width / 2
  const cy = height / 2
  const outerRadiusX = Math.max(80, width / 2 - 24)
  const outerRadiusY = Math.max(80, height / 2 - 24)
  const layerFactors = [1, 0.9, 0.8, 0.7]
  const positionMap = new Map<string, { x: number; y: number }>()

  if (rootNodeKey) {
    positionMap.set(rootNodeKey, { x: cx, y: cy })
  }

  orderedGroupKeys.forEach((groupKey, groupIndex) => {
    const group = groupedNodes.get(groupKey) || []
    if (group.length === 0) return

    const baseAngle = -Math.PI / 2 + (2 * Math.PI * groupIndex) / Math.max(1, orderedGroupKeys.length)
    const spread = Math.min(1.25, Math.max(0.55, group.length * 0.03))
    const layerStride = Math.max(1, Math.ceil(group.length / layerFactors.length))

    group.forEach((node, nodeIndex) => {
      const t = group.length === 1 ? 0 : nodeIndex / (group.length - 1) - 0.5
      const angle = baseAngle + t * spread
      const layerIndex = Math.min(layerFactors.length - 1, Math.floor(nodeIndex / layerStride))
      const layerFactor = layerFactors[layerIndex]

      const visualSize = Number(node.__visual?.size) || 90
      const nodeRadius = Math.round(visualSize * 0.34)
      const marginX = nodeRadius + 8
      const marginY = nodeRadius + 8

      let x = cx + Math.cos(angle) * outerRadiusX * layerFactor
      let y = cy + Math.sin(angle) * outerRadiusY * layerFactor
      x = Math.max(marginX, Math.min(width - marginX, x))
      y = Math.max(marginY, Math.min(height - marginY, y))

      positionMap.set(nodeKey(node.id), { x, y })
    })
  })

  return positionMap
}

onMounted(async () => {
  if (tripStore.tripPlan) {
    tripPlan.value = tripStore.tripPlan
    pendingBudgetItems.value = []
    // 六个区块同页展开，所以挂载后一次性把重组件都点亮
    // 加载景点真照片：不 await —— 它要先等高德 JS API、再串一串 POI 搜索，
    // 堵在这里会把地图初始化整体推迟；照片就绪后 Vue 会自动把 img src 换掉
    void loadAttractionPhotos()
    // 加载知识图谱：自建后端会带回 graph_data；走云模型时没有，就在本地按行程推导一份，
    // 否则常驻展开的「知识图谱」区块会是空的
    graphData.value = tripStore.graphData ?? buildKnowledgeGraphFromPlan(tripPlan.value)
    graphCategories.value = graphData.value.categories || []
    await nextTick()
    // 地图/图谱/概览轮播都在可见容器里，无需等切页
    void ensureMapReady()
    void ensureGraphReady()
    void initOverviewSwiper()
    window.addEventListener('scroll', onWindowScroll, { passive: true })
    window.addEventListener('resize', onWindowScroll)
  }
})

// ===== 滚动高亮：六个区块都展开了，导航改为滚动联动 =====
const SECTION_IDS = ['overview', 'budget', 'map', 'days', 'knowledge-graph', 'weather'] as const
let scrollRaf = 0

const onWindowScroll = () => {
  if (scrollRaf) return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = 0
    syncActiveSectionFromScroll()
  })
}

/**
 * 区块锚点的滚动偏移量。
 * 固定导航 70px + 粘性区块导航 ~56px，取 136px 让标题落在导航下方。
 * 必须与 `.result-section` 的 `scroll-margin-top` 保持一致。
 */
const SECTION_SCROLL_OFFSET = 136

const syncActiveSectionFromScroll = () => {
  /*
   * 判定"当前区块"的阅读线：视口上方 1/3 处，且不高于导航下沿。
   * 只用 SECTION_SCROLL_OFFSET 的话，区块标题滚到屏幕中部时导航还高亮着上一个区块，
   * 看起来像没跟上；用 1/3 视口能让高亮跟着真正在看的内容走。
   * 区块高度都远大于 1/3 视口，不会出现提前跳到下一区块的情况。
   */
  const offset = Math.max(SECTION_SCROLL_OFFSET + 8, window.innerHeight * 0.35)
  let current: string | null = null
  for (const id of SECTION_IDS) {
    const el = document.getElementById(id)
    if (!el) continue
    if (el.getBoundingClientRect().top <= offset) current = id
  }
  if (current && current !== activeSection.value) {
    activeSection.value = current
  }
}

const scrollToSectionId = (id: string) => {
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - SECTION_SCROLL_OFFSET
  window.scrollTo({ top, behavior: 'smooth' })
  activeSection.value = id
}

watch(
  overviewAttractions,
  (items) => {
    if (items.length === 0) {
      activeOverviewCard.value = -1
      return
    }
    if (activeOverviewCard.value < 0 || activeOverviewCard.value >= items.length) {
      activeOverviewCard.value = Math.min(1, items.length - 1)
    }
    void initOverviewSwiper()
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll)
  window.removeEventListener('resize', onWindowScroll)
  if (scrollRaf) {
    window.cancelAnimationFrame(scrollRaf)
    scrollRaf = 0
  }
  destroyOverviewSwiper()
  if (kgResizeHandler) {
    window.removeEventListener('resize', kgResizeHandler)
    kgResizeHandler = null
  }
  if (kgChart) {
    kgChart.dispose()
    kgChart = null
  }
})

const goBack = () => {
  router.push('/')
}

// ===== 登录态：与 Landing 保持一致的行为 =====
const openAuth = () => {
  authOpen.value = true
}

const handleAuthSuccess = () => {
  feedback.success(t('auth.notice.signedIn'))
  void authStore.init()
}

const handleSignOut = () => {
  confirmDialog({
    title: t('auth.signOutTitle'),
    okText: t('auth.signOut'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      await authStore.signOut()
      feedback.success(t('auth.notice.signedOut'))
    },
  })
}

// 滚动到指定区域
const scrollToSection = (key: string) => {
  scrollToSectionId(key)
}

const goToDayFromOverview = (dayArrayIndex: number) => {
  scrollToSectionId(`day-${dayArrayIndex}`)
}

const setActiveOverviewCard = (index: number) => {
  activeOverviewCard.value = index
  if (overviewSwiper && overviewSwiper.activeIndex !== index) {
    overviewSwiper.slideTo(index)
  }
}

// 切换编辑模式
const toggleEditMode = () => {
  editMode.value = true
  // 保存原始数据用于取消编辑
  originalPlan.value = JSON.parse(JSON.stringify(tripPlan.value))
  feedback.info(t('result.messages.enterEditMode'))
}

// 保存修改
const saveChanges = () => {
  editMode.value = false
  recalculateBudgetTotals()
  // 更新 store
  if (tripPlan.value) {
    tripStore.setTripPlan(tripPlan.value, graphData.value)
  }
  feedback.success(t('result.messages.changesSaved'))

  // 重新初始化地图以反映更改
  destroyMap()
  nextTick(() => {
    void initMap(true)
  })
}

// 取消编辑
const cancelEdit = () => {
  if (originalPlan.value) {
    tripPlan.value = JSON.parse(JSON.stringify(originalPlan.value))
  }
  pendingBudgetItems.value = []
  editMode.value = false
  feedback.info(t('result.messages.editCanceled'))
}

// 删除景点
const deleteAttraction = (dayIndex: number, attrIndex: number) => {
  if (!tripPlan.value) return

  const day = tripPlan.value.days[dayIndex]
  if (day.attractions.length <= 1) {
    feedback.warning(t('result.messages.keepOneAttraction'))
    return
  }

  day.attractions.splice(attrIndex, 1)
  recalculateBudgetTotals()
  feedback.success(t('result.messages.attractionDeleted'))
}

// 移动景点顺序
const moveAttraction = (dayIndex: number, attrIndex: number, direction: 'up' | 'down') => {
  if (!tripPlan.value) return

  const day = tripPlan.value.days[dayIndex]
  const attractions = day.attractions

  if (direction === 'up' && attrIndex > 0) {
    [attractions[attrIndex], attractions[attrIndex - 1]] = [attractions[attrIndex - 1], attractions[attrIndex]]
  } else if (direction === 'down' && attrIndex < attractions.length - 1) {
    [attractions[attrIndex], attractions[attrIndex + 1]] = [attractions[attrIndex + 1], attractions[attrIndex]]
  }
}

const getMealLabel = (type: string): string => {
  const labels: Record<string, string> = {
    breakfast: t('result.meals.breakfast'),
    lunch: t('result.meals.lunch'),
    dinner: t('result.meals.dinner'),
    snack: t('result.meals.snack')
  }
  return labels[type] || type
}

const toBudgetNumber = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return numeric
}

const roundBudgetAmount = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const formatBudgetAmount = (value: number): string => {
  const rounded = roundBudgetAmount(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

const getBudgetTypeLabel = (type: BudgetItemType): string => {
  const labels: Record<BudgetItemType, string> = {
    attraction: t('result.budget.attraction'),
    hotel: t('result.budget.hotel'),
    meal: t('result.budget.meal'),
    transport: t('result.budget.transport'),
  }
  return labels[type]
}

const cloneData = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T

const recalculateBudgetTotals = (transportationOverride?: number) => {
  if (!tripPlan.value) return

  let attractionTotal = 0
  let hotelTotal = 0
  let mealTotal = 0

  tripPlan.value.days.forEach((day) => {
    day.attractions.forEach((attraction) => {
      attractionTotal += toBudgetNumber(attraction.ticket_price)
    })

    if (day.hotel) {
      hotelTotal += toBudgetNumber(day.hotel.estimated_cost)
    }

    day.meals.forEach((meal) => {
      mealTotal += toBudgetNumber(meal.estimated_cost)
    })
  })

  const transportationTotal = roundBudgetAmount(
    transportationOverride ?? toBudgetNumber(tripPlan.value.budget?.total_transportation)
  )

  tripPlan.value.budget = {
    total_attractions: roundBudgetAmount(attractionTotal),
    total_hotels: roundBudgetAmount(hotelTotal),
    total_meals: roundBudgetAmount(mealTotal),
    total_transportation: transportationTotal,
    total: roundBudgetAmount(attractionTotal + hotelTotal + mealTotal + transportationTotal),
  }
}

const budgetItems = computed<BudgetDetailItem[]>(() => {
  if (!tripPlan.value) return []

  const items: BudgetDetailItem[] = []

  tripPlan.value.days.forEach((day, dayIndex) => {
    const dayNumber = day.day_index + 1

    day.attractions.forEach((attraction, attractionIndex) => {
      const amount = roundBudgetAmount(toBudgetNumber(attraction.ticket_price))
      if (amount <= 0) return
      items.push({
        id: `attraction-${dayIndex}-${attractionIndex}`,
        type: 'attraction',
        dayIndex,
        dayNumber,
        name: attraction.name,
        amount,
        sourceIndex: attractionIndex,
      })
    })

    if (day.hotel) {
      const amount = roundBudgetAmount(toBudgetNumber(day.hotel.estimated_cost))
      if (amount > 0) {
        items.push({
          id: `hotel-${dayIndex}`,
          type: 'hotel',
          dayIndex,
          dayNumber,
          name: day.hotel.name,
          amount,
        })
      }
    }

    day.meals.forEach((meal, mealIndex) => {
      const amount = roundBudgetAmount(toBudgetNumber(meal.estimated_cost))
      if (amount <= 0) return
      items.push({
        id: `meal-${dayIndex}-${mealIndex}`,
        type: 'meal',
        dayIndex,
        dayNumber,
        name: `${getMealLabel(meal.type)} · ${meal.name}`,
        amount,
        sourceIndex: mealIndex,
      })
    })
  })

  const transportTotal = roundBudgetAmount(toBudgetNumber(tripPlan.value.budget?.total_transportation))
  const transportDays = tripPlan.value.days
    .map((day, dayIndex) => ({ day, dayIndex }))
    .filter(({ day }) => Boolean(day.transportation && day.transportation.trim()))

  if (transportTotal > 0 && transportDays.length > 0) {
    const avg = roundBudgetAmount(transportTotal / transportDays.length)
    let remaining = transportTotal

    transportDays.forEach(({ day, dayIndex }, index) => {
      const amount = index === transportDays.length - 1 ? remaining : Math.min(avg, remaining)
      remaining = roundBudgetAmount(remaining - amount)
      items.push({
        id: `transport-${dayIndex}`,
        type: 'transport',
        dayIndex,
        dayNumber: day.day_index + 1,
        name: day.transportation,
        amount: roundBudgetAmount(amount),
      })
    })
  }

  return items
})

const filteredBudgetItems = computed<BudgetDetailItem[]>(() => {
  let items = budgetItems.value

  if (budgetFilterType.value !== 'all') {
    items = items.filter((item) => item.type === budgetFilterType.value)
  }

  const sorted = [...items]
  sorted.sort((a, b) => {
    const dayA = a.dayNumber ?? Number.MAX_SAFE_INTEGER
    const dayB = b.dayNumber ?? Number.MAX_SAFE_INTEGER

    switch (budgetSortMode.value) {
      case 'amountAsc':
        return a.amount - b.amount
      case 'dayAsc':
        return dayA - dayB || b.amount - a.amount
      case 'dayDesc':
        return dayB - dayA || b.amount - a.amount
      case 'amountDesc':
      default:
        return b.amount - a.amount
    }
  })

  return sorted
})

const budgetEditVisible = ref(false)
const budgetEditItem = ref<BudgetDetailItem | null>(null)
// 允许 null：a-input-number 清空时回传 null，需在提交时拦截而不是静默按 0 处理
const budgetEditValue = ref<number | null>(0)

const budgetEditTitle = computed(() => {
  const item = budgetEditItem.value
  if (!item) return ''
  return t('result.budget.editPrompt', {
    name: item.name,
    amount: formatBudgetAmount(item.amount),
  })
})

/** 打开改价弹窗（替代原生 window.prompt，避免阻塞式交互与样式脱节） */
const editBudgetItemAmount = (item: BudgetDetailItem) => {
  if (!tripPlan.value || item.dayIndex === null) return
  budgetEditItem.value = item
  budgetEditValue.value = roundBudgetAmount(item.amount)
  budgetEditVisible.value = true
}

const closeBudgetEdit = () => {
  budgetEditVisible.value = false
  budgetEditItem.value = null
}

const confirmBudgetEdit = () => {
  const item = budgetEditItem.value
  if (!item || !tripPlan.value || item.dayIndex === null) {
    closeBudgetEdit()
    return
  }

  const day = tripPlan.value.days[item.dayIndex]
  if (!day) {
    closeBudgetEdit()
    return
  }

  const raw = budgetEditValue.value
  if (raw === null || raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
    feedback.warning(t('result.messages.budgetInvalidAmount'))
    return
  }

  const nextAmount = roundBudgetAmount(Number(raw))
  if (nextAmount === roundBudgetAmount(item.amount)) {
    closeBudgetEdit()
    return
  }

  let changed = false

  if (item.type === 'attraction' && typeof item.sourceIndex === 'number' && day.attractions[item.sourceIndex]) {
    day.attractions[item.sourceIndex].ticket_price = nextAmount
    changed = true
  }

  if (item.type === 'meal' && typeof item.sourceIndex === 'number' && day.meals[item.sourceIndex]) {
    day.meals[item.sourceIndex].estimated_cost = nextAmount
    changed = true
  }

  if (item.type === 'hotel' && day.hotel) {
    day.hotel.estimated_cost = nextAmount
    changed = true
  }

  const transportationTotal =
    item.type === 'transport'
      ? Math.max(
          0,
          roundBudgetAmount(toBudgetNumber(tripPlan.value.budget?.total_transportation) - item.amount + nextAmount)
        )
      : undefined

  if (item.type === 'transport' && day.transportation && day.transportation.trim()) {
    changed = true
  }

  closeBudgetEdit()

  if (!changed) return

  recalculateBudgetTotals(transportationTotal)
  if (tripPlan.value) {
    tripStore.setTripPlan(tripPlan.value, graphData.value)
  }
  feedback.success(t('result.messages.budgetAmountUpdated'))
}

const deleteBudgetItem = (item: BudgetDetailItem) => {
  if (!tripPlan.value || item.dayIndex === null) return

  const day = tripPlan.value.days[item.dayIndex]
  if (!day) return

  let changed = false
  let restorePayload: BudgetRestorePayload | null = null

  if (item.type === 'attraction' && typeof item.sourceIndex === 'number') {
    const attraction = day.attractions[item.sourceIndex]
    if (attraction) {
      restorePayload = {
        type: 'attraction',
        attraction: cloneData(attraction),
        insertIndex: item.sourceIndex,
      }
      day.attractions.splice(item.sourceIndex, 1)
      changed = true
    }
  }

  if (item.type === 'meal' && typeof item.sourceIndex === 'number') {
    const meal = day.meals[item.sourceIndex]
    if (meal) {
      restorePayload = {
        type: 'meal',
        meal: cloneData(meal),
        insertIndex: item.sourceIndex,
      }
      day.meals.splice(item.sourceIndex, 1)
      changed = true
    }
  }

  if (item.type === 'hotel') {
    if (day.hotel) {
      restorePayload = {
        type: 'hotel',
        hotel: cloneData(day.hotel),
        accommodation: day.accommodation || '',
      }
      day.hotel = undefined
      day.accommodation = ''
      changed = true
    }
  }

  if (item.type === 'transport') {
    if (day.transportation && day.transportation.trim()) {
      restorePayload = {
        type: 'transport',
        transportation: day.transportation,
      }
      day.transportation = ''
      changed = true
    }
  }

  if (!changed || !restorePayload) return

  pendingBudgetItems.value.unshift({
    uid: `${item.id}-${Date.now()}`,
    base: cloneData(item),
    payload: restorePayload,
  })

  const transportationTotal =
    item.type === 'transport'
      ? Math.max(
          0,
          roundBudgetAmount(
            toBudgetNumber(tripPlan.value.budget?.total_transportation) - roundBudgetAmount(item.amount)
          )
        )
      : undefined

  recalculateBudgetTotals(transportationTotal)
  if (tripPlan.value) {
    tripStore.setTripPlan(tripPlan.value, graphData.value)
  }

  destroyMap()

  feedback.success(t('result.messages.budgetItemDeleted'))
}

const restoreBudgetItem = (pendingItem: BudgetRestoreItem) => {
  if (!tripPlan.value || pendingItem.base.dayIndex === null) return

  const day = tripPlan.value.days[pendingItem.base.dayIndex]
  if (!day) return

  let changed = false

  if (pendingItem.payload.type === 'attraction') {
    const insertAt = Math.max(0, Math.min(pendingItem.payload.insertIndex, day.attractions.length))
    day.attractions.splice(insertAt, 0, cloneData(pendingItem.payload.attraction))
    changed = true
  }

  if (pendingItem.payload.type === 'meal') {
    const insertAt = Math.max(0, Math.min(pendingItem.payload.insertIndex, day.meals.length))
    day.meals.splice(insertAt, 0, cloneData(pendingItem.payload.meal))
    changed = true
  }

  if (pendingItem.payload.type === 'hotel') {
    day.hotel = cloneData(pendingItem.payload.hotel)
    day.accommodation = pendingItem.payload.accommodation
    changed = true
  }

  if (pendingItem.payload.type === 'transport') {
    day.transportation = pendingItem.payload.transportation
    changed = true
  }

  if (!changed) return

  const transportationTotal =
    pendingItem.base.type === 'transport'
      ? roundBudgetAmount(toBudgetNumber(tripPlan.value.budget?.total_transportation) + pendingItem.base.amount)
      : undefined

  recalculateBudgetTotals(transportationTotal)
  pendingBudgetItems.value = pendingBudgetItems.value.filter((item) => item.uid !== pendingItem.uid)
  if (tripPlan.value) {
    tripStore.setTripPlan(tripPlan.value, graphData.value)
  }

  destroyMap()

  feedback.success(t('result.messages.budgetItemRestored'))
}

/**
 * PlaceSearch 在 extensions: 'all' 下返回的字段子集。
 * 只声明我们真的会用的：照片、地址、电话、营业时间、评分/人均。
 */
type AmapPoi = {
  name?: string
  type?: string
  photos?: Array<{ url?: string }>
  address?: string
  tel?: string
  /** 营业时间，只有部分 POI 类型（餐饮/景点）会返回 */
  open_time?: string
  /** 评分与人均消费，同样只有部分类型有 */
  biz_ext?: { rating?: string | number; cost?: string | number }
  location?: { lng?: number; lat?: number }
}

/**
 * 景点名 → 高德 POI 明细。
 * 配图那次 PlaceSearch 本来就带回了这些字段，只是原来只用照片、其余丢掉；
 * 现在顺手存下来给地图详情窗用 —— 零额外请求。
 *
 * 刻意不用 ref：详情窗的 DOM 是我们手动拼的字符串，在点击那一刻现拼，
 * 不需要驱动 Vue 重渲染。
 */
const poiDetails: Record<string, AmapPoi> = {}

/**
 * 高德 POI 库里混着「某景点的停车场 / 售票处 / 东门」这类子设施，它们也有照片，
 * 但拍的多半是水泥地、道闸和指示牌。给这类名字扣分，别让它们挤掉正主。
 */
const POI_NOISE_PATTERN = /停车场|停车楼|售票|出入口|入口|出口|大门|东门|南门|西门|北门|卫生间|厕所|游客中心|服务中心|派出所|公交站|地铁站|便利店|超市|商店|餐厅|酒楼|宾馆|公寓|住宿|路口|岗亭|管理处|办公楼|宿舍|仓库|充电站|加油站|有限公司|分公司/

/** 风景名胜类的封面更「像明信片」；命中就加点分，让同分的候选里它排前面 */
const POI_SCENIC_PATTERN = /风景名胜|公园|景点|寺庙|道观|教堂|古迹|遗址|博物馆|纪念馆|美术馆|文化|广场|园林|湿地|古镇|步行街|旅游|景区/

/** 去掉括号补充说明与标点，只留可比较的正文：「西湖风景名胜区（断桥残雪·白堤）」→「西湖风景名胜区」 */
const normalizePoiName = (value: string) =>
  (value || '')
    .replace(/[（(【[][^）)】\]]*[）)】\]]/g, '')
    .replace(/[\s·・\-—_,，。.、'"“”]/g, '')
    .trim()

/**
 * 中文 POI 名大多是「核心词 + 类型后缀」。把后缀剥掉再比对，
 * 能救回「河坊街历史街区 ↔ 河坊街景区」这种同一个地方、两种叫法的情况。
 * 只剥多字后缀：单字的「塔 / 湖 / 山」往往就是名字本身（雷峰塔不能变成雷峰）。
 */
const POI_TYPE_SUFFIXES = [
  '历史文化特色街区',
  '历史文化街区',
  '历史街区',
  '特色商业街',
  '特色街区',
  '步行街',
  '商业街',
  '国家级景点',
  '风景名胜区',
  '湿地公园',
  '森林公园',
  '主题公园',
  '地质公园',
  '博物馆',
  '纪念馆',
  '美术馆',
  '文化馆',
  '游客中心',
  '服务中心',
  '服务区',
  '景区',
  '公园',
  '古镇',
  '古街',
  '街区',
  '广场',
  '大道',
  '旅游区',
]

const stripPoiTypeSuffix = (value: string) => {
  for (const suffix of POI_TYPE_SUFFIXES) {
    // 至少给核心词留 2 个字，别把「西湖风景名胜区」剥成空
    if (value.length > suffix.length + 1 && value.endsWith(suffix)) {
      return value.slice(0, -suffix.length)
    }
  }
  return value
}

/** 用字重合度（Jaccard）。名字对不上时用兜底，低于阈值就被淘汰 */
const charOverlap = (a: string, b: string) => {
  const setA = new Set(a)
  const setB = new Set(b)
  let hit = 0
  setA.forEach((char) => {
    if (setB.has(char)) hit += 1
  })
  return hit / (setA.size + setB.size - hit)
}

/**
 * 给候选 POI 打分：分数越高越可能是「正主」。
 * 返回 -1 表示根本不像同一个地方，直接淘汰。
 */
const scorePoi = (poi: AmapPoi, targetName: string): number => {
  const poiName = normalizePoiName(poi.name ?? '')
  const target = normalizePoiName(targetName)
  if (!poiName || !target) return -1

  const poiCore = stripPoiTypeSuffix(poiName)
  const targetCore = stripPoiTypeSuffix(target)

  let score: number
  if (poiName === target || poiCore === targetCore) score = 100
  else if (target.includes(poiName) || targetCore.includes(poiCore)) score = 72 // 目标更长：这个 POI 是它的一部分
  else if (poiName.includes(target) || poiCore.includes(targetCore)) score = 58 // POI 更长：目标在它里面
  else {
    const overlap = charOverlap(poiName, target)
    if (overlap < 0.5) return -1
    score = Math.round(10 + overlap * 60)
  }

  if (POI_NOISE_PATTERN.test(poi.name ?? '')) score -= 60
  // 风景名胜类的封面更「像明信片」；商场、写字楼的封面加不了分，自然排在后面
  if (POI_SCENIC_PATTERN.test(poi.type ?? '')) score += 8

  return score
}

/**
 * 高德图床默认给的是 500px 宽的缩略图，卡片在 2x 屏上发虚、导出 PNG 更糊。
 * 它认 `operate=original`：实测同一张图从 500×333 变成 1280×853。
 * 有的直链本身就带 `?type=pic`，所以是追加而不是替换查询串。
 * 顺带把 http 换成 https —— https 页面会把混合内容直接拦掉。
 */
const withOriginalSize = (url: string): string => {
  const httpsUrl = url.replace(/^http:\/\//, 'https://')
  if (!/store\.is\.autonavi\.com\/showpic\//.test(httpsUrl)) return httpsUrl
  if (/[?&]operate=/.test(httpsUrl)) return httpsUrl
  return `${httpsUrl}${httpsUrl.includes('?') ? '&' : '?'}operate=original`
}

/** 探针式加载：只有真的解码成功才算可用（否则 <img src> 会先切成空白再变图） */
const probeImageLoads = (url: string, waitMs: number) =>
  new Promise<boolean>((resolve) => {
    const probe = new Image()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    probe.onload = () => finish(true)
    probe.onerror = () => finish(false)
    setTimeout(() => finish(false), waitMs)
    probe.src = url
  })

/**
 * 先拿小图，再争取换成原图。
 *
 * 顺序是踩出来的：高德图床的 `?operate=original` 偶尔会给一张几 MB 的巨图
 * （实测西溪某张原图 7,084,007 字节），在超时窗口里根本拉不完。
 * 如果「原图失败就整体放弃」，用户最后看到的就是一张插画 —— 实测就是这么翻车的。
 * 反过来先上默认缩略图（40KB 上下，基本必成），原图能回来再替换：
 * 最差退化成 500px 的小图，而不是没有图。
 *
 * 只有真的解码成功才写进 `attractionPhotos`，否则 <img src> 会先切成一段空白再变图，
 * 反而比一直显示插画更像「图挂了」。
 */
const loadPhotoWithUpgrade = async (name: string, defaultUrl: string, originalUrl: string) => {
  if (!defaultUrl || attractionPhotos.value[name]) return

  const loaded = await probeImageLoads(defaultUrl, 9000)
  if (!loaded) return
  if (!attractionPhotos.value[name]) attractionPhotos.value[name] = defaultUrl

  // 直链本来就不是高德图床（比如 aos-comment 的用户实拍），没有原图可换
  if (originalUrl === defaultUrl) return

  // 原图窗口给短一点：几 MB 的巨图拉不下来就及时放弃，别一直占着连接
  if (await probeImageLoads(originalUrl, 5000)) {
    attractionPhotos.value[name] = originalUrl
  }
}

/**
 * 加载景点真照片。
 *
 * 优先级：自建后端的 POI 图库 > 高德 POI 搜索的真实照片 > 模板里兜底的本地矢量插画。
 * 云模式下没有自建后端，真照片走**高德 JS API 的 PlaceSearch 插件**——
 * 用的是页面里本来就有的 Web端 JS Key，不需要再往浏览器塞一把 Web服务 Key
 * （Web服务 Key 无法按域名限制，放前端等于公开一把能在服务端调用的凭据）。
 */
const loadAttractionPhotos = async () => {
  const plan = tripPlan.value
  if (!plan) return

  if (hasOwnBackend) {
    const promises: Promise<void>[] = []
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

    plan.days.forEach((day) => {
      day.attractions.forEach((attraction) => {
        const promise = fetch(`${apiBase}/api/poi/photo?name=${encodeURIComponent(attraction.name)}&city=${encodeURIComponent(plan.city)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.data.photo_url) {
              attractionPhotos.value[attraction.name] = data.data.photo_url
            }
          })
          .catch((err) => {
            console.error(`获取${attraction.name}图片失败:`, err)
          })

        promises.push(promise)
      })
    })

    await Promise.all(promises)
    return
  }

  const AMap = await loadAMap().catch(() => null)
  if (!AMap || typeof AMap.PlaceSearch !== 'function') return

  const names = [...new Set(plan.days.flatMap((day) => day.attractions.map((a) => a.name)))]

  const searchOne = (name: string) =>
    new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      // 高德接口偶发不回调，别让整页卡在一次搜索上
      const timer = setTimeout(finish, 8000)
      /*
       * 每个关键词配一个独立实例。
       * 一开始所有关键词共用同一个 PlaceSearch，实测回调会串台 ——
       * 同一个实例并发 search 时，先发的关键词偶尔收不到自己的回调（景点就莫名其妙只剩插画）。
       */
      const placeSearch = new AMap.PlaceSearch({
        city: plan.city,
        citylimit: Boolean(plan.city),
        pageSize: 10, // 多拿几个候选，才够在里面挑「正主」而不是它的东停车场
        extensions: 'all', // 不加这个拿不到 photos 字段
      })
      // 括号里的补充说明（「（断桥残雪·白堤·苏堤）」）会把搜索结果带偏，用正文搜更稳
      const keyword = normalizePoiName(name) || name
      placeSearch.search(keyword, (status: string, result: unknown) => {
        clearTimeout(timer)
        const jobs: Promise<void>[] = []
        if (status === 'complete') {
          const pois = ((result as { poiList?: { pois?: AmapPoi[] } })?.poiList?.pois ?? []) as AmapPoi[]
          // 按「像不像同一个地方」排序取第一名；停车场、售票处这类会被扣分挤下去。
          // 同分时挑名字更长的那个 —— 更长意味着更具体：
          // 「杭州西湖风景名胜区-断桥残雪」比「杭州西湖风景名胜区」更贴景点名里写的那处。
          const best = pois
            .map((poi) => ({ poi, score: scorePoi(poi, name), depth: normalizePoiName(poi.name ?? '').length }))
            .filter((entry) => entry.score > 0 && Array.isArray(entry.poi.photos) && entry.poi.photos.length > 0)
            .sort((a, b) => b.score - a.score || b.depth - a.depth)[0]

          // 一个都不像时退回到「第一个带照片的」——总比整块插画强
          const fallback = pois.find((p) => Array.isArray(p.photos) && p.photos.length > 0)
          const photo = best?.poi.photos?.[0]?.url ?? fallback?.photos?.[0]?.url

          // 明细优先取「正主」，没有就把带照片那个收下 —— 地图详情窗要用
          const detail = best?.poi ?? fallback
          if (detail) poiDetails[name] = detail
          if (photo) {
            const httpsUrl = photo.replace(/^http:\/\//, 'https://')
            // 缩略图先顶上，原图（2x 屏、导出 PNG 更清楚）能回来再替换
            jobs.push(loadPhotoWithUpgrade(name, httpsUrl, withOriginalSize(httpsUrl)))
          }
        }
        // 先等照片试完再收工，这样下面的「谁还缺图」是准的，不会白补搜一轮
        void Promise.all(jobs).then(finish)
      })
    })

  /*
   * 一个景点一个景点地搜，别并发。
   *
   * 踩过的坑：早先一次性把 5 个关键词全发出去，实测每轮总有一两个景点收不到回调
   * （网络面板里连对应的 showpic 请求都不会出现，最后只剩一张插画），补搜一轮照样丢。
   * 串行之后每次搜索都是干净的，5 个关键词总共也就多花 1~2 秒 —— 比丢图便宜得多。
   */
  for (const name of names) {
    await searchOne(name)
  }

  // 高德偶发返回慢或空，漏掉的那几个补搜（最多两轮，不是重试风暴）
  for (let round = 0; round < 2; round += 1) {
    const missing = names.filter((name) => !attractionPhotos.value[name])
    if (!missing.length) break
    for (const name of missing) {
      await searchOne(name)
    }
  }
}

/*
 * 获取景点图片。
 *
 * 优先级：真照片（自建后端 /api/poi/photo，或高德 POI 搜索拿到的实拍图）> 本地生成的矢量插画。
 * 照片是异步到位的，到之前先显示插画，所以不会出现"先空白再变图"的闪烁。
 *
 * variant 决定画幅比例：概览卡是近方形（'card'），每日行程是横幅（'wide'）。
 * 不按画幅生成的话，`object-fit: cover` 会把构图裁掉一半。
 */
const getAttractionImage = (name: string, category?: string, variant: ArtworkVariant = 'card'): string => {
  const photo = attractionPhotos.value[name]
  if (photo) return photo
  return buildAttractionArtwork(name, category, variant)
}

/*
 * 照片是异步把插画替换掉的，直接换 src 会「啪」地一跳。
 * 每次 load 重放一次淡入，替换看起来就是渐变而不是闪切。
 */
const handleImageLoad = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.classList.remove('is-loaded')
  void img.offsetWidth // 强制重排：同名 class 不加这一次重排是不会重放动画的
  img.classList.add('is-loaded')
}

// 图片加载失败时的处理：退回本地插画（比一块灰底 + 一行"加载失败"体面得多）
const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (img.dataset.fallbackApplied === '1') return
  img.dataset.fallbackApplied = '1'
  // 概览卡和每日行程用的是两种画幅，插画不能混用（object-fit: cover 会把构图裁掉）——
  // 这个 handler 被两处共用，所以按元素当前的长宽比反推该用哪种
  const box = img.getBoundingClientRect()
  const variant: ArtworkVariant = box.height > 0 && box.width / box.height < 1.6 ? 'card' : 'wide'
  img.src = buildAttractionArtwork(img.alt || 'trip', undefined, variant)
}



// ========== 构建导出用的纯净 HTML ==========
const buildExportHTML = (): string => {
  if (!tripPlan.value) return ''
  const tp = tripPlan.value as TripPlan & {
    hotel_recommendations?: Array<{
      name?: string
      price?: number | string
      address?: string
    }>
  }

  const mealLabels: Record<string, string> = {
    breakfast: t('result.meals.breakfast'),
    lunch: t('result.meals.lunch'),
    dinner: t('result.meals.dinner'),
    snack: t('result.meals.snack'),
  }

  // 每日行程 HTML
  let daysHTML = ''
  tp.days.forEach((day) => {
    let attractionsHTML = ''
    day.attractions.forEach((a, ai) => {
      /*
       * 导出物一律用本地插画（data URL），**不要**把高德那张真照片写进来。
       *
       * 原因是导出走 html2canvas 光栅化：store.is.autonavi.com 不返回
       * Access-Control-Allow-Origin，照片一旦被画进 canvas 就会「污染」它，
       * 紧接着 canvas.toDataURL() 抛 SecurityError，PNG / PDF 导出整体失败。
       * data URL 是同源内容，既不会污染 canvas，导出物也自带图、不依赖外链。
       */
      const imgSrc = buildAttractionArtwork(a.name, a.category, 'wide')
      const durationText = t('result.export.durationLine', { duration: a.visit_duration || '—' })
      const imgTag = `<img src="${imgSrc}" style="width:100%;height:160px;object-fit:cover;border-radius:8px;margin-bottom:8px;" alt="${a.name}" />`
      attractionsHTML += `
        <div style="flex:0 0 48%;background:#fff;border-radius:10px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,0.07);margin-bottom:14px;">
          ${imgTag}
          <h4 style="margin:0 0 6px;font-size:15px;color:#1a1a1a;">${ai + 1}. ${a.name}</h4>
          <p style="margin:2px 0;font-size:12px;color:#555;">${a.address || '—'}</p>
          <p style="margin:2px 0;font-size:12px;color:#555;">${durationText}${a.ticket_price ? `  |  ¥${a.ticket_price}` : ''}</p>
          <p style="margin:4px 0;font-size:12px;color:#666;">${a.description || ''}</p>
        </div>`
    })

    // 餐饮推荐
    let mealsHTML = ''
    if (day.meals && day.meals.length) {
      mealsHTML = `<div style="margin-top:10px;"><strong style="color:#333;">${t('result.export.mealTitle')}</strong><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;">`
      day.meals.forEach(m => {
        mealsHTML += `<div style="background:#fffbe6;padding:8px 14px;border-radius:8px;font-size:12px;color:#333;"><b>${mealLabels[m.type] || m.type}</b>: ${m.name || t('result.export.noMealRecommendation')}${m.estimated_cost ? ` (¥${m.estimated_cost})` : ''}</div>`
      })
      mealsHTML += '</div></div>'
    }

    daysHTML += `
      <div style="background:#ffffff;border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
        <h3 style="margin:0 0 14px;color:#e85520;font-size:18px;">${t('result.export.dayTitle', { day: day.day_index + 1 })} <span style="font-size:14px;color:#888;margin-left:8px;">${day.date || ''}</span></h3>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${attractionsHTML}
        </div>
        ${mealsHTML}
      </div>`
  })

  // 预算 HTML
  let budgetHTML = ''
  if (tp.budget) {
    const b = tp.budget
    budgetHTML = `
      <div style="background:#ffffff;border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
        <h3 style="margin:0 0 14px;color:#e85520;">${t('result.budget.title')}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <div style="flex:1;min-width:120px;background:#f5f7fa;padding:14px;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#888;">${t('result.budget.attraction')}</div><div style="font-size:20px;font-weight:bold;color:#333;">¥${b.total_attractions || 0}</div>
          </div>
          <div style="flex:1;min-width:120px;background:#f5f7fa;padding:14px;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#888;">${t('result.budget.hotel')}</div><div style="font-size:20px;font-weight:bold;color:#333;">¥${b.total_hotels || 0}</div>
          </div>
          <div style="flex:1;min-width:120px;background:#f5f7fa;padding:14px;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#888;">${t('result.budget.meal')}</div><div style="font-size:20px;font-weight:bold;color:#333;">¥${b.total_meals || 0}</div>
          </div>
          <div style="flex:1;min-width:120px;background:#f5f7fa;padding:14px;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#888;">${t('result.budget.transport')}</div><div style="font-size:20px;font-weight:bold;color:#333;">¥${b.total_transportation || 0}</div>
          </div>
        </div>
        <div style="background:linear-gradient(135deg,#ff8f52,#c2451a);color:#fff;padding:16px 20px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:16px;">${t('result.budget.total')}</span>
          <span style="font-size:26px;font-weight:bold;">¥${b.total || 0}</span>
        </div>
      </div>`
  }

  // 天气 HTML
  let weatherHTML = ''
  if (tp.weather_info) {
    if (Array.isArray(tp.weather_info) && tp.weather_info.length > 0) {
      let weatherCards = ''
      tp.weather_info.forEach((w: any) => {
        weatherCards += `
          <div style="flex:1;min-width:180px;background:#2b2d3c;padding:16px;border-radius:12px;margin:5px;">
            <div style="text-align:center;color:#ff6b35;font-weight:bold;margin-bottom:12px;font-size:15px;">${w.date}</div>
            <div style="display:flex;align-items:center;margin-bottom:10px;">
              <div style="line-height:1.2;">
                <div style="font-size:12px;color:#99b0c9;margin-bottom:2px;">${t('result.export.daytime')}</div>
                <div style="font-size:14px;color:#fff;font-weight:600;">${w.day_weather} ${w.day_temp}°C</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;margin-bottom:12px;">
              <div style="line-height:1.2;">
                <div style="font-size:12px;color:#99b0c9;margin-bottom:2px;">${t('result.export.nighttime')}</div>
                <div style="font-size:14px;color:#fff;font-weight:600;">${w.night_weather} ${w.night_temp}°C</div>
              </div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:10px;text-align:center;font-size:12px;color:#99b0c9;">
              ${w.wind_direction} ${w.wind_power}
            </div>
          </div>`
      })
      weatherHTML = `
        <div style="background:#ffffff;border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
          <h3 style="margin:0 0 14px;color:#e85520;">${t('result.export.weatherTitle')}</h3>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${weatherCards}
          </div>
        </div>`
    } else {
      weatherHTML = `
        <div style="background:#ffffff;border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
          <h3 style="margin:0 0 10px;color:#e85520;">${t('result.export.weatherTitle')}</h3>
          <p style="font-size:14px;color:#333;line-height:1.8;">${typeof tp.weather_info === 'string' ? tp.weather_info : JSON.stringify(tp.weather_info)}</p>
        </div>`
    }
  }

  // 酒店 HTML
  let hotelHTML = ''
  if (tp.hotel_recommendations && tp.hotel_recommendations.length) {
    let hotelItems = ''
    tp.hotel_recommendations.forEach((h) => {
      hotelItems += `<div style="background:#e3f2fd;padding:12px 16px;border-radius:10px;margin-bottom:8px;">
        <b style="color:#1565c0;">${h.name || t('result.export.hotelFallback')}</b>
        ${h.price ? `<span style="float:right;color:#e85520;font-weight:bold;">¥${h.price}${t('result.export.perNight')}</span>` : ''}
        ${h.address ? `<p style="margin:4px 0 0;font-size:12px;color:#555;">${h.address}</p>` : ''}
      </div>`
    })
    hotelHTML = `
      <div style="background:#ffffff;border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
        <h3 style="margin:0 0 14px;color:#1976d2;">${t('result.hotelTitle')}</h3>
        ${hotelItems}
      </div>`
  }

  return `
    <div style="width:800px;padding:30px;background:#f0f2f5;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#333;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="margin:0;font-size:28px;color:#333;">${t('result.export.title', { city: tp.city })}</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#888;">${t('result.export.subtitle', {
          start: tp.start_date || '',
          end: tp.end_date || '',
          days: tp.days?.length || 0,
        })}</p>
        ${tp.overall_suggestions ? `<p style="margin:8px auto 0;max-width:600px;font-size:13px;color:#666;line-height:1.6;">${tp.overall_suggestions}</p>` : ''}
      </div>
      ${budgetHTML}
      ${daysHTML}
      ${hotelHTML}
      ${weatherHTML}
      <div style="text-align:center;padding:16px;color:#aaa;font-size:12px;">${t('result.export.footer')}</div>
    </div>`
}

/*
 * 导出用的两个库按需加载：html2canvas + jsPDF 合计约 1.5MB，
 * 但只有点了「导出」才用得上 —— 静态 import 会把它们塞进首屏包。
 * 动态 import 之后它们单独成 chunk，不进首屏、也不进结果页本身。
 */
const loadExportLibs = async () => {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  return { html2canvas, jsPDF }
}

// 导出为图片
const exportAsImage = async () => {
  // 句柄必须在 try 外声明：catch 里也要能收掉它
  const loadingMsg = feedback.loading(t('result.messages.generatingImage'))
  try {
    const { html2canvas } = await loadExportLibs()
    const exportContainer = document.createElement('div')
    exportContainer.innerHTML = buildExportHTML()
    exportContainer.style.position = 'absolute'
    exportContainer.style.left = '-9999px'
    document.body.appendChild(exportContainer)

    const canvas = await html2canvas(exportContainer, {
      backgroundColor: token('--c-bg-soft', '#f1f3f7'),
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true
    })

    document.body.removeChild(exportContainer)

    const link = document.createElement('a')
    link.download = `${t('result.export.filePrefix')}_${tripPlan.value?.city}_${new Date().getTime()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()

    loadingMsg?.destroy()
    feedback.success(t('result.messages.imageSuccess'))
  } catch (error: any) {
    console.error('导出图片失败:', error)
    loadingMsg?.destroy()
    feedback.error(t('result.messages.imageFailed', { error: error.message }))
  }
}

// 导出为PDF
const exportAsPDF = async () => {
  const loadingMsg = feedback.loading(t('result.messages.generatingPdf'))
  try {
    const { html2canvas, jsPDF } = await loadExportLibs()
    const exportContainer = document.createElement('div')
    exportContainer.innerHTML = buildExportHTML()
    exportContainer.style.position = 'absolute'
    exportContainer.style.left = '-9999px'
    document.body.appendChild(exportContainer)

    const canvas = await html2canvas(exportContainer, {
      backgroundColor: '#f0f2f5',
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true
    })

    document.body.removeChild(exportContainer)

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })

    const imgWidth = 210
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= 297

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= 297
    }

    pdf.save(`${t('result.export.filePrefix')}_${tripPlan.value?.city}_${new Date().getTime()}.pdf`)

    loadingMsg?.destroy()
    feedback.success(t('result.messages.pdfSuccess'))
  } catch (error: any) {
    console.error('导出PDF失败:', error)
    loadingMsg?.destroy()
    feedback.error(t('result.messages.pdfFailed', { error: error.message }))
  }
}
// ========== 知识图谱初始化 ==========
const initKnowledgeGraph = () => {
  if (!graphData.value) return

  const container = document.getElementById('kg-chart-container')
  if (!container) return

  // 如果已存在实例则销毁
  if (kgChart) {
    kgChart.dispose()
  }

  kgChart = echarts.init(container, 'grey')
  const containerWidth = Math.max(container.clientWidth, 320)
  const containerHeight = Math.max(container.clientHeight, 320)
  const nodesWithVisual = graphData.value.nodes.map((node) => {
    const rawSize = Number(node.symbolSize) || 40
    const categoryName = graphData.value?.categories?.[Number(node.category)]?.name || ''
    const visual = getKgNodeVisualPreset(rawSize, categoryName)
    return {
      ...node,
      __visual: visual,
    }
  })
  const boundaryPositionMap = buildKgBoundaryPositionMap(
    nodesWithVisual,
    graphData.value.edges,
    graphData.value.categories,
    containerWidth,
    containerHeight
  )
  const kgForceGravity = containerWidth < 500 ? 0.2 : 0.06
  const kgForceRepulsion = containerWidth < 500 ? 360 : 520
  const kgForceEdgeLength: [number, number] = containerWidth < 500 ? [60, 140] : [95, 220]

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: brandRgba(0.35),
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: token('--c-ink-900', '#16181d'), fontSize: 13 },
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          const catName = graphData.value?.categories[params.data.category]?.name || ''
          const cat = getCategoryLabel(catName)
          let tip = `<b style="color:${brandStrongColor()};font-size:15px">${params.data.name}</b><br/>`
          tip += `<span style="color:#64748b">${t('result.graph.type')}:</span>${cat}<br/>`
          if (params.data.value) {
            tip += `<span style="color:#64748b">${t('result.graph.detail')}:</span>${params.data.value}`
          }
          return tip
        }
        if (params.dataType === 'edge') {
          return `<span style="color:${brandStrongColor()}">${params.data.label || t('result.graph.relation')}</span>`
        }
        return ''
      }
    },
    legend: {
      show: false  // 使用自定义legend
    },
    animationDuration: 1500,
    animationEasingUpdate: 'quinticInOut',
    series: [
      {
        type: 'graph',
        layout: 'force',
        data: nodesWithVisual.map(node => {
          const visual = node.__visual as KgNodeVisualPreset
          const nodeSymbol = getKgNodeSymbol(visual)
          const point = boundaryPositionMap.get(String(node.id))
          const labelFontSize = visual.size >= 140 ? 10 : visual.size >= 110 ? 9 : 8
          const labelMaxChars = visual.size >= 140 ? 7 : visual.size >= 110 ? 6 : 5
          const labelWidth = Math.round(visual.size * 0.52)

          return {
            ...node,
            x: point?.x ?? containerWidth / 2,
            y: point?.y ?? containerHeight / 2,
            fixed: Boolean(point && point.x === containerWidth / 2 && point.y === containerHeight / 2),
            symbol: nodeSymbol,
            symbolSize: visual.size,
            itemStyle: {
              ...(node.itemStyle || {}),
              borderColor: 'rgba(0, 0, 0, 0)',
              borderWidth: 0,
              shadowBlur: 0,
              shadowColor: 'rgba(0, 0, 0, 0)',
            },
            label: {
              show: visual.size >= 60,
              position: 'inside' as const,
              distance: 0,
              fontSize: labelFontSize,
              width: labelWidth,
              overflow: 'truncate',
              ellipsis: '…',
              align: 'center' as const,
              verticalAlign: 'middle' as const,
              lineHeight: labelFontSize + 2,
              color: '#fff',
              fontWeight: 'bold' as const,
              formatter: (params: any) => {
                const name = String(params.data.name || '')
                return name.length > labelMaxChars ? name.slice(0, labelMaxChars) + '…' : name
              },
            },
          }
        }),
        links: graphData.value.edges.map(edge => ({
          ...edge,
          lineStyle: {
            color: inkRgba(0.16),
            width: 1.5,
            curveness: 0.1,
          },
          label: {
            show: true,
            formatter: edge.label || '',
            fontSize: 10,
            color: inkRgba(0.5),
          },
        })),
        categories: graphData.value.categories,
        roam: true,
        draggable: true,
        force: {
          initLayout: 'none',
          repulsion: kgForceRepulsion,
          gravity: kgForceGravity,
          edgeLength: kgForceEdgeLength,
          friction: 0.2,
          layoutAnimation: true,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 4, color: brandColor() },
          itemStyle: { borderColor: brandColor(), borderWidth: 3 },
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 8],
      },
    ],
  }

  kgChart.setOption(option)

  // 响应窗口变化：重算边界偏置坐标，防止节点越界
  if (kgResizeHandler) {
    window.removeEventListener('resize', kgResizeHandler)
  }
  kgResizeHandler = () => {
    if (!graphData.value) return
    initKnowledgeGraph()
  }
  window.addEventListener('resize', kgResizeHandler)
}

const escapeHtml = (value: unknown): string => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const buildMarkerContent = (dayNo: number, stopNo: number): string => {
  return `
    <div class="tripstar-map-marker">
      <span class="tripstar-map-marker__core" aria-hidden="true">
        <svg fill="#ffffff" width="30px" height="30px" viewBox="0 0 256 256" id="Flat" xmlns="http://www.w3.org/2000/svg">
          <path d="M231.4248,109.2041,169.36426,86.63574,146.7959,24.57422a19.99984,19.99984,0,0,0-37.5918.001L86.63574,86.63574,24.57422,109.2041a19.99984,19.99984,0,0,0,.001,37.5918l62.06054,22.56836,22.56836,62.06152a19.99984,19.99984,0,0,0,37.5918-.001l22.56836-62.06054,62.06152-22.56836a19.99984,19.99984,0,0,0-.001-37.5918Zm-72.01562,38.24219a19.95591,19.95591,0,0,0-11.96289,11.96289l.001-.001L128,212.88672l-19.44629-53.47754A19.95279,19.95279,0,0,0,96.5918,147.44727L43.11328,128l53.47754-19.44629A19.95279,19.95279,0,0,0,108.55273,96.5918L128,43.11328l19.44629,53.47754a19.95279,19.95279,0,0,0,11.96191,11.96191L212.88672,128Z"/>
        </svg>
      </span>
      <span class="tripstar-map-marker__index" aria-hidden="true">${dayNo}-${stopNo}</span>
    </div>
  `
}

/** 悬停时只给最少信息：鼠标扫过一串标记时，弹大卡片反而挡住地图 */
const buildTooltipContent = (attraction: any): string => {
  const name = escapeHtml(attraction.name || t('common.noData'))
  const dayAttractionText = escapeHtml(
    t('result.mapInfo.dayAttraction', { day: attraction.dayIndex + 1, index: attraction.attrIndex + 1 })
  )
  const visitDuration = Number.isFinite(attraction.visit_duration) ? attraction.visit_duration : '—'
  const minuteUnit = escapeHtml(t('result.minuteUnit'))

  return `
    <div class="tripstar-map-tooltip tripstar-map-tooltip--plain">
      <p class="tripstar-map-tooltip__line tripstar-map-tooltip__line--title">${name}</p>
      <p class="tripstar-map-tooltip__line">${dayAttractionText}</p>
      <p class="tripstar-map-tooltip__line">${visitDuration}${minuteUnit}</p>
    </div>
  `
}

/**
 * 详情卡顶部那行「第几天 · 第几站」。
 * 不是「标签 : 值」结构，单独一条 —— 早先是塞进标签位、值留空，
 * 渲染出来是个空值行，语义上是假的。
 */
const detailMeta = (text: string): string =>
  `<p class="tripstar-map-detail__meta">${escapeHtml(text)}</p>`

/**
 * 详情窗里的一行「标签 : 值」。
 *
 * 两个 span 之间**必须有换行**，这不是排版，是给读屏和复制粘贴留的分隔：
 * flex 容器里只含空白的文本节点不会生成匿名 flex 项（等于 display:none），
 * 所以视觉上不会多一个空格，但 textContent 拿得到 —— 否则读出来是
 * 「Address杭州市西湖区」这种黏在一起的串。
 */
const detailRow = (label: string, value: string): string =>
  `<div class="tripstar-map-detail__row"><span class="tripstar-map-detail__label">${escapeHtml(label)}</span>
        <span class="tripstar-map-detail__value">${escapeHtml(value)}</span></div>`

/**
 * 点击标记时的详情卡。
 *
 * 内容在点击那一刻才拼（不预先生成），因为 POI 明细是异步配图时才回来的 ——
 * 标记创建的时刻它多半还没到，预生成会永远是空的。
 */
const buildAttractionDetailContent = (attraction: any): string => {
  const name = escapeHtml(attraction.name || t('common.noData'))
  const poi = poiDetails[attraction.name]

  const address = attraction.address || poi?.address || ''
  const rating = poi?.biz_ext?.rating
  const cost = poi?.biz_ext?.cost
  const tel = poi?.tel
  const openTime = poi?.open_time

  const rows: string[] = []
  const meta = detailMeta(
    t('result.mapInfo.dayAttraction', { day: attraction.dayIndex + 1, index: attraction.attrIndex + 1 })
  )
  if (address) rows.push(detailRow(t('result.fieldAddress'), String(address)))
  if (openTime) rows.push(detailRow(t('result.mapInfo.openHours'), String(openTime)))
  if (rating) rows.push(detailRow(t('result.mapInfo.ratingLabel'), String(rating)))
  if (cost) rows.push(detailRow(t('result.mapInfo.costLabel'), `¥${cost}`))

  const phoneRow = tel ? detailRow(t('result.mapInfo.tel'), String(tel)) : ''

  const rawPhoto = poi?.photos?.[0]?.url
  const photo = rawPhoto ? rawPhoto.replace(/^http:\/\//, 'https://') : ''

  const lng = Number(attraction.location?.longitude)
  const lat = Number(attraction.location?.latitude)
  const openInAmap =
    Number.isFinite(lng) && Number.isFinite(lat)
      ? `<a class="tripstar-map-detail__link" href="https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(attraction.name || '')}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('result.mapInfo.openInAmap'))}</a>`
      : ''

  return `
    <div class="tripstar-map-detail">
      ${photo ? `<div class="tripstar-map-detail__cover"><img src="${photo}" alt="${name}" loading="lazy" /></div>` : ''}
      <div class="tripstar-map-detail__body">
        <p class="tripstar-map-detail__title">${name}</p>
        ${meta}
        ${rows.join('')}
        ${phoneRow}
        ${openInAmap}
      </div>
    </div>
  `
}

type RouteMode = 'driving' | 'walking' | 'transit' | 'riding' | 'straight'

/** 底图是浅色的，描边统一用浅色 halo，深浅两种底色上都分得开 */
const ROUTE_OUTLINE_LIGHT = 'rgba(255, 255, 255, 0.9)'
type RoutePoint = [number, number]

const ROUTE_STYLE_PRESETS: Record<
  RouteMode,
  {
    strokeColor: string
    strokeWeight: number
    strokeOpacity: number
    strokeStyle: 'solid' | 'dashed'
    strokeDasharray?: number[]
    lineJoin?: 'round' | 'miter' | 'bevel'
    lineCap?: 'butt' | 'round' | 'square'
    outlineColor?: string
    borderWeight?: number
  }
> = {
  /*
   * 四档交通方式各自一个语义色，全部来自设计 token（见 utils/designToken）：
   * 驾车=品牌橙、步行=成功绿、公交=信息蓝、骑行=警示琥珀。
   * 线型也参与区分：实线=机动车、虚线=人力/换乘，色弱用户单看线型也能分。
   */
  driving: {
    strokeColor: brandColor(),
    strokeWeight: 3.5,
    strokeOpacity: 0.92,
    strokeStyle: 'solid',
    lineJoin: 'round',
    lineCap: 'round',
    outlineColor: ROUTE_OUTLINE_LIGHT,
    borderWeight: 1,
  },
  transit: {
    strokeColor: infoColor(),
    strokeWeight: 3.5,
    strokeOpacity: 0.92,
    strokeStyle: 'solid',
    lineJoin: 'round',
    lineCap: 'round',
    outlineColor: ROUTE_OUTLINE_LIGHT,
    borderWeight: 1,
  },
  riding: {
    strokeColor: warningColor(),
    strokeWeight: 3,
    strokeOpacity: 0.92,
    strokeStyle: 'dashed',
    strokeDasharray: [14, 6],
    lineJoin: 'round',
    lineCap: 'round',
    outlineColor: ROUTE_OUTLINE_LIGHT,
    borderWeight: 0.8,
  },
  walking: {
    strokeColor: successColor(),
    strokeWeight: 3,
    strokeOpacity: 0.9,
    strokeStyle: 'dashed',
    strokeDasharray: [12, 8],
    lineJoin: 'round',
    lineCap: 'round',
    outlineColor: ROUTE_OUTLINE_LIGHT,
    borderWeight: 0.8,
  },
  straight: {
    /* 直线连线兜底：地图是浅色底图，白色虚线看不见，改用品牌深色 */
    strokeColor: brandStrongColor(),
    strokeWeight: 2,
    strokeOpacity: 0.9,
    strokeStyle: 'solid',
    strokeDasharray: [10, 10],
    lineJoin: 'round',
    lineCap: 'round',
    outlineColor: ROUTE_OUTLINE_LIGHT,
    borderWeight: 0.8,
  },
}

/**
 * 从行程里的「交通方式」文本推断用哪种路线规划。
 * 顺序有讲究：先判步行与公交 —— 「地铁+公交+步行」这类文本里几个词都在，
 * 但主干是公共交通，不能因为出现了「步行」就降级成 Walking。
 */
const detectRouteMode = (transportation: string): RouteMode => {
  const normalized = (transportation || '').toLowerCase()
  if (/(地铁|公交|巴士|轻轨|有轨|subway|metro|bus|transit|public)/i.test(normalized)) return 'transit'
  if (/(骑行|单车|自行车|共享单车|bike|bicycle|cycling)/i.test(normalized)) return 'riding'
  if (/(步行|徒步|散步|walk|walking)/i.test(normalized)) return 'walking'
  if (/(驾车|开车|自驾|打车|出租车|网约车|car|drive|driving|taxi)/i.test(normalized)) return 'driving'
  return 'driving'
}

const toRoutePoint = (raw: any): RoutePoint | null => {
  if (!raw) return null

  if (Array.isArray(raw) && raw.length >= 2) {
    const lng = Number(raw[0])
    const lat = Number(raw[1])
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }

  if (typeof raw.getLng === 'function' && typeof raw.getLat === 'function') {
    const lng = Number(raw.getLng())
    const lat = Number(raw.getLat())
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }

  if ('lng' in raw && 'lat' in raw) {
    const lng = Number(raw.lng)
    const lat = Number(raw.lat)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }

  if ('longitude' in raw && 'latitude' in raw) {
    const lng = Number(raw.longitude)
    const lat = Number(raw.latitude)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }

  return null
}

const parsePolylineString = (polyline: string): RoutePoint[] => {
  if (!polyline) return []

  return polyline
    .split(';')
    .map((pair) => pair.split(','))
    .map((parts) => {
      const lng = Number(parts[0])
      const lat = Number(parts[1])
      return Number.isFinite(lng) && Number.isFinite(lat) ? ([lng, lat] as RoutePoint) : null
    })
    .filter((point): point is RoutePoint => Boolean(point))
}

const dedupeRoutePath = (points: RoutePoint[]): RoutePoint[] => {
  if (points.length <= 1) return points
  return points.filter((point, index, array) => {
    if (index === 0) return true
    const prev = array[index - 1]
    return point[0] !== prev[0] || point[1] !== prev[1]
  })
}

/** 高德不同服务把主路线放在不同位置，统一在这里取 */
const pickPrimaryRoute = (result: any): any =>
  result?.routes?.[0] || result?.route?.paths?.[0] || result?.route?.routes?.[0] || null

const extractRoutePath = (result: any): RoutePoint[] => {
  const route = pickPrimaryRoute(result)

  if (!route) return []

  const steps = route.steps || []
  const points: RoutePoint[] = []

  steps.forEach((step: any) => {
    if (Array.isArray(step?.path)) {
      step.path.forEach((node: any) => {
        const point = toRoutePoint(node)
        if (point) points.push(point)
      })
      return
    }

    if (typeof step?.polyline === 'string') {
      points.push(...parsePolylineString(step.polyline))
    }
  })

  if (points.length > 1) return dedupeRoutePath(points)

  if (typeof route?.polyline === 'string') {
    const fromRoute = dedupeRoutePath(parsePolylineString(route.polyline))
    if (fromRoute.length > 1) return fromRoute
  }

  return []
}

/** 不是'直线兜底'的，就是能真的去问高德要路线的模式 */
type PlannedRouteMode = Exclude<RouteMode, 'straight'>

type RouteMetrics = {
  path: RoutePoint[]
  /** 米 */
  distance: number
  /** 秒 */
  duration: number
}

/** 一天里的一段路线汇总，用于地图卡下方的说明行 */
type DayRouteSummary = {
  dayIndex: number
  mode: RouteMode
  segments: number
  fallbackSegments: number
  /** 米 */
  distance: number
  /** 秒 */
  duration: number
}

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const readRouteMetrics = (route: any): { distance: number; duration: number } => ({
  distance: toFiniteNumber(route?.distance),
  duration: toFiniteNumber(route?.time),
})

/**
 * 公交/地铁路线的形状藏在 segments 里：一段换乘可能「先走路再坐车再走路」，
 * 每段自己的 steps 才带 polyline，必须按顺序全部串起来，否则轨迹会断成几截。
 */
const extractTransferPath = (result: any): RoutePoint[] => {
  const plan = result?.plans?.[0]
  if (!plan) return []

  const points: RoutePoint[] = []
  const segments = Array.isArray(plan.segments) ? plan.segments : []

  segments.forEach((segment: any) => {
    const groups = [segment?.walking, segment?.transit, segment?.railway, segment?.taxi]
    groups.forEach((group: any) => {
      const steps = Array.isArray(group?.steps) ? group.steps : []
      steps.forEach((step: any) => {
        if (Array.isArray(step?.path)) {
          step.path.forEach((node: any) => {
            const point = toRoutePoint(node)
            if (point) points.push(point)
          })
          return
        }
        if (typeof step?.polyline === 'string') {
          points.push(...parsePolylineString(step.polyline))
        }
      })
    })
  })

  return points.length > 1 ? dedupeRoutePath(points) : []
}

/**
 * 按交通方式建规划服务实例。
 * 公交规划必须带城市（city/cityd），拿不到城市就直接放弃 —— 否则会返回跨城乱结果。
 */
const createRouteService = (AMap: any, mode: PlannedRouteMode): any | null => {
  const Ctor =
    mode === 'walking'
      ? AMap.Walking
      : mode === 'riding'
        ? AMap.Riding
        : mode === 'transit'
          ? AMap.Transfer
          : AMap.Driving
  if (typeof Ctor !== 'function') return null

  if (mode === 'driving') {
    return new Ctor({ policy: AMap.DrivingPolicy?.LEAST_TIME ?? 0 })
  }

  if (mode === 'transit') {
    const city = tripPlan.value?.city || ''
    if (!city) return null
    return new Ctor({
      city,
      cityd: city,
      // 少换乘优先：行程里拖着行李换三次车，比省 5 分钟更要命
      policy: AMap.TransferPolicy?.LEAST_TRANSFER ?? 0,
      extensions: 'all',
    })
  }

  return new Ctor({})
}

/**
 * 调一次路线规划，拿回「真实道路形状 + 真实里程 + 真实耗时」。
 * 拿不到就 resolve(null)，由调用方降级成直线并如实标记。
 */
const searchRoute = (
  AMap: any,
  mode: PlannedRouteMode,
  start: RoutePoint,
  end: RoutePoint
): Promise<RouteMetrics | null> =>
  new Promise((resolve) => {
    const service = createRouteService(AMap, mode)
    if (!service) {
      resolve(null)
      return
    }

    let settled = false
    const finish = (value: RouteMetrics | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    // 高德偶发不回调，别让整张地图卡在一次规划上
    const timer = setTimeout(() => finish(null), 8000)

    service.search(start, end, (status: string, result: any) => {
      if (status !== 'complete') {
        finish(null)
        return
      }

      if (mode === 'transit') {
        const plan = result?.plans?.[0]
        const path = extractTransferPath(result)
        finish(path.length > 1 ? { path, ...readRouteMetrics(plan) } : null)
        return
      }

      const path = extractRoutePath(result)
      finish(path.length > 1 ? { path, ...readRouteMetrics(pickPrimaryRoute(result)) } : null)
    })
  })

/*
 * 高德 JS API 的加载器已抽到 @/services/amap：
 * 地图、景点真照片、城市联想三处都要用它，而 loader 对同一个 key 重复 load
 * 会重复注入脚本、插件列表还会互相覆盖 —— 必须只有一个入口。
 */

// 初始化地图
const initMap = async (notify = false) => {
  if (!hasAmapKey()) {
    // 没配 Key 时不弹错误提示打断浏览，只在卡片里留个说明
    mapStatus.value = 'unavailable'
    if (notify) feedback.warning(t('result.messages.mapUnavailable'))
    return
  }

  mapStatus.value = 'loading'
  try {
    const AMap = await loadAMap()

    // 创建地图实例
    /*
     * viewMode 用 2D：
     * 这是一张俯视的路线概览图，不需要透视；更要紧的是 3D 模式开着倾斜/旋转手势，
     * 用户（尤其触屏双指）把地图一转歪，下面详情卡的贴边钳位就不成立了 ——
     * 那个是按屏幕像素算的，只在正投影下等价于地理位移。2D 把这类情况从结构上排除。
     */
    map = new AMap.Map('amap-container', {
      zoom: 12,
      center: [116.397128, 39.916527], // 默认中心点(北京)
      viewMode: '2D',
      mapStyle: AMAP_MAP_STYLE,
      features: AMAP_MAP_FEATURES,
    })

    /*
     * 暴露地图实例，仅供调试与自动化核验读取。
     * 高德 2.0 的折线是画在 canvas 上的，DOM 里查不到，
     * 想断言「路线有没有画全 / 用的什么颜色」只能从实例调 getPath()。
     * 只挂一个引用、不参与任何业务逻辑。
     */
    ;(window as unknown as { __wbAmapDebug?: unknown }).__wbAmapDebug = map

    // 添加景点标记
    await addAttractionMarkers(AMap)

    mapStatus.value = 'ready'
    if (notify) feedback.success(t('result.messages.mapLoaded'))
  } catch (error) {
    console.error('地图加载失败:', error)
    mapStatus.value = 'error'
    if (notify) feedback.error(t('result.messages.mapLoadFailed'))
  }
}

/*
 * 详情卡贴边时把镜头挪回来。
 *
 * 为什么不靠 InfoWindow 的 autoMove：它只管「锚点还在不在视野里」，不管
 * 「整张卡放不放得下」。详情卡实测高约 300px，标记落在容器顶部附近时，
 * 打开的一瞬间上半截就顶出去被裁掉（顶部溢出 221px，autoMove 只补回来 88px）。
 * 所以关掉 autoMove、自己量自己挪。
 *
 * 量到没量到要用返回值告诉调用方 —— 刚插进 DOM 时宽高还是 0，这一帧不算数。
 * 顺带记一下方向：panBy(0, +y) 是把锚点（连同窗口）往下推，探针实测确认过，
 * 且实测位移与请求值严格 1:1（60/120/240/480 全部精确命中）。
 */
const DETAIL_PAN_MS = 280

const keepDetailWindowInView = (mapInstance: any, container: HTMLElement | null): boolean => {
  if (!mapInstance || !container) return true

  const card = container.querySelector<HTMLElement>('.tripstar-map-detail')
  if (!card) return false

  const rect = card.getBoundingClientRect()
  // 宽高全 0：高德还没把窗口摆上去，这一帧量了也不算数
  if (!rect.width && !rect.height) return false

  const box = container.getBoundingClientRect()
  const MARGIN = 10

  // 卡片比容器还高（小屏 / 地图被压扁）时先保住顶部，
  // 否则上下都溢出、两个分支互相顶，永远钳不到位
  if (rect.height > box.height - MARGIN * 2) {
    const dy = MARGIN - (rect.top - box.top)
    if (dy) mapInstance.panBy(0, dy, DETAIL_PAN_MS)
    return true
  }

  const overTop = MARGIN - (rect.top - box.top)
  const overBottom = MARGIN - (box.bottom - rect.bottom)
  const overLeft = MARGIN - (rect.left - box.left)
  const overRight = MARGIN - (box.right - rect.right)

  const dy = overTop > 0 ? overTop : overBottom > 0 ? -overBottom : 0
  const dx = overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0

  // 必须给时长：panBy 默认过渡长到 2.3 秒（实测），点一下标记慢慢滑过去太钝了
  if (dx || dy) mapInstance.panBy(dx, dy, DETAIL_PAN_MS)
  return true
}

/**
 * open() 之后窗口要过一两帧才被高德摆上去（刚插进 DOM 时宽高还是 0），
 * 只量一次会落空 —— 实测就是这样，卡片照样被裁。
 * 所以逐帧重试；量到就收工，绝不重复量：
 * panBy 是带过渡的，动画没跑完就再量一次，量到的是中间态，会再补一段直接过头。
 */
const repositionDetailWindow = (mapInstance: any) => {
  const container = document.getElementById('amap-container')
  if (!container) return

  let tries = 0
  const attempt = () => {
    if (tries++ > 10) return
    if (!keepDetailWindowInView(mapInstance, container)) requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

// 添加景点标记
const addAttractionMarkers = async (AMap: any) => {
  if (!tripPlan.value) return

  const markers: any[] = []
  const allAttractions: any[] = []

  // 收集所有景点（保留全局编号）
  let globalIndex = 0
  tripPlan.value.days.forEach((day, dayIndex) => {
    day.attractions.forEach((attraction, attrIndex) => {
      globalIndex++
      if (attraction.location && attraction.location.longitude && attraction.location.latitude) {
        allAttractions.push({
          ...attraction,
          dayIndex,
          attrIndex,
          globalIndex   // 全局编号（从1开始）
        })
      }
    })
  })

  // 创建标记
  allAttractions.forEach((attraction, index) => {
    const marker = new AMap.Marker({
      position: [attraction.location.longitude, attraction.location.latitude],
      content: buildMarkerContent(attraction.dayIndex + 1, attraction.attrIndex + 1),
      anchor: 'center',
      offset: new AMap.Pixel(0, 0),
      zIndex: 120 + index,
    })

    /*
     * 两个信息窗，各管一件事：
     * - 悬停：轻量提示（名字/第几天第几个/建议停留），移出即关，不挡地图；
     * - 点击：详情卡（照片 + POI 明细 + 在高德打开），一直留到点地图空白处。
     *
     * 早先只有前者且点击复用同一个窗，于是鼠标一移开就关 —— 详情里的链接根本点不到。
     * 详情内容在点击时才 setContent：POI 明细要等异步配图回来，建标记时还没到。
     */
    const tooltipWindow = new AMap.InfoWindow({
      isCustom: true,
      content: buildTooltipContent(attraction),
      offset: new AMap.Pixel(0, -18),
      closeWhenClickMap: true,
    })

    const detailWindow = new AMap.InfoWindow({
      isCustom: true,
      content: '',
      offset: new AMap.Pixel(0, -22),
      closeWhenClickMap: true,
      // 位置自己算（见 keepDetailWindowInView）：autoMove 算得太早，赶不上实拍图回来
      autoMove: false,
    })

    marker.on('mouseover', () => {
      tooltipWindow.open(map, marker.getPosition())
    })
    marker.on('mouseout', () => {
      tooltipWindow.close()
    })
    marker.on('click', () => {
      tooltipWindow.close()
      detailWindow.setContent(buildAttractionDetailContent(attraction))
      detailWindow.open(map, marker.getPosition())
      repositionDetailWindow(map)
    })

    markers.push(marker)
  })

  // 添加标记到地图
  map.add(markers)

  // 绘制路线（优先真实道路路线，失败时回退直线）
  const { polylines: routePolylines, fullPaths } = await drawRoutes(AMap, allAttractions)

  /*
   * 自动调整视野以包含所有标记与路线。
   * 必须给 avoid 边距：不给的话最靠边的那几个标记会贴着容器边缘被裁掉半个，
   * 而且标记本身有 30px 高，压在边上也点不到。
   */
  if (allAttractions.length > 0) {
    const overlaysForFit = routePolylines.length > 0 ? [...markers, ...routePolylines] : markers
    map.setFitView(overlaysForFit, false, [72, 72, 72, 72])
  }

  /*
   * 视野定好之后再放画入动画。
   * 顺序不能反：边画边 setFitView，镜头会跟着一条还在生长的线来回晃。
   */
  playRouteDrawIn(routePolylines, fullPaths)
}

// 绘制路线：根据交通方式选择 driving / walking；失败时降级为直线
/**
 * 路线画入动画：把每段折线从起点逐点"画"到终点。
 * 不引额外插件（高德的 MoveAnimation 是另一个 plugin，为一个过渡效果不值当），
 * 直接按进度推进 polyline 的 path 就行。用户开了「减少动态效果」就一次性铺满。
 */
const playRouteDrawIn = (polylines: any[], fullPaths: RoutePoint[][]) => {
  if (!polylines.length) return

  const applyFullPath = () => {
    polylines.forEach((polyline, index) => {
      if (fullPaths[index]?.length) polyline.setPath(fullPaths[index])
    })
  }

  // 地图已经销毁 / 用户要求减少动态效果 —— 别留下半截路线
  if (!map) {
    applyFullPath()
    return
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    applyFullPath()
    return
  }

  const jobs = polylines
    .map((polyline, index) => ({ polyline, path: fullPaths[index] }))
    .filter((job) => Array.isArray(job.path) && job.path.length > 2)
  if (!jobs.length) {
    applyFullPath()
    return
  }

  const DRAW_MS = 420
  const STAGGER_MS = 90
  const startedAt = performance.now()
  const totalMs = DRAW_MS + STAGGER_MS * (jobs.length - 1)

  const step = (now: number) => {
    // 动画途中地图被销毁（切页面/重新生成行程）就地收手
    if (!map) return

    const elapsed = now - startedAt
    jobs.forEach((job, index) => {
      const local = Math.min(Math.max(elapsed - index * STAGGER_MS, 0), DRAW_MS)
      const ratio = local / DRAW_MS
      const count = Math.max(1, Math.ceil(job.path.length * ratio))
      job.polyline.setPath(job.path.slice(0, count))
    })

    if (elapsed < totalMs) {
      requestAnimationFrame(step)
    } else {
      applyFullPath()
    }
  }

  requestAnimationFrame(step)
}

/**
 * 绘制路线：按交通方式问高德要真实道路形状，并把真实里程/耗时汇总起来。
 * 规划失败的那一段降级为直线，并在汇总里如实计入 fallbackSegments。
 */
const drawRoutes = async (
  AMap: any,
  attractions: any[]
): Promise<{ polylines: any[]; fullPaths: RoutePoint[][] }> => {
  if (attractions.length < 2 || !tripPlan.value) return { polylines: [], fullPaths: [] }

  // 按天分组绘制路线
  const dayGroups: Record<number, any[]> = {}
  attractions.forEach((attr) => {
    if (!dayGroups[attr.dayIndex]) {
      dayGroups[attr.dayIndex] = []
    }
    dayGroups[attr.dayIndex].push(attr)
  })

  const polylines: any[] = []
  /** 与 polylines 一一对应的完整路径：折线先只挂起点，画入动画按这个逐点铺开 */
  const fullPaths: RoutePoint[][] = []
  const summaries: DayRouteSummary[] = []

  // 为每天的景点逐段绘制路线
  for (const dayAttractions of Object.values(dayGroups)) {
    if (dayAttractions.length < 2) continue

    dayAttractions.sort((a: any, b: any) => a.attrIndex - b.attrIndex)
    const dayIndex = dayAttractions[0].dayIndex
    const transportation = tripPlan.value.days?.[dayIndex]?.transportation || ''
    const preferredMode = detectRouteMode(transportation)

    // 优先用高德返回的「每天实际交通方式」，它比模型写的自由文本更准
    const summary: DayRouteSummary = {
      dayIndex,
      mode: preferredMode,
      segments: 0,
      fallbackSegments: 0,
      distance: 0,
      duration: 0,
    }

    for (let i = 0; i < dayAttractions.length - 1; i++) {
      const start = dayAttractions[i]
      const end = dayAttractions[i + 1]
      const startPoint: RoutePoint = [start.location.longitude, start.location.latitude]
      const endPoint: RoutePoint = [end.location.longitude, end.location.latitude]

      const planned =
        preferredMode === 'straight' ? null : await searchRoute(AMap, preferredMode, startPoint, endPoint)

      const usePlannedRoute = Boolean(planned && planned.path.length > 1)
      const routeModeForStyle: RouteMode = usePlannedRoute ? preferredMode : 'straight'
      const path = usePlannedRoute && planned ? planned.path : [startPoint, endPoint]
      const style = ROUTE_STYLE_PRESETS[routeModeForStyle]

      const polyline = new AMap.Polyline({
        /*
         * 建的时候给完整路径，而不是只给起点 ——
         * 因为紧接着的 setFitView 要用叠加物的边界算视野，只给起点的话
         * 道路绕出去的那一段就不在视野里，最南/最北的标记会被裁掉。
         * （不会因此闪一下：画入动画的首帧 rAF 在浏览器绘制之前就会把路径收回起点。）
         */
        path,
        ...style,
        showDir: true,
        zIndex: 90,
      })

      polylines.push(polyline)
      fullPaths.push(path)

      summary.segments += 1
      if (usePlannedRoute && planned) {
        summary.distance += planned.distance
        summary.duration += planned.duration
      } else {
        summary.fallbackSegments += 1
      }
    }

    if (summary.segments > 0) summaries.push(summary)
  }

  if (polylines.length > 0) {
    map.add(polylines)
  }

  dayRouteSummaries.value = summaries

  return { polylines, fullPaths }
}
</script>

<style scoped>
@import 'swiper/css';

/* ===== Landing 同款视觉基底 - 结果页 ===== */

.result-container {
  min-height: 100vh;
  background: var(--c-bg-app);
  color: var(--c-ink-900);
  position: relative;
  isolation: isolate;
  /* 用 clip 而不是 hidden：hidden 会让祖先变成滚动容器，粘性导航会失效 */
  overflow-x: clip;
}

.result-main {
  position: relative;
  padding: calc(var(--nav-h) + 22px) 0 var(--sp-9);
}

/**
 * 内容容器：只负责最大宽度与左右留白。
 * 原来这里是一张包住全页的大白卡（白底 + 边框 + 大阴影），
 * 于是每个区块的卡片都成了「卡中卡」，层级糊成一片。
 */
.content-wrapper {
  width: 100%;
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 0 var(--layout-gutter);
}

/* ============================================================
   顶部区块导航：吸顶的胶囊标签 + 右侧动作
   ============================================================ */
.section-nav {
  position: sticky;
  top: var(--nav-h);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
  padding: 10px 0;
  background: rgba(247, 248, 250, 0.9);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
}

.section-nav__list {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.section-nav__list::-webkit-scrollbar {
  display: none;
}

.section-nav__item {
  flex: 0 0 auto;
  padding: 7px 14px;
  border-radius: var(--r-full);
  color: var(--c-ink-500);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.section-nav__item:hover {
  background: var(--c-ink-50);
  color: var(--c-ink-800);
}

.section-nav__item.is-active {
  background: var(--c-brand-50);
  color: var(--c-brand-700);
}

.section-nav__actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 0 0 auto;
}

.btn-caret {
  width: 12px;
  height: 12px;
  color: var(--c-ink-400);
}

.empty-state-panel {
  max-width: 900px;
  margin: 0 auto;
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  backdrop-filter: blur(18px);
  box-shadow: var(--sh-lg);
  padding: var(--sp-9) var(--sp-5);
  text-align: center;
}

.empty-desc {
  color: var(--c-ink-600);
}

/* 天气看板样式 */
.weather-section-card {
  /* margin-top: 14px; */
  overflow: hidden;
}

.weather-dashboard {
  display: flex;
  height: 350px;
  /* border-radius: 24px; */
  overflow: hidden;
  /* border: 1px solid rgba(255, 255, 255, 0.14); */
  background: none;
}

.weather-side {
  position: relative;
  flex: 0 0 300px;
  overflow: hidden;
  box-shadow: var(--sh-md);
  transition: transform var(--dur-base) var(--ease-out);
}

.weather-side:hover {
  transform: scale(1.01);
}

.weather-gradient {
  position: absolute;
  inset: 0;
  /* 原本挂的是一张外链照片；换成随天气变化的本地渐变，去掉外部依赖 */
  background-image: var(--weather-gradient, linear-gradient(140deg, #78818f 0%, #454d5b 100%));
  opacity: 1;
}

/*
 * 卡内文字与图标都是白色，而"晴/雪"两档渐变偏亮（白字对比度不足）。
 * 统一压一层自上而下的深色蒙层，既保证可读性又保留天气色相。
 */
.weather-gradient::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(8, 18, 32, 0.18) 0%, rgba(8, 18, 32, 0.52) 100%);
}

.date-container {
  position: absolute;
  top: 38px;
  left: 38px;
  right: 28px;
  z-index: 2;
}

.date-dayname {
  margin: 0;
  font-size: 26px;
  line-height: 1.12;
  font-weight: var(--fw-display);
  color: rgba(255, 255, 255, 0.96);
}

.date-day {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  letter-spacing: 0.03em;
  color: rgba(240, 247, 255, 0.84);
}

.location {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  font-size: 16px;
  font-weight: var(--fw-medium);
  color: rgba(242, 248, 255, 0.9);
}

.location-icon {
  margin-right: 6px;
}

.weather-container {
  position: absolute;
  left: 28px;
  right: 28px;
  bottom: 28px;
  z-index: 2;
}

.weather-hero-icon {
  display: inline-block;
  /* 图标本体是若干 CSS 色块（.cloud/.sun/.rain），这里只是兜底前景色 */
  color: var(--c-ink-900);
  font-size: 0.78em;
  line-height: 1;
  margin-bottom: -22px;
  margin-left: -20px;
  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.18));
}

.weather-icon {
  position: relative;
  display: inline-block;
  width: 12em;
  height: 10em;
  animation: weather-float 5.5s ease-in-out infinite;
}

.weather-icon .cloud {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  width: 3.6875em;
  height: 3.6875em;
  margin: -1.84375em;
  background: currentColor;
  border-radius: 50%;
  box-shadow:
    -2.1875em 0.6875em 0 -0.6875em,
    2.0625em 0.9375em 0 -0.9375em,
    0 0 0 0.375em #fff,
    -2.1875em 0.6875em 0 -0.3125em #fff,
    2.0625em 0.9375em 0 -0.5625em #fff;
}

.weather-icon .cloud:after {
  content: '';
  position: absolute;
  bottom: 0;
  left: -0.5em;
  display: block;
  width: 4.5625em;
  height: 1em;
  background: currentColor;
  box-shadow: 0 0.4375em 0 -0.0625em #fff;
}

.weather-icon .cloud:nth-child(2) {
  z-index: 0;
  background: #fff;
  box-shadow:
    -2.1875em 0.6875em 0 -0.6875em #fff,
    2.0625em 0.9375em 0 -0.9375em #fff,
    0 0 0 0.375em #fff,
    -2.1875em 0.6875em 0 -0.3125em #fff,
    2.0625em 0.9375em 0 -0.5625em #fff;
  opacity: 0.3;
  transform: scale(0.5) translate(6em, -3em);
  animation: weather-cloud 4s linear infinite;
}

.weather-icon .cloud:nth-child(2):after {
  background: #fff;
}

.weather-icon .sun {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2.5em;
  height: 2.5em;
  margin: -1.25em;
  background: currentColor;
  border-radius: 50%;
  box-shadow: 0 0 0 0.375em #fff;
  animation: weather-spin 12s infinite linear;
}

.weather-icon .rays {
  position: absolute;
  top: -2em;
  left: 50%;
  display: block;
  width: 0.375em;
  height: 1.125em;
  margin-left: -0.1875em;
  background: #fff;
  border-radius: 0.25em;
  box-shadow: 0 5.375em #fff;
}

.weather-icon .rays:before,
.weather-icon .rays:after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  width: 0.375em;
  height: 1.125em;
  transform: rotate(60deg);
  transform-origin: 50% 3.25em;
  background: #fff;
  border-radius: 0.25em;
  box-shadow: 0 5.375em #fff;
}

.weather-icon .rays:before {
  transform: rotate(120deg);
}

.weather-icon .cloud + .sun {
  margin: -2em 1em;
}

.weather-icon .rain,
.weather-icon .lightning,
.weather-icon .snow {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  width: 3.75em;
  height: 3.75em;
  margin: 0.375em 0 0 -2em;
  background: transparent;
}

.weather-icon .rain:after {
  content: '';
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  width: 1.125em;
  height: 1.125em;
  margin: -1em 0 0 -0.25em;
  background: #0284c7;
  border-radius: 100% 0 60% 50% / 60% 0 100% 50%;
  box-shadow:
    0.625em 0.875em 0 -0.125em rgba(255, 255, 255, 0.2),
    -0.875em 1.125em 0 -0.125em rgba(255, 255, 255, 0.2),
    -1.375em -0.125em 0 rgba(255, 255, 255, 0.2);
  transform: rotate(-28deg);
  animation: weather-rain 3s linear infinite;
}

.weather-icon .bolt {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -0.25em 0 0 -0.125em;
  color: #fff;
  opacity: 0.3;
  animation: weather-lightning 2s linear infinite;
}

.weather-icon .bolt:nth-child(2) {
  width: 0.5em;
  height: 0.25em;
  margin: -1.75em 0 0 -1.875em;
  transform: translate(2.5em, 2.25em);
  opacity: 0.2;
  animation: weather-lightning 1.5s linear infinite;
}

.weather-icon .bolt:before,
.weather-icon .bolt:after {
  content: '';
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  margin: -1.625em 0 0 -1.0125em;
  border-top: 1.25em solid transparent;
  border-right: 0.75em solid;
  border-bottom: 0.75em solid;
  border-left: 0.5em solid transparent;
  transform: skewX(-10deg);
}

.weather-icon .bolt:after {
  margin: -0.25em 0 0 -0.25em;
  border-top: 0.75em solid;
  border-right: 0.5em solid transparent;
  border-bottom: 1.25em solid transparent;
  border-left: 0.75em solid;
  transform: skewX(-10deg);
}

.weather-icon .bolt:nth-child(2):before {
  margin: -0.75em 0 0 -0.5em;
  border-top: 0.625em solid transparent;
  border-right: 0.375em solid;
  border-bottom: 0.375em solid;
  border-left: 0.25em solid transparent;
}

.weather-icon .bolt:nth-child(2):after {
  margin: -0.125em 0 0 -0.125em;
  border-top: 0.375em solid;
  border-right: 0.25em solid transparent;
  border-bottom: 0.625em solid transparent;
  border-left: 0.375em solid;
}

.weather-icon .flake:before,
.weather-icon .flake:after {
  content: '\2744';
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -1.025em 0 0 -1.0125em;
  color: #fff;
  line-height: 1em;
  opacity: 0.2;
  animation: weather-spin 8s linear infinite reverse;
}

.weather-icon .flake:after {
  margin: 0.125em 0 0 -1em;
  font-size: 1.5em;
  opacity: 0.4;
  animation: weather-spin 14s linear infinite;
}

.weather-icon .flake:nth-child(2):before {
  margin: -0.5em 0 0 0.25em;
  font-size: 1.25em;
  opacity: 0.2;
  animation: weather-spin 10s linear infinite;
}

.weather-icon .flake:nth-child(2):after {
  margin: 0.375em 0 0 0.125em;
  font-size: 2em;
  opacity: 0.4;
  animation: weather-spin 16s linear infinite reverse;
}

.weather-temp {
  margin: 8px 0 0;
  font-size: 56px;
  line-height: 0.95;
  font-weight: var(--fw-display);
  color: #fff;
  letter-spacing: -0.02em;
}

.weather-desc {
  margin: 8px 0 0;
  font-size: 20px;
  color: rgba(245, 249, 255, 0.94);
  font-weight: 600;
}

.weather-info-side {
  flex: 1;
  min-width: 0;
  padding: 16px 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.today-info-container {
  /* border-radius: 14px; */
  /* border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.02); */
}

.today-info {
  padding: 10px 12px;
}

.today-info-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 1.3;
}

.today-info-item + .today-info-item {
  margin-top: 6px;
  padding-top: 6px;
  /* border-top: 1px solid rgba(255, 255, 255, 0.08); */
}

.today-info-item .wea-title {
  color: var(--c-ink-700);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  padding: 3px 0;
}

.today-info-item .value {
  color: var(--c-ink-900);
  text-align: right;
  font-size: 16px;
}

.week-container {
  margin-top: 0;
  padding-top: 0;
}

.week-container--top {
  margin-bottom: 2px;
}

.week-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.week-list > li {
  width: 86px;
  padding: 8px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, color 0.2s ease;
  border: 1px solid var(--c-border);
  background: var(--c-bg-soft);
  color: var(--c-ink-600);
}

.week-list > li:hover {
  transform: translateY(-3px);
  background: var(--c-bg-sunken);
  color: var(--c-ink-900);
  box-shadow: var(--sh-md);
}

.week-list > li.active {
  background: var(--c-brand-500);
  color: #ffffff;
  box-shadow: var(--sh-brand);
}

.week-list > li .day-icon {
  display: block;
  margin: 0 auto;
}

.week-list > li .day-icon.weather-icon--small {
  width: 12em;
  height: 10em;
  font-size: 0.3em;
  color: inherit;
  animation-duration: 6.2s;
}

.week-list > li .day-name {
  display: block;
  margin-top: 6px;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.03em;
}

.week-list > li .day-temp {
  display: block;
  text-align: center;
  margin-top: 3px;
  font-weight: var(--fw-semibold);
  font-size: 12px;
}

@keyframes weather-spin {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes weather-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-2px);
  }
}

@keyframes weather-cloud {
  0% {
    opacity: 0;
  }

  50% {
    opacity: 0.3;
  }

  100% {
    opacity: 0;
    transform: scale(0.5) translate(-200%, -3em);
  }
}

@keyframes weather-rain {
  0% {
    background: #0284c7;
    box-shadow:
      0.625em 0.875em 0 -0.125em rgba(255, 255, 255, 0.2),
      -0.875em 1.125em 0 -0.125em rgba(255, 255, 255, 0.2),
      -1.375em -0.125em 0 #0cf;
  }

  25% {
    box-shadow:
      0.625em 0.875em 0 -0.125em rgba(255, 255, 255, 0.2),
      -0.875em 1.125em 0 -0.125em #0cf,
      -1.375em -0.125em 0 rgba(255, 255, 255, 0.2);
  }

  50% {
    background: rgba(255, 255, 255, 0.3);
    box-shadow:
      0.625em 0.875em 0 -0.125em #0cf,
      -0.875em 1.125em 0 -0.125em rgba(255, 255, 255, 0.2),
      -1.375em -0.125em 0 rgba(255, 255, 255, 0.2);
  }

  100% {
    box-shadow:
      0.625em 0.875em 0 -0.125em rgba(255, 255, 255, 0.2),
      -0.875em 1.125em 0 -0.125em rgba(255, 255, 255, 0.2),
      -1.375em -0.125em 0 #0cf;
  }
}

@keyframes weather-lightning {
  45% {
    color: #fff;
    background: #fff;
    opacity: 0.2;
  }

  50% {
    color: #0284c7;
    background: #0284c7;
    opacity: 1;
  }

  55% {
    color: #fff;
    background: #fff;
    opacity: 0.2;
  }
}

/* 回到顶部按钮 */
.back-top-button {
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, var(--c-brand-500), var(--c-brand-700));
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: var(--fw-semibold);
  letter-spacing: 0.03em;
  box-shadow: var(--sh-brand);
  cursor: pointer;
  transition: all 0.3s ease;
}

.back-top-button:hover {
  transform: scale(1.15);
  box-shadow: 0 6px 28px var(--sh-brand);
}

/* 酒店卡片样式 */
/* ---------------- 通用面板：取代原先各处零散的 a-card ---------------- */
.panel {
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  box-shadow: var(--sh-sm);
}

.result-section {
  margin-bottom: var(--sp-8);
  scroll-margin-top: calc(var(--nav-h) + 60px);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: var(--sp-4);
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.section-title::before {
  content: '';
  width: 4px;
  height: 17px;
  flex: 0 0 auto;
  border-radius: var(--r-full);
  background: linear-gradient(180deg, var(--c-brand-400), var(--c-brand-600));
}

.overview-card {
  padding: var(--sp-5) var(--sp-5) var(--sp-4);
}

.overview-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--c-border);
}

.overview-meta__date {
  flex: 0 0 auto;
  padding: 4px 12px;
  border-radius: var(--r-full);
  background: var(--c-brand-50);
  color: var(--c-brand-700);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
}

.overview-meta__text {
  flex: 1 1 260px;
  min-width: 0;
  font-size: var(--fs-sm);
  line-height: var(--lh-snug);
  color: var(--c-ink-500);
}

/* ---------------- 酒店：从「标题栏 + descriptions」换成键值对小卡 ---------------- */
.hotel-card {
  padding: var(--sp-4) var(--sp-5);
  border-radius: var(--r-md);
  background: var(--c-bg-soft);
}

.hotel-card__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}

.hotel-card__name {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.hotel-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--sp-3) var(--sp-6);
  margin: 0;
}

.hotel-fact {
  display: flex;
  gap: var(--sp-2);
  min-width: 0;
}

.hotel-fact--wide {
  grid-column: 1 / -1;
}

.hotel-fact dt {
  flex: 0 0 auto;
  min-width: 56px;
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.hotel-fact dd {
  margin: 0;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--c-ink-700);
}

.overview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.overview-head .section-title {
  margin-bottom: 0;
}

.overview-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.overview-nav-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--c-border);
  background: var(--c-bg-card);
  color: var(--c-ink-700);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.overview-nav-btn:hover:not(:disabled) {
  border-color: var(--c-brand-500);
  color: var(--c-brand-700);
  box-shadow: var(--sh-sm);
}

.overview-nav-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.overview-swiper {
  padding: 8px 2px 10px;
}

.overview-swiper .swiper {
  padding: 10px 0 12px;
  margin: 0;
  overflow: hidden;
  border-radius: 12px;
}

.overview-swiper .swiper-wrapper {
  /*
   * 必须给 wrapper 一个确定高度：swiper 核心样式给 .swiper-slide 设了 height:100%，
   * 父容器高度为 auto 时百分比无从解析，卡片会退化成"内容高度"（标题/按钮被裁）。
   * 27rem 与 OverviewAttractionCard.vue 里 .swiper-slide 的高度保持一致。
   */
  height: var(--overview-card-height, 27rem);
  align-items: stretch;
}


/* 预算卡片 */
/* ---------------- 预算：总览条 + 明细卡 ---------------- */
.budget-overview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-5);
  padding: var(--sp-5) var(--sp-6);
  margin-bottom: var(--sp-4);
}

.budget-overview__total {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: var(--sp-5);
  border-right: 1px solid var(--c-border);
}

.budget-overview__label {
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.budget-overview__amount {
  display: flex;
  align-items: baseline;
  font-family: var(--font-num);
  font-size: var(--fs-xl);
  font-weight: var(--fw-semibold);
  line-height: 1.15;
  color: var(--c-ink-900);
}

.budget-overview__currency {
  margin-right: 2px;
  font-size: var(--fs-md);
  font-weight: var(--fw-medium);
  color: var(--c-ink-400);
}

.budget-overview__split {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-6);
  flex: 1 1 auto;
}

.budget-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 72px;
}

.budget-chip__value {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.budget-chip__label {
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.budget-pending {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
  padding-top: var(--sp-4);
  border-top: 1px dashed var(--c-border-strong);
}

.budget-pending__title {
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  color: var(--c-ink-400);
}

.budget-pending__empty {
  font-size: var(--fs-xs);
  color: var(--c-ink-300);
}

.budget-pending__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.budget-pending__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--r-full);
  background: var(--c-bg-soft);
  font-size: var(--fs-sm);
  color: var(--c-ink-500);
}

.budget-detail {
  padding: var(--sp-5) var(--sp-6) var(--sp-4);
}

.budget-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
  margin-bottom: var(--sp-4);
}

.budget-toolbar__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.budget-toolbar__label {
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.budget-select {
  width: 170px;
}

.budget-rows {
  display: flex;
  flex-direction: column;
}

.budget-row {
  display: grid;
  grid-template-columns: 92px 70px minmax(0, 1fr) 96px 74px;
  align-items: center;
  gap: var(--sp-3);
  padding: 11px var(--sp-3);
  border-radius: var(--r-sm);
  font-size: var(--fs-base);
  transition: background var(--dur-fast) var(--ease-out);
}

.budget-row:not(.budget-row--head):hover {
  background: var(--c-ink-50);
}

.budget-row--head {
  padding-top: 0;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--c-border);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  color: var(--c-ink-400);
}

.budget-type {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 3px 10px;
  border-radius: var(--r-full);
  background: var(--c-bg-soft);
  color: var(--c-ink-600);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}

/* 四类各给一点色彩区分，扫读更快 */
.budget-type[data-type='attraction'] {
  background: var(--c-cat-attraction-bg);
  color: var(--c-cat-attraction-fg);
}

.budget-type[data-type='hotel'] {
  background: var(--c-cat-hotel-bg);
  color: var(--c-cat-hotel-fg);
}

.budget-type[data-type='meal'] {
  background: var(--c-cat-meal-bg);
  color: var(--c-cat-meal-fg);
}

.budget-type[data-type='transport'] {
  background: var(--c-cat-transport-bg);
  color: var(--c-cat-transport-fg);
}

.budget-day {
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.budget-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-ink-700);
}

.budget-amount {
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
  text-align: right;
}

.budget-row__amount {
  text-align: right;
}

.budget-row__actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: var(--r-sm);
  color: var(--c-ink-300);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.icon-btn svg {
  width: 15px;
  height: 15px;
}

.icon-btn:hover {
  background: var(--c-ink-100);
  color: var(--c-ink-700);
}

.icon-btn--danger:hover {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}

.budget-edit-input {
  width: 100%;
}

.budget-edit-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}

/* ---------------- 地图 ---------------- */
.map-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 画布给固定高度：高德初始化时容器必须有确定尺寸，flex 撑开会让首帧算错 */
.map-canvas {
  flex: none;
  width: 100%;
  height: 460px;
}

.map-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  background: var(--c-bg-soft);
}

.map-placeholder__text {
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
  text-align: center;
}

/* ---------------- 路线概览（真实里程/耗时） ---------------- */
.map-routes {
  flex: none;
  padding: var(--sp-4) var(--sp-5) var(--sp-5);
  border-top: 1px solid var(--c-border);
  background: var(--c-bg-card);
}

.map-routes__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}

.map-routes__title {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.map-routes__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.map-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  color: var(--c-ink-500);
}

/* 图例里的线样：和地图上折线的颜色/实虚线一一对应 */
.map-legend__stroke {
  width: 20px;
  height: 0;
  border-top-width: 3px;
  border-top-style: solid;
  border-radius: var(--r-full);
}

.map-legend__stroke[data-mode='driving'] {
  border-top-color: var(--c-brand-500);
}

.map-legend__stroke[data-mode='transit'] {
  border-top-color: var(--c-info);
}

.map-legend__stroke[data-mode='riding'] {
  border-top-color: var(--c-warning);
  border-top-style: dashed;
}

.map-legend__stroke[data-mode='walking'] {
  border-top-color: var(--c-success);
  border-top-style: dashed;
}

.map-routes__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.map-route {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--c-bg-soft);
  font-size: var(--fs-sm);
}

.map-route__day {
  flex: none;
  color: var(--c-ink-700);
  font-weight: var(--fw-medium);
}

.map-route__mode {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--r-full);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  background: var(--c-bg-sunken);
  color: var(--c-ink-600);
}

.map-route__mode[data-mode='driving'] {
  background: var(--c-brand-50);
  color: var(--c-brand-700);
}

.map-route__mode[data-mode='transit'] {
  background: var(--c-info-soft);
  color: var(--c-info);
}

.map-route__mode[data-mode='riding'] {
  background: var(--c-warning-soft);
  color: var(--c-warning);
}

.map-route__mode[data-mode='walking'] {
  background: var(--c-success-soft);
  color: var(--c-success);
}

.map-route__text {
  margin-left: auto;
  color: var(--c-ink-500);
  font-size: var(--fs-xs);
}

.map-routes__note {
  margin: var(--sp-3) 0 0;
  font-size: var(--fs-xs);
  color: var(--c-warning);
}

/* 附近站点面板：放在路线概览下方，跟着地图卡片走 */
.map-stations {
  margin-top: var(--sp-4);
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: 0 1px 0 var(--c-border);
}

/* ---------------- 知识图谱 ---------------- */
.kg-card {
  padding: var(--sp-4) var(--sp-5) var(--sp-5);
}

.kg-chart {
  width: 100%;
  height: 600px;
}

.kg-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
  margin-top: var(--sp-3);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--c-border);
}

.kg-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-sm);
  color: var(--c-ink-500);
}

.kg-legend-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
}

/* ---------------- 每日行程 ---------------- */
.days-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.day-card {
  padding: var(--sp-5) var(--sp-6) var(--sp-6);
}

.day-card__head {
  scroll-margin-top: calc(var(--nav-h) + 70px);
}

.day-card__heading {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.day-card__badge {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--c-brand-400), var(--c-brand-600));
  color: #fff;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.day-card__titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.day-card__name {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-900);
}

.day-card__date {
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.day-card__desc {
  margin-top: var(--sp-3);
  font-size: var(--fs-base);
  line-height: var(--lh-normal);
  color: var(--c-ink-500);
}

.day-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin-top: var(--sp-4);
}

.day-meta__item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: var(--r-full);
  background: var(--c-bg-soft);
}

.day-meta__label {
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.day-meta__value {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--c-ink-700);
}

/* 区块小标题：取代原来的 a-divider */
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: var(--sp-6) 0 var(--sp-3);
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--c-ink-800);
}

.block-title::before {
  content: '';
  width: 3px;
  height: 13px;
  flex: 0 0 auto;
  border-radius: var(--r-full);
  background: var(--c-brand-500);
}

/* ---------------- 景点卡 ---------------- */
.attraction-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
  gap: var(--sp-4);
}

.attraction-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-border);
  overflow: hidden;
  transition: border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.attraction-card:hover {
  border-color: var(--c-brand-200);
  box-shadow: var(--sh-md);
  transform: translateY(-2px);
}

.attraction-image-wrapper {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: var(--c-bg-soft);
}

.attraction-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out);
}

.attraction-image.is-loaded {
  opacity: 1;
}

.attraction-card:hover .attraction-image {
  transform: scale(1.05);
}

.attraction-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--r-full);
  background: rgba(22, 24, 29, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
}

.price-tag {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 10px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.94);
  color: var(--c-brand-700);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
}

.attraction-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4);
  flex: 1 1 auto;
}

.attraction-body__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
}

.attraction-name {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-snug);
  color: var(--c-ink-900);
}

.attraction-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.attraction-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attraction-edit__label {
  font-size: var(--fs-xs);
  color: var(--c-ink-400);
}

.attraction-facts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.attraction-fact {
  display: flex;
  gap: var(--sp-2);
  min-width: 0;
}

.attraction-fact dt {
  flex: 0 0 auto;
  min-width: 52px;
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

.attraction-fact dd {
  margin: 0;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--c-ink-700);
}

.attraction-desc {
  margin-top: 6px;
  padding-top: var(--sp-3);
  border-top: 1px dashed var(--c-border);
  font-size: var(--fs-sm);
  line-height: var(--lh-normal);
  color: var(--c-ink-500);
}

/* ---------------- 餐饮 ---------------- */
.meal-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.meal-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-2);
  padding: 10px var(--sp-4);
  border-radius: var(--r-md);
  background: var(--c-bg-soft);
}

.meal-item__type {
  flex: 0 0 auto;
  min-width: 46px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  color: var(--c-brand-700);
}

.meal-item__name {
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  color: var(--c-ink-800);
}

.meal-item__desc {
  font-size: var(--fs-sm);
  color: var(--c-ink-400);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .result-main {
    padding: calc(var(--nav-h) + 16px) 0 24px;
  }

  .layout-container {
    padding: 0 var(--sp-4);
  }

  .section-nav {
    gap: var(--sp-2);
    padding: 8px 0;
  }

  .section-nav__actions {
    gap: 6px;
  }

  .budget-overview {
    gap: var(--sp-4);
    padding: var(--sp-4);
  }

  .budget-overview__total {
    flex: 1 1 100%;
    padding-right: 0;
    border-right: none;
  }

  .budget-overview__split {
    gap: var(--sp-4);
  }

  .budget-detail {
    padding: var(--sp-4) var(--sp-4) var(--sp-3);
  }

  .budget-toolbar {
    gap: var(--sp-3);
  }

  .budget-toolbar__item {
    width: 100%;
    justify-content: space-between;
  }

  .budget-select {
    width: 160px;
  }

  /* 明细行是固定列宽的网格，窄屏交给横向滚动，比挤成一团可读 */
  .budget-rows {
    overflow-x: auto;
  }

  .budget-row {
    grid-template-columns: 84px 56px minmax(0, 1fr) 84px 66px;
    min-width: 520px;
    gap: var(--sp-2);
    padding: 10px var(--sp-2);
    font-size: var(--fs-sm);
  }

  .day-card {
    padding: var(--sp-4) var(--sp-4) var(--sp-5);
  }

  .attraction-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .weather-dashboard {
    flex-direction: column;
    min-height: auto;
    border-radius: 16px;
  }

  .weather-side {
    flex: 0 0 auto;
    width: 100%;
    min-height: 260px;
    border-radius: 16px 16px 0 0;
    transform: none !important;
  }

  .weather-info-side {
    padding: 12px;
  }

  .weather-temp {
    font-size: 46px;
  }

  .weather-desc {
    font-size: var(--fs-md);
  }

  .week-list {
    justify-content: space-between;
  }

  .week-list > li {
    width: calc(33.333% - 7px);
    min-width: 88px;
    padding: 8px 6px;
  }

  .overview-meta {
    gap: var(--sp-2);
  }

  .overview-swiper .swiper {
    padding: 10px 0 12px;
  }

  .map-canvas {
    height: 340px;
  }

  .kg-chart {
    height: 420px;
  }
}

</style>

<style>
/* 地图专用变量：全部转发到全局 token，避免地图自己维护一套橙色 */
:root {
  --tripstar-map-accent: var(--c-brand-500);
  --tripstar-map-accent-strong: var(--c-brand-600);
  --tripstar-map-surface: var(--c-bg-card);
  --tripstar-map-border: var(--c-border-strong);
  --tripstar-map-text-main: var(--c-ink-900);
  --tripstar-map-text-sub: var(--c-ink-500);
}

.tripstar-map-marker {
  position: relative;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* 站点聚焦气泡（高德 InfoWindow 内容，非 scoped） */
.station-bubble {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--tripstar-map-surface);
  border: 1px solid var(--tripstar-map-border);
  border-radius: var(--r-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  font-size: var(--fs-sm);
  color: var(--tripstar-map-text-main);
  white-space: nowrap;
}

.station-bubble__tag {
  align-self: flex-start;
  padding: 0 6px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: var(--fw-medium);
  background: var(--c-info-soft);
  color: var(--c-info);
}

.station-bubble__name {
  font-weight: var(--fw-semibold);
}

.station-bubble__meta {
  font-size: var(--fs-xs);
  color: var(--tripstar-map-text-sub);
}

.tripstar-map-marker__core {
  position: relative;
  z-index: 1;
  width: 20px;
  height: 20px;
  /* border-radius: 50%; */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* background: rgba(0, 0, 0, 0.86);
  border: 1.2px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45); */
}

.tripstar-map-marker__icon {
  width: 12px;
  height: 12px;
  stroke: #ffffff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.tripstar-map-marker__index {
  position: absolute;
  top: calc(100% + 1px);
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  line-height: 1;
  /* 浅色底图下白字带黑描边像一块污渍，改用品牌深橙 + 白色描边 */
  color: var(--tripstar-map-accent-strong);
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.9), 0 0 3px rgba(255, 255, 255, 0.75);
  white-space: nowrap;
  pointer-events: none;
}

.tripstar-map-tooltip {
  max-width: min(320px, calc(100vw - 40px));
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  color: var(--tripstar-map-text-main);
  pointer-events: none;
}

.tripstar-map-tooltip__line {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tripstar-map-text-sub) !important;
  background-color: var(--c-bg-soft);
  white-space: nowrap;
}

.tripstar-map-tooltip__line + .tripstar-map-tooltip__line {
  margin-top: 2px;
}

.tripstar-map-tooltip__line--title {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--tripstar-map-text-main) !important;
}

#amap-container .amap-info-content {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}

#amap-container .amap-info-sharp {
  display: none !important;
}

/* ---------------- 点击标记的详情卡 ---------------- */
/* 这段 DOM 由高德插到 #amap-container 里，在组件作用域之外，只能写在这里 */
.tripstar-map-detail {
  width: 268px;
  overflow: hidden;
  background: var(--tripstar-map-surface);
  border: 1px solid var(--tripstar-map-border);
  border-radius: var(--r-md);
  box-shadow: var(--sh-lg);
}

.tripstar-map-detail__cover {
  height: 116px;
  background: var(--c-bg-sunken);
}

.tripstar-map-detail__cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tripstar-map-detail__body {
  padding: 12px 14px 14px;
}

.tripstar-map-detail__title {
  margin: 0 0 8px;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  color: var(--tripstar-map-text-main);
}

.tripstar-map-detail__meta {
  margin: 0 0 6px;
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--tripstar-map-text-sub);
}

.tripstar-map-detail__row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 5px;
  font-size: var(--fs-xs);
  line-height: 1.5;
}

.tripstar-map-detail__label {
  flex: none;
  min-width: 52px;
  color: var(--tripstar-map-text-sub);
}

.tripstar-map-detail__value {
  flex: 1;
  min-width: 0;
  color: var(--tripstar-map-text-main);
  overflow-wrap: anywhere;
}

.tripstar-map-detail__link {
  display: inline-flex;
  align-items: center;
  margin-top: 12px;
  padding: 6px 12px;
  border-radius: var(--r-full);
  background: var(--c-brand-500);
  color: #fff;
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  text-decoration: none;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.tripstar-map-detail__link:hover {
  background: var(--c-brand-600);
}
</style>

