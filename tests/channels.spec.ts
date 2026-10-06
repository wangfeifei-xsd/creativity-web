import { expect, test, type Page } from '@playwright/test'

const channel = { channel_id: 'channel_a', channel_code: 'research', name: '资料渠道', owner: '管理员',
  status: 'ACTIVE', status_label: '启用', created_at: '2026-10-02T01:00:00Z', archived_at: null, revision: 1, retention_policy: { retention_days: 90 }, actions: [] }
async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' }, workspace: null,
      navigation: [{ navigation_key: 'channels', label: '渠道管理' }], actions: [{ action_key: 'channel:create', label: '开通渠道' }], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/channel-create-options')) json = { accounts: [{ value: 'admin_a', label: '管理员' }], environments: [{ value: 'test', label: '测试' }],
      independent_actions: [{ action_key: 'run:approve', label: '审批运行操作' }] }
    else if (path === '/admin/v1/channels/page') json = { items: [channel], total: 1, offset: 0, limit: 20 }
    else if (path.endsWith('/page')) json = { channel, tabs: [{ navigation_key: 'data-scopes', label: '业务数据域' }], actions: [{ action_key: 'data_scope:create', label: '创建数据域' }], service_actions: [], management_missing_environments: [] }
    else if (path.endsWith('/environments')) json = [{ environment: 'test', name: '测试', status: 'ACTIVE' }]
    else if (path.endsWith('/data-scopes')) json = [{ data_scope_id: 'scope_a', name: '研发资料', environment: 'test', environment_name: '测试', external_scope_type: '源系统/workspace', external_scope_type_name: null, external_scope_id: '研发:001/甲', status: 'ACTIVE', status_label: '启用', revision: 1 }]
    await route.fulfill({ json })
  })
}

for (const width of [1391, 390]) test(`渠道列表仅提示环境，接入服务和 Key 不标未完成（${width}）`, async ({ page }, testInfo) => {
  await fixture(page)
  await page.setViewportSize({ width, height: 1000 })
  const check = { key: 'environments', label: '环境', completed: true, message: '已配置：1 个启用环境', path: '/channels/channel_a?tab=environments' }
  let configured = true
  await page.route('**/admin/v1/channels/page?*', route => route.fulfill({ json: {
    items: [{ ...channel, configuration_status: [{ ...check, completed: configured,
      message: configured ? check.message : '未配置：没有启用环境' },
    { key: 'clients', label: '接入服务', completed: false, message: '旧版未完成提示', path: '/channels/channel_a?tab=clients' },
    { key: 'keys', label: '接入 Key', completed: false, message: '旧版未完成提示', path: '/channels/channel_a?tab=keys' }] }], total: 1, offset: 0, limit: 20,
  } }))
  await page.route('**/channels/channel_a/page', route => route.fulfill({ json: {
    channel, tabs: [{ navigation_key: check.key, label: check.label }],
    actions: [], service_actions: [], management_missing_environments: [],
  } }))
  await page.goto('#/channels')
  await expect(page.getByRole('columnheader')).toHaveText(['渠道名称', '负责人', '状态', '开通时间', '环境配置'])
  const environment = page.getByRole('link', { name: '环境：已配置', exact: true })
  await expect(environment.locator('.ant-tag')).toHaveClass(/ant-tag-success/)
  await expect(page.getByRole('link', { name: /接入服务：|接入 Key：/ })).toHaveCount(0)
  await environment.hover()
  await expect(page.getByRole('tooltip')).toHaveText(check.message)
  await page.getByRole('heading', { name: '渠道管理', exact: true }).hover()
  await page.screenshot({ path: testInfo.outputPath('channel-configuration-status.png'), fullPage: true })
  await environment.click()
  await expect(page).toHaveURL(`/creativity/#${check.path}`)
  await expect(page.getByRole('tab', { name: check.label, exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('link', { name: '渠道列表', exact: true }).click()
  configured = false
  await page.reload()
  const missing = page.getByRole('link', { name: '环境：未配置', exact: true })
  await expect(missing.locator('.ant-tag')).toHaveClass(/ant-tag-error/)
  await missing.hover()
  await expect(page.getByRole('tooltip')).toHaveText('未配置：没有启用环境')
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

const managementWorkspace = { channel_id: 'channel_a', channel_name: '资料渠道', environment: 'test',
  environment_name: '测试', data_scope_id: 'manage_a', data_scope_name: '管理工作区' }

async function managementFixture(page: Page) {
  await fixture(page)
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' },
    workspace: managementWorkspace, can_access_platform: true, default_workspace: managementWorkspace,
    workspace_options: [managementWorkspace],
    navigation: [{ navigation_key: 'channels', label: '渠道管理' }], actions: [], expires_at: '2030-01-01T00:00:00Z',
  } }))
}

test('数据域没有配置目录时不能手填，提示先接入目录', async ({ page }) => {
  await managementFixture(page)
  await page.route('**/channels/channel_a/data-scope-sources', route => route.fulfill({ json: [] }))
  await page.goto('#/channels/channel_a?tab=data-scopes')
  await page.getByRole('button', { name: '创建数据域' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('当前工作区尚无可用的数据域目录工具。', { exact: false })).toBeVisible()
  await expect(dialog.getByLabel('外部数据域类型')).toHaveCount(0)
  await expect(dialog.getByLabel('外部数据域编号')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '确认' })).toBeDisabled()
})

test('旧渠道可从已有环境显式补齐管理入口', async ({ page }) => {
  await fixture(page)
  let provisioned = false
  await page.route('**/channels/channel_a/page', route => route.fulfill({ json: {
    channel, tabs: [{ navigation_key: 'environments', label: '环境' }],
    actions: [{ action_key: 'environment:edit', label: '编辑' }],
    service_actions: [], pending_administrator: { value: 'admin_a', label: '管理员' },
    management_missing_environments: provisioned ? [] : ['test'],
  } }))
  await page.route('**/channels/channel_a/environments/test/management-workspace', route => {
    provisioned = true
    return route.fulfill({ status: 204, body: '' })
  })
  await page.goto('#/channels/channel_a?tab=environments')
  await page.getByRole('button', { name: '开通管理入口' }).click()
  await expect(page.getByRole('button', { name: '开通管理入口' })).toHaveCount(0)
  expect(provisioned).toBe(true)
})

for (const width of [1391, 390]) test(`从真实目录选择数据域，自动带入名称、类型和编号（${width}）`, async ({ page }, testInfo) => {
  await managementFixture(page)
  await page.setViewportSize({ width, height: 1000 })
  const source = { connection_id: 'mcp_a', remote_tool_name: 'list_data_scopes', label: '俱乐部系统 · 业务范围目录' }
  let created: Record<string, unknown> | undefined
  await page.route('**/channels/channel_a/data-scope-sources', route => route.fulfill({ json: [source] }))
  await page.route('**/channels/channel_a/data-scope-directory', route => {
    expect(route.request().postDataJSON()).toEqual({ environment: 'test', connection_id: source.connection_id, remote_tool_name: source.remote_tool_name })
    return route.fulfill({ json: { items: [{ name: '俱乐部甲', type: 'club', id: 'club-001' }, { name: '俱乐部乙', type: 'club', id: 'club-002' }] } })
  })
  await page.route('**/channels/channel_a/data-scopes/from-source', route => {
    created = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: {} })
  })
  await page.goto('#/channels/channel_a?tab=data-scopes')
  await page.getByRole('button', { name: '创建数据域' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('名称', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('外部数据域类型')).toHaveCount(0)
  await expect(dialog.getByLabel('外部数据域编号')).toHaveCount(0)
  await dialog.getByLabel('目录来源').click()
  await page.locator('.ant-select-dropdown:visible').getByText(source.label).click()
  await dialog.getByLabel('可选数据域').click()
  await page.locator('.ant-select-dropdown:visible').getByText('俱乐部乙 · club / club-002').click()
  await page.screenshot({ path: testInfo.outputPath('source-directory.png'), fullPage: true })
  await dialog.getByRole('button', { name: '确认' }).click()
  await expect(dialog).toBeHidden()
  expect(created).toEqual({ environment: 'test', connection_id: source.connection_id,
    remote_tool_name: source.remote_tool_name, external_scope_type: 'club', external_scope_id: 'club-002' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})
