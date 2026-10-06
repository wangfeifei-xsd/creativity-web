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
    else if (path.endsWith('/page')) json = { channel, tabs: [{ navigation_key: 'environments', label: '环境' }], actions: [], service_actions: [] }
    else if (path.endsWith('/environments')) json = [{ environment: 'test', name: '测试', status: 'ACTIVE' }]
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
    actions: [], service_actions: [],
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


test('渠道内展示全部授权环境并切换，页面没有数据域或工作区划分', async ({ page }) => {
  await fixture(page)
  const dev = { channel_id: channel.channel_id, channel_name: channel.name, environment: 'dev', environment_name: '开发环境' }
  const prod = { ...dev, environment: 'prod', environment_name: '生产环境' }
  let current = dev
  const switches: unknown[] = []
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' },
    workspace: current, workspace_options: [dev, prod], can_access_platform: false,
    navigation: [{ navigation_key: 'channels', label: '渠道管理' }], actions: [], expires_at: '2030-01-01T00:00:00Z',
  } }))
  await page.route('**/channels/channel_a/environments', route => route.fulfill({ json:
    [dev, prod].map(env => ({ ...env, name: env.environment_name, status: 'ACTIVE', status_label: '启用' }))
  }))
  await page.route('**/admin/v1/auth/channel-context', route => {
    switches.push(route.request().postDataJSON()); current = prod
    return route.fulfill({ json: { access_token: 'prod-token', token_type: 'Bearer', expires_in: 3600 } })
  })
  await page.goto('#/channels/channel_a?tab=environments')
  await expect(page.getByRole('row').filter({ hasText: '生产环境' })).toBeVisible()
  await expect(page.getByRole('button', { name: '开通管理入口' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /数据域/ })).toHaveCount(0)
  await expect(page.getByLabel('业务数据范围')).toHaveCount(0)
  await page.getByLabel('切换环境', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('生产环境', { exact: true }).click()
  expect(switches).toEqual([{ channel_id: channel.channel_id, environment: 'prod' }])
  await expect(page.locator('header').getByText('生产环境', { exact: true })).toBeVisible()
})
