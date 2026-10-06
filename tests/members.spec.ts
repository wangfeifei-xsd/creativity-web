import { expect, test } from '@playwright/test'

test('成员逐行操作区分编辑和移除权限，刷新后采用最新状态', async ({ page }) => {
  const workspace = { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test', environment_name: '测试', data_scope_id: 'domain-a', data_scope_name: '业务域甲' }
  let readonly = false
  const writes: string[] = []
  const actions = (edit: boolean, remove: boolean) => [
    { action_key: 'member:edit', label: '编辑', enabled: edit, disabled_reason: edit ? null : '不能超出本人的可授权范围' },
    { action_key: 'member:remove', label: '移除成员', enabled: remove, disabled_reason: remove ? null : '不能超出本人的可授权范围' },
  ]
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') writes.push(request.method())
    if (path.endsWith('/auth/session')) return route.fulfill({ json: {
      user: { user_id: 'admin', login_name: 'admin', display_name: '管理员' }, workspace, workspace_options: [workspace],
      can_access_platform: false, navigation: [{ navigation_key: 'members', label: '成员与权限' }],
      actions: [], expires_at: '2030-01-01T00:00:00Z',
    } })
    if (path.endsWith('/access-options')) return route.fulfill({ json: {
      tabs: [{ navigation_key: 'members', label: '成员' }],
      actions: [{ action_key: 'member:create', label: '添加成员' }, ...actions(true, true)],
      workspaces: [workspace], accounts: [], roles: [{ role_code: 'builder', name: '开发者' }],
    } })
    if (path.endsWith('/members')) return route.fulfill({ json: ['超出范围', '仅可移除', '可管理成员'].map((name, index) => ({
      user_id: `member-${index}`, display_name: name, revision: 1, roles: ['builder'], role_names: ['开发者'],
      environments: ['test'], environment_names: ['测试'], data_scopes: ['domain-a'], data_scope_names: ['业务域甲'],
      status: 'ACTIVE', status_label: '启用', actions: actions(index === 2 && !readonly, index > 0 && !readonly),
    })) })
    return route.fulfill({ json: [] })
  })
  await page.goto('#/members')
  const forbidden = page.getByRole('row').filter({ hasText: '超出范围' })
  const removable = page.getByRole('row').filter({ hasText: '仅可移除' })
  const manageable = page.getByRole('row').filter({ hasText: '可管理成员' })
  await expect(forbidden.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
  await expect(forbidden.getByRole('button', { name: '移除成员', exact: true })).toBeDisabled()
  await forbidden.getByRole('button', { name: '编辑', exact: true }).locator('..').hover()
  await expect(page.getByRole('tooltip')).toHaveText('不能超出本人的可授权范围')
  await expect(removable.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
  await removable.getByRole('button', { name: '移除成员', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '移除 仅可移除' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await manageable.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑成员' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  readonly = true
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(manageable.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
  await expect(manageable.getByRole('button', { name: '移除成员', exact: true })).toBeDisabled()
  expect(writes).toEqual([])
})
