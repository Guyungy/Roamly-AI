# R1 地图能力数据契约（唯一事实源）

> 状态：**已冻结**（2026-10-25，基于真实 Key 实测）
> 适用范围：公交换乘 / 附近站点 / 一键导航
> 事实源：`backend/app/models/schemas.py` 的 `R1 地图契约` 段
> 证据：`backend/tests/fixtures/tencent/*.json`（腾讯真实响应，已剔除 polyline 与 request_id）

本文件是**唯一**契约。任何分支若与本文件冲突，一律以本文件为准，分支侧模型视为废弃。

---

## 0. 为什么需要这份文件

POLL-149 / 152 / 153 / 157 / 158 五条分支各自定义了同名不同形的模型，已实测确认以下事实：

| 分支 | 模型 | 与事实源的关系 |
|---|---|---|
| POLL-149 (P-4) | `TransitRoute{origin,destination,distance,duration,cost,steps}` / `NearbyStation{id,name,location,line,distance}` | 结构最接近，但**缺**多方案、换乘次数、票价语义 |
| POLL-152 (T1.2) | `TransitRoute{mode,distance,duration,transfers,fare,segments}` / `TransitLine` / `StationInfo` | 命名与 P-4 冲突 |
| POLL-153 (T1.3) | `TransitPlan` / `TransitSegment` / `TransitStep` | **第三套**命名 |
| POLL-157 (T2.2) | `NearbyStation{id,name,location,line,distance}` | 与 P-4 一致 |
| POLL-158 (T2.3) | `NearbyStation{name,type,distance_m,longitude,latitude}` + `NearbyStationData` | **破坏性替换**，`data` 由数组变对象 |

**结论**：POLL-153 的 `TransitPlan/TransitSegment`、POLL-158 的 `NearbyStationData` 一律废弃。

---

## 1. 通用约定

### 1.1 坐标
- 全项目统一 `Location{longitude, latitude}`，**GCJ-02**（与高德对齐，腾讯原生即 GCJ-02）。
- 腾讯上游用 `"lat,lng"` 字符串顺序，与 `Location` 字段顺序**相反**，适配层必须显式转换。

### 1.2 腾讯上游 `status`
- `0` = 成功。**非 0 一律视为失败，不得降级为"空列表"冒充成功。**
- 已实测的错误码：

| status | message | 含义 | 我方处理 |
|---|---|---|---|
| 301 | 必要字段key缺少或有多个 | 未配置 Key | 降级 `degraded=true` |
| 311 | key格式错误 | Key 非法 | 降级 `degraded=true`，日志告警 |
| 348 | 参数错误，纬度超出范围 | 入参非法 | **400**，不降级 |
| 113 | 此功能未被授权 | 权限/配额不足 | 降级 `degraded=true`，**告警（非普通降级）** |

### 1.3 单位（本次实测的核心发现）

| 字段 | 单位 | 证据 |
|---|---|---|
| `routes[].distance` | **米** | 与 `distance/matrix` 同路同量级 |
| `routes[].duration` | **分钟** | 17.8km/80 → 3.72 m/s；若按秒则 223 m/s，不可能 |
| `distance/v1/matrix` 的 `duration` | **秒** | 15074m/13703 → 1.10 m/s |
| `routes[].price` | **分** | 500 = 5.00 元（北京中关村→天安门地铁票价） |
| `lines[].price` | **分**，`-1` = 无票价 | 实测为 `-1` |
| `steps[].distance` / `duration` | 米 / 分钟 | 与 route 同口径 |
| `place/v1/search` 的 `_distance` | **米（浮点）** | 实测 732.46 |

> ⚠️ **两个接口的 `duration` 单位不同**（direction 是分钟，matrix 是秒）。这是最容易写错的一处，契约层统一输出 **秒**。

### 1.4 配额与限流（实测响应头）
```
X-Limit: current_qps=1; limit_qps=10; current_pv=3; limit_pv=11000
```
- QPS 上限 **10**，日 PV 上限 **11000**（该 Key 当前档位）。
- 客户端必须限流 ≤ 8 QPS 留余量；附近站点检索需按坐标做短时缓存（建议 60s）。

### 1.5 分页
- `place/v1/search` 的 `page_size` 上限 **20**，传 21 仍返回 20，传 50 报 `113 此功能未被授权`。
- 单次检索最多返回 20 条；需要更多时必须翻页（`page_index`）。

### 1.6 多关键词（本次实测发现）

`keyword` 是**单串精确匹配**，不是"或"关系。以中关村坐标（116.316478, 39.984055）实测：

| 传入 keyword | 返回 | 类型分布 |
|---|---|---|
| `地铁站,公交站` | 6 条 | **bus ×6**，地铁站全部丢失 |
| `地铁站 公交站`（空格） | 6 条 | bus ×6，同上 |
| `地铁站\|公交站` | 6 条 | bus ×6，同上 |
| `地铁站` | 6 条 | metro ×6 |
| `公交站` | 20 条 | bus ×20 |

结论：**多关键词必须由服务端逐个检索再合并去重**，不能把逗号串直接透传给上游。
`tencent_map_client.nearby_station` 已按此实现（按上游 POI id 去重，按距离升序合并）。

---

## 2. 附近站点 `GET /api/map/nearby-station`

### 请求
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `longitude` | float | 是 | 检索中心经度（GCJ-02） |
| `latitude` | float | 是 | 检索中心纬度（GCJ-02） |
| `radius` | int | 否 | 米，默认 1000，上限 5000 |
| `keyword` | str | 否 | 默认 `地铁站`；多关键词用英文逗号，**服务端逐个检索后合并去重** |
| `city` | str | 否 | 提升精度 |

> 请求参数用 **两个 float**，不用 `coord="lng,lat"` 单串——避免与腾讯的 `"lat,lng"` 顺序混淆，这是 POLL-158 的实测踩坑点。

### 响应（`NearbyStationResponse`）
```json
{
  "success": true,
  "degraded": false,
  "message": "",
  "data": [
    {
      "id": "2199027905900",
      "name": "中关村[地铁站]",
      "type": "metro",
      "address": "地铁4号线大兴线",
      "location": { "longitude": 116.316478, "latitude": 39.984055 },
      "distance": 767,
      "lines": ["地铁4号线大兴线"]
    }
  ]
}
```

- **`data` 是数组**（不是对象）。这是与 POLL-158 的关键差异，前端 `Array.isArray(payload.data)` 才能成立。
- `type` 取值：`metro` | `bus` | `other`，由上游 `category` 推导：
  - `基础设施:交通设施:地铁站` → `metro`
  - `基础设施:交通设施:公交车站` → `bus`
- `distance`：整数米，由上游 `_distance`（浮点）四舍五入。
- `lines`：从上游 `address` 字段按逗号切分（腾讯把途经线路放在 `address` 里）。
- `degraded=true` 时 `data=[]`，**绝不伪造站点**。

---

## 3. 公交换乘 `GET /api/map/transit`

### 请求
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `from_longitude` / `from_latitude` | float | 是 | 起点（GCJ-02） |
| `to_longitude` / `to_latitude` | float | 是 | 终点（GCJ-02） |
| `city` | str | 否 | 提升精度 |

### 响应（`TransitResponse`）
```json
{
  "success": true,
  "degraded": false,
  "message": "",
  "data": [
    {
      "distance": 17835,
      "duration": 4800,
      "transfers": 1,
      "fare": 5.0,
      "steps": [
        { "mode": "WALKING", "distance": 948, "duration": 840, "line": "", "from_name": "", "to_name": "", "instruction": "从起点朝北行进37米右转" },
        { "mode": "TRANSIT", "distance": 12883, "duration": 1620, "line": "地铁4号线大兴线", "from_name": "中关村", "to_name": "西单", "instruction": "" }
      ]
    }
  ]
}
```

- **`data` 是数组**（多方案，上游默认返回 5 条）。POLL-149 的 `data` 是单对象，**必须改**。
- `duration` 统一为**秒**（上游分钟 × 60）。
- `fare` 单位**元**，上游分 ÷ 100。
- `transfers` = 乘坐段数 − 1（`WALKING` 不计）。
- `mode` 取值：`WALKING` | `TRANSIT` | `RAILWAY` | `TAXI`（保留上游大写，前端按需映射）。
- 一个 `TRANSIT` 段的上游结构里 `distance`/`duration` 在 `step` 层为 `null`，真实值在 `lines[]` 里——适配层必须从 `lines` 汇总，否则该段长度为 0。**这是 POLL-152/153 都会踩的坑。**

---

## 4. 一键导航 `GET /api/map/nav-link`

```json
{
  "success": true,
  "message": "",
  "data": {
    "mode": "walk",
    "destination": "故宫",
    "provider": "tencent",
    "url": "https://apis.map.qq.com/uri/v1/routeplan?type=walk&to=故宫&tocoord=39.916,116.397&referer=roamly"
  }
}
```

- `provider` 默认 `tencent`（P-4 写的 `amap` 是旧的，已改）。
- 导航链接生成**只保留后端一份**，前端不得自行拼接（POLL-161 重复实现的问题）。

---

## 5. 废弃清单

以下定义在各分支存在，合并时必须删除，不得保留别名：

| 分支 | 废弃符号 |
|---|---|
| POLL-153 | `TransitPlan`、`TransitSegment`、`TransitStep`(153 版)、`TransitResponse` |
| POLL-158 | `NearbyStationData`、`NearbyStation`(158 版)、`NearbyStationResponse`(158 版) |
| POLL-152 | `TransitLine`、`StationInfo`、`TransitRoute`(152 版) |

保留并扩写：POLL-149 的 `TransitRoute` / `NearbyStation` / `NavLink`（即本契约 §2–§4）。

---

## 6. 验收方式

契约不是文档，是可执行的测试。落地在 `backend/tests/test_r1_contract.py`：

1. **形状**：用 §2–§4 的示例 JSON 反序列化，字段齐全、类型正确。
2. **单位**：用 `fixtures/tencent/transit_ok.json` 跑适配层，断言 `duration` 秒数、`fare` 元数、`TRANSIT` 段距离非 0。
3. **错误**：用 `err_bad_key.json` / `err_no_auth.json` / `err_bad_coord.json` 断言各自的处理分支。
4. **前端兼容**：断言 `NearbyStationResponse.data` 是 `list`，与 `frontend/src/services/nearbyStation.ts` 的 `Array.isArray` 一致。

`pytest backend/tests/test_r1_contract.py` 全绿 = 契约达成。
