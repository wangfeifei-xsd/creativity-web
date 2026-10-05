import { expect, test } from '@playwright/test'

const workspace = { channel_id: 'channel_a', channel_name: '业务渠道', environment: 'test', environment_name: '测试', data_scope_id: 'domain_a', data_scope_name: '资料域' }
const session = {
  user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace,
  navigation: [{ navigation_key: 'members', label: '成员与权限' }],
  actions: [{ action_key: 'membership:manage', label: '管理成员' }, { action_key: 'run:read', label: '查看运行' }],
  expires_at: '2030-01-01T00:00:00Z',
}

test('外部身份交换失败保留凭据，成功后使用平台 Token 并可退出', async ({ page }) => {
  let signedIn = false, exchanges = 0, loggedOut = false
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path.endsWith('/identity-providers')) return route.fulfill({ json: [{ profile_id: 'company', name: '企业身份' }] })
    if (path.endsWith('/auth/external-token')) {
      expect(request.postDataJSON()).toEqual({ profile_id: 'company', token: 'upstream-opaque' })
      exchanges++
      if (exchanges === 1) return route.fulfill({ status: 401, json: { error: { code: 'EXTERNAL_IDENTITY_INVALID', message: '外部身份已过期', fields: [] } } })
      signedIn = true
      return route.fulfill({ json: { access_token: 'platform-opaque', token_type: 'Bearer', expires_in: 120, expires_at: session.expires_at } })
    }
    if (path.endsWith('/auth/session')) {
      if (!signedIn) return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: '请登录', fields: [] } } })
      expect(request.headers().authorization).toBe('Bearer platform-opaque')
      return route.fulfill({ json: session })
    }
    if (path.endsWith('/auth/logout')) {
      expect(request.headers().authorization).toBe('Bearer platform-opaque')
      signedIn = false; loggedOut = true
      return route.fulfill({ json: {} })
    }
    return route.fulfill({ json: path.endsWith('/auth/channels') ? [workspace] : [] })
  })
  await page.goto('/')
  await page.getByRole('combobox', { name: '登录方式' }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('外部身份', { exact: true }).click()
  await page.getByLabel('身份源', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('企业身份', { exact: true }).click()
  await page.getByLabel('外部访问凭据', { exact: true }).fill('upstream-opaque')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('外部身份已过期', { exact: true })).toBeVisible()
  await expect(page.getByLabel('外部访问凭据', { exact: true })).toHaveValue('upstream-opaque')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('creativity.management.token'))).toBe('platform-opaque')
  await page.getByRole('button', { name: '用户菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
  expect(loggedOut).toBe(true)
  expect(await page.evaluate(() => sessionStorage.getItem('creativity.management.token'))).toBeNull()
})

test('自定义角色携带修订提交，冲突保留输入并显示停用影响', async ({ page }) => {
  let role = { grant_scope: 'channel', grant_scope_name: '渠道', id: 'role_a', name: '运行观察', builtin: false, revision: 4, allowed_actions: ['run:read'], action_names: ['查看运行'], active: true, state_label: '启用', member_count: 2, editable: true, menu_ids: ['run-page', 'run-action'] }
  let writes = 0
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: session })
    if (path.endsWith('/auth/channels')) return route.fulfill({ json: [workspace] })
    if (path.endsWith('/access-options')) return route.fulfill({ json: { tabs: [], actions: [], accounts: [], workspaces: [], roles: [], grantee_roles: [], member_accounts: [], resources: [], grant_actions: [] } })
    if (path.endsWith('/custom-roles/options')) return route.fulfill({ json: { scope: 'channel', scope_name: '渠道', scopes: [{ value: 'channel', label: '渠道' }], menus: [
      { id: 'run-page', name: '运行记录', kind: 'MENU', parent_id: null, page_key: 'runs', sort_order: 1 },
      { id: 'run-action', name: '查看运行', kind: 'BUTTON', parent_id: 'run-page', action_key: 'run:read', sort_order: 1 },
    ], actions: [{ value: 'run:read', label: '查看运行' }] } })
    if (path.endsWith('/custom-roles')) return route.fulfill({ json: [role, { ...role, id: 'builder', name: '构建者', builtin: true, editable: false, member_count: 1 }] })
    if (path.endsWith('/custom-roles/role_a')) {
      const body = request.postDataJSON()
      writes++
      expect(body).toEqual({ grant_scope: 'channel', name: '停用运行观察', allowed_actions: ['run:read'], active: false, revision: writes === 1 ? 4 : 5, menu_ids: ['run-page', 'run-action'] })
      if (writes === 1) {
        role = { ...role, revision: 5 }
        return route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '角色已被其他管理员修改', fields: [] } } })
      }
      role = { ...role, ...body, revision: 6, state_label: '停用' }
      return route.fulfill({ json: role })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/roles')
  await expect(page.getByRole('row').filter({ hasText: '构建者' }).getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑角色' })
  await expect(dialog.getByText('当前关联 2 位有效成员，权限变更立即生效。')).toBeVisible()
  await dialog.getByLabel('角色名称', { exact: true }).fill('停用运行观察')
  await dialog.getByRole('switch').uncheck()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog.getByText('角色已被其他管理员修改', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('角色名称', { exact: true })).toHaveValue('停用运行观察')
  await dialog.getByRole('button', { name: '读取最新版本，保留填写内容' }).click()
  await expect(dialog.getByLabel('角色名称', { exact: true })).toHaveValue('停用运行观察')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: '停用运行观察' })).toContainText('停用')
  expect(writes).toBe(2)
})

test('角色管理展示两个内置作用域，新增渠道角色切换权限树不丢失名称', async ({ page }) => {
  let saved: Record<string, unknown> | undefined
  const defaults = ['platform', 'channel'].map(scope => ({
    id: `${scope}_admin`, name: scope === 'platform' ? '平台管理员' : '渠道管理员',
    builtin: true, grant_scope: scope, grant_scope_name: scope === 'platform' ? '平台' : '渠道',
    revision: 1, allowed_actions: [], action_names: [], active: true, state_label: '启用',
    member_count: 1, editable: false, menu_ids: null,
  }))
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: {
      ...session, workspace: null, can_access_platform: true,
      navigation: [{ navigation_key: 'roles', label: '角色管理' }],
      actions: [{ action_key: 'role:grant', label: '管理角色' }],
    } })
    if (path.endsWith('/custom-roles/options')) {
      const scope = url.searchParams.get('grant_scope') ?? 'platform'
      return route.fulfill({ json: {
        scope, scope_name: scope === 'platform' ? '平台' : '渠道',
        scopes: [{ value: 'platform', label: '平台' }, { value: 'channel', label: '渠道' }],
        menus: scope === 'platform' ? [] : [
          { id: 'usage-page', name: '用量', kind: 'MENU', parent_id: null, page_key: 'usage', sort_order: 1 },
          { id: 'usage-action', name: '查看用量', kind: 'BUTTON', parent_id: 'usage-page', action_key: 'usage:read', sort_order: 1 },
        ], actions: [],
      } })
    }
    if (path.endsWith('/custom-roles')) {
      if (request.method() === 'POST') {
        saved = request.postDataJSON()
        return route.fulfill({ status: 201, json: {} })
      }
      return route.fulfill({ json: defaults })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/roles')
  const platform = page.getByRole('row').filter({ hasText: '平台管理员' })
  const channel = page.getByRole('row').filter({ hasText: '渠道管理员' })
  await expect(platform.getByRole('cell', { name: '平台', exact: true })).toBeVisible()
  await expect(channel.getByRole('cell', { name: '渠道', exact: true })).toBeVisible()
  await expect(channel.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '新增角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增角色' })
  await dialog.getByLabel('角色名称', { exact: true }).fill('用量观察员')
  await dialog.getByLabel('作用域', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道', { exact: true }).click()
  await expect(dialog.getByText('查看用量', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('角色名称', { exact: true })).toHaveValue('用量观察员')
  await dialog.locator('.ant-tree-treenode').filter({ has: page.getByText('用量', { exact: true }) }).locator('.ant-tree-checkbox').click()
  await dialog.locator('.ant-tree-treenode').filter({ has: page.getByText('查看用量', { exact: true }) }).locator('.ant-tree-checkbox').click()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(saved).toMatchObject({ name: '用量观察员', grant_scope: 'channel', allowed_actions: ['usage:read'] })
})
