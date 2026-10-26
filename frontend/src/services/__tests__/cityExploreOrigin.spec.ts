/**
 * 城市探索检索原点（契约 §5）。
 *
 * 锁的是「定位兜底不显示」那个 bug 的根因：逆地理编码查不到城市名时，
 * 坐标必须能顶上来当检索原点，否则请求跑完了界面还是「尚未确定城市」。
 */

import { describe, expect, it } from 'vitest'
import { hasExploreOrigin, resolveExploreOrigin } from '@/services/cityExploreOrigin'

const BEIJING = { longitude: 116.4074, latitude: 39.9042 }

describe('城市探索检索原点', () => {
  it('只有行程目的地城市时用它', () => {
    const origin = resolveExploreOrigin('杭州', '', null)
    expect(origin).toEqual({ city: '杭州', center: null })
    expect(hasExploreOrigin(origin)).toBe(true)
  })

  it('定位到的城市压过行程目的地（用户显式要看自己的城市）', () => {
    const origin = resolveExploreOrigin('杭州', '成都市', null)
    expect(origin.city).toBe('成都市')
  })

  it('没有城市名时坐标兜底 —— 定位成功就不该显示「尚未确定城市」', () => {
    const origin = resolveExploreOrigin(undefined, '', BEIJING)
    expect(origin.city).toBe('')
    expect(origin.center).toEqual(BEIJING)
    expect(hasExploreOrigin(origin)).toBe(true)
  })

  it('城市名与坐标不同时发：城市名更准，后端拿它查城市中心', () => {
    const origin = resolveExploreOrigin('杭州', '', BEIJING)
    expect(origin.city).toBe('杭州')
    expect(origin.center).toBeNull()
  })

  it('目的地城市为空串/空白时当作没有', () => {
    expect(hasExploreOrigin(resolveExploreOrigin('   ', '', null))).toBe(false)
    expect(hasExploreOrigin(resolveExploreOrigin(undefined, '', null))).toBe(false)
  })

  it('城市名两端空白被裁掉', () => {
    expect(resolveExploreOrigin(' 杭州 ', '', null).city).toBe('杭州')
  })
})
