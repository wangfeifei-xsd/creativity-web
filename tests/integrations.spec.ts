import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'scope_a', data_scope_name: '默认业务域' }
const row = { integration_id: 'int_a', name: '租号业务服务', environment_name: '测试', data_scope_name: '默认业务域',
  adapter_code: 'standard_http', adapter_name: '标准业务接口', adapter_version: '1.0.0', business_endpoint: 'https://business.example',
  credential_ref: 'credential_a', allowed_operations: ['dictionary'], operation_paths: { dictionary: '/dictionary' }, field_mapping: {},
  health: 'HEALTHY', health_name: '正常', status: 'ACTIVE', status_name: '启用', contract_version: '1.0.0', revision: 1,
  actions: [action('integration:edit', '编辑'), action('integration:test', '契约测试')] }
const capability = { operation: 'dictionary', name: '业务字典', public: true, required_actions: ['run:create'], supported: true, allowed: true, verified: true }

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' }, workspace,
      navigation: [{ navigation_key: 'integrations', label: '业务接入' }], actions: [action('integration:manage', '管理业务接入'), action('key:manage', '管理接入凭据')], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/integrations') json = { items: [row], actions: [action('integration:create', '新建连接')] }
    else if (path === '/admin/v1/integrations/int_a') json = row
    else if (path.endsWith('/capabilities')) json = [capability]
    else if (path.endsWith('/options')) json = { adapters: [{ code: 'standard_http', name: '标准业务接口', version: '1.0.0', capabilities: [capability] }], clients: [{ value: 'client_a', label: '租号业务后端' }], operations: [{ value: 'dictionary', label: '业务字典' }] }
    else if (path.endsWith('/tests')) json = [{ test_id: 'test_a', integration_id: 'int_a', config_revision: 1, state: 'PASSED', state_name: '通过', created_at: '2026-10-02T01:00:00Z', results: [{ operation: 'dictionary', name: '业务字典', passed: true, message: '契约验证通过', item_count: 3 }], capabilities: ['dictionary'] }]
    await route.fulfill({ json })
  })
}

test('连接列表、能力与脱敏测试使用业务名称', async ({ page }) => {
  await fixture(page)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/integrations')
  await page.getByRole('tab', { name: '旧 HTTP 连接', exact: true }).click()
  await page.getByRole('link', { name: '租号业务服务' }).click()
  await expect(page.getByText('标准业务接口 · 1.0.0')).toBeVisible()
  await expect(page.getByText('业务字典', { exact: true })).toBeVisible()
  await expect(page.getByText('已通过', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '契约测试', exact: true }).click()
  await expect(page.getByText('2026/10/02 09:00:00')).toBeVisible()
  expect(errors).toEqual([])
})

test('契约测试错误保留输入且请求不包含渠道身份', async ({ page }) => {
  await fixture(page)
  let writes = 0
  await page.route('**/integrations/int_a/tests', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    writes++
    expect(route.request().postDataJSON()).toEqual({ revision: 1, cases: [{ operation: 'dictionary', arguments: { game: 'rental' } }] })
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '连接配置已变更', fields: [] } } })
  })
  await page.goto('/integrations/int_a')
  await page.getByRole('button', { name: '契约测试', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('能力', { exact: true }).click()
  await page.getByText('业务字典', { exact: true }).last().click()
  await dialog.getByLabel('查询参数').fill('{"game":"rental"}')
  await dialog.getByRole('button', { name: '运行测试' }).click()
  await expect(dialog.getByText('连接配置已变更')).toBeVisible()
  await expect(dialog.getByLabel('查询参数')).toHaveValue('{"game":"rental"}')
  expect(writes).toBe(1)
})

test('窄屏配置表单可操作', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/integrations')
  await page.getByRole('button', { name: '新建连接' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('业务服务凭据')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '../.logs/18-integrations-mobile.png', fullPage: true, animations: 'disabled' })
})

test('旧 HTTP 目录不可用时仍能配置独立委托凭据', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/integrations', route => route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN', message: '无权管理旧连接', fields: [] } } }))
  await page.route('**/integrations/options', () => { throw new Error('委托页面不应读取旧协议能力目录') })
  await page.goto('/integrations')
  await page.getByRole('tab', { name: '身份委托', exact: true }).click()
  await page.getByRole('button', { name: '创建委托密钥' }).click()
  await page.getByLabel('接入服务', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('租号业务后端', { exact: true })).toBeVisible()
})

test('主体复核从 MCP 发现绑定，保存不含用户或数据域覆盖', async ({ page }) => {
  await fixture(page)
  const remote = { name: 'access.review-current', title: '当前主体权限', purpose: 'subject_review' }
  const conn = { connection_id: 'mcp_review', name: '身份授权服务', credential_mask: '••••••••', status: { value: 'ENABLED' } }
  await page.route('**/admin/v1/mcp-connections', route => route.fulfill({ json: { items: [conn], actions: [] } }))
  await page.route('**/admin/v1/mcp-connections/mcp_review', route => route.fulfill({ json: {
    connection: conn, discoveries: [{ discovery_id: 'review_snapshot', tools: [remote,
      { name: 'archive.find-notes', title: '档案查询', purpose: 'business' }] }], checks: [], imports: [],
  } }))
  await page.route('**/admin/v1/subject-review-bindings/options', route => route.fulfill({ json: [{ value: 'client_a', label: '资料业务后端' }] }))
  let submitted = false
  await page.route('**/admin/v1/subject-review-bindings', async route => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ client_id: 'client_a', connection_id: 'mcp_review',
        discovery_id: 'review_snapshot', remote_tool_name: 'access.review-current', timeout_seconds: 5, enabled: true })
      submitted = true
    }
    await route.fulfill({ json: [] })
  })
  await page.goto('/integrations')
  await page.getByRole('button', { name: '配置主体复核', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('接入服务', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('资料业务后端', { exact: true }).click()
  await dialog.getByRole('combobox').nth(1).click()
  await page.locator('.ant-select-dropdown:visible').getByText('身份授权服务', { exact: true }).click()
  await dialog.getByLabel('身份复核工具', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('档案查询')).toHaveCount(0)
  await page.locator('.ant-select-dropdown:visible').getByText('当前主体权限', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeVisible()
  await page.screenshot({ path: '.logs/20/subject-review-mobile.png', fullPage: true, animations: 'disabled' })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(submitted).toBe(true)
})

test('定时运行按时区保存，批量失败保留条目并重用幂等键', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/agents', route => route.fulfill({ json: { items: [{ agent_id: 'report', agent_code: 'report', name: '通用报告' }], actions: [] } }))
  let scheduleSaved = false
  await page.route('**/admin/v1/schedules', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    expect(route.request().postDataJSON()).toEqual({ name: '每日报告', request: { agent_code: 'report', input: {} }, timezone: 'Asia/Shanghai', daily_at: '09:00', interval_seconds: null })
    scheduleSaved = true
    await route.fulfill({ json: {} })
  })
  const keys: string[] = []
  await page.route('**/admin/v1/batches', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    keys.push(route.request().headers()['idempotency-key'])
    await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: '暂不可用，请重试', fields: [] } } })
  })
  await page.goto('/integrations')
  await page.getByRole('tab', { name: '运行与事件', exact: true }).click()
  await page.getByRole('button', { name: '新增计划', exact: true }).click()
  const plan = page.getByRole('dialog', { name: '新增定时计划' })
  await plan.getByLabel('计划名称').fill('每日报告')
  await plan.getByLabel('智能体', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('通用报告', { exact: true }).click()
  await plan.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => scheduleSaved).toBe(true)
  await page.getByRole('tab', { name: '批量运行', exact: true }).click()
  await page.getByRole('button', { name: '新建批次', exact: true }).click()
  const batch = page.getByRole('dialog', { name: '新建批量运行' })
  await batch.getByLabel('批次名称').fill('同步导入')
  const items = '[{"event_id":"event-1","request":{"agent_code":"report","input":{}}}]'
  await batch.getByLabel('运行条目').fill(items)
  await batch.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => keys.length).toBe(1)
  await expect(page.getByText('暂不可用，请重试', { exact: true })).toBeVisible()
  await expect(batch.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  await batch.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => keys.length).toBe(2)
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
  await expect(batch.getByLabel('运行条目')).toHaveValue(items)
})
