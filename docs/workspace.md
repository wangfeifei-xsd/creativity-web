# 06 页面接入协议

开发规范引用 [rule.md](../../rule.md)。管理壳从 `GET /admin/v1/auth/session` 读取导航；页面路径注册不承担鉴权。

07–10 以及后续页面在自己的 `src/features/<module>/registration.ts` 导出 `registration: FeatureRegistration` 或 `registrations: FeatureRegistration[]`。公共 `registry.ts` 自动收集登记，无需修改公共文件。示例：

```ts
import type { FeatureRegistration } from '../registry'
import { ModelsPage } from './ModelsPage'
export const registration: FeatureRegistration = {
  navigationKey: 'models', path: '/models', Component: ModelsPage,
}
```

路径登记负责路由映射，服务端导航负责菜单；直接访问已登记页面仍由接口返回 401/403/404。服务端已登记 `models`、`prompts`、`tools`、`usage`，各模块仅需要维护自身响应与操作。统一壳始终展示当前渠道、环境和数据域。

页面通过 `useSession` 读取服务端 SessionView；所有请求使用 `apiClient`。`useQuery` 提供页面实例内的查询与取消，不跨范围保留数据。Token 更换或工作区切换使旧请求失效，并卸载整个页面树，页面筛选、表单、一次性 Key 一同释放。不要自行持久化业务缓存、权限或角色。

公共组件 `PageContainer`、`ErrorState`、`ActionButtons`、`EditorDialog`、`ImpactDialog`、`VersionSelect` 可复用。`EditorDialog` 禁止重复提交；409 保留输入，显式读取新 revision 后仍须人工核对并提交。`api/management.ts` 的 `send` 封装 JSON 写请求，`applyFormErrors` 映射服务端字段错误。

渠道详情中的成员页与独立 `/members`、`/resource-grants` 共用 `MembersPage` 和 IAM 原始接口。接口与验证记录见服务端 `docs/workspace.md`。
