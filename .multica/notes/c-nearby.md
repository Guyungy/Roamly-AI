## 能力已由契约分支交付（PR #1）

- `tencent_map_service.parse_nearby_stations` —— 纯解析，无网络
- `tencent_map_client.TencentMapService.nearby_station` —— 60s 坐标缓存 + 降级
- `GET /api/map/nearby-station?longitude=&latitude=&radius=&keyword=`

**契约要点**：`data` 恒为数组（废弃 `NearbyStationData` 对象包装）；`type` 取 `metro/bus/other`；`degraded=true` 表示上游没给，不等于附近没有。

**实测新增一条**：`keyword` 是单串精确匹配，`"地铁站,公交站"` 只回公交站，地铁站整类丢失。必须逐个检索后合并 —— 中关村同坐标实测 23 条（bus×20 + metro×3），单查 `地铁站` 只有 3 条。

PR：https://github.com/Guyungy/Roamly-AI/pull/1
