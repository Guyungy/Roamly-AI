import type { TripPlan } from './index'

/**
 * 云数据库表 `trip_plans` 的列定义。
 *
 * 这里手写的是运行时的真实列，不是"生成的 schema"，但形状与 supabase 生成的一致，
 * 这样才能作为泛型传给 createWorkBuddyCloud，让 from()/insert() 拿到正确的类型。
 * 表结构变更（加列/改类型）时，本文件要同步改。
 */
export interface TripPlanRow {
  id: number
  owner_id: string
  title: string
  city: string
  start_date: string | null
  end_date: string | null
  travel_days: number | null
  plan: TripPlan
  created_at: string
}

/**
 * 插入时**故意不含 owner_id**：该列有 DEFAULT auth.uid()，
 * 由服务端填值，客户端手动传会被 INSERT 策略的 WITH CHECK 拒绝。
 */
export type TripPlanInsert = Omit<TripPlanRow, 'id' | 'owner_id' | 'created_at'>

export interface CloudDatabase {
  public: {
    Tables: {
      trip_plans: {
        Row: TripPlanRow
        Insert: TripPlanInsert
        Update: Partial<TripPlanInsert>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
