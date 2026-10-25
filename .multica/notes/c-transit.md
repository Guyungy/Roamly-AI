## 能力已由契约分支交付（PR #1）

本单 Service 封装与 REST 路由的最终形态：

- `tencent_map_service.parse_transit` —— 纯解析换算，无网络，可单测
- `tencent_map_client.TencentMapService.transit` —— HTTP + 限流 QPS≤8 + 降级
- `GET /api/map/transit` —— `r1_map.py`

**实测纠正的三处口径错误**（mock 测不出来）：

| 事实 | 若不修 |
|---|---|
| `direction/v1` 的 `duration` 是**分钟**，`distance/v1/matrix` 才是秒 | 中关村→天安门算成 223 m/s |
| `TRANSIT` 段的 `distance`/`duration` 在 step 层为 `null`，真值在 `lines[0]` | 每个乘车段显示 0 米 |
| `lines[].price` 实测为 `-1`（无票价），route 层 `price` 单位是分 | 票价显示 -0.01 元 |

有 Key 时断言物理合理性：17835m / 4800s → 3.72 m/s。

PR：https://github.com/Guyungy/Roamly-AI/pull/1
