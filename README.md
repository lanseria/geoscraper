# GeoScraper

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Nuxt](https://img.shields.io/badge/Nuxt-v3.x-00DC82.svg)](https://nuxt.com)
[![Python](https://img.shields.io/badge/Python-v3.12+-3776AB.svg)](https://www.python.org/)
[![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-A3E635.svg)](https://orm.drizzle.team/)

一个功能强大的 Web 应用，用于可视化选择、下载和管理地理瓦片地图数据。

![GeoScraper 仪表盘](./screenshot.jpg)
_(建议在此处放置一张项目仪表盘的截图)_

## ✨ 核心功能

- **可视化地图选区**: 通过交互式地图界面，轻松框选需要下载的地理范围。
- **多地图源支持**: 内置支持谷歌卫星图、OpenStreetMap 标准图和地形图等多种数据源。
- **实时任务估算**: 在创建任务时，即时计算所需下载的瓦片总数和预估的磁盘空间占用。
- **后台异步处理**: 采用独立的 Python 工作进程处理耗时的下载任务，不阻塞前端操作。
- **实时进度更新**: 使用 Server-Sent Events (SSE) 技术，将任务的创建、下载进度和完成状态实时推送到前端，无需手动刷新。
- **并发下载与延迟控制**: 支持自定义下载并发数和请求延迟，以适应不同网络环境和目标服务器策略。
- **响应式布局与深色模式**: 界面在桌面和移动设备上均有良好表现，并支持明暗主题切换。

## 🏛️ 系统架构

GeoScraper 采用现代化的前后端分离与任务队列架构，确保了系统的高响应性、可伸缩性和健壮性。

```
+------------------+     (HTTP API)     +-------------------+     (DB / Queue)     +-----------------+
|                  | <----------------> |                   | <------------------> |                 |
|  用户 (浏览器)     |                    |   Nuxt 3 / Nitro  |                      |  PostgreSQL DB  |
|   (Vue Frontend) | -----------------> |    (Backend API)  | -------------------> |    (Redis)      |
|                  | <----------------- |                   |                      |                 |
+------------------+   (SSE Real-time)   +-------------------+                      +--------+--------+
                                                 ^                                         |
                                                 | (Redis Pub/Sub)                         | (BullMQ Listen)
                                                 |                                         |
                                                 |                                         v
                                         +-------+---------+
                                         |                 |
                                         |  Python Worker  |
                                         |  (Downloader)   |
                                         |                 |
                                         +-----------------+
```

1.  **前端 (Nuxt/Vue)**: 用户交互界面，负责创建任务和展示任务状态。
2.  **后端 API (Nitro)**:
    - 接收前端的请求（如创建/删除任务）。
    - 将任务信息写入 **PostgreSQL** 数据库。
    - 将任务 ID 推送到 **Redis** 中的 **BullMQ** 任务队列。
    - 通过 SSE 端点，监听 Redis 的 **Pub/Sub** 频道，并将实时更新推送到前端。
3.  **后台工作进程 (Python Worker)**:
    - 独立于 Web 服务运行，持续监听 Redis 任务队列。
    - 获取任务后，从数据库读取任务详情。
    - 并发下载地图瓦片，并将下载进度、瓦片数等信息更新回 **PostgreSQL**。
    - 每次更新数据库后，通过 Redis 的 **Pub/Sub** 发布一个事件，触发后端 API 向前端推送实时消息。

## 🛠️ 技术栈

- **前端**:
  - [**Nuxt 3**](https://nuxt.com/): 核心框架
  - [**Vue 3**](https://vuejs.org/): 响应式 UI
  - [**Pinia**](https://pinia.vuejs.org/): 状态管理
  - [**UnoCSS**](https://github.com/unocss/unocss): 原子化 CSS 引擎
  - [**MapLibre GL**](https://maplibre.org/): 交互式地图渲染
- **后端 API**:
  - [**Nitro**](https://nitro.unjs.io/): Nuxt 的高性能服务器引擎
  - [**Drizzle ORM**](https://orm.drizzle.team/): 类型安全的 TypeScript ORM
  - [**BullMQ**](https://bullmq.io/): 基于 Redis 的高性能任务队列
- **后台工作进程**:
  - [**Python 3.12+**](https://www.python.org/)
  - [**asyncio**](https://docs.python.org/3/library/asyncio.html): 异步 I/O
  - [**httpx**](https://www.python-httpx.org/): 现代化的异步 HTTP 客户端
  - [**psycopg2**](https://www.psycopg.org/): PostgreSQL 驱动
- **数据库与缓存**:
  - [**PostgreSQL**](https://www.postgresql.org/): 主数据库
  - [**Redis**](https://redis.io/): 用于任务队列和消息发布/订阅

## 🚀 快速开始 (本地开发)

### 1. 先决条件

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v10+)
- [Python](https://www.python.org/) (v3.12+)
- [Docker](https://www.docker.com/) 和 [Docker Compose](https://docs.docker.com/compose/)

### 2. 环境搭建

1.  **克隆仓库**

    ```bash
    git clone https://github.com/lanseria/geoscraper.git
    cd geoscraper
    ```

2.  **启动依赖服务**
    项目依赖 PostgreSQL 和 Redis。我们提供了一个 `docker-compose.yml` 文件来一键启动它们。

    ```bash
    docker-compose up -d
    ```

3.  **安装依赖**

    - 安装前端和后端依赖:
      ```bash
      pnpm install
      ```
    - 安装 Python Worker 依赖 (建议在虚拟环境中进行):

      ````bash # 创建并激活虚拟环境 (可选但推荐)
      python -m venv .venv
      source .venv/bin/activate # on Windows: .venv\Scripts\activate

          # 安装依赖
          pip install -r worker/requirements.txt
          ```

      _(如果 `worker/requirements.txt` 不存在, 可通过 `pip install -e worker` 或手动安装 `pyproject.toml` 中的依赖)_
      ````

4.  **配置环境变量**
    复制 `.env.example` 文件为 `.env`，并根据你的环境填写必要信息。

    ```bash
    cp .env.example .env
    ```

    - 你至少需要填写 `NUXT_PUBLIC_MAPTILER_KEY`。可以从 [MapTiler](https://www.maptiler.com/cloud/) 获取免费的 API Key。
    - `STORAGE_ROOT` 是存放瓦片文件的本地路径，请确保该目录存在且有写入权限。

5.  **数据库迁移**
    运行 Drizzle Kit 来初始化数据库 schema。
    ```bash
    pnpm db:migrate
    ```

### 3. 启动应用

你需要同时启动 Nuxt 应用和 Python Worker。

- **启动 Nuxt 应用 (前端 + 后端 API)**:

  ```bash
  pnpm dev
  ```

  应用将在 `http://localhost:3000` 上可用。

- **启动 Python Worker** (在新的终端窗口中):

  ```bash
  # 如果使用了虚拟环境，请确保已激活
  # source .venv/bin/activate

  pnpm worker:start
  ```

现在，你可以访问 `http://localhost:3000` 并开始使用 GeoScraper 了！

## ⚙️ 环境变量

在项目根目录的 `.env` 文件中配置以下变量：

```ini
# .env.example

# PostgreSQL 数据库连接 URL (Drizzle 和 Worker 共用)
# 默认 docker-compose 配置的用户/密码/数据库名是 geoscraper
NUXT_DB_URL="postgresql://geoscraper:geoscraper@localhost:5432/geoscraper"

# Redis 连接配置 (Nuxt 和 Worker 共用)
NUXT_REDIS_HOST="localhost"
NUXT_REDIS_PASSWORD=""
NUXT_REDIS_DB="3"

# MapTiler API Key (前端 MapSelector 组件需要)
NUXT_PUBLIC_MAPTILER_KEY="YOUR_MAPTILER_API_KEY"

# Worker 配置: 瓦片存储的根目录
STORAGE_ROOT="/data/geoscraper-tiles"
```

## 📜 可用脚本

- `pnpm dev` - 启动 Nuxt 开发服务器。
- `pnpm build` - 构建生产环境的 Nuxt 应用。
- `pnpm start` - 在生产模式下启动 Nuxt 服务器 (需要先 build)。
- `pnpm db:generate` - 根据 `schema.ts` 生成数据库迁移文件。
- `pnpm db:migrate` - 应用数据库迁移。
- `pnpm worker:start` - 启动 Python 后台工作进程。
- `pnpm lint` - 代码风格检查与格式化。

## 🐳 Docker 部署

项目包含一个用于 Nuxt 应用的 `Dockerfile`。你可以构建镜像并运行容器：

```bash
# 1. 构建 Nuxt 应用镜像
docker build -t geoscraper-app .

# 2. 运行应用容器 (需要连接到外部的 DB 和 Redis)
docker run -p 3000:3000 \
  --name geoscraper-app-container \
  -e NUXT_DB_URL="<your_db_url>" \
  -e NUXT_REDIS_HOST="<your_redis_host>" \
  -e NUXT_PUBLIC_MAPTILER_KEY="<your_maptiler_key>" \
  geoscraper-app
```

**注意**: 在生产环境中，推荐使用 Docker Compose 统一编排 Nuxt 应用、Python Worker、PostgreSQL 和 Redis 容器。

## 🤝 贡献

欢迎提交 PRs 和 issues！在提交代码前，请确保运行 `pnpm lint` 以保证代码风格一致。

## 📄 许可证

[MIT](./LICENSE) License © 2024 [lanseria](https://github.com/lanseria)
