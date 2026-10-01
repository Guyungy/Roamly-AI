import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import './styles/global.css'
import App from './App.vue'
import { i18n } from './i18n'
import { useAuthStore } from './stores/auth'

/*
 * 两个页面都懒加载。
 * /result 拖着一整套重家伙 —— ECharts、Swiper、地图、导出用的 html2canvas/jsPDF，
 * 静态 import 会把这些全算进首屏包；而用户打开首页时真正需要的只有 / 这一页。
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Landing',
      component: () => import('./views/Landing.vue')
    },
    {
      path: '/result',
      name: 'Result',
      component: () => import('./views/Result.vue')
    }
  ]
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(i18n)
// 组件库无需全局注册：Naive UI 在各文件里按需 import，构建产物只含用到的部分

// 启动时恢复云服务会话，导航栏等组件才能正确显示登录态
void useAuthStore().init()

app.mount('#app')
