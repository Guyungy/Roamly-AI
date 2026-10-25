import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * 前端单测配置（P-5 契约测试）。
 *
 * 只测 service 层，不测组件：契约的风险点全在「后端响应怎么被消费」，
 * 组件渲染由 build + 浏览器实测覆盖，拉一套 jsdom 进来收益不大。
 * 所以 environment 用 node，跑得快、也不依赖浏览器 API 的模拟。
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
