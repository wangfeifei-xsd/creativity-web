import { expect, test, type Page } from '@playwright/test'

const workspace = { channel_id: 'channel1', channel_name: '测试渠道', environment: 'test', environment_name: '测试', data_scope_id: 'scope1', data_scope_name: '默认域' }
const session = { user: { user_id: 'user1', display_name: '模型管理员', login_name: 'admin' }, workspace,
  navigation: [{ navigation_key: 'models', label: '模型配置' }, { navigation_key: 'model-routes', label: '模型路由' }, { navigation_key: 'model-providers', label: '模型供应商' }],
  actions: [{ action_key: 'model:manage', label: '管理模型' }, { action_key: 'channel:govern', label: '治理渠道' }], expires_at: '2030-01-01T00:00:00Z' }
const connection = { id: 'connection1', name: '业务模型连接', provider_id: 'provider1', provider_name: '供应商甲', protocol: 'chat_completions', protocol_name: 'Chat Completions 兼容', endpoint: 'https://models.example/v1', timeout_seconds: 60, status: 'ACTIVE', status_label: '启用', health_status: 'UNKNOWN', health_label: '未知', health_reason: null, health_checked_at: null, current_version_id: 'cv1', revision: 1, credential_ref: 'secret-reference', actions: [{ action_key: 'edit', label: '编辑' }] }
const model = { id: 'model1', name: '业务模型', model_code: 'business', connection_id: 'connection1', connection_name: connection.name, provider_model_name: 'provider-v1', provider_name: '供应商甲', protocol: 'chat_completions', protocol_name: connection.protocol_name, status: 'ACTIVE', status_label: '启用', context_limit: null, parameters: { max_tokens: 100 }, parameter_allowlist: ['max_tokens'], parameter_reasons: { temperature: '该模型未开放此参数' }, usage_subsets: { cache_read: 'input' }, revision: 1, current_version_id: 'v1', config_digest: 'digest', verified_at: null,
  capabilities: [{ capability: 'tools', name: '工具调用', state: 'UNVERIFIED', label: '未验证', verified_at: null, reason: '当前配置尚未通过真实验证' }], actions: [{ action_key: 'edit', label: '编辑' }, { action_key: 'test', label: '能力验证' }, { action_key: 'history', label: '历史版本' }] }
const provider = { id: 'provider1', code: 'provider', name: '供应商甲', protocols: ['chat_completions'], template_content: { endpoint: 'https://models.example/v1', protocol: 'chat_completions' }, revision: 1 }
async function setup(page: Page) {
  await page.route('**/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const data: Record<string, unknown> = {
      '/admin/v1/auth/session': session, '/admin/v1/auth/channels': [workspace],
      '/admin/v1/models': { items: [model], actions: [{ action_key: 'create', label: '新增模型' }] },
      '/admin/v1/models/model1': model,
      '/admin/v1/model-connections': { items: [connection], actions: [{ action_key: 'create', label: '新增连接' }] },
      '/admin/v1/model-providers': [provider], '/admin/v1/model-protocols': [{ code: 'chat_completions', name: 'Chat Completions 兼容', enabled: true, reason: null, parameters: ['max_tokens'] }],
      '/admin/v1/model-test-cases': [{ case: 'text', name: '短文本' }, { case: 'usage', name: '用量口径' }],
      '/admin/v1/models/model1/price-versions': [{ id: 'price1', name: '供应商公开报价', currency: 'CNY', source: '官方报价表', effective_at: '2026-10-01T00:00:00Z', items: [{ dimension: 'input', amount: '2.50', per_units: 1000000 }] }],
    }
    return route.fulfill({ json: data[path] ?? [] })
  })
}

test('模型详情展示能力证据、价格单位和不可执行的验证记录', async ({ page }) => {
  await setup(page)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const tests: unknown[] = []
  await page.route('**/admin/v1/models/model1/tests', async route => {
    if (route.request().method() === 'POST') {
      tests.push({ id: 'test1', model_name: model.name, config_revision: 1, created_at: '2026-10-02T00:00:00Z', state: 'BLOCKED', state_label: '不可执行', reason: '调试服务暂不可用', results: [], attempt_ids: [], run_id: null, latency_ms: null })
      return route.fulfill({ status: 201, json: tests[0] })
    }
    return route.fulfill({ json: tests })
  })
  await page.goto('/models')
  await page.getByRole('button', { name: '业务模型', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('tab', { name: '能力', exact: true }).click()
  await expect(drawer.getByText('未验证', { exact: true })).toBeVisible()
  await expect(drawer.getByText('当前配置尚未通过真实验证')).toBeVisible()
  await drawer.getByRole('tab', { name: '价格', exact: true }).click()
  await expect(drawer.getByText('输入：2.50 CNY / 1,000,000 Token')).toBeVisible()
  await expect(drawer.getByText('官方报价表')).toBeVisible()
  await drawer.getByRole('tab', { name: '验证', exact: true }).click()
  await drawer.getByRole('button', { name: '能力验证', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(drawer.getByText('不可执行', { exact: true })).toBeVisible()
  await expect(drawer.getByText('调试服务暂不可用')).toBeVisible()
  expect(errors).toEqual([])
  await page.screenshot({ path: '/tmp/creativity-models-detail.png', fullPage: true })
})

test('连接编辑不回显凭据，保存保留凭据引用与修订号', async ({ page }) => {
  await setup(page)
  let saved: unknown
  await page.route('**/admin/v1/model-connections/connection1', route => {
    saved = route.request().postDataJSON()
    return route.fulfill({ json: connection })
  })
  await page.goto('/models')
  await page.getByRole('tab', { name: '供应商连接', exact: true }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('新凭据（留空保留原凭据）')).toHaveValue('')
  await dialog.getByLabel('连接名称').fill('修改后的连接')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(saved).toMatchObject({ name: '修改后的连接', credential_ref: 'secret-reference', revision: 1 })
  expect(saved).not.toHaveProperty('secret')
})

test('不支持的参数反馈保留输入，并阻止重复提交', async ({ page }) => {
  await setup(page)
  let count = 0
  await page.route('**/admin/v1/models/model1', async route => {
    if (route.request().method() === 'PATCH') {
      count++
      await new Promise(resolve => setTimeout(resolve, 200))
      return route.fulfill({ status: 422, json: { error: { code: 'MODEL_PARAMETER_UNSUPPORTED', message: '参数未获协议或模型支持：seed', fields: [] } } })
    }
    return route.fulfill({ json: model })
  })
  await page.goto('/models')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('默认参数（JSON）').fill('{"max_tokens":100,"seed":1}')
  await dialog.getByRole('button', { name: '保存', exact: true }).dblclick()
  await expect(dialog.getByText('参数未获协议或模型支持：seed')).toBeVisible()
  await expect(dialog.getByLabel('默认参数（JSON）')).toHaveValue('{"max_tokens":100,"seed":1}')
  expect(count).toBe(1)
})
