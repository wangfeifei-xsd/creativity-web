import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'domain_a', data_scope_name: '租号数据域' }
const session = { user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace,
  navigation: [{ navigation_key: 'tools', label: '工具管理' }], actions: [action('tool:manage', '管理工具'), action('run:create', '执行能力')], expires_at: '2030-01-01T00:00:00Z' }
const tool = { tool_id: 'tool_a', tool_code: 'sum', name: '精确求和', description: '计算统计合计', source_type: 'builtin', source_label: '预置函数',
  owner: '管理员', revision: 1, status: { value: 'ACTIVE', label: '已启用', tone: 'success' }, effect_types: ['READ_ONLY'], effect_labels: ['只读'],
  actions: [action('edit', '编辑'), action('create_version', '新增版本'), action('disable', '停用')] }
const definition = { input_schema: { type: 'object', properties: { values: { type: 'array', title: '数值列表', items: { type: 'string' } } }, required: ['values'], additionalProperties: false },
  output_schema: { type: 'object', properties: { sum: { type: 'string' } }, required: ['sum'], additionalProperties: false }, model_fields_allowed: ['values'],
  binding: { adapter_key: 'decimal_sum', implementation_version: '1', connection_id: null }, effect_type: 'READ_ONLY', required_scopes: ['run:create'],
  allowed_data_domains: ['domain_a'], environments: ['test'], subject_requirements: { required: false, allowed_types: [] },
  timeout_seconds: 10, max_result_size: 262144, retry_policy: { max_attempts: 1, delay_ms: 100 }, cache_policy: { ttl_seconds: 0, freshness_seconds: 60, volatile: false }, idempotency_policy: 'none' }
const version = { version: { version_id: 'version_a', version_label: '初始版本', state: 'DRAFT' }, revision: 1, definition,
  status: { value: 'DRAFT', label: '草稿', tone: 'default' }, execution_enabled: true, unavailable_reason: null,
  actions: [action('edit', '保存草稿'), action('freeze', '冻结版本'), action('test', '测试')] }
const detail = { tool, versions: [version], release_version_id: null, release_revision: null, impact: { tool_id: 'tool_a', references: [], ongoing_calls: 0, message: '停用后阻断后续调用和重试。' } }

async function fixture(page: Page, execution = false) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = session
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/tools') json = { items: [tool], actions: [action('create', '新增工具')] }
    else if (path === '/admin/v1/tools/tool_a') json = detail
    else if (path === '/admin/v1/tool-bindings') json = [{ binding: definition.binding, name: '十进制求和', source_type: 'builtin', effect_type: 'READ_ONLY', effect_label: '只读', execution_enabled: true, unavailable_reason: null }]
    else if (path.endsWith('/test-description')) json = { version_id: 'version_a', revision: 1, input_schema: definition.input_schema, trusted_scope: { ...workspace }, principal_name: '管理员', executable: execution, unavailable_reason: execution ? null : '工具测试暂不可用' }
    await route.fulfill({ json })
  })
}

test('工具列表和详情使用名称，缺少运行服务时禁止测试', async ({ page }) => {
  await fixture(page)
  await page.goto('/tools')
  await page.getByRole('link', { name: '精确求和' }).click()
  await expect(page.getByRole('tab', { name: '契约', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '连接绑定' }).click()
  await expect(page.getByText('十进制求和', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '测试', exact: true }).click()
  await expect(page.getByLabel('数值列表')).toBeVisible()
  await expect(page.getByText('工具测试暂不可用')).toBeVisible()
  await expect(page.getByRole('button', { name: '运行测试' })).toBeDisabled()
})

test('测试只提交业务参数，服务器字段错误保留输入', async ({ page }) => {
  await fixture(page, true)
  let calls = 0
  await page.route('**/tool-versions/version_a/tests', async route => {
    calls++
    expect(route.request().postDataJSON()).toEqual({ revision: 1, arguments: { values: ['1.25'] } })
    await route.fulfill({ status: 422, json: { error: { code: 'TOOL_INPUT_INVALID', message: '参数不符合契约', fields: [{ path: ['values'], message: '数值范围不正确' }] } } })
  })
  await page.goto('/tools/tool_a')
  await page.getByRole('tab', { name: '测试', exact: true }).click()
  await page.getByLabel('数值列表').fill('["1.25"]')
  await page.getByRole('button', { name: '运行测试' }).click()
  await expect(page.getByText('数值范围不正确', { exact: true })).toBeVisible()
  await expect(page.getByLabel('数值列表')).toHaveValue('["1.25"]')
  expect(calls).toBe(1)
})

test('窄屏版本编辑和执行策略可用', async ({ page }) => {
  await fixture(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tools/tool_a')
  await page.getByRole('button', { name: '新增版本' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('版本名称')).toBeVisible()
  await dialog.getByRole('tab', { name: '执行策略', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '执行策略', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByLabel('超时（秒）')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('tools-mobile.png'), fullPage: true })
})
