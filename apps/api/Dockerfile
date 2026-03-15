# Fly.io 部署用的 Dockerfile
FROM node:22-slim

WORKDIR /app

# 复制根目录的 package.json（因为是 workspace）
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/engine/package*.json ./packages/engine/

# 安装所有依赖
RUN npm ci

# 复制源码
COPY apps/api ./apps/api
COPY packages/engine ./packages/engine

# 构建 API
WORKDIR /app/apps/api
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "dist/server.js"]
