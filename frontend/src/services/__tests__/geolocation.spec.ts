/**
 * 定位服务的契约测试。
 *
 * 这里测的不是「能不能拿到位置」（那取决于用户授权与设备），而是两件单测能锁住、
 * 出错又极难靠肉眼发现的事：
 *
 * 1. **坐标系转换**。浏览器给 WGS-84，契约 §1.1 要 GCJ-02。转错或漏转不会报错，
 *    只会让附近站点整体偏移几百米 —— 列表照样有数据、排序照样正常，看起来完全正常。
 *    所以这里用已知地标的公开对照值做锚点。
 * 2. **失败分类**。四种失败（不支持/非安全上下文/拒绝/超时）用户能做的事完全不同，
 *    合并成一个「定位失败」等于让用户无从下手。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentLocation,
  isOutOfChina,
  LocateFailure,
  wgs84ToGcj02,
  type LocateFailureKind,
} from '@/services/geolocation'

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('WGS-84 → GCJ-02', () => {
  /*
   * 锚点：用国测局算法的独立参考实现（Python 版，逐行对照）算出的期望值。
   * 偏移量 360–620 米 —— 如果哪天算法写反（GCJ→WGS 而不是 WGS→GCJ），
   * 结果会朝反方向偏，这些断言会立刻失败。
   *
   * 注意纬度偏移**不是**恒正的：上海/广州/成都都是负的（GCJ 点在南边）。
   * 一开始我按「境内恒向东偏北」写断言，实测三个城市全挂 —— 这个方向特征不存在。
   */
  const CASES = [
    { name: '天安门', wgs: { longitude: 116.391248, latitude: 39.907151 }, gcj: { longitude: 116.397489, latitude: 39.908552 } },
    { name: '上海人民广场', wgs: { longitude: 121.4737, latitude: 31.2304 }, gcj: { longitude: 121.478223, latitude: 31.228458 } },
    { name: '广州', wgs: { longitude: 113.2644, latitude: 23.1291 }, gcj: { longitude: 113.269730, latitude: 23.126423 } },
    { name: '成都', wgs: { longitude: 104.0665, latitude: 30.5723 }, gcj: { longitude: 104.069005, latitude: 30.569846 } },
  ]

  CASES.forEach(({ name, wgs, gcj }) => {
    it(`${name}：与参考实现一致（6 位小数内）`, () => {
      const got = wgs84ToGcj02(wgs)
      expect(got.longitude).toBeCloseTo(gcj.longitude, 6)
      expect(got.latitude).toBeCloseTo(gcj.latitude, 6)
    })

    it(`${name}：偏移量在 200–1000 m 量级`, () => {
      const got = wgs84ToGcj02(wgs)
      const dLngM =
        (got.longitude - wgs.longitude) * 111000 * Math.cos((wgs.latitude * Math.PI) / 180)
      const dLatM = (got.latitude - wgs.latitude) * 111000
      const distance = Math.sqrt(dLngM * dLngM + dLatM * dLatM)
      // 漏转 = 0 m；转反 = 同量级但方向错（由上面的 6 位小数断言兜住）
      expect(distance).toBeGreaterThan(200)
      expect(distance).toBeLessThan(1000)
      // 经度偏移恒为正（东偏），这一条在实测的四个城市都成立
      expect(got.longitude).toBeGreaterThan(wgs.longitude)
    })
  })

  it('境外原样返回：GCJ-02 偏移只在境内成立，境外硬转会把坐标推偏几百米', () => {
    const tokyo = { longitude: 139.6917, latitude: 35.6895 }
    expect(isOutOfChina(tokyo)).toBe(true)
    expect(wgs84ToGcj02(tokyo)).toEqual(tokyo)
  })

  it('非法坐标抛 LocateFailure，不返回 NaN 让下游自己崩', () => {
    expect(() => wgs84ToGcj02({ longitude: Number.NaN, latitude: 39.9 })).toThrow(LocateFailure)
  })
})

describe('定位失败分类', () => {
  const stubGeolocation = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) => {
    vi.stubGlobal('window', { isSecureContext: true })
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => impl(ok, fail),
      },
    })
  }

  const expectFailure = async (kind: LocateFailureKind) => {
    await expect(getCurrentLocation()).rejects.toMatchObject({ name: 'LocateFailure', kind })
  }

  it('浏览器没有 geolocation → unsupported', async () => {
    vi.stubGlobal('window', { isSecureContext: true })
    vi.stubGlobal('navigator', {})
    await expectFailure('unsupported')
  })

  it('非安全上下文（http 线上域名）→ insecure，而不是含混的 denied', async () => {
    vi.stubGlobal('window', { isSecureContext: false })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } })
    await expectFailure('insecure')
  })

  it('用户拒绝授权（code=1）→ denied', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1, message: 'denied' } as GeolocationPositionError))
    await expectFailure('denied')
  })

  it('定位服务不可用（code=2）→ unavailable', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 2, message: 'unavailable' } as GeolocationPositionError))
    await expectFailure('unavailable')
  })

  it('超时（code=3）→ timeout', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 3, message: 'timeout' } as GeolocationPositionError))
    await expectFailure('timeout')
  })

  it('成功时返回 GCJ-02（不是浏览器原样的 WGS-84），并保留精度与时间戳', async () => {
    stubGeolocation((ok) =>
      ok({
        coords: { longitude: 116.391248, latitude: 39.907151, accuracy: 35 },
        timestamp: 1700000000000,
      } as GeolocationPosition)
    )

    const result = await getCurrentLocation()
    expect(result.location.longitude).toBeCloseTo(116.397489, 6)
    expect(result.location.latitude).toBeCloseTo(39.908552, 6)
    expect(result.accuracy).toBe(35)
    expect(result.timestamp).toBe(1700000000000)
  })
})
