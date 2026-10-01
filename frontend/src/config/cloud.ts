/**
 * 云服务公开配置（publicConfig）
 *
 * 这三个值来自本应用开通云服务时服务端返回的 publicConfig，是唯一可以随前端代码下发的凭据。
 * 约束（不要改）：
 * - 不要改成环境变量、不要从 window.location 推导、不要另写猜的域名；
 *   endpoint 必须是 publicConfig 里返回的那个，重新发布后要同步更新本文件。
 * - publishableKey 只用于标识"是哪个应用"，本身不带权限；真正的访问控制由
 *   服务端按 Origin 精确校验 + 数据库 RLS 完成。
 * - resourceId / 环境内部 ID 之外的任何长期密钥都不得出现在前端代码里。
 */
export const cloudPublicConfig = {
  resourceId: 'wbcs_jdzNfRfiSTb9g2bMhEf5v3',
  endpoint: 'https://roamly-ai-trip-planner.app.workbuddy.host',
  publishableKey: 'wbpk_GDkgA3kTiWoQR3GI2XYwBt_Fjw8wt3ewpHwLueaZ7oOy1bu10wyIuJ7',
} as const

/**
 * 是否配置了自建后端（backend/ 多智能体服务）。
 * 配置了 VITE_API_BASE_URL 时，行程生成 / AI 问答优先走自建后端；
 * 未配置（线上默认）则走云服务的模型能力。
 */
export const hasOwnBackend = Boolean(import.meta.env.VITE_API_BASE_URL)
