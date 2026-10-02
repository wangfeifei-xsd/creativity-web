import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const session = { user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' },
  workspace: { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'domain_a', data_scope_name: '默认业务域' },
  navigation: [{ navigation_key: 'mcp-connections', label: 'MCP 连接' }], actions: [action('run:create', '执行能力')], expires_at: '2030-01-01T00:00:00Z' }
const connection = { connection_id: 'mcp_a', name: '目录服务', endpoint: 'https://example.com/mcp', transport: 'streamable_http', transport_label: 'Streamable HTTP',
  revision: 3, configuration_revision: 1, credential_mask: '••••••••', timeouts: { connect_seconds: 10, operation_seconds: 30 }, health_policy: { interval_seconds: 300, failure_threshold: 3 },
  status: { value: 'DISABLED', label: '未启用', tone: 'default' }, health: { value: 'HEALTHY', label: '正常', tone: 'success' }, last_check_at: '2026-10-02T08:00:00Z',
  actions: [action('edit', '编辑'), action('credential', '更新凭据'), action('test', '连接测试'), action('discover', '发现工具'), action('enable', '启用'), action('import', '导入草稿')] }
const remote = { name: 'raw_lookup_123', title: '目录查询', description: '查询授权目录', annotations: { readOnlyHint: true }, input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  output_schema: { type: 'object', properties: { value: { type: 'string' } }, additionalProperties: false }, schema_hash: 'a'.repeat(64) }
const snapshot = { discovery_id: 'discovery_a', connection_revision: 1, negotiated_version: '2025-11-25', tools: [remote], discovered_at: '2026-10-02T08:00:00Z' }
const detail = { connection, checks: [{ check_id: 'check_a', connection_revision: 1, operation: 'discover', negotiated_version: '2025-11-25', server_info: { name: '目录服务' }, capabilities: { tools: {} },
  health: connection.health, latency_ms: 24, error_category: null, error_message: null, checked_at: connection.last_check_at }], discoveries: [snapshot], imports: [] }

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = session
    else if (path.endsWith('/auth/channels')) json = [session.workspace]
    else if (path === '/admin/v1/mcp-connections') json = { items: [connection], actions: [action('create', '新增连接')] }
    else if (path === '/admin/v1/mcp-connections/mcp_a') json = detail
    else if (path.endsWith('/impact')) json = { tools: [], ongoing_calls: 0, message: '停用后阻止新调用。' }
    else if (path.endsWith('/diff')) json = { discovery_id: 'discovery_a', previous_discovery_id: null, items: [{ remote_tool_name: remote.name, name: '目录查询', changes: ['schema'], labels: ['参数变更'], breaking: true }] }
    await route.fulfill({ json })
  })
}

test('连接详情区分人工启用和健康，契约变化明确提示', async ({ page }) => {
  await fixture(page)
  await page.goto('/mcp-connections')
  await expect(page.getByText('未启用', { exact: true })).toBeVisible()
  await expect(page.getByText('正常', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '目录服务' }).click()
  await page.getByRole('tab', { name: '同步差异' }).click()
  await expect(page.getByText('需要新版本及重新验证')).toBeVisible()
  await page.getByRole('tab', { name: '鉴权', exact: true }).click()
  await expect(page.getByText('••••••••', { exact: true })).toBeVisible()
})

test('工具导入要求本地权限与执行策略，只提交草稿请求', async ({ page }) => {
  await fixture(page)
  let imported: Record<string, unknown> | undefined
  await page.route('**/mcp_a/imports', async route => { imported = route.request().postDataJSON(); await route.fulfill({ json: {} }) })
  await page.goto('/mcp-connections/mcp_a')
  await page.getByRole('tab', { name: '远程工具' }).click()
  await expect(page.getByText('未导入', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '导入草稿' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('负责人').fill('业务负责人')
  await dialog.getByLabel('实际影响').click()
  await page.getByText('只读', { exact: true }).click()
  await dialog.getByLabel('必要业务权限').click()
  await page.getByText('执行能力', { exact: true }).click()
  await dialog.getByLabel('本地显示名称').click()
  await dialog.getByRole('button', { name: '导入草稿' }).click()
  await expect(dialog).not.toBeVisible()
  expect(imported?.required_scopes).toEqual(['run:create'])
  expect(imported?.effect_type).toBe('READ_ONLY')
  expect(imported?.remote_tool_name).toBe(remote.name)
  expect(imported).not.toHaveProperty('channel_id')
  expect(imported).not.toHaveProperty('binding')
})

test('窄屏连接配置标明暂不可用连接方式', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/mcp-connections')
  await page.getByRole('button', { name: '新增连接' }).click()
  await page.getByLabel('连接方式').click()
  await expect(page.getByText('OAuth 用户委托（暂不可用）')).toBeVisible()
  await page.getByLabel('连接方式').press('Escape')
  await expect(page.getByLabel('检查间隔（秒）')).toHaveValue('300')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: test.info().outputPath('mcp-mobile.png'), fullPage: true, animations: 'disabled' })
})

test('身份复核工具只能进入复核配置，不向模型导入', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/mcp-connections/mcp_a', route => route.fulfill({ json: { ...detail,
    discoveries: [{ ...snapshot, tools: [{ ...remote, purpose: 'subject_review', title: '当前主体权限' }] }],
  } }))
  await page.goto('/mcp-connections/mcp_a')
  await page.getByRole('tab', { name: '远程工具' }).click()
  await expect(page.getByText('当前主体权限', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导入草稿', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '配置主体复核', exact: true })).toBeVisible()
})
