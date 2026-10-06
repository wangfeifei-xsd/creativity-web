import { expect, test, type Page } from '@playwright/test'

const workspace = { channel_id: 'channel1', channel_name: '测试渠道', environment: 'test', environment_name: '测试',  }
const session = { user: { user_id: 'user1', display_name: '模型管理员', login_name: 'admin' }, workspace,
  navigation: [{ navigation_key: 'models', label: '模型配置' }, { navigation_key: 'model-routes', label: '模型路由' }, { navigation_key: 'model-providers', label: '模型供应商' }],
  actions: [{ action_key: 'model:manage', label: '管理模型' }, { action_key: 'channel:govern', label: '治理渠道' }], expires_at: '2030-01-01T00:00:00Z' }
const connection = { id: 'connection1', name: '业务模型连接', provider_id: 'provider1', provider_name: '供应商甲', protocol: 'chat_completions', protocol_name: 'Chat Completions 兼容', endpoint: 'https://models.example/v1', timeout_seconds: 60, status: 'ACTIVE', status_label: '启用', health_status: 'UNKNOWN', health_label: '未知', health_reason: null, health_checked_at: null, current_version_id: 'cv1', revision: 1, credential_ref: 'secret-reference', actions: [{ action_key: 'edit', label: '编辑' }] }
const model = { id: 'model1', name: '业务模型', model_code: 'business', connection_id: 'connection1', connection_name: connection.name, provider_model_name: 'provider-v1', provider_name: '供应商甲', protocol: 'chat_completions', protocol_name: connection.protocol_name, status: 'ACTIVE', status_label: '启用', context_limit: null, parameters: { max_tokens: 100 }, parameter_allowlist: ['max_tokens'], parameter_reasons: { temperature: '该模型未开放此参数' }, usage_subsets: { cache_read: 'input' }, revision: 1, current_version_id: 'v1', config_digest: 'digest', verified_at: null,
  capabilities: [{ capability: 'tools', name: '工具调用', state: 'UNVERIFIED', label: '未验证', verified_at: null, reason: '当前配置尚未通过真实验证' }], actions: [{ action_key: 'edit', label: '编辑', enabled: true }, { action_key: 'test_connection', label: '测试连接', enabled: true }, { action_key: 'test', label: '能力验证', enabled: true }, { action_key: 'history', label: '历史版本', enabled: true }] }
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
  await page.goto('#/models')
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
  await page.goto('#/models')
  await page.getByRole('tab', { name: '供应商连接', exact: true }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('新凭据（留空保留原凭据）')).toHaveValue('')
  await dialog.getByLabel('连接名称').fill('修改后的连接')
  await dialog.getByLabel('允许的 IP 范围').fill('10.20.0.0/16\n2001:2::59/128')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(saved).toMatchObject({ name: '修改后的连接', allowed_networks: ['10.20.0.0/16', '2001:2::59/128'], credential_ref: 'secret-reference', revision: 1 })
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
  await page.goto('#/models')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('默认参数（JSON）').fill('{"max_tokens":100,"seed":1}')
  await dialog.getByRole('button', { name: '保存', exact: true }).dblclick()
  await expect(dialog.getByText('参数未获协议或模型支持：seed')).toBeVisible()
  await expect(dialog.getByLabel('默认参数（JSON）')).toHaveValue('{"max_tokens":100,"seed":1}')
  expect(count).toBe(1)
})


for (const success of [true, false]) {
  test(`模型列表测试连接显示${success ? '成功' : '失败'}结果和耗时`, async ({ page }) => {
    await setup(page)
    let requests = 0
    await page.route('**/admin/v1/models/model1/connection-test', async route => {
      requests++
      expect(route.request().method()).toBe('POST')
      expect(route.request().postData()).toBeNull()
      await new Promise(resolve => setTimeout(resolve, 350))
      return route.fulfill({ json: {
        model_id: 'model1', connection_id: 'connection1', success,
        message: success ? '连接成功，供应商接口与凭据检查通过' : '供应商鉴权失败，请检查连接凭据及其访问权限',
        error_code: success ? null : 'MODEL_AUTH_FAILED', latency_ms: 238, checked_at: '2026-10-06T03:00:00Z',
      } })
    })
    await page.goto('#/models')
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '测试连接 · 业务模型' })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeDisabled()
    await expect(dialog.getByText(success ? '连接成功，供应商接口与凭据检查通过' : '供应商鉴权失败，请检查连接凭据及其访问权限')).toBeVisible()
    await expect(dialog.getByText('238 毫秒')).toBeVisible()
    expect(requests).toBe(1)
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
    await expect(dialog).toBeHidden()
  })
}

test('无凭据使用权限时禁用测试连接', async ({ page }) => {
  await setup(page)
  await page.route('**/admin/v1/models', route => route.fulfill({ json: {
    items: [{ ...model, actions: [{ action_key: 'test_connection', label: '测试连接', enabled: false, disabled_reason: '没有使用连接凭据的权限' }] }], actions: [],
  } }))
  await page.goto('#/models')
  await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeDisabled()
})

async function openRouteVersion(page: Page, routeModels = [model]) {
  await setup(page)
  await page.route('**/admin/v1/models', route => route.fulfill({ json: { items: routeModels, actions: [] } }))
  await page.route('**/admin/v1/model-routes', route => route.fulfill({ json: { items: [{ id: 'route1', name: '测试路由', status_label: '启用', released_version_id: null }], actions: [] } }))
  let saved: Record<string, unknown> | undefined
  await page.route('**/admin/v1/model-routes/route1/versions', route => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON()
      return route.fulfill({ json: { version_id: 'route-version1', version_label: 'v1', content: saved } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('#/model-routes')
  await page.getByRole('button', { name: '版本', exact: true }).click()
  await page.getByRole('button', { name: '新增版本', exact: true }).click()
  await page.getByRole('dialog', { name: '新增路由版本', exact: true }).getByLabel('版本名称').fill('v1')
  return () => saved
}

async function chooseRouteModel(page: Page, field: string, name: string) {
  const input = page.getByRole('dialog', { name: '新增路由版本', exact: true }).getByLabel(field, { exact: true })
  await input.click()
  await page.locator('.ant-select-dropdown:visible').getByText(`供应商甲 · 业务模型连接 · ${name}`, { exact: true }).click()
  if (await input.getAttribute('aria-expanded') === 'true') await input.press('Escape')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}

test('单模型路由可以不设置回退，通过重试上限重复尝试', async ({ page }) => {
  const saved = await openRouteVersion(page)
  const dialog = page.getByRole('dialog', { name: '新增路由版本', exact: true })
  await chooseRouteModel(page, '首选模型', '业务模型')
  await dialog.getByLabel('回退模型（按选择顺序）', { exact: true }).click()
  await expect(page.getByText('暂无其他模型，可不设置回退')).toBeVisible()
  await dialog.getByLabel('回退模型（按选择顺序）', { exact: true }).press('Escape')
  await dialog.getByLabel('总尝试上限（次）').fill('10')
  await dialog.getByLabel('每个模型重试上限（次）').fill('2')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(saved()).toMatchObject({ primary_model: 'model1', fallback_models: [], retry_policy: { max_attempts: 10, retries_per_model: 2 } })
})

test('切换首选时移除同名回退并保留其他回退顺序', async ({ page }) => {
  const saved = await openRouteVersion(page, [model, ...['乙', '丙', '丁'].map((name, index) => ({ ...model, id: `model${index + 2}`, name: `模型${name}` }))])
  const dialog = page.getByRole('dialog', { name: '新增路由版本', exact: true })
  await chooseRouteModel(page, '首选模型', '业务模型')
  await chooseRouteModel(page, '回退模型（按选择顺序）', '模型乙')
  await chooseRouteModel(page, '回退模型（按选择顺序）', '模型丙')
  await chooseRouteModel(page, '回退模型（按选择顺序）', '模型丁')
  await chooseRouteModel(page, '首选模型', '模型丙')
  await chooseRouteModel(page, '回退模型（按选择顺序）', '业务模型')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(saved()).toMatchObject({ primary_model: 'model3', fallback_models: ['model2', 'model4', 'model1'] })
})

async function openRoutePublish(page: Page, reason?: string) {
  await setup(page)
  let released = false
  let submitted: unknown
  await page.route('**/admin/v1/model-routes', route => route.fulfill({ json: { items: [{ id: 'route1', name: '测试路由', status_label: '启用', released_version_id: null }], actions: [] } }))
  await page.route('**/admin/v1/model-routes/route1/versions', route => route.fulfill({ json: [{
    version_id: 'route-version1', version_label: 'v1', content: { primary_model: 'model1', fallback_models: [] },
    actions: [{ action_key: 'release', label: '发布', enabled: !reason && !released, disabled_reason: released ? '该版本已是当前发布版本' : reason }],
  }] }))
  await page.route('**/admin/v1/model-routes/route1/releases', route => {
    submitted = route.request().postDataJSON()
    released = true
    return route.fulfill({ json: { version_id: 'route-version1' } })
  })
  await page.goto('#/model-routes')
  await page.getByRole('button', { name: '版本', exact: true }).click()
  return () => submitted
}

for (const reason of ['当前角色未获此环境的发布权限，请联系有授权权限的管理员', '业务模型：以下能力尚未通过当前配置验证：文本生成']) {
  test(`路由发布不可用时显示禁用按钮与原因：${reason}`, async ({ page }) => {
    await openRoutePublish(page, reason)
    const drawer = page.getByRole('dialog', { name: '测试路由', exact: true })
    await expect(drawer.getByRole('button', { name: '发布', exact: true })).toBeDisabled()
    await expect(drawer.getByText(reason, { exact: true })).toBeVisible()
  })
}

test('路由按服务端版本操作展示发布入口，发布后更新状态并阻止重复发布', async ({ page }) => {
  const submitted = await openRoutePublish(page)
  const drawer = page.getByRole('dialog', { name: '测试路由', exact: true })
  await drawer.getByRole('button', { name: '发布', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '发布 v1', exact: true })
  await expect(dialog.getByText('发布后新的运行将使用该路由版本。')).toBeVisible()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(drawer.getByText('当前发布', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '发布', exact: true })).toBeDisabled()
  expect(submitted()).toEqual({ version_id: 'route-version1', expected_version_id: null })
})

test('配置和业务页面统一使用渠道与环境', async ({ page }) => {
  await setup(page)
  const management = { ...workspace,  }
  let current = management
  const switches: unknown[] = []
  await page.route('**/admin/v1/auth/session', route => route.fulfill({ json: {
    ...session, workspace: current, workspace_options: [management, workspace],
    navigation: [...session.navigation, { navigation_key: 'conversations', label: '会话管理' }],
  } }))
  await page.route('**/admin/v1/auth/channel-context', route => {
    switches.push(route.request().postDataJSON())
    current = workspace
    return route.fulfill({ json: { access_token: 'scoped-token', token_type: 'Bearer', expires_in: 28800 } })
  })
  await page.route('**/admin/v1/conversations?**', route => route.fulfill({ json: {
    items: [], has_more: false, actions: [], agents: [], unavailable_reason: null,
  } }))
  await page.goto('#/models')
  const header = page.locator('header')
  await expect(header.getByText('测试渠道', { exact: true })).toBeVisible()
  await expect(header.getByText('测试', { exact: true })).toBeVisible()
  await expect(header.getByText('管理工作区')).toHaveCount(0)
  await expect(header.getByRole('combobox', { name: '业务数据范围' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '能力验证', exact: true })).toBeEnabled()
  await page.getByRole('menuitem', { name: '会话管理', exact: true }).click()
  await expect(header.getByRole('combobox', { name: '业务数据范围' })).toHaveCount(0)
  expect(switches).toEqual([])
  await page.getByRole('menuitem', { name: '模型路由', exact: true }).click()
  await expect(header.getByRole('combobox', { name: '业务数据范围' })).toHaveCount(0)
})
