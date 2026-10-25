## 浏览器端已验收（Playwright + 真实上游）

站点列表在真实页面里跑通，数据来自后端 `/api/map/nearby-station`，非 mock：

```
25 条 · 公交 20 + 地铁 5 · 按距离升序
海淀桥南[公交站] 163 米 · 步行约 2 分钟
万泉河桥[地铁站] 732 米 …
```

**验收中发现的回归已修（PR #2）**：合并后 `.map-stations` 挂进 `.map-card`，`.map-placeholder` 的 `inset:0` 基准变成整张卡片，高德不可用时把 2646px 的站点面板整块盖掉（占位层 3122px）。加 `.map-canvas-wrap { position: relative }` 收口后，占位层回到 460px 画布范围，列表正常可读。

修复前后 `elementFromPoint` 对比：`.map-placeholder` → `.station-row`。

**仍存在的产品决策点**：`degraded=true`（上游没给）时走缓存/mock，`degraded=false` 且空列表时如实显示空 —— 但当前 mock 数据在 UI 上有"演示数据"标记，若产品要求完全不出现假数据，需另开单把 mock 分支去掉。
