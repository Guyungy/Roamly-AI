## 已并入 PR #1

前端代码已收编到 `r1/tencent-map-contract`，并按 `docs/r1/CONTRACT.md` 改造数据层：

- 请求参数 `coord="lng,lat"` → `longitude` + `latitude` 两个 float（腾讯上游是 `"lat,lng"`，单串最易串位）
- 识别 `degraded=true`：上游没给 ≠ 附近没有。前者走缓存/mock，后者如实显示空列表
- `type` 先按契约映射 `metro/bus/other`，再兜旧写法
- 补 `VITE_API_BASE_URL` 基址，否则线上永远打到自己域名降级到 mock
- 小程序侧同步同一套参数与降级语义

PR：https://github.com/Guyungy/Roamly-AI/pull/1

**验证**：`npm run build` 通过、`vue-tsc --noEmit` 零错误、`npm run build:mp-weixin` Build complete。
**未验证**：浏览器内真实渲染（需后端 `hello_agents` 依赖，本轮未装）。
