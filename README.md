# GeoScraper

**一个用于下载和管理地理瓦片地图的 Web 工具。**

![GeoScraper 仪表盘](screenshots/geoscraper-dashboard.png)
![GeoScraper 任务创建](screenshots/geoscraper-create.png)
![GeoScraper 地图查看器](screenshots/geoscraper-viewer.png)

## ✨ 核心功能

- **交互式任务创建**: 通过拖拽和缩放地图来直观地选择下载区域。
- **多地图源支持**: 内置支持谷歌卫星图、OpenStreetMap 等多种地图类型。
- **实时任务仪表盘**: 使用 SSE (Server-Sent Events) 技术，实时更新所有任务的状态、下载进度和校验结果，无需手动刷新。
- **并发下载与后台执行**: 任务在后端非阻塞执行，支持自定义并发数和下载延迟，提高下载效率。
- **文件完整性校验**: 对已完成的任务，可一键启动文件校验，快速找出缺失或损坏的瓦片。
- **智能修复与管理**:
  - **一键重下载**: 自动重新下载所有缺失的瓦片。
  - **标记空白瓦片**: 在地图查看器中，可将海洋、天空等无内容的瓦片标记为“不存在”，避免在后续校验中被误判。
- **内置地图查看器**: 直接在浏览器中预览已下载的瓦片地图，并以可视化的方式高亮展示缺失瓦片的位置。
- **共享瓦片缓存**: 所有相同地图类型的任务共享同一份瓦片缓存，节约磁盘空间，避免重复下载。
- **网络代理支持**: 支持配置 HTTP 代理进行瓦片下载，并提供代理连通性健康检查。
- **容器化部署**: 提供开箱即用的 `Dockerfile` 和 `docker-compose.yml` 配置，轻松实现一键部署。

## 🚀 技术栈

- **前端**:
  - **框架**: [Nuxt 3](https://nuxt.com/) (Vue 3)
  - **状态管理**: [Pinia](https://pinia.vuejs.org/)
  - **UI & 样式**: [UnoCSS](https://unocss.dev/) (原子化 CSS)
  - **地图渲染**: [MapLibre GL JS](https://maplibre.org/)
  - **类型系统**: [TypeScript](https://www.typescriptlang.org/)

- **后端**:
  - **框架**: [Nitro](https://nitro.unjs.io/) (Nuxt 3 的服务端引擎)
  - **ORM**: [Drizzle ORM](https://orm.drizzle.team/) (类型安全的 SQL 查询构建器)
  - **异步任务**: 原生后台任务 + [Redis](https://redis.io/) (用于消息发布/订阅)

- **数据库与服务**:
  - **数据库**: [PostgreSQL](https://www.postgresql.org/)
  - **消息与缓存**: [Redis](https://redis.io/)

- **开发与构建**:
  - **包管理器**: [pnpm](https://pnpm.io/)
  - **代码规范**: [@antfu/eslint-config](https://github.com/antfu/eslint-config)
  - **部署**: [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)

## 🔧 项目启动

### 1. 先决条件

- [Node.js](https://nodejs.org/) (v22.x 或更高版本)
- [pnpm](https://pnpm.io/installation) (v10.x 或更高版本)
- [Docker](https://www.docker.com/get-started/) 和 [Docker Compose](https://docs.docker.com/compose/install/)

### 2. 环境配置

1.  **克隆项目到本地**:

    ```bash
    git clone https://github.com/lanseria/geoscraper.git
    cd geoscraper
    ```

2.  **安装依赖**:

    ```bash
    pnpm install
    ```

3.  **设置环境变量**:
    项目依赖 PostgreSQL 和 Redis 服务。你可以使用 Docker 快速启动它们。

    首先，复制环境变量文件：

    ```bash
    cp .env.example .env
    ```

    然后，编辑 `.env` 文件，填入你的配置。以下是各变量的说明：

    ```ini
    # 数据库连接字符串 (用于 Drizzle 和 Nitro)
    NUXT_DB_URL="postgresql://user:password@localhost:5432/geoscraper_db"

    # Redis 配置
    NUXT_REDIS_HOST="localhost"
    NUXT_REDIS_PASSWORD=""
    NUXT_REDIS_DB="3"

    # 瓦片下载代理 (可选, 例如 "http://127.0.0.1:7890")
    NUXT_PROXY_URL=""

    # 瓦片文件存储在宿主机上的根目录 (绝对路径或相对路径)
    NUXT_STORAGE_ROOT="./geoscraper_tiles"

    # 【前端必需】MapTiler API Key (用于地图选择器背景图)
    # 前往 https://www.maptiler.com/ 免费注册获取
    NUXT_PUBLIC_MAPTILER_KEY="YOUR_MAPTILER_KEY"

    # 【前端必需】本地瓦片服务地址 (用于地图查看器)
    # 如果使用 Docker 部署，需要是外部可访问的地址
    NUXT_PUBLIC_GIS_SERVER_URL="http://localhost:8080"
    ```

    > **注意**: `NUXT_PUBLIC_GIS_SERVER_URL` 需要指向一个能提供瓦片文件的静态文件服务器。你可以使用 Nginx 或 `npx serve` 等工具来托管 `NUXT_STORAGE_ROOT` 目录。

### 3. 数据库迁移

在首次启动或数据库 `schema.ts` 发生变化后，需要运行数据库迁移。

1.  **生成迁移文件**:
    ```bash
    pnpm db:generate
    ```
2.  **应用迁移**:
    ```bash
    pnpm db:migrate
    ```

### 4. 启动开发服务器

```bash
pnpm dev
```

应用将在 `http://localhost:3000` 上运行。

## 📦 使用 Docker Compose 一键启动

为了简化开发环境的搭建，项目提供了 `docker-compose.yml` 文件，可以一键启动所有必需的服务（PostgreSQL, Redis, Nginx）。

1.  **确保 `.env` 文件已配置好**，特别是 `NUXT_PUBLIC_MAPTILER_KEY`。`docker-compose.yml` 会自动读取 `.env` 文件。

2.  **构建并启动所有服务**:

    ```bash
    docker-compose up --build -d
    ```

3.  **访问应用**:
    - **GeoScraper 应用**: `http://localhost:3000`
    - **本地瓦片服务 (Nginx)**: `http://localhost:8080`

4.  **查看日志**:

    ```bash
    docker-compose logs -f
    ```

5.  **停止并移除容器**:
    ```bash
    docker-compose down
    ```

## 🛠️ 可用脚本

- `pnpm dev`: 启动 Nuxt 开发服务器。
- `pnpm build`: 为生产环境构建应用。
- `pnpm start`: 启动生产环境服务器（需先执行 `build`）。
- `pnpm lint`: 检查代码风格和格式。
- `pnpm typecheck`: 进行 TypeScript 类型检查。
- `pnpm db:generate`: 根据 `schema.ts` 生成 Drizzle 迁移文件。
- `pnpm db:migrate`: 将迁移应用到数据库。

## 🏗️ 项目架构

- `app/`: 包含所有前端 Vue 组件、页面、Pinia stores、静态资源和工具函数。
- `server/`: 包含所有后端 Nitro API 路由、数据库 schema 和业务逻辑。
  - `database/`: Drizzle ORM 的 schema 和迁移文件。
  - `routes/api/`: RESTful API 端点定义。
  - `utils/`: 后端核心业务逻辑，如任务执行器 (`task-runner.ts`)、文件校验器 (`task-verifier.ts`) 等。
- `uno.config.ts`: UnoCSS 配置文件，定义了原子化 CSS 的快捷方式和规则。
- `nuxt.config.ts`: Nuxt 3 核心配置文件，管理模块、运行时配置等。
- `Dockerfile`: 用于构建生产环境的 Docker 镜像，采用了多阶段构建。
- `docker-compose.yml`: 用于编排开发和生产环境所需的所有服务。

### 实时通信流程

1.  **前端**: 页面加载后，`useTaskStore` 通过 `EventSource` 连接到后端的 `/api/tasks/sse` 端点。
2.  **后端 (SSE)**: `sse.get.ts` 为每个客户端建立一个长连接，并订阅 Redis 的 `task-updates` 频道。
3.  **后端 (任务变更)**: 任何修改任务状态的操作（如创建、更新、进度变化），都会将最新的任务数据发布到 Redis 的 `task-updates` 频道。
4.  **推送**: Redis 将消息推送给所有订阅者（即所有 SSE 连接），SSE 连接再将数据实时发送给前端。
5.  **前端 (响应)**: Pinia store 接收到新数据后，自动更新 `tasks` 状态，Vue 的响应式系统会立即将变化渲染到 UI 上。

## 许可证

[MIT](./LICENSE) © 2024 Lanseria
