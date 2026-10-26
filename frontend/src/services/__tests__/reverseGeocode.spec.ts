/**
 * 逆地理编码的降级契约。
 *
 * 这个接口不是「关键路径」——定位已经成功了，地名只是锦上添花。所以它**永远不抛错**：
 * 没配高德 Key（后端 500）、后端没起、返回空字段，一律退到 null，让 UI 只显示
 * 「我的位置」。这条如果破了，用户会遇到「定位成功但整个面板报错」。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPlaceLabel, reverseGeocode } from '@/services/reverseGeocode'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  mockFetch.mockReset()
  vi.resetModules()
})

describe('reverseGeocode', () => {
  it('正常返回时压成 city / district / address / province', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { city: '北京', district: '东城区', address: '东长安街', province: '北京' },
      })
    )
    const geo = await reverseGeocode(116.397489, 39.908552)
    expect(geo).toEqual({ city: '北京', district: '东城区', address: '东长安街', province: '北京' })
    expect(formatPlaceLabel(geo)).toBe('北京 · 东城区')
  })

  it('后端 500（没配高德 Key）→ 返回 null，不抛错', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: '高德地图 API Key 未配置' }, 500))
    await expect(reverseGeocode(116.4, 39.9)).resolves.toBeNull()
  })

  it('网络断开 → 返回 null', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(reverseGeocode(116.4, 39.9)).resolves.toBeNull()
  })

  it('字段全空视为没查到，返回 null 而不是一个空对象', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { city: '', district: '', address: '', province: '' } })
    )
    await expect(reverseGeocode(116.4, 39.9)).resolves.toBeNull()
  })

  it('同一坐标只请求一次（进程内缓存）', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: true, data: { city: '上海', district: '黄浦区', address: '', province: '上海' } })
    )
    await reverseGeocode(121.478223, 31.228458)
    await reverseGeocode(121.478223, 31.228458)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('非法坐标不发请求', async () => {
    await expect(reverseGeocode(Number.NaN, 39.9)).resolves.toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('formatPlaceLabel', () => {
  it('没有市/区时退到完整地址', () => {
    expect(formatPlaceLabel({ city: '', district: '', address: '某条路 1 号', province: '北京' })).toBe(
      '某条路 1 号'
    )
  })

  it('null 返回空串（调用方据此保留「我的位置」四个字）', () => {
    expect(formatPlaceLabel(null)).toBe('')
  })
})
