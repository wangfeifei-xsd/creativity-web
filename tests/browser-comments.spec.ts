import { expect, test, type Page } from '@playwright/test'

const actions = '管理账号、查看操作审计、开通渠道、治理渠道、管理菜单、授予平台角色、跨渠道查看用量'
const role = { id: 'platform_admin', name: '平台管理员', builtin: true, grant_scope: 'platform',
  grant_scope_name: '平台', action_names: actions.split('、'), allowed_actions: [], member_count: 1,
  state_label: '启用', active: true, editable: false, revision: 1, menu_ids: [],
  updated_at: '2026-10-05T18:28:03Z' }
const protocols = [{ code: 'chat_completions', name: 'Chat Completions 兼容', enabled: true, reason: null, parameters: [] }]

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = path.endsWith('/auth/session') ? {
      user: { user_id: 'admin', login_name: 'admin', display_name: '管理员' },
      workspace: null, workspace_options: [], default_workspace: null, can_access_platform: true,
      navigation: [{ navigation_key: 'roles', label: '角色管理' }],
      actions: [{ action_key: 'account:manage', label: '管理账号' }, { action_key: 'channel:govern', label: '治理渠道' }],
      expires_at: '2030-01-01T00:00:00Z',
    } : path.endsWith('/custom-roles/options') ? { scopes: [], menus: [], scope: 'platform', actions: [] }
      : path.endsWith('/custom-roles') ? [role]
        : path.endsWith('/model-protocols') ? protocols
          : path.endsWith('/accounts/roles') ? [
            { role_code: 'platform_admin', name: '平台管理员', grant_scope: 'platform' },
            { role_code: 'channel_admin', name: '渠道管理员', grant_scope: 'channel' },
          ] : path.endsWith('/accounts/page') ? { items: [], total: 0, offset: 0, limit: 20 }
            : path.endsWith('/channels/page') ? { items: [{ channel_id: 'channel_a', name: '渠道甲', status: 'ACTIVE' }], total: 1, offset: 0, limit: 20 }
              : path.endsWith('/channels/options') ? { items: [{ value: 'channel_a', label: '渠道甲' }], total: 1, offset: 0, limit: 20 }
                : path.endsWith('/tools') ? { items: [], actions: [], referenced_agents: [] }
                  : path.endsWith('/memories') ? { items: [], actions: [], attributes: [], next_cursor: null }
                    : []
    await route.fulfill({ json })
  })
}

test('账号角色允许平台和渠道多选，保留明确渠道授权', async ({ page }) => {
  await fixture(page)
  let submitted: Record<string, unknown> | undefined
  await page.route('**/admin/v1/accounts', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: {} })
  })
  await page.goto('#/accounts')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('登录名').fill('multi-role-account')
  await dialog.getByLabel('初始密码').fill('Initial-password-1234')
  await dialog.getByLabel('显示名称').fill('多角色账号')
  await dialog.getByLabel('角色', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('平台管理员', { exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(dialog.getByText('平台管理员', { exact: true })).toBeVisible()
  await expect(dialog.getByText('渠道管理员', { exact: true })).toBeVisible()
  await dialog.getByLabel('授权渠道').click()
  await page.locator('.ant-select-dropdown:visible').getByText('渠道甲', { exact: true }).click()
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(submitted).toMatchObject({ roles: ['channel_admin', 'platform_admin'], channel_ids: ['channel_a'] })
  expect(submitted).not.toHaveProperty('role')
})

test('供应商新增不提交编码，编辑按既有标识保存', async ({ page }) => {
  await fixture(page)
  let provider: Record<string, unknown> | undefined
  const writes: Record<string, unknown>[] = []
  await page.route('**/admin/v1/model-providers', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      writes.push(body)
      provider = { ...body, id: 'provider_YYYY', code: 'YYYY', revision: writes.length }
      return route.fulfill({ json: provider })
    }
    await route.fulfill({ json: provider ? [provider] : [] })
  })
  await page.goto('#/model-providers')
  await page.getByRole('button', { name: '新增供应商', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('供应商编码')).toHaveCount(0)
  await dialog.getByLabel('供应商名称').fill('云')
  await dialog.getByLabel('协议', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('Chat Completions 兼容', { exact: true }).click()
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes[0]).not.toHaveProperty('code')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await dialog.getByLabel('供应商名称').fill('云端模型')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes[1]).toMatchObject({ id: 'provider_YYYY', name: '云端模型', revision: 1 })
  expect(writes[1]).not.toHaveProperty('code')
})

test('时间统一中文格式，缩略单元格悬停显示完整内容', async ({ page }) => {
  await fixture(page)
  await page.goto('#/roles')
  await expect(page.getByRole('cell', { name: '2026年10月6日 02:28:03', exact: true })).toBeVisible()
  const cell = page.locator('td.ant-table-cell-ellipsis').first()
  await cell.hover()
  await expect(page.getByRole('tooltip')).toHaveText(actions)
  await page.getByRole('heading', { name: '角色管理', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toBeHidden()
})

for (const width of [1391, 820, 375]) test(`查询条件换行保留统一行间距，时间输入使用中文格式（${width}）`, async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width, height: 900 })
  await page.goto('#/platform-usage')
  const form = page.locator('form.ant-form-inline')
  await expect(form).toBeVisible()
  expect(await form.evaluate(element => getComputedStyle(element).rowGap)).toBe('16px')
  await expect(page.getByLabel('开始时间')).toHaveValue(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}:\d{2}$/)
  const boxes = await form.locator(':scope > .ant-form-item').evaluateAll(items =>
    items.map(item => { const { x, y, width, height } = item.getBoundingClientRect(); return { x, y, width, height } }))
  for (const upper of boxes) for (const lower of boxes) {
    if (lower.y > upper.y) expect(lower.y - (upper.y + upper.height)).toBeGreaterThanOrEqual(15)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})

for (const route of ['tools', 'memories']) for (const width of [1391, 820, 375]) {
  test(`非表单查询条件也保留统一换行间距（${route}，${width}）`, async ({ page }) => {
    await fixture(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`#/${route}`)
    const filters = page.locator('.query-filters')
    await expect(filters).toBeVisible()
    expect(await filters.evaluate(element => getComputedStyle(element).rowGap)).toBe('16px')
    expect(await filters.evaluate(element => getComputedStyle(element).columnGap)).toBe('16px')
    const boxes = await filters.locator(':scope > .ant-space-item').evaluateAll(items =>
      items.map(item => { const { y, height } = item.getBoundingClientRect(); return { y, height } }))
    for (const upper of boxes) for (const lower of boxes) {
      if (lower.y > upper.y) expect(lower.y - (upper.y + upper.height)).toBeGreaterThanOrEqual(15)
    }
  })
}
