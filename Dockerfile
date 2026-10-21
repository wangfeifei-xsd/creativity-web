FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
    npm_config_registry=https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine
# 反向代理目标：creativity-service 在宿主机上发布的地址
ENV API_UPSTREAM=172.17.0.1:38000
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
