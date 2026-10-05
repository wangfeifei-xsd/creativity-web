import { expect, test } from '@playwright/test'

const a = { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test', environment_name: '测试', data_scope_id: 'domain-a', data_scope_name: '业务域甲' }
const b = { channel_id: 'channel-b', channel_name: '渠道乙', environment: 'test', environment_name: '测试', data_scope_id: 'domain-b', data_scope_name: '业务域乙' }
const roles = [{ role_code: 'platform_admin', name: '平台管理员', grant_scope: 'platform' }, { role_code: 'channel_admin', name: '渠道管理员', grant_scope: 'channel' }]
const user = { user_id: 'admin', login_name: 'admin', display_name: '管理员' }

test('渠道管理员自动进入服务端默认渠道，切换不再经过工作区弹窗', async ({ page }) => {
  let current: typeof a | null = null
  const switches: unknown[] = []
  await page.addInitScript(() => sessionStorage.setItem('creativity.management.token', 'login-token'))
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: {
      user, workspace: current, workspace_options: [a, b], default_workspace: current ? null : a,
      can_access_platform: false, navigation: current ? [{ navigation_key: 'agents', label: '智能体管理' }] : [],
      actions: [], expires_at: '2030-01-01T00:00:00Z',
    } })
    if (path.endsWith('/auth/channel-context')) {
      const input = route.request().postDataJSON()
      switches.push(input)
      current = input.channel_id === a.channel_id ? a : b
      return route.fulfill({ json: { access_token: `${current.channel_id}-token`, token_type: 'Bearer', expires_in: 7200 } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  expect(switches).toEqual([{ channel_id: a.channel_id, environment: 'test', data_scope_id: a.data_scope_id }])
  await expect(page.getByText('选择工作区', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '进入工作区' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '账号管理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '智能体管理', exact: true })).toBeVisible()
  await expect(page.getByLabel('管理模式')).toBeDisabled()
  await expect(page.locator('header').getByText('渠道管理', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '用户菜单' }).click()
  await expect(page.getByRole('menuitem', { name: '返回平台', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByLabel('切换渠道', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道乙', { exact: true }).click()
  await expect(page.getByText('业务域乙', { exact: true })).toBeVisible()
  expect(switches).toHaveLength(2)
  expect(switches[1]).toEqual({ channel_id: b.channel_id, environment: 'test', data_scope_id: b.data_scope_id })
  await page.reload()
  await expect(page.getByText('业务域乙', { exact: true })).toBeVisible()
  expect(switches).toHaveLength(2)
})

test('未分配渠道不会显示平台身份，也不能通过页面获得平台菜单', async ({ page }) => {
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    user, workspace: null, workspace_options: [], default_workspace: null,
    can_access_platform: false, navigation: [], actions: [], expires_at: '2030-01-01T00:00:00Z',
  } }))
  await page.goto('/#/')
  await expect(page.getByText('尚未分配可用渠道，请联系平台管理员')).toBeVisible()
  await expect(page.getByLabel('切换渠道')).toHaveCount(0)
  await expect(page.getByText('平台管理', { exact: true })).toHaveCount(0)
})

test('账号读取内置角色，渠道可多选，改为平台作用域时不提交残留渠道', async ({ page }) => {
  const writes: Record<string, unknown>[] = []
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: {
      user, workspace: null, workspace_options: [], default_workspace: null, can_access_platform: true,
      navigation: [{ navigation_key: 'accounts', label: '账号管理' }],
      actions: [{ action_key: 'account:manage', label: '管理账号' }], expires_at: '2030-01-01T00:00:00Z',
    } })
    if (path.endsWith('/accounts/roles')) return route.fulfill({ json: roles })
    if (path.endsWith('/accounts/page')) return route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } })
    if (path.endsWith('/channels/page')) return route.fulfill({ json: {
      items: [a, b].map(item => ({ channel_id: item.channel_id, name: item.channel_name, status: 'ACTIVE' })),
      total: 2, offset: 0, limit: 20,
    } })
    if (path.endsWith('/accounts') && request.method() === 'POST') {
      writes.push(request.postDataJSON())
      return route.fulfill({ status: 201, json: {} })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/accounts')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('登录名').fill('channel-admin')
  await dialog.getByLabel('初始密码').fill('Initial-password-1234')
  await dialog.getByLabel('显示名称').fill('渠道管理员甲')
  await dialog.getByLabel('角色', { exact: true }).click()
  const popup = page.locator('.ant-select-dropdown:visible')
  await expect(popup.locator('.ant-select-item-option')).toHaveCount(2)
  await popup.getByText('渠道管理员', { exact: true }).click()
  await dialog.getByLabel('授权渠道', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道甲', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道乙', { exact: true }).click()
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes[0]).toMatchObject({ role: 'channel_admin', channel_ids: ['channel-a', 'channel-b'] })
  expect(writes[0]).not.toHaveProperty('platform_roles')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('登录名').fill('platform-admin')
  await dialog.getByLabel('初始密码').fill('Initial-password-1234')
  await dialog.getByLabel('显示名称').fill('平台管理员乙')
  await dialog.getByLabel('授权渠道', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道甲', { exact: true }).click()
  await page.keyboard.press('Escape')
  await dialog.getByLabel('角色', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('平台管理员', { exact: true }).click()
  await expect(dialog.getByLabel('授权渠道', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes[1]).toMatchObject({ role: 'platform_admin', channel_ids: [] })
})

test('渠道多选支持服务端搜索和分页，已选名称不随翻页丢失', async ({ page }) => {
  const searches: string[] = []
  await page.route('**/admin/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: {
      user, workspace: null, can_access_platform: true, navigation: [{ navigation_key: 'accounts', label: '账号管理' }],
      actions: [{ action_key: 'account:manage', label: '管理账号' }], expires_at: '2030-01-01T00:00:00Z',
    } })
    if (path.endsWith('/accounts/roles')) return route.fulfill({ json: roles })
    if (path.endsWith('/accounts/page')) return route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } })
    if (path.endsWith('/channels/page')) {
      const search = url.searchParams.get('search') ?? '', offset = Number(url.searchParams.get('offset'))
      searches.push(`${search}:${offset}`)
      return route.fulfill({ json: { items: [{ channel_id: offset ? 'last-channel' : 'first-channel',
        name: offset ? '末页渠道' : '首个渠道', status: 'ACTIVE' }], total: 201, offset, limit: 20 } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/accounts')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  const picker = page.getByRole('dialog').getByLabel('授权渠道', { exact: true })
  await picker.click()
  await page.locator('.ant-select-dropdown:visible').getByText('首个渠道', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByTitle('11', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('末页渠道', { exact: true })).toBeVisible()
  await page.locator('.ant-select-dropdown:visible').getByText('末页渠道', { exact: true }).click()
  await picker.fill('检索名称')
  await expect.poll(() => searches.includes('检索名称:0')).toBe(true)
  await expect(page.getByRole('dialog').getByText('首个渠道', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('末页渠道', { exact: true })).toBeVisible()
})

test('账号可选择角色目录中的自定义角色，按作用域联动渠道而非固定角色编码', async ({ page }) => {
  const writes: Record<string, unknown>[] = []
  const catalog = [
    { role_code: 'role_channel_observer', name: '渠道观察员', grant_scope: 'channel' },
    { role_code: 'role_platform_operator', name: '平台运营员', grant_scope: 'platform' },
  ]
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: {
      user, workspace: null, can_access_platform: true, navigation: [{ navigation_key: 'accounts', label: '账号管理' }],
      actions: [{ action_key: 'account:manage', label: '管理账号' }], expires_at: '2030-01-01T00:00:00Z',
    } })
    if (path.endsWith('/accounts/roles')) return route.fulfill({ json: catalog })
    if (path.endsWith('/accounts/page')) return route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } })
    if (path.endsWith('/channels/page')) return route.fulfill({ json: {
      items: [a, b].map(channel => ({ channel_id: channel.channel_id, name: channel.channel_name, status: 'ACTIVE' })),
      total: 2, offset: 0, limit: 20,
    } })
    if (path.endsWith('/accounts') && request.method() === 'POST') {
      writes.push(request.postDataJSON())
      return route.fulfill({ status: 201, json: {} })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/accounts')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('渠道观察员', { exact: true })).toBeVisible()
  await dialog.getByLabel('登录名').fill('catalog-user')
  await dialog.getByLabel('初始密码').fill('Initial-password-1234')
  await dialog.getByLabel('显示名称').fill('渠道观察账号')
  await dialog.getByLabel('授权渠道', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道甲', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道乙', { exact: true }).click()
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes[0]).toMatchObject({ role: 'role_channel_observer', channel_ids: ['channel-a', 'channel-b'] })
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await dialog.getByLabel('角色', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('平台运营员', { exact: true }).click()
  await expect(dialog.getByLabel('授权渠道', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('平台管理员', { exact: true })).toHaveCount(0)
})
