import { expect, test } from '@playwright/test'

for (const path of ['members', 'resource-grants']) {
  test(`${path} 按服务端逐行状态禁用授权操作，并显示原因`, async ({ page }) => {
    const workspace = { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test', environment_name: '测试', data_scope_id: 'domain-a', data_scope_name: '业务域甲' }
    let revoked = false
    const writes: string[] = []
    const actions = (enabled: boolean) => [
      { action_key: 'grant:edit', label: '编辑', enabled, disabled_reason: enabled ? null : '不能超出本人的可授权范围' },
      { action_key: 'grant:revoke', label: '撤销授权', enabled, disabled_reason: enabled ? null : '不能超出本人的可授权范围' },
    ]
    await page.route('**/admin/v1/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (request.method() !== 'GET') writes.push(request.method())
      if (url.pathname.endsWith('/auth/session')) return route.fulfill({ json: {
        user: { user_id: 'admin', login_name: 'admin', display_name: '管理员' }, workspace, workspace_options: [workspace],
        can_access_platform: false, navigation: [{ navigation_key: 'members', label: '成员与权限' }, { navigation_key: 'resource-grants', label: '资源授权' }],
        actions: [], expires_at: '2030-01-01T00:00:00Z',
      } })
      if (url.pathname.endsWith('/access-options')) return route.fulfill({ json: {
        tabs: [{ navigation_key: 'grants', label: '资源授权' }],
        actions: [{ action_key: 'grant:create', label: '添加授权' }, ...actions(true)],
        workspaces: [workspace], accounts: [], member_accounts: [], roles: [], grantee_roles: [], resources: [],
        grant_actions: [{ action_key: 'version:read', label: '查看版本' }],
      } })
      if (url.pathname.endsWith('/resource-grants')) return route.fulfill({ json: ['超出范围', '可管理授权'].map((name, index) => ({
        grant_id: `grant-${index}`, revision: 1, grantee_type: 'role', grantee_id: 'builder', grantee_name: name,
        resource_type: 'version', resource_id: '*', resource_name: '该类全部资源',
        allowed_actions: ['version:read'], action_names: ['查看版本'], environments: ['test'], environment_names: ['测试'],
        data_scopes: ['domain-a'], data_scope_names: ['业务域甲'], actions: actions(index === 1 && !revoked),
      })) })
      return route.fulfill({ json: [] })
    })
    await page.goto(`#/${path}`)
    const forbidden = page.getByRole('row').filter({ hasText: '超出范围' })
    const manageable = page.getByRole('row').filter({ hasText: '可管理授权' })
    await expect(forbidden.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
    await expect(forbidden.getByRole('button', { name: '撤销授权', exact: true })).toBeDisabled()
    await forbidden.getByRole('button', { name: '编辑', exact: true }).locator('..').hover()
    await expect(page.getByRole('tooltip')).toHaveText('不能超出本人的可授权范围')
    await expect(manageable.getByRole('button', { name: '编辑', exact: true })).toBeEnabled()
    await manageable.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '编辑资源授权' })).toBeVisible()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await manageable.getByRole('button', { name: '撤销授权', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '撤销资源授权' })).toBeVisible()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    revoked = true
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await expect(manageable.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
    await expect(manageable.getByRole('button', { name: '撤销授权', exact: true })).toBeDisabled()
    expect(writes).toEqual([])
  })
}
