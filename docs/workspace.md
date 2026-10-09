# 06 页面接入协议

开发规范引用 [rule.md](../../rule.md)。管理壳从 `GET /admin/v1/auth/session` 读取导航；页面路径注册不承担鉴权。

应用基础路径为 `/creativity/`，统一使用 React Router 的 HashRouter，浏览器地址为 `/creativity/#/models`、`/creativity/#/agents/<agent_id>` 等。登记路径、`Link` 和 `navigate` 继续使用 `/models` 这类路由路径，由路由器生成 Hash 地址；Playwright 的 `baseURL` 包含 `/creativity/`，测试直达页面使用 `#/models` 等相对地址，入口使用 `./`，避免以 `/` 开头绕过基础路径。

07–10 以及后续页面在自己的 `src/features/<module>/registration.ts` 导出 `registration: FeatureRegistration` 或 `registrations: FeatureRegistration[]`。公共 `registry.ts` 自动收集登记，无需修改公共文件。示例：

```ts
import type { FeatureRegistration } from '../registry'
import { ModelsPage } from './ModelsPage'
export const registration: FeatureRegistration = {
  navigationKey: 'models', path: '/models', Component: ModelsPage,
}
```

路径登记负责路由映射，服务端导航负责菜单；直接访问已登记页面仍由接口返回 401/403/404。服务端已登记 `models`、`prompts`、`tools`、`usage`，各模块仅需要维护自身响应与操作。统一壳始终展示当前渠道、环境和数据域。

桌面使用浅色侧栏与分组图标菜单，窄屏通过顶部按钮打开同主题导航抽屉。`app/workspace/navigation.tsx` 按服务端导航装配层级并补充图标；名称、顺序与可见入口仍取服务端导航。顶部管理模式、渠道与环境使用独立控件，单一选项展示为静态标签，多选项支持直接切换；刷新按钮和用户菜单位于右侧。管理模式是否可切换由服务端 `can_access_platform` 和授权范围决定。

工作台以响应式图标卡片展示同一批已登记导航，沿用服务端的名称、顺序与可见入口；整张卡片可点击或通过键盘打开，图标复用侧栏映射，并使用主题色区分功能。桌面四列、中等屏幕三列、窄屏两列；默认展示两行，可展开与收起，长名称换行展示，空导航继续使用公共空状态。配置指引使用独立面板，桌面通过标签页切换，窄屏使用选择器；保留全部指引步骤及按授权范围提供的跳转入口。配色、圆角与公共组件主题统一维护在 `app/theme.ts`。

平台与渠道管理员共用登录页和后台壳。初始化读取 `SessionView`，若服务端返回 `default_workspace`，由管理认证接口自动取得该范围的新 Token，再装配页面；浏览器不解析角色或自行判定默认权限。`workspace_options` 是服务端核准的可切换范围。账号页的管理员角色选项取 `/admin/v1/accounts/roles`，支持多选服务端核准的内置及自定义管理角色；平台角色与渠道角色可同时选择，渠道选择应用于所选全部渠道角色；渠道多选复用分页渠道目录，选中名称不因搜索、翻页丢失，角色与渠道一起提交账号接口。

登录页沿用工作台的蓝色品牌标识与主题色，桌面采用左侧小号标题和图标说明、右侧开放式表单；窄屏优先展示登录表单。品牌标识复用蓝青渐变切面 C，叠层、文档、渠道及表单图标集中维护在 `features/auth/AuthIcon.tsx`。背景使用浅蓝青底色、底部弧线与右上、左下角点阵；鼠标附近显示淡紫光晕与轻微散开的点阵，触屏和减少动态效果偏好使用静态背景。表单继续复用账号密码、滑块验证、外部身份与初始密码修改流程。

页面通过 `useSession` 读取服务端 SessionView；所有请求使用 `apiClient`。`useQuery` 提供页面实例内的查询与取消，不跨范围保留数据。Token 更换或工作区切换使旧请求失效，并卸载整个页面树，页面筛选、表单、一次性 Key 一同释放。不要自行持久化业务缓存、权限或角色。

公共组件 `PageContainer`、`ErrorState`、`ActionButtons`、`EditorDialog`、`ImpactDialog`、`VersionSelect` 可复用。`EditorDialog` 禁止重复提交；409 保留输入，显式读取新 revision 后仍须人工核对并提交。`api/management.ts` 的 `send` 封装 JSON 写请求，`applyFormErrors` 映射服务端字段错误。

渠道详情中的成员页与独立 `/members`、`/resource-grants` 共用 `MembersPage` 和 IAM 原始接口。接口与验证记录见服务端 `docs/development.md#workspace`。

`/integrations` 页面管理当前主体复核、运行与事件及独立委托密钥，固定业务 HTTP 连接、能力与契约测试入口已移除。主体复核和运行事件使用 `integration:manage`，身份委托页使用 `key:manage` 操作入口。签名密钥只保留在一次性页面状态中，工作区切换会清除。配置与验收见 [业务接入交接](../../creativity-service/docs/integration.md#integrations)。

## 会话页面

`features/conversations/registration.ts` 注册 `/conversations`；会话权限和动作由后端返回。页面提供筛选、消息/版本时间线、部分输出与取消、归档恢复、删除预览及进度、受控附件和导出。运行期间刷新持久化快照；17 后续装配 SSE。业务与验证边界见 [12 交接](../../creativity-service/docs/runtime.md#conversations)。
