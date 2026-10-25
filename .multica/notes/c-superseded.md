## 分支已被契约取代，能力已进 PR #1

本单的代码分支（`agent/agent/poll-XXX`）**不合并、不 rebase**，按 `docs/r1/MERGE-PLAN.md` 处置。

**原因**：5 条后端分支各自"从零新建" `TencentMapService`，没有一条基于前一条扩展，逐条合并必然出现重复类定义。契约分支已覆盖本单全部能力，且用真实 Key 响应定稿。

**能力落地位置**（PR #1：https://github.com/Guyungy/Roamly-AI/pull/1，分支 `r1/tencent-map-contract`）：

| 能力 | 实现 |
|---|---|
| 公交换乘 | `tencent_map_service.parse_transit` + `GET /api/map/transit` |
| 附近站点 | `tencent_map_service.parse_nearby_stations` + `GET /api/map/nearby-station` |
| 一键导航 | `build_nav_url` + `GET /api/map/nav-link` |
| 地理编码 / POI 检索 | `client.geocode` / `client.search_place` |

分支保留在本地与远端作历史留痕，避免重复劳动。
