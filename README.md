# 出门啦 (Chumenla) — AI 出行规划助手

> **多智能体协作 × 小程序 × 说走就走**

<p align="center">
  <img src="https://img.shields.io/badge/license-GPL--2.0-orange">
  <img src="https://img.shields.io/badge/version-v2.0.0-FF6B35">
  <img src="https://img.shields.io/badge/python-3.10+-blue.svg">
  <img src="https://img.shields.io/badge/FastAPI-0.100+-teal.svg">
  <img src="https://img.shields.io/badge/Vue-3.x-brightgreen.svg">
  <img src="https://img.shields.io/badge/uni--app-Vue3-4CD964.svg">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker">
</p>

## 这是什么？

**出门啦** 是一个 AI 驱动的出行规划工具。告诉它你想去哪、玩几天、喜欢什么，多个 AI 智能体会像旅行管家一样协作——查景点、看天气、找酒店、排路线——帮你生成一份完整的行程计划。

支持两种场景：

| 场景 | 描述 |
|---|---|
| **长途旅行** | 输入目的地城市、日期、偏好，生成多日行程 |
| **附近出行** | 自动定位当前城市，选择半天/一天 + 兴趣类型，快速推荐 |

三端可用：**Web 网页** / **微信小程序** / **H5**

---

## 核心功能

- **多智能体协作** — 景点规划师、天气预报员、酒店推荐专家各司其职，总控 Agent 统筹编排
- **长途 + 短途** — 多天深度游和半天随心逛，两种模式一个入口
- **自动定位** — 附近出行自动获取位置，通过后端安全调用高德逆地理编码
- **智能推荐** — 根据选择的兴趣类型（美食、亲子、文艺……）动态推荐标签
- **完整行程** — 每日景点路线、餐饮安排、住宿推荐、交通方式，一步到位
- **预算明细** — 门票、餐饮、住宿、交通分项统计
- **天气预报** — 目标日期天气一目了然
- **地图路线** — 景点标记 + 连线，直观预览路线
- **AI 问答** — 生成行程后可随时追问细节
- **历史行程** — 本地持久化，随时回看
- **变现体系** — 每日免费 1 次，看广告 +1，邀请好友 +3

---

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│  客户端                                              │
│                                                      │
│  小程序 (uni-app)          Web (Vue 3 + Vite)        │
│  ├── 长途规划               ├── Landing 表单          │
│  ├── 附近出行 (定位)         ├── Result 行程详情       │
│  ├── 历史行程               ├── AI Chat 问答          │
│  ├── AI 问答                └── Pinia 状态管理        │
│  ├── 我的 (次数/广告/邀请)                            │
│  └── Pinia + uni.request                             │
│              │                       │                │
│              └───────┬───────────────┘                │
│                      ↓                                │
├──────────────────────────────────────────────────────┤
│  后端 API (FastAPI)                                   │
│                                                      │
│  POST /api/trip/plan      → 提交规划任务 (返回 task_id)│
│  GET  /api/trip/status/:id → 轮询任务状态              │
│  POST /api/chat/ask       → AI 行程问答               │
│  GET  /api/map/reverse-geocode → 逆地理编码           │
│  GET  /api/poi/photo      → 景点图片                  │
│  GET  /health             → 健康检查                   │
│                                                      │
│  CORS 可配置 · lifespan 生命周期 · 任务超时+自动清理    │
├──────────────────────────────────────────────────────┤
│  智能体引擎 (HelloAgents + MCP)                       │
│                                                      │
│  总控 Agent ──┬── 景点规划 Agent → 高德 MCP (POI搜索)  │
│               ├── 天气预报 Agent → 天气查询工具         │
│               └── 酒店推荐 Agent → 高德 MCP (酒店搜索)  │
│                      ↓                                │
│              结构化 JSON 输出                          │
└─────────────────────────────────────────────────────┘
```

### 异步轮询机制

LLM 生成行程需要 1~3 分钟，直接等会导致网关超时。解决方案：

1. `POST /api/trip/plan` — 立即返回 `task_id`，后台 `asyncio.create_task` 执行
2. 客户端每 3 秒轮询 `GET /api/trip/status/{task_id}`
3. 后端有 10 分钟任务超时 + 30 分钟 TTL 自动清理，防止内存泄漏

---

## 项目结构

```
出门啦/
├── backend/                        # Python 后端 (纯 API)
│   ├── app/
│   │   ├── api/routes/             # 路由: trip, chat, map, poi
│   │   ├── agents/                 # 多智能体编排 (HelloAgents)
│   │   ├── services/               # 业务: LLM, 高德MCP, Unsplash, 知识图谱
│   │   ├── models/                 # Pydantic 数据模型
│   │   └── config.py               # 配置管理 (pydantic-settings)
│   ├── requirements.txt
│   ├── run.py                      # 入口
│   └── Dockerfile
│
├── frontend/                       # Vue 3 Web 端
│   ├── src/
│   │   ├── views/                  # Landing (表单) / Result (行程)
│   │   ├── components/             # AIChat, NavBar, OverviewCard
│   │   ├── stores/                 # Pinia 状态管理
│   │   ├── services/               # Axios API 层
│   │   ├── i18n/                   # 国际化 (中/英/日)
│   │   └── types/                  # TypeScript 类型
│   ├── vite.config.ts
│   └── Dockerfile
│
├── miniapp/                        # uni-app 小程序端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── landing/            # Tab 1: 长途规划
│   │   │   ├── nearby/             # Tab 2: 附近出行 (定位)
│   │   │   ├── history/            # Tab 3: 历史行程
│   │   │   ├── profile/            # Tab 4: 我的 (次数/广告/邀请)
│   │   │   ├── result/             # 子页: 行程详情
│   │   │   └── chat/               # 子页: AI 问答
│   │   ├── components/             # NavBar, DayCard, AttractionCard, WeatherCard,
│   │   │                           # BudgetPanel, LoadingOverlay, QuotaWall
│   │   ├── stores/                 # trip (行程), quota (次数), history (历史)
│   │   ├── services/               # uni.request API 适配器
│   │   ├── types/                  # 与 Web 端共享的类型定义
│   │   ├── utils/                  # 格式化工具
│   │   └── static/                 # TabBar 图标 (行李箱/定位针/日历/人形)
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yaml             # 前后端双容器编排
└── README.md
```

---

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- 高德地图 Key (Web 服务类型)
- LLM API Key (兼容 OpenAI 格式，如豆包、通义千问、DeepSeek)

### 1. 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入：
#   LLM_API_KEY=你的大模型API密钥
#   LLM_BASE_URL=https://api.openai.com/v1 (或其他兼容端点)
#   LLM_MODEL_ID=模型名称
#   VITE_AMAP_WEB_KEY=高德Web服务Key
#   UNSPLASH_ACCESS_KEY=Unsplash图片Key (可选)

# 启动
python run.py
# 或: uvicorn app.api.main:app --host 0.0.0.0 --port 8000 --reload
```

API 文档：`http://localhost:8000/docs`

### 2. Web 前端

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

开发模式下 Vite 会自动代理 `/api` 请求到后端 `localhost:8000`。

### 3. 小程序端

```bash
cd miniapp
npm install --legacy-peer-deps

# 开发模式 (微信)
npx uni -p mp-weixin
# 用微信开发者工具打开 dist/dev/mp-weixin

# 构建生产版
npx uni build -p mp-weixin
# 用微信开发者工具打开 dist/build/mp-weixin
```

> 小程序需要在 `manifest.json` 填入真实的微信 AppID。
> `services/api.ts` 中的 `API_BASE_URL` 需指向你的后端地址。

### 4. Docker 部署

```bash
docker-compose up -d
# 后端: http://localhost:8000
# 前端: http://localhost:5173
```

---

## 小程序页面一览

| Tab | 页面 | 功能 |
|---|---|---|
| 🧳 长途 | `pages/landing` | 输入目的地、日期、偏好 → AI 生成多日行程 |
| 📍 附近 | `pages/nearby` | 自动定位 → 选半天/一天 + 兴趣类型 → 快速推荐 |
| 📅 行程 | `pages/history` | 历史行程列表，点击查看详情 |
| 👤 我的 | `pages/profile` | 剩余次数、看广告 +1、邀请好友 +3、使用统计 |
| — | `pages/result` | 行程详情：每日安排 / 预算 / 天气 / 地图 |
| — | `pages/chat` | AI 问答：基于行程上下文追问细节 |

### 变现模型

| 方式 | 奖励 | 限制 |
|---|---|---|
| 每日免费 | 1 次 | 每天 0:00 重置 |
| 观看激励视频广告 | +1 次 | 每天最多 5 次 |
| 邀请好友 | +3 次 | 长期有效，无上限 |

---

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/trip/plan` | 提交行程规划任务，返回 `task_id` |
| `GET` | `/api/trip/status/:id` | 轮询任务状态和结果 |
| `POST` | `/api/chat/ask` | AI 行程问答 |
| `GET` | `/api/map/reverse-geocode` | 经纬度 → 城市名 (逆地理编码) |
| `GET` | `/api/poi/photo` | 获取景点图片 (Unsplash) |
| `GET` | `/api/poi/search` | 搜索 POI |
| `GET` | `/health` | 健康检查 |

完整接口文档：启动后端后访问 `/docs` (Swagger) 或 `/redoc`。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端框架 | FastAPI + Uvicorn |
| 智能体 | HelloAgents (多 Agent 编排) |
| 工具协议 | MCP (Model Context Protocol) + 高德地图 |
| LLM | OpenAI 兼容 API |
| Web 前端 | Vue 3 + TypeScript + Vite + Pinia + Ant Design Vue |
| 小程序 | uni-app (Vue 3) + Pinia |
| 地图 | 高德地图 JS API 2.0 (Web) / 小程序原生 map 组件 |
| 图片 | Unsplash API + pypinyin 中文转拼音搜索 |
| 部署 | Docker Compose (前后端分离) |

---

## 后续计划

- [ ] 接入 Google Maps，支持海外目的地
- [ ] 小红书 MCP 适配，融入达人推荐
- [ ] 行程 PDF 导出
- [ ] 多用户账号体系
- [ ] 行程分享与协作编辑

---

## 致谢

感谢 [linuxdo](https://linux.do/) 社区的交流与反馈。

## License

[GPL-2.0](LICENSE)
