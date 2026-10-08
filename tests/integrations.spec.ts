import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试',  }
test('通知端点可选择业务调用服务，失败保留输入并能恢复本人范围', async ({ page }) => {
  await fixture(page)
  let endpoint = { id: 'hook_a', name: '业务通知', url: 'https://business.example/events', events: ['run.terminal'], client_ids: [] as string[], revision: 1, state: 'ACTIVE', state_label: '启用' }
  let writes = 0
  await page.route('**/admin/v1/run-subscription-options', route => route.fulfill({ json: [{ client_id: 'client_a', name: '业务 API 服务', active: true }] }))
  await page.route('**/admin/v1/webhooks', route => route.fulfill({ json: [endpoint] }))
  await page.route('**/admin/v1/webhooks/hook_a', async route => {
    writes++
    const body = route.request().postDataJSON()
    expect(body).toEqual({ revision: endpoint.revision, active: true, client_ids: writes <= 2 ? ['client_a'] : [] })
    if (writes === 1) return route.fulfill({ status: 503, json: { error: { code: 'DEPENDENCY_UNAVAILABLE', message: '暂时无法保存', fields: [] } } })
    endpoint = { ...endpoint, client_ids: body.client_ids, revision: endpoint.revision + 1 }
    return route.fulfill({ json: endpoint })
  })
  await page.goto('#/integrations')
  await page.getByRole('tab', { name: '运行与事件', exact: true }).click()
  await page.getByRole('tab', { name: '事件投递', exact: true }).click()
  await page.getByRole('button', { name: '编辑范围', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('调用服务', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('业务 API 服务', { exact: true }).click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('暂时无法保存', { exact: true })).toBeVisible()
  await expect(dialog.getByText('业务 API 服务', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('cell', { name: '业务 API 服务', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑范围', exact: true }).click()
  await dialog.locator('.ant-select-selection-item-remove').click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('cell', { name: '本人发起', exact: true })).toBeVisible()
  expect(writes).toBe(3)
})

test('运行失败告警保存所选调用服务并显示监测范围', async ({ page }) => {
  await fixture(page)
  const rules: unknown[] = []
  await page.route('**/admin/v1/run-subscription-options', route => route.fulfill({ json: [{ client_id: 'client_a', name: '业务 API 服务', active: true }] }))
  await page.route('**/admin/v1/webhooks', route => route.fulfill({ json: [{ id: 'hook_alert', name: '运营告警', events: ['alert.triggered', 'alert.resolved'] }] }))
  await page.route('**/admin/v1/alert-rules', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: rules })
    const body = route.request().postDataJSON()
    expect(body).toEqual({ name: '业务失败提醒', kind: 'run_failure', threshold: 1, window_seconds: 3600, endpoint_id: 'hook_alert', client_ids: ['client_a'], active: true })
    const saved = { ...body, id: 'rule_a', revision: 1, enabled: true, state_label: '正常', kind_label: '运行失败', last_value: 0, generation: 0 }
    rules.push(saved)
    return route.fulfill({ status: 201, json: saved })
  })
  await page.goto('#/integrations')
  await page.getByRole('tab', { name: '运行与事件', exact: true }).click()
  await page.getByRole('tab', { name: '外部告警', exact: true }).click()
  await page.getByRole('button', { name: '新增告警', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('业务失败提醒')
  await dialog.getByLabel('调用服务', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('业务 API 服务', { exact: true }).click()
  await dialog.getByLabel('投递端点', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('运营告警', { exact: true }).click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('cell', { name: '业务 API 服务', exact: true })).toBeVisible()
  await page.screenshot({ path: '.local/channel-validation/run-subscription-alert.png', fullPage: true, animations: 'disabled' })
})

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', login_name: 'admin', display_name: '管理员' }, workspace,
      navigation: [{ navigation_key: 'integrations', label: '业务接入' }], actions: [action('integration:manage', '管理业务接入'), action('key:manage', '管理接入凭据'), action('run:read', '查看运行元数据'), action('run:create', '执行能力')], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/agents') json = { items: [], actions: [] }
    else if (path === '/admin/v1/delegation-keys/options') json = { clients: [{ value: 'client_a', label: '租号业务后端' }] }
    await route.fulfill({ json })
  })
}

test('业务接入只展示当前功能，独立委托配置不再请求旧接口', async ({ page }) => {
  await fixture(page)
  const legacyRequests: string[] = []
  page.on('request', request => {
    if (/\/admin\/v1\/(integrations|integration-credentials)(\/|\?|$)/.test(request.url())) legacyRequests.push(request.url())
  })
  await page.goto('#/integrations')
  await expect(page.getByRole('tab')).toHaveText(['当前主体复核', '运行与事件', '身份委托'])
  await expect(page.getByRole('button', { name: '新建连接' })).toHaveCount(0)
  await page.getByRole('tab', { name: '身份委托', exact: true }).click()
  await page.getByRole('button', { name: '创建委托密钥' }).click()
  await page.getByLabel('接入服务', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('租号业务后端', { exact: true })).toBeVisible()
  expect(legacyRequests).toEqual([])
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
  await page.goto('#/integrations')
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
  await page.goto('#/integrations')
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

test('缺少运行授权时禁用运行操作且不请求运行目录', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace,
    navigation: [{ navigation_key: 'integrations', label: '业务接入' }],
    actions: [action('integration:manage', '管理业务接入')], expires_at: '2030-01-01T00:00:00Z',
  } }))
  const deniedReads: string[] = []
  page.on('request', request => {
    if (/\/(run-subscription-options|batches)(\?|$)/.test(request.url())) deniedReads.push(request.url())
  })
  await page.goto('#/integrations')
  await page.getByRole('tab', { name: '运行与事件', exact: true }).click()
  await expect(page.getByRole('button', { name: '新增计划', exact: true })).toBeDisabled()
  await expect(page.getByRole('tab', { name: '批量运行', exact: true })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('tab', { name: '事件投递', exact: true }).click()
  await expect(page.getByRole('button', { name: '新增端点', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '外部告警', exact: true }).click()
  await page.getByRole('button', { name: '新增告警', exact: true }).click()
  await expect(page.getByLabel('调用服务', { exact: true })).toBeDisabled()
  expect(deniedReads).toEqual([])
})
