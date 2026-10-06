import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试',  }
const definition = { workflow_type: 'structured', entrypoint: 'structured.v1', start_step: 'answer',
  input_schema: { type: 'object', properties: { request: { type: 'string', title: '业务诉求' } }, required: ['request'], additionalProperties: false },
  output_schema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] },
  steps: [{ key: 'answer', name: '生成业务结果', kind: 'model', dependency: null, inputs: { request: { source: 'input', path: 'request' } }, input_schema: {}, output_schema: {}, timeout_seconds: 30, failure_policy: 'fail', max_retries: 0 }],
  edges: [{ source: 'answer', target: 'END', condition: null, otherwise: false }],
  bindings: { prompt_version: 'prompt_version', model_route_version: 'route_version', tool_versions: [], skill_versions: [] },
  limits: { deadline_seconds: 60, loop_timeout_seconds: 60, token_limit: 16000, max_model_rounds: 6, max_tool_calls: 10, max_iterations: 10, output_repair_attempts: 1, cost_limit: null },
  context: { conversation_enabled: false, context_limit: 8000, summary_policy: 'none', memory_policy: null },
}
const agent = { agent_id: 'agent_a', agent_code: 'business_task', name: '业务助手', description: '处理业务诉求', owner: '配置人员', revision: 3,
  status: { value: 'ACTIVE', label: '已启用', tone: 'success' }, actions: [action('edit', '编辑信息'), action('create_version', '新增草稿'), action('emergency_stop', '紧急停用')] }
const version = { version_id: 'draft_a', version_label: '初始草稿', revision: 7, content_digest: 'a'.repeat(64), status: { value: 'DRAFT', label: '草稿', tone: 'default' }, definition,
  actions: [action('edit', '编辑配置'), action('validate', '校验'), action('test', '调试'), action('release', '发布')] }
const detail = { agent, versions: [version], release_revision: 2, release_version_id: 'published_a', differences: [{ field: 'limits', label: '运行限制', before: { max_model_rounds: 3 }, after: { max_model_rounds: 6 } }], releases: [
  { release_id: 'release_a', environment: 'test', environment_label: '测试', version_id: 'published_a', version_label: '发布版本 1', operation: 'publish', operation_label: '发布', note: '增加结果校验', actor_name: '发布人员', created_at: '2026-10-02T03:00:00Z', evidence_refs: [] },
] }
const options = { environment: 'test', environment_label: '测试', templates: [{ key: 'structured.v1', name: '单步结构化任务', workflow_type: 'structured', definition }], dependencies: [
  { resource_type: 'prompt', resource_id: 'prompt_a', version_id: 'prompt_version', name: '业务提示词', version_label: '提示词初版', revision: 1, state: { label: '已发布' }, content_digest: 'c'.repeat(64) },
  { resource_type: 'model_route', resource_id: 'route_a', version_id: 'route_version', name: '结构化路由', version_label: '模型初版', revision: 1, state: { label: '已发布' }, content_digest: 'd'.repeat(64) },
] }
async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace,
      navigation: [{ navigation_key: 'agents', label: '智能体' }], actions: [action('agent:manage', '管理智能体')], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/agents') json = { items: [agent], actions: [action('create', '新增智能体')] }
    else if (path === '/admin/v1/agents/options') json = options
    else if (path === '/admin/v1/agents/agent_a') json = detail
    await route.fulfill({ json })
  })
}

test('列表仅在打开新增窗口后读取依赖选项', async ({ page }) => {
  await fixture(page)
  let calls = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/admin/v1/agents/options') calls++
  })
  await page.goto('#/agents')
  await expect(page.getByRole('link', { name: '业务助手' })).toBeVisible()
  expect(calls).toBe(0)
  await page.getByRole('button', { name: '新增智能体', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => calls).toBe(1)
})

test('配置、流程、资源名称和发布记录可查看', async ({ page }) => {
  await fixture(page)
  await page.goto('#/agents')
  await page.getByRole('link', { name: '业务助手' }).click()
  await expect(page.getByLabel('流程图')).toContainText('生成业务结果')
  await expect(page.getByLabel('流程图')).toContainText('结束')
  await page.screenshot({ path: '/tmp/creativity-agent-desktop.png', fullPage: true })
  await page.getByRole('tab', { name: '模型、提示词与工具技能' }).click()
  await expect(page.getByRole('cell', { name: '业务提示词', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '结构化路由', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '发布记录', exact: true }).click()
  await expect(page.getByRole('cell', { name: '发布人员' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2026年10月2日 11:00:00' })).toBeVisible()
})

test('生产门禁错误明确显示，发布携带修订与工作区环境', async ({ page }) => {
  await fixture(page)
  await page.route('**/agents/agent_a/releases', async route => {
    expect(route.request().postDataJSON()).toEqual({ version_id: 'draft_a', revision: 7, expected_mapping_revision: 2, environment: 'test', operation: 'publish', note: '验证改动', evaluation_refs: [] })
    await route.fulfill({ status: 422, json: { error: { code: 'EVALUATION_REQUIRED', message: '生产发布需要有效评测报告', fields: [] } } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.getByLabel('发布说明').fill('验证改动')
  await page.getByRole('button', { name: '确认发布' }).click()
  await expect(page.getByText('生产发布需要有效评测报告', { exact: true })).toBeVisible()
  await expect(page.getByLabel('发布说明')).toHaveValue('验证改动')
})

test('窄屏修改冲突保留草稿，提交不覆盖受信渠道', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/agent-versions/draft_a', async route => {
    const body = route.request().postDataJSON()
    expect(body.revision).toBe(7)
    expect(body.definition.limits.max_model_rounds).toBe(9)
    expect(body).not.toHaveProperty('channel_id')
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '草稿已变更，请刷新后重新检查', fields: [] } } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByLabel('模型轮数上限（次）').fill('9')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('草稿已变更，请刷新后重新检查', { exact: true })).toBeVisible()
  await expect(page.getByLabel('模型轮数上限（次）')).toHaveValue('9')
  await page.screenshot({ path: '/tmp/creativity-agent-mobile.png', fullPage: true })
})

test('调试按字段标题生成输入，执行服务未接通时不显示成功结果', async ({ page }) => {
  await fixture(page)
  await page.route('**/agent-versions/draft_a/tests', async route => {
    const body = route.request().postDataJSON()
    expect(body.input).toEqual({ request: '整理最近咨询' })
    expect(body.revision).toBe(7)
    expect(body).not.toHaveProperty('snapshot')
    await route.fulfill({ status: 503, json: { error: { code: 'DEPENDENCY_UNAVAILABLE', message: '智能体调试运行服务暂不可用', fields: [] } } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('tab', { name: '调试', exact: true }).click()
  await page.getByLabel('业务诉求').fill('整理最近咨询')
  await page.getByRole('button', { name: '开始调试' }).click()
  await expect(page.getByText('智能体调试运行服务暂不可用', { exact: true })).toBeVisible()
  await expect(page.getByText('已完成', { exact: true })).toHaveCount(0)
})

test('调试结果的步骤轨迹通过 Hash 路由进入运行详情', async ({ page }) => {
  await fixture(page)
  const run = { run_id: 'run_a', name: '业务助手', state: 'SUCCEEDED', state_label: '已完成', purpose_label: '调试',
    created_at: '2026-10-02T03:00:00Z', content_allowed: false, result: null, actions: [] }
  await page.route('**/admin/v1/agent-versions/draft_a/tests', route => route.fulfill({ json: {
    run_id: run.run_id, state: { value: run.state, label: run.state_label }, trace_url: '/runs/run_a',
  } }))
  await page.route('**/admin/v1/runs/run_a/detail', route => route.fulfill({ json: run }))
  await page.route('**/admin/v1/runs/run_a/trace', route => route.fulfill({ json: { items: [], next_sequence: null } }))
  await page.goto('#/agents/agent_a')
  await page.getByRole('tab', { name: '调试', exact: true }).click()
  await page.getByLabel('业务诉求').fill('整理最近咨询')
  await page.getByRole('button', { name: '开始调试' }).click()
  const link = page.getByRole('link', { name: '查看步骤轨迹', exact: true })
  await expect(link).toHaveAttribute('href', '#/runs/run_a')
  await link.click()
  await expect(page).toHaveURL(/\/#\/runs\/run_a$/)
  await expect(page.getByRole('heading', { name: '运行详情', exact: true })).toBeVisible()
  await expect(page.getByText('当前权限可查看执行轨迹，输入输出未授权', { exact: true })).toBeVisible()
})

test('新增向导使用模板并提交完整依赖及限制', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/agents', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: { items: [], actions: [action('create', '新增智能体')] } }); return }
    const body = route.request().postDataJSON()
    expect(body.agent_code).toBe('new_agent')
    expect(body.definition.entrypoint).toBe('structured.v1')
    expect(body.definition.context.memory_policy).toBeNull()
    expect(body.definition.bindings.model_route_version).toBe('route_version')
    await route.fulfill({ status: 201, json: detail })
  })
  await page.goto('#/agents')
  await page.getByRole('button', { name: '新增智能体', exact: true }).click()
  await page.getByLabel('调用编码').fill('new_agent')
  await page.getByLabel('智能体名称', { exact: true }).fill('新业务助手')
  await page.getByLabel('用途', { exact: true }).fill('业务验证')
  await page.getByLabel('负责人').fill('负责人')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page).toHaveURL(/\/#\/agents\/agent_a$/)
})

test('旧入口编辑保留版本，新增可选择通用流程', async ({ page }) => {
  await fixture(page)
  const legacy = { ...definition, workflow_type: 'template', entrypoint: 'risk.v1' }
  const generic = { ...definition, workflow_type: 'template', entrypoint: 'workflow.v1' }
  await page.route('**/admin/v1/agents/options', route => route.fulfill({ json: { ...options,
    templates: [...options.templates, { key: 'workflow.v1', name: '通用流程', workflow_type: 'template', definition: generic }],
    legacy_templates: [{ key: 'risk.v1', name: '风险评估（旧版）', workflow_type: 'template', definition: legacy }],
  } }))
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, versions: [{ ...version, definition: legacy }] } }))
  await page.route('**/agent-versions/draft_a', async route => {
    expect(route.request().postDataJSON().definition.entrypoint).toBe('risk.v1')
    await route.fulfill({ json: { ...version, definition: legacy } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('风险评估（旧版） · 通用流程', { exact: true })).toBeVisible()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.goto('#/agents')
  await page.getByRole('button', { name: '新增智能体', exact: true }).click()
  await page.getByLabel('流程模板').click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('风险评估（旧版） · 通用流程', { exact: true })).toHaveCount(0)
  await page.locator('.ant-select-dropdown:visible').getByText('通用流程 · 通用流程', { exact: true }).click()
  await expect(page.getByRole('dialog').getByTitle('通用流程 · 通用流程', { exact: true })).toBeVisible()
})

test('Agent 固定技能参考文件与按需加载选择', async ({ page }) => {
  await fixture(page)
  const skillDependency = { resource_type: 'skill', resource_id: 'skill_a', version_id: 'skill_version', name: '档案解读', version_label: '技能初版', revision: 1, state: { label: '已冻结' }, content_digest: 'e'.repeat(64) }
  await page.route('**/admin/v1/agents/options', route => route.fulfill({ json: { ...options, dependencies: [...options.dependencies, skillDependency] } }))
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, versions: [{ ...version, definition: { ...definition, bindings: { ...definition.bindings, skill_versions: ['skill_version'] } } }] } }))
  await page.route('**/skill-versions/skill_version', route => route.fulfill({ json: { files: [
    { relative_path: 'SKILL.md', loadable: true }, { relative_path: 'references/citation.md', loadable: true }, { relative_path: 'scripts/check.py', loadable: false, unavailable_reason: '脚本执行未启用' },
  ] } }))
  let saves = 0
  await page.route('**/agent-versions/draft_a', async route => {
    saves++
    const body = route.request().postDataJSON()
    expect(body.definition.bindings.skill_loading).toEqual([{ version_id: 'skill_version', selected: true, selected_files: ['references/citation.md'] }])
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '草稿已变更，请重新检查', fields: [] } } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('switch', { name: '触发按需技能' }).click()
  await page.getByLabel('加载参考资料').click()
  await page.getByText('references/citation.md', { exact: true }).last().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await page.screenshot({ path: '.logs/21/agent-skill-loading.png', fullPage: true })
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('草稿已变更，请重新检查', { exact: true })).toBeVisible()
  expect(saves).toBe(1)
})

test('可视化新增审批步骤与连线，保存带原草稿修订', async ({ page }) => {
  await fixture(page)
  let saved = false
  await page.route('**/agent-versions/draft_a', async route => {
    const body = route.request().postDataJSON()
    expect(body.revision).toBe(7)
    expect(body.definition.steps).toContainEqual(expect.objectContaining({ key: 'approval_step', name: '业务审批', kind: 'compute', operator: 'approval' }))
    expect(body.definition.edges).toContainEqual({ source: 'approval_step', target: 'END', condition: null, otherwise: false })
    saved = true
    await route.fulfill({ json: version })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '新增步骤', exact: true }).click()
  const step = page.getByRole('dialog', { name: '新增步骤', exact: true })
  await step.getByLabel('步骤标识').fill('approval_step')
  await step.getByLabel('步骤名称').fill('业务审批')
  await step.getByLabel('操作', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('等待审批', { exact: true }).click()
  await step.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByLabel('流程编辑画布')).toContainText('业务审批')
  await page.getByRole('button', { name: '新增连线', exact: true }).click()
  const edge = page.getByRole('dialog', { name: '编辑连线' })
  await edge.getByLabel('来源步骤').click()
  await page.locator('.ant-select-dropdown:visible').getByText('业务审批', { exact: true }).click()
  await edge.getByRole('button', { name: '确定', exact: true }).click()
  await page.screenshot({ path: '/tmp/creativity-enhancements-flow.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => saved).toBe(true)
})
