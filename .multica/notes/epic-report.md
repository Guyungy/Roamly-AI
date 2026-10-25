## R1 交付闭环：契约已进 main，两条 PR 已合并

**结论：10 个 done 中此前"只在分支上、main 上为零"的缺口已补上。** main 现在有腾讯地图的完整实现，且是唯一一份。

| PR | 内容 | 状态 |
|---|---|---|
| [#1](https://github.com/Guyungy/Roamly-AI/pull/1) | 冻结契约 + 收编 poll-159 站点列表 / poll-161 一键导航 + 清运行产物 | merged `f5f01b1` |
| [#2](https://github.com/Guyungy/Roamly-AI/pull/2) | 修合并引入的占位层遮挡回归 | merged `7b081b5` |

### 一、合并方案执行结果

按 `docs/r1/MERGE-PLAN.md`：**删分支、留契约**，不逐条 rebase。

| 分支 | 处置 | 单号 |
|---|---|---|
| poll-152 / 153 / 157 / 158 | 能力已被契约覆盖，不合并 | POLL-152/153/157/158 |
| poll-160 | 已收编（geocode / search_place / nav_link） | POLL-160 |
| poll-159 / 161 | 前端已收编并改参数 | POLL-159/161 |

理由不变：5 条后端分支各自从零新建 `TencentMapService`，逐条合并必然出现重复类定义。契约分支的 3 个文件（`tencent_map_service.py` 纯解析 / `tencent_map_client.py` HTTP+限流+缓存 / `r1_map.py` 三端点）已覆盖全部能力。

### 二、验证（真实 Key，非 mock）

```
pytest tests/ -q                       # 26 passed, 4 skipped（无 Key 降级路径）
TENCENT_MAP_KEY=... pytest tests/ -q   # 28 passed, 2 skipped（真打上游）
frontend: npm run build ✓  vue-tsc --noEmit ✓
miniapp:  npm run build:mp-weixin ✓ Build complete
```

三个端点在生产形态（uvicorn + Vite 代理）下实测：

| 端点 | 结果 |
|---|---|
| `GET /api/map/transit` | 5 个方案；首个 17835m / 4800s / ¥5.0 / 换乘 1 次 → 3.72 m/s |
| `GET /api/map/nearby-station` | degraded=false，按距离升序 |
| `GET /api/map/nav-link` | `provider=tencent`，`tocoord` 为 `lat,lng` |

浏览器端（Playwright，高德不可用场景）：站点面板 25 条（公交 20 + 地铁 5），一键导航链接来自后端，前端 bundle 内无 `apis.map.qq.com` 字面量。

### 三、过程中发现并修掉的回归

合并 poll-159 后 `.map-stations` 挂进 `.map-card`，`.map-placeholder` 的 `inset:0` 基准从画布变成整卡 —— 高德不可用时占位层 3122px 把 2646px 的站点面板整块盖掉。`elementFromPoint` 命中的是占位层而非站点行。已用 `.map-canvas-wrap` 收口（PR #2）。

**这条只有真在浏览器里跑才能发现**，单测与构建都不会报错。

### 四、剩余未闭环项

| 项 | 状态 | 说明 |
|---|---|---|
| POLL-154 T1.4 前端换乘展示 | todo | 后端 `/api/map/transit` 已就绪，前端未接 |
| POLL-150 P-5 前端统一调用层 | todo | 事实已被 poll-159/161 绕过，建议重定义为"收口"而非"新建" |
| POLL-146 Key 签收 | in_review | 生产/测试配额归属仍未确认 |
| 小程序 lockfile 不同步 | 预先存在 | `npm ci` 报 EUSAGE，需 `npm install` 重建；非本轮引入 |

