## 已并入 PR #1

`navLink.ts` 重写为调 `GET /api/map/nav-link`（契约 §4 唯一实现），前端不再出现 `apis.map.qq.com` 字面量：

- 挂载后按行程景点/酒店批量取链接（同名去重、并发 4、会话内缓存）
- 取不到就不渲染按钮，不做前端兜底拼接
- 默认出行方式 `drive` → `walk`，与后端 `build_nav_url` 的 walk 语义对齐

PR：https://github.com/Guyungy/Roamly-AI/pull/1

**验证**：`npm run build` 通过、`vue-tsc --noEmit` 零错误。后端 `test_nav_link_always_works_without_key` 断言 `provider=tencent` 且 URL 含 `apis.map.qq.com`。
