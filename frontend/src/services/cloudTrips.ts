import { cloud } from './cloud'
import type { TripPlan } from '@/types'
import type { TripPlanInsert, TripPlanRow } from '@/types/cloud'

/** 云数据库 trip_plans 表的一行 */
export type SavedTrip = TripPlanRow

const COLUMNS = 'id, title, city, start_date, end_date, travel_days, plan, created_at'

/** 把 Supabase 风格的 { data, error } 信封转成 throw */
function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

/**
 * 用户级数据的登录门禁。
 * 界面上已经按登录态渲染，这里是第二道防线：会话不在就直接拒绝，
 * 绝不用匿名身份或本地假用户去"让查询通过"。
 */
async function requireSession(): Promise<void> {
  const { data, error } = await cloud.auth.getSession()
  if (error || !data) {
    throw new Error('AUTH_REQUIRED')
  }
}

/**
 * 读取当前用户的行程。
 * 数据隔离由数据库 RLS 负责（owner_id = auth.uid()），前端不传 owner_id、也不自行过滤。
 */
export async function listMyTrips(limit = 50): Promise<SavedTrip[]> {
  await requireSession()
  const data = unwrap(
    await cloud.database
      .from('trip_plans')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit)
  )
  return (Array.isArray(data) ? data : []) as SavedTrip[]
}

export async function countMyTrips(): Promise<number> {
  await requireSession()
  const { count } = await cloud.database
    .from('trip_plans')
    .select('id', { count: 'exact', head: true })
  return count ?? 0
}

/**
 * 保存一份行程。
 * 故意不传 owner_id —— 由 owner_id 的 DEFAULT auth.uid() 在服务端填，
 * 手动传会被 INSERT 策略的 WITH CHECK 拒绝。
 */
export async function saveTrip(plan: TripPlan, title: string): Promise<SavedTrip | null> {
  await requireSession()
  const data = unwrap(
    await cloud.database
      .from('trip_plans')
      .insert({
        title,
        city: plan.city,
        start_date: plan.start_date || null,
        end_date: plan.end_date || null,
        travel_days: plan.days?.length ?? null,
        plan,
      } satisfies TripPlanInsert)
      .select(COLUMNS)
  )
  return Array.isArray(data) && data.length > 0 ? (data[0] as SavedTrip) : null
}

/**
 * 删除一份行程。
 * 返回实际删除行数：0 表示这条记录不存在或不属于当前用户（被 RLS 过滤），不是成功。
 */
export async function deleteTrip(id: number): Promise<number> {
  await requireSession()
  const data = unwrap(
    await cloud.database.from('trip_plans').delete().eq('id', id).select('id')
  )
  return Array.isArray(data) ? data.length : 0
}
