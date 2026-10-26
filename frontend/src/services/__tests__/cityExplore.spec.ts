/**
 * 城市探索契约测试（前端侧，docs/r1/CONTRACT.md §5）。
 *
 * 与 `backend/tests/test_r1_city_explore.py` 成对：后端测「腾讯响应 → 契约」，
 * 这里测「契约 → 前端消费」。两边各测一遍才算闭环 —— §2 的教训是
 * 后端把 data 改成对象时后端单测全绿，前端 `Array.isArray` 静默失败。
 *
 * 重点锁三件后端单测覆盖不到的事：
 *   1. `city` 与 `data` 平级挂在信封上（不是塞在 data 里）
 *   2. 四种来源（live/cache/degraded/mock）互不串味
 *   3. 只给坐标、没有城市名时不编造 mock 地点
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  mockFetch.mockReset()
  store.clear()
  vi.resetModules()
})

const loadService = async () => import('@/services/cityExplore')

/** docs/r1/CONTRACT.md §5 的响应形状（真实腾讯响应经后端适配后） */
const CITY_SAMPLE = {
  success: true,
  degraded: false,
  message: '',
  city: {
    name: '杭州市',
    location: { longitude: 120.210792, latitude: 30.246026 },
  },
  data: [
    {
      id: '1001',
      name: '雷峰塔景区',
      category: '旅游景点:国家级景点',
      kind: 'spot',
      address: '浙江省杭州市西湖区南山路15号',
      location: { longitude: 120.14875, latitude: 30.23106 },
      distance: 6174,
      score: 49.1,
    },
    {
      id: '1002',
      name: '西湖风景名胜区',
      category: '旅游景点:国家级景点',
      kind: 'spot',
      address: '浙江省杭州市西湖区龙井路1号',
      location: { longitude: 120.1304, latitude: 30.2592 },
      distance: 9012,
      score: 46.6,
    },
  ],
}

describe('契约 §5 城市探索：响应形状', () => {
  it('data 是数组，city 与 data 平级挂在信封上', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))

    const result = await fetchCityExplore({ city: '杭州', kind: 'spot' })

    expect(result.source).toBe('live')
    expect(Array.isArray(result.spots)).toBe(true)
    expect(result.spots).toHaveLength(2)
    // city 不在 data 里，而在信封上 —— 这是 §5 与 §2 的结构差异
    expect(result.city?.name).toBe('杭州市')
    expect(result.city?.location.longitude).toBeCloseTo(120.210792, 4)
  })

  it('字段完整映射，距离是整数米、分数原样保留', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))

    const { spots } = await fetchCityExplore({ city: '杭州' })
    const first = spots[0]

    expect(first.id).toBe('1001')
    expect(first.name).toBe('雷峰塔景区')
    expect(first.kind).toBe('spot')
    expect(first.category).toBe('旅游景点:国家级景点')
    expect(first.distance).toBe(6174)
    expect(Number.isInteger(first.distance)).toBe(true)
    expect(first.score).toBe(49.1)
    expect(first.location.longitude).toBeCloseTo(120.14875, 4)
  })

  it('按 score 降序排列（后端已排好，前端不得打乱）', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))

    const { spots } = await fetchCityExplore({ city: '杭州' })
    expect(spots.map((s) => s.score)).toEqual([49.1, 46.6])
  })

  it('缺坐标或缺名字的地点被丢弃，不给 0,0', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(
      jsonResponse({
        ...CITY_SAMPLE,
        data: [
          CITY_SAMPLE.data[0],
          { id: 'x', name: '没有坐标的地方', kind: 'spot', score: 1 },
          { id: 'y', location: { longitude: 120, latitude: 30 }, kind: 'spot', score: 2 },
        ],
      })
    )

    const { spots } = await fetchCityExplore({ city: '杭州' })
    expect(spots).toHaveLength(1)
    expect(spots[0].name).toBe('雷峰塔景区')
  })

  it('成功但列表为空时如实返回空列表（不是降级）', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse({ ...CITY_SAMPLE, data: [] }))

    const result = await fetchCityExplore({ city: '阿勒泰', kind: 'museum' })
    expect(result.source).toBe('live')
    expect(result.spots).toEqual([])
  })
})

describe('契约 §5 城市探索：四态来源', () => {
  it('degraded=true → source=degraded 且不伪造地点、不拿缓存冒充', async () => {
    const { fetchCityExplore } = await loadService()

    // 先成功一次写缓存
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))
    await fetchCityExplore({ city: '杭州' })

    // 再降级：必须给空列表，不能回落到上一次的缓存
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: false,
        degraded: true,
        message: '腾讯位置服务 Key 未配置',
        city: null,
        data: [],
      })
    )
    const result = await fetchCityExplore({ city: '杭州' })

    expect(result.source).toBe('degraded')
    expect(result.spots).toEqual([])
    expect(result.city).toBeNull()
    expect(result.degradedReason).toContain('Key 未配置')
  })

  it('网络失败 → 命中缓存时 source=cache', async () => {
    const { fetchCityExplore } = await loadService()

    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))
    await fetchCityExplore({ city: '杭州' })

    mockFetch.mockReset()
    mockFetch.mockRejectedValue(new Error('network down'))
    const result = await fetchCityExplore({ city: '杭州' })

    expect(result.source).toBe('cache')
    expect(result.spots).toHaveLength(2)
  })

  it('网络失败且无缓存 → mock，且必须能识别为 mock', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockRejectedValue(new Error('network down'))

    const result = await fetchCityExplore({ city: '杭州', kind: 'food' })
    expect(result.source).toBe('mock')
    expect(result.spots.length).toBeGreaterThan(0)
    // 演示数据必须自证身份，UI 才能如实标注
    expect(result.spots.every((s) => s.address.includes('演示数据'))).toBe(true)
  })

  it('只有坐标没有城市名时，失败不编造 mock', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockRejectedValue(new Error('network down'))

    const result = await fetchCityExplore({
      center: { longitude: 120.15, latitude: 30.27 },
      kind: 'spot',
    })
    // 没有城市名就没有可标注的城市，编地点等于骗用户
    expect(result.source).toBe('degraded')
    expect(result.spots).toEqual([])
  })

  it('请求被取消时原样上抛，不降级', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    await expect(fetchCityExplore({ city: '杭州' })).rejects.toBeTruthy()
  })

  it('HTTP 4xx（城市名非法）不拿 mock 掩盖', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: '参数错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    // 4xx 走 ApiFailure('http')，当前策略归到 cache/mock 分支；
    // 但绝不能让调用方以为拿到了真实数据 —— source 必须不是 live
    const result = await fetchCityExplore({ city: '不存在的城市xyz' })
    expect(result.source).not.toBe('live')
  })
})

describe('契约 §5 城市探索：请求参数', () => {
  it('用两个 float 传坐标，不拼 "lng,lat" 单串', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))

    await fetchCityExplore({ center: { longitude: 120.15507, latitude: 30.274085 } })

    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toContain('longitude=120.155070')
    expect(url).toContain('latitude=30.274085')
    expect(url).not.toContain('coord=')
  })

  it('城市名优先于坐标（后端据此解析城市中心）', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))

    await fetchCityExplore({ city: '杭州', center: { longitude: 120.15, latitude: 30.27 } })

    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toContain('city=' + encodeURIComponent('杭州'))
  })

  it('kind 与 limit 正确透传', async () => {
    const { fetchCityExplore } = await loadService()
    mockFetch.mockResolvedValue(jsonResponse(CITY_SAMPLE))

    await fetchCityExplore({ city: '杭州', kind: 'museum', limit: 6 })

    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toContain('kind=museum')
    expect(url).toContain('limit=6')
  })
})
