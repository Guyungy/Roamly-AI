// 临时预览入口：直接挂载 NearbyStationPanel，方便可视化验收（验收后可删除）
import { createApp, h } from 'vue'
import { NMessageProvider, NConfigProvider, zhCN } from 'naive-ui'
import { createI18n } from 'vue-i18n'
import NearbyStationPanel from '@/components/NearbyStationPanel.vue'
import zh from '@/i18n/locales/zh.json'
import './src/styles/global.css'

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  messages: { zh },
})

const centers = [
  { key: '0-0', label: '第 1 天 景点 1 · 故宫', longitude: 116.397, latitude: 39.916 },
  { key: '0-1', label: '第 1 天 景点 2 · 天坛', longitude: 116.407, latitude: 39.882 },
  { key: '1-0', label: '第 2 天 景点 1 · 颐和园', longitude: 116.276, latitude: 39.999 },
]

const app = createApp({
  setup() {
    const onFocus = (s: unknown) => {
      const st = s as { name: string }
      ;(window as unknown as { __lastFocus?: unknown }).__lastFocus = s
      console.log('[preview focus]', JSON.stringify(st.name))
    }
    return () =>
      h(NConfigProvider, { locale: zhCN }, () =>
        h(NMessageProvider, () =>
          h('div', { style: 'padding: 12px' }, [
            h('h1', { style: 'font-size:18px;margin-bottom:8px' }, '附近站点面板预览'),
            h(NearbyStationPanel, { centers, onFocus })
          ])
        )
      )
  },
})

app.use(i18n)
app.mount('#app')