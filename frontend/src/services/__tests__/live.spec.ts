/**
 * 前端 ↔ 真实后端的联调契约测试（默认跳过）。
 *
 * 单测里的 mock 只能证明「前端按契约消费」，证明不了「后端真的这么回」。
 * 契约 §7 要求可执行验收，后端侧已有 `test_r1_routes.py` 真打上游；
 * 这里补上消费端：用**同一份 service 代码**打真后端，断言解析结果物理合理。
 *
 * 跑法：
 *   VITE_API_BASE_URL=http://127.0.0.1:8000 npx vitest run src/services/__tests__/live.spec.ts
 *
 * 不设 VITE_API_BASE_URL 时整组跳过，CI 不会因为没起后端而红。
 */

import { describe, expect, it } from 'vitest'
import { fetchNearbyStations } from '@/services/nearbyStation'
import { fetchNavLink } from '@/services/navLink'

// service 读 import.meta.env.VITE_API_BASE_URL；vitest 会把同名进程环境变量注入进去，
// 所以这里判断的就是 service 真正会用的那个值
const LIVE = Boolean(import.meta.env.VITE_API_BASE_URL)

// 北京中关村：实测周边地铁+公交齐全，是契约 §1.6 的取证坐标
const CENTER = { longitude: 116.316478, latitude: 39.984055 }

describe.skipIf(!LIVE)('联调：前端 service ↔ 真实后端', () => {
  it('附近站点拿到真实数据，且地铁与公交都在（契约 §1.6 多关键词合并）', async () => {
    const result = await fetchNearbyStations(CENTER, { keyword: '地铁,公交' })

    expect(result.source).toBe('live')
    expect(result.stations.length).toBeGreaterThan(0)

    // 实测教训：多关键词若不逐个检索，地铁站会整类丢失
    const types = new Set(result.stations.map((s) => s.type))
    expect(types.has('subway')).toBe(true)
    expect(types.has('bus')).toBe(true)

    // 契约 §2：距离升序
    const distances = result.stations.map((s) => s.distance)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))

    // 坐标落在北京，不是 0,0 也不是串位后的镜像
    result.stations.forEach((s) => {
      expect(s.location.longitude).toBeGreaterThan(115)
      expect(s.location.longitude).toBeLessThan(118)
      expect(s.location.latitude).toBeGreaterThan(39)
      expect(s.location.latitude).toBeLessThan(41)
    })
  })

  it('导航链接由后端生成，provider=tencent 且坐标顺序是 lat,lng', async () => {
    const url = await fetchNavLink('故宫', { longitude: 116.397, latitude: 39.916 })

    expect(url).toBeTruthy()
    expect(url).toContain('apis.map.qq.com')
    // 腾讯 URI 的 tocoord 是 "lat,lng"——前端若自行拼接最易在这里串位
    expect(url).toContain('tocoord=39.916,116.397')
  })
})
