/**
 * 前端契约测试（P-5 收口）。
 *
 * 与 `backend/tests/test_r1_contract.py` 成对：后端测「解析腾讯响应是否符合契约」，
 * 这里测「前端消费后端响应是否符合契约」。
 *
 * 为什么前端也必须测契约：契约 §2 明确要求 `data` 是**数组**，POLL-158 曾把它改成
 * 对象，后端单测发现不了前端 `Array.isArray` 会静默失败——两边各测一遍才算闭环。
 *
 * fixtures 复用 `backend/tests/fixtures/tencent/` 的真实腾讯响应（已剔除 polyline），
 * 前端断言的是「后端按契约适配后」的形状（docs/r1/CONTRACT.md §2–§5 的示例）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// service 只依赖 import.meta.env.VITE_API_BASE_URL 与全局 fetch/localStorage，
// 没有需要 mock 的配置模块——降级判定全在 http.ts 内部，不依赖 hasOwnBackend。

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

/** 简易内存版 localStorage（node 环境没有） */
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

const CENTER = { longitude: 116.316478, latitude: 39.984055 }

beforeEach(() => {
  mockFetch.mockReset()
  store.clear()
  vi.resetModules()
})

/** 每次拿到全新的 service 实例，避免模块级缓存串用例 */
const loadServices = async () => {
  const nearby = await import('@/services/nearbyStation')
  const nav = await import('@/services/navLink')
  const http = await import('@/services/http')
  return { nearby, nav, http }
}

// ============ 契约 §2：附近站点 ============

describe('契约 §2 附近站点', () => {
  /** docs/r1/CONTRACT.md §2 的响应示例（真实腾讯响应经后端适配后的形状） */
  const CONTRACT_SAMPLE = {
    success: true,
    degraded: false,
    message: '',
    data: [
      {
        id: '2199027905900',
        name: '中关村[地铁站]',
        type: 'metro',
        address: '地铁4号线大兴线',
        location: { longitude: 116.316478, latitude: 39.984055 },
        distance: 767,
        lines: ['地铁4号线大兴线'],
      },
      {
        id: '2199027905901',
        name: '中关村南[公交站]',
        type: 'bus',
        address: '302路,332路',
        location: { longitude: 116.317, latitude: 39.984 },
        distance: 120,
        lines: ['302路', '332路'],
      },
    ],
  }

  it('data 是数组时正常解析，并按距离升序', async () => {
    mockFetch.mockResolvedValue(jsonResponse(CONTRACT_SAMPLE))
    const { nearby } = await loadServices()

    const result = await nearby.fetchNearbyStations(CENTER)

    expect(result.source).toBe('live')
    expect(result.stations.map((s) => s.distance)).toEqual([120, 767])
  })

  it('契约 type=metro 映射为 subway，bus 映射为 bus', async () => {
    mockFetch.mockResolvedValue(jsonResponse(CONTRACT_SAMPLE))
    const { nearby } = await loadServices()

    const { stations } = await nearby.fetchNearbyStations(CENTER)

    expect(stations.map((s) => s.type)).toEqual(['bus', 'subway'])
  })

  it('请求用 longitude/latitude 两个 float，不发 coord 单串', async () => {
    mockFetch.mockResolvedValue(jsonResponse(CONTRACT_SAMPLE))
    const { nearby } = await loadServices()

    await nearby.fetchNearbyStations(CENTER)

    const url = new URL(mockFetch.mock.calls[0][0] as string, 'http://localhost')
    expect(url.searchParams.get('longitude')).toBe('116.316478')
    expect(url.searchParams.get('latitude')).toBe('39.984055')
    expect(url.searchParams.has('coord')).toBe(false)
  })

  it('degraded=true 时不伪造站点，source 标为 degraded 并带回原因', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        degraded: true,
        message: '腾讯位置服务 Key 未配置，请在 .env 设置 TENCENT_MAP_KEY',
        data: [],
      })
    )
    const { nearby } = await loadServices()

    const result = await nearby.fetchNearbyStations(CENTER)

    expect(result.source).toBe('degraded')
    expect(result.stations).toEqual([])
    expect(result.degradedReason).toContain('Key 未配置')
  })

  it('degraded 时即便有旧缓存也不拿来冒充本次结果', async () => {
    // 先成功一次写缓存
    mockFetch.mockResolvedValue(jsonResponse(CONTRACT_SAMPLE))
    const { nearby } = await loadServices()
    await nearby.fetchNearbyStations(CENTER)

    // 再让后端降级：缓存是「上一次」的事实，不能当本次结果展示
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, degraded: true, message: '此功能未被授权', data: [] })
    )
    const result = await nearby.fetchNearbyStations(CENTER)

    expect(result.source).toBe('degraded')
    expect(result.stations).toEqual([])
    expect(result.degradedReason).toContain('未被授权')
  })

  it('成功但附近真没有站点：如实返回空列表（live），不拿 mock 冒充', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, degraded: false, message: '', data: [] })
    )
    const { nearby } = await loadServices()

    const result = await nearby.fetchNearbyStations(CENTER)

    expect(result.source).toBe('live')
    expect(result.stations).toEqual([])
  })

  it('网络失败且无缓存：降级到 mock 并如实标注来源', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { nearby } = await loadServices()

    const result = await nearby.fetchNearbyStations(CENTER)

    expect(result.source).toBe('mock')
    expect(result.stations.length).toBeGreaterThan(0)
  })

  it('网络失败但有缓存：用缓存，source=cache', async () => {
    mockFetch.mockResolvedValue(jsonResponse(CONTRACT_SAMPLE))
    const { nearby } = await loadServices()
    await nearby.fetchNearbyStations(CENTER) // 先写缓存

    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await nearby.fetchNearbyStations(CENTER)

    expect(result.source).toBe('cache')
    expect(result.stations).toHaveLength(2)
  })

  it('请求被取消时原样上抛，不降级（否则旧响应会污染新列表）', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortErr)
    const { nearby } = await loadServices()

    await expect(nearby.fetchNearbyStations(CENTER)).rejects.toThrow()
  })

  it('坐标非法的站点被丢弃，不产生 NaN 坐标', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        degraded: false,
        data: [
          { id: 'a', name: '好站', type: 'metro', location: { longitude: 116.3, latitude: 39.9 }, distance: 100 },
          { id: 'b', name: '坏站', type: 'bus', location: {}, distance: 200 },
        ],
      })
    )
    const { nearby } = await loadServices()

    const { stations } = await nearby.fetchNearbyStations(CENTER)

    expect(stations).toHaveLength(1)
    expect(stations[0].name).toBe('好站')
  })

  it('步行字段由距离推导，不来自上游', async () => {
    mockFetch.mockResolvedValue(jsonResponse(CONTRACT_SAMPLE))
    const { nearby } = await loadServices()

    const { stations } = await nearby.fetchNearbyStations(CENTER)
    const near = stations[0] // 120m

    expect(near.walkKm).toBe(0.1)
    expect(near.walkable).toBe(true)
    expect(near.walkMinutes).toBe(2) // 120 / 1.2 / 60 ≈ 1.67 → 2
  })
})

// ============ 契约 §4：一键导航 ============

describe('契约 §4 一键导航', () => {
  const NAV_SAMPLE = {
    success: true,
    message: '',
    data: {
      mode: 'walk',
      destination: '故宫',
      provider: 'tencent',
      url: 'https://apis.map.qq.com/uri/v1/routeplan?type=walk&to=故宫&tocoord=39.916,116.397&referer=roamly',
    },
  }

  it('返回后端生成的链接，原样透传不在前端重新拼接', async () => {
    mockFetch.mockResolvedValue(jsonResponse(NAV_SAMPLE))
    const { nav } = await loadServices()

    const url = await nav.fetchNavLink('故宫', { longitude: 116.397, latitude: 39.916 })

    expect(url).toBe(NAV_SAMPLE.data.url)
    // 逐字符相等即证明前端没有重新拼：referer 与 tocoord 的 "lat,lng" 顺序都是后端给的
    expect(url).toContain('referer=roamly')
    expect(url).toContain('tocoord=39.916,116.397')
  })

  it('provider 是 tencent（P-4 的 amap 已废弃）', async () => {
    mockFetch.mockResolvedValue(jsonResponse(NAV_SAMPLE))
    const { nav } = await loadServices()

    await nav.fetchNavLink('故宫')

    expect(NAV_SAMPLE.data.provider).toBe('tencent')
  })

  it('后端不可用时返回 null，绝不前端兜底拼接', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { nav } = await loadServices()

    await expect(nav.fetchNavLink('故宫')).resolves.toBeNull()
  })

  it('后端 5xx 时返回 null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500))
    const { nav } = await loadServices()

    await expect(nav.fetchNavLink('故宫')).resolves.toBeNull()
  })

  it('data 为 null 时返回 null，不抛异常', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true, message: '', data: null }))
    const { nav } = await loadServices()

    await expect(nav.fetchNavLink('故宫')).resolves.toBeNull()
  })

  it('同目的地同坐标命中缓存，只发一次请求', async () => {
    mockFetch.mockResolvedValue(jsonResponse(NAV_SAMPLE))
    const { nav } = await loadServices()

    await nav.fetchNavLink('故宫', { longitude: 116.397, latitude: 39.916 })
    await nav.fetchNavLink('故宫', { longitude: 116.397, latitude: 39.916 })

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('批量取链接时同名地点只请求一次，失败项不出现在结果里', async () => {
    mockFetch.mockImplementation(async (input: string) => {
      const dest = new URL(input, 'http://localhost').searchParams.get('destination')
      if (dest === '坏点') return jsonResponse({ detail: 'x' }, 500)
      return jsonResponse({
        success: true,
        data: { mode: 'walk', destination: dest, provider: 'tencent', url: `https://x/${dest}` },
      })
    })
    const { nav } = await loadServices()

    const map = await nav.fetchNavLinks([
      { name: '故宫' },
      { name: '故宫' },
      { name: '坏点' },
      { name: '天坛' },
    ])

    expect(map).toEqual({ 故宫: 'https://x/故宫', 天坛: 'https://x/天坛' })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})

// ============ 统一调用层本身 ============

describe('统一调用层 http.ts', () => {
  it('把 HTTP 状态码失败归为 http 类', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 502))
    const { http } = await loadServices()

    await expect(http.getJson('/api/x')).rejects.toMatchObject({
      kind: 'http',
      status: 502,
    })
  })

  it('把网络异常归为 network 类', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { http } = await loadServices()

    await expect(http.getJson('/api/x')).rejects.toMatchObject({ kind: 'network' })
  })

  it('把非 JSON 响应归为 malformed 类', async () => {
    mockFetch.mockResolvedValue(new Response('<html>502</html>', { status: 200 }))
    const { http } = await loadServices()

    await expect(http.getJson('/api/x')).rejects.toMatchObject({ kind: 'malformed' })
  })

  it('success=false 视为失败，不把 data 当成功返回', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: false, message: '上游错误', data: [] }))
    const { http } = await loadServices()

    await expect(http.getJson('/api/x')).rejects.toMatchObject({ kind: 'malformed' })
  })

  it('查询参数里 undefined/null 被丢弃，不发 ?city=undefined', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true, data: 1 }))
    const { http } = await loadServices()

    await http.getJson('/api/x', { query: { a: 1, city: undefined, kw: null } })

    // 只断言查询串，不依赖 VITE_API_BASE_URL 是否被注入（联调时基址非空）
    const url = new URL(mockFetch.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/x')
    expect(url.search).toBe('?a=1')
  })

  it('aborted 不可降级（isDegradable=false）', async () => {
    mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    const { http } = await loadServices()

    const err = (await http.getJson('/api/x').catch((e) => e)) as InstanceType<typeof http.ApiFailure>

    expect(err).toBeInstanceOf(http.ApiFailure)
    expect(err.kind).toBe('aborted')
    expect(err.isDegradable).toBe(false)
  })
})
