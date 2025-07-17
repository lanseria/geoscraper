# ---- Stage 1: Build Nuxt App (不变) ----
FROM m.daocloud.io/docker.io/library/node:22 AS build-stage

WORKDIR /app
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- Stage 2: Final Production Image (纯 Node.js) ----
FROM m.daocloud.io/docker.io/library/node:22-slim AS production-stage

WORKDIR /app

# 从构建阶段复制 Nuxt build output
COPY --from=build-stage /app/.output ./.output

EXPOSE 3000

# 启动 Nuxt 服务器
CMD ["node", ".output/server/index.mjs"]