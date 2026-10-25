# R1 分支合并方案

> 结论：**15 条分支不需要"解冲突"，需要"删分支、留契约"。**
> 契约分支已覆盖全部后端能力，冲突文件全部是可丢弃的自造实现。

## 一、实测数据

### 1.1 分支真实差异

15 条 agent 分支里，前端大改（`Result.vue` +2662 行、`Landing.vue` +832 行等）
是**所有分支共享的同一份基线噪音**，不是各分支的工作成果。

实测：`poll-152` 与 `poll-157` 之间只差 **6 个文件**：

```
backend/.env.example                          3+/4-
backend/app/config.py                         1+/1-
backend/app/models/schemas.py                 9+/51-
backend/app/services/tencent_map_service.py   261+/219-
backend/tests/test_tencent_nearby.py          154+/0
backend/tests/test_tencent_transit.py         0/258-
```

### 1.2 各分支后端真实产出

| 分支 | 任务 | 后端文件 | 服务方法 | 处置 |
|---|---|---|---|---|
| poll-149 | P-4 契约 | `routes/transit.py` 骨架 | 无 | **已被契约取代** |
| poll-152 | T1.2 | service + schemas | `transit_plan` | **删**，`parse_transit` 已覆盖 |
| poll-153 | T1.3 | service + route | `transit_plan` | **删**，同上 |
| poll-157 | T2.2 | service + schemas | `nearby_station` | **删**，`parse_nearby_stations` 已覆盖 |
| poll-158 | T2.3 | service + route | `nearby_station` | **删**，同上 |
| poll-160 | T3.2 | service | `search_poi`/`geocode`/`build_nav_link` | **已收编**，方法已在契约版实现 |
| poll-159 | T1.4 | 前端 | — | 保留前端，改接口对齐 |
| poll-161 | T3.1 | 前端 | — | 保留前端，删自拼导航 URL |

### 1.3 冲突面（用契约分支作基线实测）

```
merge poll-152 → CONFLICT  .env.example, config.py, schemas.py, tencent_map_service.py
merge poll-153 → CONFLICT  .env.example, config.py, tencent_map_service.py
merge poll-157 → CONFLICT  .env.example, config.py, tencent_map_service.py
merge poll-158 → CONFLICT  .env.example, config.py, tencent_map_service.py
merge poll-160 → CONFLICT  .env.example, config.py, tencent_map_service.py
merge poll-159 → CONFLICT  i18n × 3, Result.vue, miniapp result/index.vue
merge poll-161 → CONFLICT  i18n × 3, Result.vue
```

**所有冲突文件都是"每人都从零新建同一批文件"造成的**，不是并行修改同一份代码。

## 二、处置方案

### 后端：0 个 PR，0 行冲突

契约分支（`agent/agent/chat-a03fb1329191`）已是后端唯一实现：

| 能力 | 契约分支 | 原分支 |
|---|---|---|
| 公交换乘 | `parse_transit` + `GET /api/map/transit` | 152/153 |
| 附近站点 | `parse_nearby_stations` + `GET /api/map/nearby-station` | 157/158 |
| 一键导航 | `build_nav_url` + `GET /api/map/nav-link` | 160 |
| 地理编码 | `parse_geocode` + `client.geocode` | 160 |
| POI 检索 | `parse_place_search` + `client.search_place` | 160 |

**动作**：5 条后端分支标记为「已被契约取代」，不合并、不 rebase。
保留分支仅作历史留痕，避免重复劳动。

### 前端：2 个 PR，冲突可机械解决

前端分支的价值在 UI 与交互，不在数据层。两处必须改：

1. **`frontend/src/services/nearbyStation.ts`**
   当前按 `payload.data` 数组解析——**这与契约一致，无需改**。
   但请求参数要从 `coord="lng,lat"` 改为 `longitude` + `latitude` 两个参数。
   这是 poll-158 踩坑点：腾讯上游是 `"lat,lng"`，单串最易串位。

2. **删除前端自拼导航 URL**
   `poll-161` 在 `frontend/src/` 里自己拼 `apis.map.qq.com/uri/v1/routeplan`，
   与后端 `build_nav_url` 重复。改为调 `GET /api/map/nav-link`。

冲突解决方式：i18n 三个 JSON 与 `Result.vue` 的冲突是"两边各加了键"，
**取并集**即可，不需要人工判断业务逻辑。

## 三、执行顺序

```
① 契约分支 → main                     （已完成，待 PR）
② poll-159 前端 → 改参数 → PR          （冲突：取并集）
③ poll-161 前端 → 删自拼 URL → PR      （冲突：取并集）
④ 后端 5 条分支 → 打标签「已被契约取代」，关闭对应 issue
```

**① 必须先合**，否则 ②③ 会按旧契约写前端，再返工一次。

## 四、代价对比

| 方案 | 工作量 | 风险 |
|---|---|---|
| 按本方案（删分支留契约） | 契约已完成；前端 2 个 PR 约 0.5 人日 | 低。后端零冲突，前端仅取并集 |
| 逐条 rebase 合并 7 条分支 | 约 2 人日 | 高。每条约 3 处冲突，且合并后出现重复类定义 |
| 继续放任 | 0 | 极高。冲突成本按天增长，且 10 个 done 无法验证 |

## 五、验收

后端：
```bash
cd backend
pytest tests/ -q                                   # 27 passed（无 Key 时降级路径）
TENCENT_MAP_KEY=<key> pytest tests/ -q             # 27 passed + 3 真实上游
```

前端（②③ 合并后）：
- 附近站点列表非空，且 `data` 为数组（不再是 mock 兜底）
- 导航按钮跳转 URL 来自后端，前端无硬编码 `apis.map.qq.com`

## 六、遗留风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 前端 2 条分支仍基于旧契约 | 合并后字段对不上 | ②③ 在 ① 之后执行，按新契约改参数 |
| 腾讯日 PV 上限 11000 | 高并发下被限流 | 已实现 60s 坐标缓存 + QPS≤8 限流 |
| `TRANSIT` 段多线路只取 `lines[0]` | 备选线路丢失 | 当前产品不需要；如需，扩契约 `alternatives` 字段 |
| Key 是生产还是测试未确认 | 可能消耗生产配额 | 见 POLL-146 签收清单 |
