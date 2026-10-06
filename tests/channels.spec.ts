import { expect, test, type Page } from '@playwright/test'

const channel = { channel_id: 'channel_a', channel_code: 'research', name: '资料渠道', owner: '管理员',
  status: 'ACTIVE', status_label: '启用', created_at: '2026-10-02T01:00:00Z', archived_at: null, revision: 1, retention_policy: { retention_days: 90 }, actions: [] }
const scopeTypes = [
  { value: 'workspace', label: '工作区（workspace）' },
  { value: 'organization', label: '组织（organization）' },
  { value: 'department', label: '部门（department）' },
  { value: 'project', label: '项目（project）' },
  { value: 'default', label: '默认业务域（default）' },
]
async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' }, workspace: null,
      navigation: [{ navigation_key: 'channels', label: '渠道管理' }], actions: [{ action_key: 'channel:create', label: '开通渠道' }], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/channel-create-options')) json = { accounts: [{ value: 'admin_a', label: '管理员' }], environments: [{ value: 'test', label: '测试' }],
      independent_actions: [{ action_key: 'run:approve', label: '审批运行操作' }] }
    else if (path === '/admin/v1/channels/page') json = { items: [channel], total: 1, offset: 0, limit: 20 }
    else if (path.endsWith('/page')) json = { channel, tabs: [{ navigation_key: 'data-scopes', label: '业务数据域' }], actions: [{ action_key: 'data_scope:create', label: '创建数据域' }], service_actions: [], data_scope_types: scopeTypes }
    else if (path.endsWith('/environments')) json = [{ environment: 'test', name: '测试', status: 'ACTIVE' }]
    else if (path.endsWith('/data-scopes')) json = [{ data_scope_id: 'scope_a', name: '研发资料', environment: 'test', environment_name: '测试', external_scope_type: '源系统/workspace', external_scope_type_name: null, external_scope_id: '研发:001/甲', status: 'ACTIVE', status_label: '启用', revision: 1 }]
    await route.fulfill({ json })
  })
}

for (const width of [1391, 390]) test(`渠道配置状态紧跟开通时间，红绿提示并支持快捷跳转（${width}）`, async ({ page }, testInfo) => {
  await fixture(page)
  await page.setViewportSize({ width, height: 1000 })
  const checks = [
    { key: 'environments', label: '环境', completed: true, message: '已配置：1 个启用环境', path: '/channels/channel_a?tab=environments' },
    { key: 'data-scopes', label: '数据域', completed: false, message: '未完成：没有启用且所属环境启用的数据域', path: '/channels/channel_a?tab=data-scopes' },
    { key: 'clients', label: '接入服务', completed: false, message: '未完成：没有启用且数据范围有效的接入服务', path: '/channels/channel_a?tab=clients' },
    { key: 'keys', label: '接入 Key', completed: false, message: '未完成：没有未过期且所属接入服务有效的 Key', path: '/channels/channel_a?tab=keys' },
  ]
  await page.route('**/admin/v1/channels/page?*', route => route.fulfill({ json: {
    items: [{ ...channel, configuration_status: checks }], total: 1, offset: 0, limit: 20,
  } }))
  await page.route('**/channels/channel_a/page', route => route.fulfill({ json: {
    channel, tabs: checks.map(check => ({ navigation_key: check.key, label: check.label })),
    actions: [], service_actions: [], data_scope_types: scopeTypes,
  } }))
  await page.goto('#/channels')
  await expect(page.getByRole('columnheader')).toHaveText(['渠道名称', '负责人', '状态', '开通时间', '配置状态'])
  const environment = page.getByRole('link', { name: '环境：已完成', exact: true })
  await expect(environment.locator('.ant-tag')).toHaveClass(/ant-tag-success/)
  const domain = page.getByRole('link', { name: '数据域：未完成', exact: true })
  await expect(domain.locator('.ant-tag')).toHaveClass(/ant-tag-error/)
  await domain.hover()
  await expect(page.getByRole('tooltip')).toHaveText(checks[1].message)
  await page.getByRole('heading', { name: '渠道管理', exact: true }).hover()
  await page.screenshot({ path: testInfo.outputPath('channel-configuration-status.png'), fullPage: true })
  for (const check of checks) {
    await page.getByRole('link', { name: `${check.label}：${check.completed ? '已完成' : '未完成'}`, exact: true }).click()
    await expect(page).toHaveURL(`/creativity/#${check.path}`)
    await expect(page.getByRole('tab', { name: check.label, exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('link', { name: '渠道列表', exact: true }).click()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})

test('Hash 详情地址可直达、刷新，并支持列表跳转和前进后退', async ({ page }) => {
  await fixture(page)
  const documents: string[] = []
  page.on('request', request => {
    if (request.resourceType() === 'document') documents.push(new URL(request.url()).pathname)
  })
  await page.goto('#/channels/channel_a?from=bookmark')
  const heading = page.getByRole('heading', { name: '资料渠道', exact: true })
  const menu = page.getByRole('menuitem', { name: '渠道管理', exact: true })
  await expect(heading).toBeVisible()
  await expect(page.getByText('业务分类', { exact: true })).toHaveCount(0)
  await expect(menu).toHaveClass(/ant-menu-item-selected/)
  await expect(page.getByLabel('页面路径')).toContainText('详情')
  await expect(page.getByLabel('页面路径').getByRole('link', { name: '渠道管理', exact: true })).toHaveAttribute('href', '#/channels')
  await page.reload()
  await expect(heading).toBeVisible()
  await expect(page).toHaveURL(/\/#\/channels\/channel_a\?from=bookmark$/)
  await page.getByRole('link', { name: '渠道列表', exact: true }).click()
  await expect(page).toHaveURL(/\/#\/channels$/)
  await expect(page.getByRole('columnheader', { name: '业务分类', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '资料渠道', exact: true })).toHaveAttribute('href', '#/channels/channel_a')
  await page.getByRole('link', { name: '资料渠道', exact: true }).click()
  await expect(heading).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/#\/channels$/)
  await expect(page.getByRole('heading', { name: '渠道管理', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/#\/channels\/channel_a$/)
  await expect(heading).toBeVisible()
  await expect(menu).toHaveClass(/ant-menu-item-selected/)
  expect(documents).toEqual(['/creativity/', '/creativity/'])
})

for (const width of [1280, 390]) test(`渠道开通只填写基本信息，成功进入环境配置（${width}）`, async ({ page }, testInfo) => {
  await fixture(page)
  await page.setViewportSize({ width, height: 1000 })
  let body: Record<string, unknown> | undefined
  await page.route('**/admin/v1/channels', async route => {
    body = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: channel })
  })
  await page.goto('#/channels')
  await page.getByRole('button', { name: '开通渠道' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('渠道名称').fill('资料渠道')
  await expect(dialog.getByLabel('渠道编码')).toHaveCount(0)
  await expect(dialog.getByLabel('业务分类')).toHaveCount(0)
  await dialog.getByLabel('负责人').fill('管理员')
  await dialog.getByLabel('首位管理员').click()
  await page.locator('.ant-select-dropdown:visible').getByText('管理员', { exact: true }).click()
  await dialog.getByLabel('独立授权').click()
  await page.locator('.ant-select-dropdown:visible').getByText('审批运行操作', { exact: true }).click()
  await expect(dialog.getByLabel('初始环境')).toHaveCount(0)
  await expect(dialog.getByLabel('数据域名称')).toHaveCount(0)
  await expect(dialog.getByLabel('外部数据域类型')).toHaveCount(0)
  await expect(dialog.getByLabel('外部数据域编号')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath(`channel-${width}.png`), fullPage: true })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/#\/channels\/channel_a\?tab=environments$/)
  expect(body).not.toHaveProperty('business_type')
  expect(body).not.toHaveProperty('channel_code')
  expect(body?.independent_actions).toEqual(['run:approve'])
  expect(body).not.toHaveProperty('environment')
  expect(body).not.toHaveProperty('data_scope')
})

test('新增数据域保留外部配置原值', async ({ page }) => {
  await fixture(page)
  let body: unknown
  await page.route('**/channels/channel_a/data-scopes', async route => {
    if (route.request().method() === 'GET') return route.fallback()
    body = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: {} })
  })
  await page.goto('#/channels/channel_a')
  await expect(page.getByRole('cell', { name: '源系统/workspace', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '创建数据域' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('第二资料域')
  await dialog.getByLabel('环境', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('测试', { exact: true }).click()
  await dialog.getByLabel('外部数据域类型').fill('org/project')
  await dialog.getByLabel('外部数据域编号').fill('001')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(body).toEqual({ name: '第二资料域', environment: 'test', external_scope_type: 'org/project', external_scope_id: '001' })
})

test('数据域类型可选择本渠道已有值', async ({ page }) => {
  await fixture(page)
  let body: Record<string, unknown> | undefined
  await page.route('**/channels/channel_a/data-scopes', async route => {
    if (route.request().method() === 'GET') return route.fallback()
    body = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: {} })
  })
  await page.goto('#/channels/channel_a')
  await page.getByRole('button', { name: '创建数据域' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('第三资料域')
  await dialog.getByLabel('环境', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('测试', { exact: true }).click()
  await dialog.getByLabel('外部数据域类型').click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText('源系统/workspace', { exact: true }).click()
  await dialog.getByLabel('外部数据域编号').fill('研发:002/乙')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(body?.external_scope_type).toBe('源系统/workspace')
  expect(body?.external_scope_id).toBe('研发:002/乙')
})

for (const width of [1391, 390]) test(`首个数据域可搜索并选择中文类型，编号必须由用户明确填写（${width}）`, async ({ page }, testInfo) => {
  await fixture(page)
  await page.setViewportSize({ width, height: 1000 })
  let body: Record<string, unknown> | undefined
  await page.route('**/channels/channel_a/data-scopes', async route => {
    if (route.request().method() === 'POST') body = route.request().postDataJSON()
    await route.fulfill({ json: [] })
  })
  await page.goto('#/channels/channel_a')
  await page.getByRole('button', { name: '创建数据域', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('研发资料')
  await dialog.getByLabel('环境', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('测试', { exact: true }).click()
  const type = dialog.getByLabel('外部数据域类型', { exact: true })
  await type.click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('工作区（workspace）', { exact: true })).toBeVisible()
  await type.fill('工作区')
  await page.locator('.ant-select-dropdown:visible').getByText('工作区（workspace）', { exact: true }).click()
  await expect(type).toHaveValue('workspace')
  await expect(dialog.getByLabel('外部数据域编号')).toBeEmpty()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog.getByText('请填写外部数据域编号')).toBeVisible()
  expect(body).toBeUndefined()
  await dialog.getByLabel('外部数据域编号').fill('workspace-001')
  await type.click()
  await page.screenshot({ path: testInfo.outputPath('data-scope-type-options.png'), fullPage: true })
  await type.press('Escape')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(body).toEqual({ name: '研发资料', environment: 'test', external_scope_type: 'workspace', external_scope_id: 'workspace-001' })
})

test('分步配置环境和数据域，首位管理员明确绑定首个真实范围', async ({ page }) => {
  await fixture(page)
  let environment: Record<string, unknown> | undefined
  let dataScope: Record<string, unknown> | undefined
  let entered = false
  let channelSwitches = 0
  let platformSwitches = 0
  const workspace = { channel_id: 'channel_a', channel_name: '资料渠道', environment: 'test', environment_name: '测试', data_scope_id: 'scope_new', data_scope_name: '研发资料' }
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' }, workspace: entered ? workspace : null,
    navigation: [{ navigation_key: 'channels', label: '渠道管理' }], actions: [], can_access_platform: true,
    default_workspace: null, expires_at: '2030-01-01T00:00:00Z',
    workspace_options: dataScope ? [workspace] : [],
  } }))
  await page.route('**/channels/channel_a/page', route => route.fulfill({ json: {
    channel, tabs: [{ navigation_key: 'environments', label: '环境' }, { navigation_key: 'data-scopes', label: '业务数据域' }],
    actions: [{ action_key: 'environment:create', label: '创建环境' }, { action_key: 'data_scope:create', label: '创建数据域' }],
    service_actions: [], data_scope_types: scopeTypes, pending_administrator: dataScope ? null : { value: 'admin_a', label: '管理员' },
  } }))
  await page.route('**/channels/channel_a/environments', async route => {
    if (route.request().method() === 'POST') environment = route.request().postDataJSON()
    await route.fulfill({ json: environment ? [{ ...environment, name: '测试', status: 'ACTIVE', status_label: '启用', revision: 1 }] : [] })
  })
  await page.route('**/channels/channel_a/data-scopes', async route => {
    if (route.request().method() === 'POST') dataScope = route.request().postDataJSON()
    await route.fulfill({ json: dataScope ? [{ ...dataScope, data_scope_id: 'scope_new', environment_name: '测试', status_label: '启用' }] : [] })
  })
  await page.route('**/admin/v1/auth/channel-context', async route => {
    expect(route.request().postDataJSON()).toEqual({ channel_id: workspace.channel_id, environment: workspace.environment, data_scope_id: workspace.data_scope_id })
    entered = true
    channelSwitches++
    await route.fulfill({ json: { access_token: 'configured-channel-token', token_type: 'Bearer', expires_in: 3600 } })
  })
  await page.route('**/admin/v1/auth/platform-context', async route => {
    entered = false
    platformSwitches++
    await route.fulfill({ json: { access_token: 'platform-token', token_type: 'Bearer', expires_in: 3600 } })
  })
  await page.goto('#/channels/channel_a?tab=environments')
  await page.getByRole('button', { name: '创建环境', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('测试')
  await dialog.getByLabel('环境', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('测试', { exact: true }).click()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: '业务数据域', exact: true }).click()
  await expect(page).toHaveURL(/#\/channels\/channel_a\?tab=data-scopes$/)
  await page.getByRole('button', { name: '创建数据域', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('该工作区管理员')).toBeDisabled()
  await expect(dialog).toContainText('管理员')
  await dialog.getByLabel('名称', { exact: true }).fill('研发资料')
  await dialog.getByLabel('环境', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('测试', { exact: true }).click()
  await dialog.getByLabel('外部数据域类型').fill('新业务/workspace')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog.getByText('请填写外部数据域编号')).toBeVisible()
  expect(dataScope).toBeUndefined()
  await dialog.getByLabel('外部数据域编号').fill('001/甲')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(dataScope).toEqual({ name: '研发资料', environment: 'test', external_scope_type: '新业务/workspace', external_scope_id: '001/甲', administrator_id: 'admin_a' })
  await page.getByLabel('管理模式', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('渠道管理', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '创建数据域', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('该工作区管理员')).toBeEnabled()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.getByLabel('管理模式', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道管理', { exact: true }).click()
  await expect(page.locator('header').getByText('资料渠道', { exact: true })).toBeVisible()
  expect(channelSwitches).toBe(1)
  await page.getByLabel('管理模式', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('平台管理', { exact: true }).click()
  await expect(page.locator('header').getByText('平台管理', { exact: true })).toBeVisible()
  await expect(page.getByLabel('切换渠道')).toHaveCount(0)
  expect(platformSwitches).toBe(1)
})
