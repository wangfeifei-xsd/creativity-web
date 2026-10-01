# creativity-web

React + TypeScript + Vite + antd。使用 Node.js 22 与 pnpm 10.32.1；完整启动顺序见 [项目 README](../README.md)，开发规范见 [rule.md](../rule.md)。

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 127.0.0.1:5173；代理三个接口前缀至本地 API |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 与 React Hooks 检查 |
| `pnpm test` | 请求状态、认证响应与字段错误的单元测试 |
| `pnpm build` | 类型检查并生成 dist |
| `pnpm api:generate` | 从相邻后端契约生成接口类型 |
| `pnpm api:check` | 检查生成内容是否最新 |
| `pnpm check` | 契约、类型、lint、单元测试与构建 |
| `pnpm exec playwright install chromium` | 安装端到端测试浏览器 |
| `pnpm test:e2e` | 自动启动 Vite 并验证浏览器加载与窄屏流程 |

本地已有 Google Chrome 时，也可用 `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`。CI 始终显式安装 Playwright Chromium，无需依赖机器预装浏览器。

`API_PROXY_TARGET` 仅供 Vite 开发服务器读取。生产静态托管需将 `/admin/v1`、`/api/v1` 和 `/health` 转发至 API，其余页面路径回落到 `index.html`。浏览器请求使用同源相对地址，不在构建产物中写入私密配置。

`src/app/` 提供主题和根布局，`src/components/` 提供页面容器、加载/空数据/错误状态、VersionSelect、StatusTag 和 ServerActions。`src/features/registry.ts` 仅登记页面组件，`resolveNavigation` 将服务端导航键映射到已登记页面，未知键不生成路由。当前工作台为空，不包含业务菜单或登录页面。

`src/api/client.ts` 使用服务端生成类型，读取错误码、字段错误与请求标识，并提供携带 Token 的受控二进制 download 方法；字段错误通过 `applyFormErrors` 映射到 antd 表单。`TokenStore` 只在内存保存不透明 Token，只有服务端 401 会触发清理及回调；403、503 和网络异常不会注销会话。后续登录模块订阅 `onUnauthorized`，根据服务端响应处理登录页面；客户端不解析 Token 或计算权限。

修改接口后先在服务端运行 `uv run creativity-openapi`，再运行 `pnpm api:generate`。生成目录不手工编辑；CI 会检查输出是否一致。后端契约文件已经纳入交付，前端安装和构建无需启动 API。

公共组件与数据模型接入见 [03 交接](../creativity-service/docs/core.md)，依赖检查执行 `pnpm audit`。
