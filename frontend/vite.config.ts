import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// 监听端口，部署环境通过 PORT 注入
const port = Number(process.env.PORT) || 5173

// 本地代理目标（需后端在跑时才有意义），可用 VITE_PROXY_TARGET 覆盖
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

// 反向代理域名下必须放行 Host，否则 Vite 报 "Blocked request. This host is not allowed."
const listen = {
  host: '0.0.0.0',
  port,
  allowedHosts: true as const
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    ...listen,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/health': {
        target: proxyTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    ...listen
  }
})
