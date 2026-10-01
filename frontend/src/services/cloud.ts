import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { cloudPublicConfig } from '@/config/cloud'
import type { CloudDatabase } from '@/types/cloud'

/**
 * 云服务客户端 —— 全应用只初始化一次，Auth / Database / Storage / LLM 共用同一个实例。
 *
 * endpoint 与 publishableKey 都必须传入，且只能取自 publicConfig（见 @/config/cloud）。
 * 首次登录后，共享的请求层会自动把当前会话带给后续的数据库请求，业务代码不需要手动塞 token。
 *
 * 泛型传入 CloudDatabase 后 `cloud.database.from('trip_plans')` 才是强类型的；
 * 不传也能跑，但行的类型会退化成 never[]，编译期就写不进数据。
 */
export const cloud = createWorkBuddyCloud<CloudDatabase>({
  endpoint: cloudPublicConfig.endpoint,
  publishableKey: cloudPublicConfig.publishableKey,
})
