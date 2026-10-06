import { expect, test, type Page } from '@playwright/test'

const account = { user_id: 'u1', login_name: 'admin', display_name: '管理员', platform_roles: ['platform_admin'], platform_role_names: ['平台管理员'],
  role: 'platform_admin', role_name: '平台管理员', channel_ids: [], channel_names: [],
  status: 'ACTIVE', status_label: '启用', revision: 1, must_change_password: false, credential_updated_at: '2026-10-01T00:00:00Z' }
const session = { user: account, workspace: null, navigation: [{ navigation_key: 'accounts', label: '账号管理', ancestors: [{ key: 'organization', label: '组织与权限' }] }],
  workspace_options: [], default_workspace: null, can_access_platform: true,
  actions: [{ action_key: 'account:manage', label: '管理账号' }], expires_at: '2000-01-01T00:00:00Z' }
const errorBody = (status: number) => ({ error: { code: 'ERROR', message: `服务返回 ${status}`, fields: [] } })
const roles = [{ role_code: 'platform_admin', name: '平台管理员', grant_scope: 'platform' }, { role_code: 'channel_admin', name: '渠道管理员', grant_scope: 'channel' }]
async function authenticated(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    await route.fulfill({ json: path.endsWith('/session') ? session : path.endsWith('/roles') ? roles : path.endsWith('/accounts/page') ? { items: [account], total: 1, offset: 0, limit: 20 } : [], status: 200 })
  })
}

test('基础路径覆盖入口、静态资源、页面刷新和前进后退', async ({ page }) => {
  await authenticated(page)
  const response = await page.goto('./')
  expect(response?.ok()).toBe(true)
  expect(response?.request().redirectedFrom()).toBeNull()
  expect(new URL(page.url()).pathname).toBe('/creativity/')
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  const modulePaths = await page.locator('script[type="module"][src]').evaluateAll(scripts =>
    scripts.map(script => new URL((script as HTMLScriptElement).src).pathname))
  expect(modulePaths.length).toBeGreaterThan(0)
  expect(modulePaths.every(path => path.startsWith('/creativity/'))).toBe(true)
  await page.getByRole('menuitem', { name: '账号管理' }).click()
  await expect(page).toHaveURL('/creativity/#/accounts')
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL('/creativity/#/accounts')
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
})

test('开发环境旧入口重定向后保留 Hash 页面', async ({ page }) => {
  await authenticated(page)
  await page.goto('/#/accounts')
  await expect(page).toHaveURL('/creativity/#/accounts')
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
})

for (const width of [1365, 375]) test(`管理模式与渠道独立切换，默认首个授权范围并保留环境（${width}）`, async ({ page }) => {
  const a = { channel_id: 'channel-a', channel_name: '研发资料协作渠道', environment: 'prod', environment_name: '生产', data_scope_id: 'a-one', data_scope_name: '业务域甲' }
  const secondDomain = { ...a, data_scope_id: 'a-two', data_scope_name: '第二业务域' }
  const bTest = { channel_id: 'channel-b', channel_name: '客户服务渠道', environment: 'test', environment_name: '测试', data_scope_id: 'b-test', data_scope_name: '测试业务域' }
  const b = { ...bTest, environment: 'prod', environment_name: '生产', data_scope_id: 'b-prod', data_scope_name: '生产业务域' }
  const workspaces = [a, secondDomain, bTest, b]
  let current: typeof a | null = null
  const switches: Record<string, unknown>[] = []
  let platformSwitches = 0
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: { ...session, workspace: current, workspace_options: workspaces } })
    if (path.endsWith('/auth/channel-context')) {
      const input = request.postDataJSON() as Record<string, unknown>
      switches.push(input)
      current = workspaces.find(option => option.channel_id === input.channel_id && option.environment === input.environment && option.data_scope_id === input.data_scope_id) ?? null
      return route.fulfill({ json: { access_token: `workspace-${switches.length}`, token_type: 'Bearer', expires_in: 3600 } })
    }
    if (path.endsWith('/auth/platform-context')) {
      platformSwitches++
      current = null
      return route.fulfill({ json: { access_token: 'platform-token', token_type: 'Bearer', expires_in: 3600 } })
    }
    await route.fulfill({ json: [] })
  })
  await page.setViewportSize({ width, height: 900 })
  await page.goto('#/')
  const header = page.locator('header')
  await expect(header.getByText('平台管理', { exact: true })).toBeVisible()
  await expect(page.getByLabel('切换渠道')).toHaveCount(0)
  await page.getByLabel('管理模式', { exact: true }).click()
  const popup = page.locator('.ant-select-dropdown:visible')
  await expect(popup.locator('.ant-select-item-option')).toHaveCount(2)
  await expect(popup.getByText(a.channel_name, { exact: true })).toHaveCount(0)
  await popup.getByText('渠道管理', { exact: true }).click()
  await expect(header.getByText('渠道管理', { exact: true })).toBeVisible()
  await expect(header.getByText(a.channel_name, { exact: true })).toBeVisible()
  expect(switches).toEqual([{ channel_id: a.channel_id, environment: a.environment, data_scope_id: a.data_scope_id }])
  await page.getByLabel('切换渠道', { exact: true }).click()
  await expect(popup.locator('.ant-select-item-option')).toHaveCount(2)
  await expect(popup.getByText('平台管理', { exact: true })).toHaveCount(0)
  await popup.getByText(b.channel_name, { exact: true }).click()
  await expect(header.getByText(b.channel_name, { exact: true })).toBeVisible()
  await expect(header.getByText('生产', { exact: true })).toBeVisible()
  await expect(header.getByText(b.data_scope_name, { exact: true })).toBeVisible()
  expect(switches[1]).toEqual({ channel_id: b.channel_id, environment: b.environment, data_scope_id: b.data_scope_id })
  await page.reload()
  await expect(header.getByText(b.channel_name, { exact: true })).toBeVisible()
  expect(switches).toHaveLength(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  await page.getByLabel('管理模式', { exact: true }).click()
  await popup.getByText('平台管理', { exact: true }).click()
  await expect(header.getByText('平台管理', { exact: true })).toBeVisible()
  await expect(page.getByLabel('切换渠道')).toHaveCount(0)
  await expect(page.getByLabel('切换环境')).toHaveCount(0)
  expect(platformSwitches).toBe(1)
})

test('没有授权渠道时不能切入渠道模式，单渠道直接显示并禁用渠道切换', async ({ page }) => {
  const workspace = { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test', environment_name: '测试', data_scope_id: 'scope-a', data_scope_name: '业务域甲' }
  let available = false
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    ...session, workspace: available ? workspace : null, workspace_options: available ? [workspace] : [],
  } }))
  await page.goto('#/')
  await page.getByLabel('管理模式', { exact: true }).click()
  const channelMode = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '渠道管理' })
  await expect(channelMode).toHaveClass(/ant-select-item-option-disabled/)
  await channelMode.hover()
  await expect(page.getByRole('tooltip')).toHaveText('暂无可用渠道，请先配置环境及成员授权')
  await expect(page.getByLabel('切换渠道')).toHaveCount(0)
  await page.keyboard.press('Escape')
  available = true
  await page.reload()
  await expect(page.locator('header').getByText(workspace.channel_name, { exact: true })).toBeVisible()
  await expect(page.getByLabel('切换渠道')).toBeDisabled()
})

test('管理模式切换失败后仍显示服务端确认的原模式', async ({ page }) => {
  const workspace = { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test', environment_name: '测试', data_scope_id: 'scope-a', data_scope_name: '业务域甲' }
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: { ...session, workspace_options: [workspace] } }))
  await page.route('**/admin/v1/auth/channel-context', route => route.fulfill({ status: 403, json: {
    error: { code: 'FORBIDDEN', message: '该渠道授权已失效', fields: [] },
  } }))
  await page.goto('#/')
  await page.getByLabel('管理模式').click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道管理', { exact: true }).click()
  await expect(page.getByText('该渠道授权已失效', { exact: true })).toBeVisible()
  await expect(page.locator('header').getByText('平台管理', { exact: true })).toBeVisible()
  await expect(page.getByLabel('切换渠道')).toHaveCount(0)
})

test('无 Token 时仍查询服务端会话，401 显示登录', async ({ page }) => {
  let checks = 0
  await page.route('**/admin/v1/auth/session', route => { checks++; return route.fulfill({ status: 401, json: errorBody(401) }) })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('#/accounts')
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
  expect(checks).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('初始化服务故障可重试，不信任本地 Token 或到期时间', async ({ page }) => {
  let failed = true
  await page.addInitScript(() => sessionStorage.setItem('creativity.management.token', 'opaque'))
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ status: failed ? 503 : 200,
    headers: failed ? { 'X-Request-ID': 'session-request-id' } : undefined,
    json: failed ? errorBody(503) : session }))
  await page.goto('./')
  await expect(page.getByText('服务返回 503', { exact: true })).toBeVisible()
  await expect(page.getByText('请求标识', { exact: false })).toHaveCount(0)
  await expect(page.getByText('session-request-id', { exact: true })).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('creativity.management.token'))).toBe('opaque')
})

test('侧栏沿用服务端导航，跳转、历史记录与顶部刷新保留当前路径', async ({ page }) => {
  await authenticated(page)
  let sessionRequests = 0
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/auth/session')) sessionRequests++ })
  await page.goto('#/accounts')
  const navigation = page.getByRole('navigation', { name: '主导航' })
  await expect(navigation.getByRole('menuitem', { name: '账号管理', exact: true })).toHaveClass(/ant-menu-item-selected/)
  await expect(navigation.getByRole('menuitem', { name: '渠道管理', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('页面路径')).toContainText('组织与权限')
  await expect(page.getByLabel('页面路径')).toContainText('账号管理')
  await navigation.getByRole('menuitem', { name: '工作台', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
  const previousRequests = sessionRequests
  await page.getByRole('button', { name: '刷新当前页面', exact: true }).click()
  await expect.poll(() => sessionRequests).toBeGreaterThan(previousRequests)
  await expect(page).toHaveURL(/\/#\/accounts$/)
  await expect(navigation.getByRole('menuitem', { name: '账号管理', exact: true })).toHaveClass(/ant-menu-item-selected/)
})

for (const width of [375, 820]) test(`窄屏抽屉可跳转和关闭，工作区信息保持可见（${width}）`, async ({ page }) => {
  await authenticated(page)
  const workspace = { channel_id: 'channel-a', channel_name: '研发资料协作渠道', environment: 'test', environment_name: '测试', data_scope_id: 'scope-a', data_scope_name: '产品研发资料域' }
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: { ...session, workspace } }))
  await page.setViewportSize({ width, height: 812 })
  await page.goto('#/')
  await expect(page.getByText(workspace.channel_name, { exact: true })).toBeVisible()
  await expect(page.getByText(workspace.environment_name, { exact: true })).toBeVisible()
  await expect(page.getByText(workspace.data_scope_name, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开导航菜单' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await drawer.getByRole('menuitem', { name: '账号管理', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '用户菜单' }).click()
  await expect(page.getByRole('menuitem', { name: '返回平台', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '退出登录', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})

test('409 保留输入，重复提交只发出一次请求，读取新版本后可恢复', async ({ page }) => {
  await authenticated(page)
  let posts = 0
  let revision = 1
  await page.route('**/admin/v1/accounts**', async route => {
    if (route.request().method() === 'PATCH') {
      posts++
      await new Promise(resolve => setTimeout(resolve, 250))
      const body = route.request().postDataJSON() as { display_name: string; revision: number }
      if (posts === 1) { revision = 2; await route.fulfill({ status: 409,
        headers: { 'X-Request-ID': 'conflict-request-id' }, json: errorBody(409) }) }
      else { expect(body).toMatchObject({ display_name: '待保留名称', revision: 2 }); await route.fulfill({ json: { ...account, ...body } }) }
    } else await route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/roles') ? roles
      : new URL(route.request().url()).pathname.endsWith('/page') ? { items: [{ ...account, revision }], total: 1, offset: 0, limit: 20 } : { ...account, revision } })
  })
  await page.goto('#/accounts')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('显示名称').fill('待保留名称')
  await dialog.getByRole('button', { name: '确认', exact: true }).dblclick()
  await expect(dialog.getByText('服务返回 409', { exact: true })).toBeVisible()
  await expect(dialog.getByText('提交冲突', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('conflict-request-id', { exact: true })).toHaveCount(0)
  expect(posts).toBe(1)
  await expect(dialog.getByLabel('显示名称')).toHaveValue('待保留名称')
  await dialog.getByRole('button', { name: '读取最新版本，保留填写内容' }).click()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(posts).toBe(2)
})

test('直接访问接口被拒绝时显示无权限，导航不成为授权依据', async ({ page }) => {
  await authenticated(page)
  await page.route('**/admin/v1/accounts**', route => route.fulfill({ status: 403, json: errorBody(403) }))
  await page.goto('#/accounts')
  await expect(page.getByText('服务返回 403', { exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('窄屏与未知页面没有横向溢出或浏览器错误', async ({ page }) => {
  await authenticated(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('#/accounts')
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.goto('#/missing-page')
  await expect(page.getByText('页面不存在')).toBeVisible()
  expect(errors).toEqual([])
})

test('IAM-A14 切换渠道清除筛选和旧请求，迟到 401 不影响新工作区', async ({ page }) => {
  const a = { channel_id: 'channel-a', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'scope-a', data_scope_name: '租号数据域' }
  const b = { channel_id: 'channel-b', channel_name: '陪玩渠道', environment: 'prod', environment_name: '生产', data_scope_id: 'scope-b', data_scope_name: '俱乐部' }
  let deferA = false
  let release!: () => void
  let pending = false
  await page.route('**/admin/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const current = request.headers().authorization === 'Bearer channel-b-token' ? b : a
    if (path.endsWith('/auth/channels')) return route.fulfill({ json: [a, b] })
    if (path.endsWith('/auth/channel-context')) return route.fulfill({ json: { access_token: 'channel-b-token', token_type: 'Bearer', expires_in: 3600 } })
    if (path.endsWith('/auth/session')) return route.fulfill({ json: { ...session, workspace: current,
      workspace_options: [a, b], can_access_platform: false, navigation: [{ navigation_key: 'channels', label: '渠道管理' }], actions: [] } })
    if (path.endsWith('/channels/page')) {
      if (current === a && deferA) {
        pending = true
        await new Promise<void>(resolve => { release = resolve })
        await route.fulfill({ status: 401, json: errorBody(401) }).catch(() => undefined)
      } else await route.fulfill({ json: { items: [{ channel_id: current.channel_id, name: current.channel_name, owner: '负责人', status_label: '启用', created_at: '2026-10-01T00:00:00Z' }], total: 1, offset: 0, limit: 20 } })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.goto('#/channels')
  await page.getByLabel('筛选渠道').fill('租号')
  deferA = true
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect.poll(() => pending).toBe(true)
  await page.getByLabel('切换渠道', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('陪玩渠道', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  release()
  await page.getByRole('menuitem', { name: '渠道管理' }).click()
  await expect(page.getByLabel('筛选渠道')).toHaveValue('')
  await expect(page.getByRole('link', { name: '陪玩渠道', exact: true })).toBeVisible()
  await expect(page.getByText('租号渠道', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toHaveCount(0)
})
