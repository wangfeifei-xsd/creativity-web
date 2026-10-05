# Creativity Web

Creativity AI 能力平台的管理前端，提供渠道与权限管理、模型和 Agent 配置、运行记录、会话记忆、用量预算及效果评测界面。

前端采用 React + TypeScript + Vite + Ant Design，通过 [Creativity Service](../creativity-service/README.md) 的管理 API 获取数据、会话和授权信息。

## 目录

- [主要功能](#主要功能)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [配置](#配置)
- [开发与测试](#开发与测试)
- [接口类型生成](#接口类型生成)
- [构建与部署](#构建与部署)
- [项目结构](#项目结构)
- [文档](#文档)
- [参与开发](#参与开发)

## 主要功能

- **工作区与权限**：登录、初始密码修改、渠道切换、账号、成员、资源授权及审计查询。
- **配置管理**：模型、提示词、MCP 连接、工具、Skills 和 Agent 的配置、调试及版本发布。
- **运行与内容**：执行记录、流式结果、会话、记忆、文件产物及删除进度。
- **用量与评测**：调用用量、预算、样本集、批量评测、报告对比及发布检查。

## 技术栈

| 用途 | 技术 |
| --- | --- |
| 界面 | React 19、Ant Design 6 |
| 语言与构建 | TypeScript 5.9、Vite 7 |
| 路由 | React Router 7 |
| 接口类型 | OpenAPI、openapi-typescript |
| 测试与检查 | Vitest、Playwright、ESLint |

依赖版本由 [package.json](package.json) 和 [pnpm-lock.yaml](pnpm-lock.yaml) 管理。

## 环境要求

| 工具或服务 | 要求 |
| --- | --- |
| Node.js | 22 LTS，版本范围 `>=22.12.0 <23`；项目版本见 [.node-version](.node-version) |
| pnpm | 10.32.1 |
| Creativity Service | 使用真实登录和管理功能时需启动后端并初始化管理员 |

以下命令均在 `creativity-web` 项目目录执行。安装和构建无需启动 API；接口类型生成与 `pnpm check` 会读取相邻的 `creativity-service/contracts/openapi.json`，请保留两个项目的并列目录结构。

## 快速开始

### 1. 准备后端

按 [服务端快速开始](../creativity-service/README.md#快速开始) 启动 API、Worker 和调度器，并完成平台管理员初始化。本地 API 默认地址为 `http://127.0.0.1:8000`。

### 2. 安装依赖并启动

首次使用时复制配置模板：

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)，使用初始化的管理员账号登录。首次登录按页面提示修改密码，之后进入有权限访问的工作区。

### 3. 联调自定义 API 地址

如果后端运行在其他地址，修改 `.env` 并重启 Vite：

```dotenv
API_PROXY_TARGET=http://127.0.0.1:8000
```

## 配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | 本地 API 代理目标，由 Vite 读取 |
| `PLAYWRIGHT_CHANNEL` | Playwright Chromium | 可选测试环境变量，例如 `chrome` 使用本机 Google Chrome |

开发服务器将 `/admin/v1`、`/api/v1` 和 `/health` 代理到 `API_PROXY_TARGET`。浏览器请求使用同源相对地址，代理配置不会写入浏览器产物。配置模板见 [.env.example](.env.example)，代理规则见 [vite.config.ts](vite.config.ts)。

## 开发与测试

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器，默认端口为 `5173` |
| `pnpm typecheck` | 执行 TypeScript 类型检查 |
| `pnpm lint` | 执行 ESLint 检查 |
| `pnpm test` | 运行 Vitest 单元测试 |
| `pnpm test:e2e` | 运行 Playwright 浏览器测试 |
| `pnpm api:generate` | 根据服务端 OpenAPI 生成接口类型 |
| `pnpm api:check` | 检查生成的接口类型是否与契约一致 |
| `pnpm build` | 检查类型并生成生产静态文件 |
| `pnpm preview` | 本地预览构建结果 |
| `pnpm check` | 执行契约、类型、lint、单元测试及构建检查 |
| `pnpm audit` | 扫描依赖公告 |

首次运行浏览器测试前安装 Chromium：

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

已有 Google Chrome 时，可改用：

```bash
PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e
```

Playwright 会自动启动 Vite。常规页面用例使用受控接口响应；连接真实后端的工作区用例需要额外设置 `WORKSPACE_LIVE_API`，未配置时跳过。真实服务和多渠道组合验证的准备步骤见 [页面验证文档](../creativity-service/docs/development.md#workspace) 和 [组合验收文档](../creativity-service/docs/testing.md)。

## 接口类型生成

前端接口类型来自服务端提交的 OpenAPI 契约。接口修改后，在 `creativity-web` 目录执行以下流程：

```bash
cd ../creativity-service
make openapi
cd ../creativity-web
pnpm api:generate
pnpm api:check
```

输入为 [服务端 OpenAPI](../creativity-service/contracts/openapi.json)，输出为 [schema.ts](src/api/generated/schema.ts)。生成文件通过脚本维护，CI 使用 `pnpm api:check` 检查契约与类型的一致性。

## 构建与部署

```bash
pnpm build
```

构建产物位于 `dist/`，可由 Nginx 或其他静态文件服务托管。部署时配置以下路由：

| 请求 | 处理方式 |
| --- | --- |
| `/admin/v1`、`/api/v1`、`/health` | 转发到 Creativity Service，保留原始路径 |
| 已存在的静态文件 | 从 `dist/` 提供 |
| 其他页面路径 | 回落到 `index.html`，交由前端路由处理 |

生产 API 地址由托管服务的反向代理配置；`API_PROXY_TARGET` 用于本地 Vite 环境。流式接口的代理需要支持 SSE，相关协议见 [运行事件文档](../creativity-service/docs/runtime.md#runtime-sse)。

## 项目结构

```text
creativity-web/
├── src/
│   ├── app/             # 应用入口、主题与工作区布局
│   ├── api/             # 请求封装、会话、事件流与生成类型
│   ├── components/      # 表单、状态、版本及运行结果组件
│   ├── features/        # 平台功能页面与路由登记
│   └── main.tsx         # React 挂载入口
├── docs/                # 页面接入文档
├── scripts/             # 接口类型生成工具
├── tests/               # Playwright 及组合验证脚本
├── .env.example         # 本地代理配置模板
├── package.json         # 依赖与开发命令
├── playwright.config.ts # 浏览器测试配置
└── vite.config.ts       # 开发服务器、代理与单元测试配置
```

功能页面通过 `src/features/<module>/registration.ts` 登记路由，由 `registry.ts` 收集；菜单与可执行操作由服务端返回。新增页面的接口与组件接入方式见 [页面接入文档](docs/workspace.md)。

## 文档

| 主题 | 入口 |
| --- | --- |
| 本地运行 | [服务端说明](../creativity-service/README.md) · [平台说明](../README.md) |
| 页面开发 | [页面接入](docs/workspace.md) · [公共设施与组件](../creativity-service/docs/development.md#core) |
| 身份与工作区 | [认证与授权](../creativity-service/docs/development.md#iam) · [渠道管理](../creativity-service/docs/development.md#channels) |
| Agent 与配置 | [Agent](../creativity-service/docs/configuration.md#agents) · [配置示例](../creativity-service/docs/configuration.md#configuration-delivery) |
| 会话与记忆 | [会话](../creativity-service/docs/runtime.md#conversations) · [记忆](../creativity-service/docs/runtime.md#memory) |
| 用量与评测 | [用量和预算](../creativity-service/docs/operations.md#usage) · [效果评测](../creativity-service/docs/operations.md#evaluations) |
| 扩展能力 | [配置与页面说明](../creativity-service/docs/configuration.md#enhancements) |
| 测试与验收 | [页面验证](../creativity-service/docs/development.md#workspace) · [组合验收](../creativity-service/docs/testing.md) |

## 参与开发

开发前阅读 [项目规则](../rule.md)、[技术方案](../技术方案.md) 和对应的 [模块需求](../需求文档/00-需求总纲.md)。提交变更前执行 `pnpm check`，涉及页面交互时补充相应浏览器验证。
