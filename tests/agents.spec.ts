import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试',  }
const definition = { workflow_type: 'structured', entrypoint: 'structured.v1', start_step: 'answer',
  input_schema: { type: 'object', properties: { request: { type: 'string', title: '业务诉求' } }, required: ['request'], additionalProperties: false },
  output_schema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] },
  steps: [{ key: 'answer', name: '生成业务结果', kind: 'model', dependency: null, inputs: { request: { source: 'input', path: 'request' } }, input_schema: {}, output_schema: {}, timeout_seconds: 30, failure_policy: 'fail', max_retries: 0 }],
  edges: [{ source: 'answer', target: 'END', condition: null, otherwise: false }],
  bindings: { prompt_id: 'prompt_version', model_route_id: 'route_version', tool_ids: [], skill_ids: [] },
  limits: { deadline_seconds: 60, loop_timeout_seconds: 60, token_limit: 16000, max_model_rounds: 6, max_tool_calls: 10, max_iterations: 10, output_repair_attempts: 1, cost_limit: null },
  context: { conversation_enabled: false, context_limit: 8000, summary_policy: 'none', memory_policy: null },
}
const agent = { agent_id: 'agent_a', agent_code: 'business_task', name: '业务助手', description: '处理业务诉求', owner: '配置人员', revision: 3,
  status: { value: 'ACTIVE', label: '已启用', tone: 'success' }, online: false, enabled: true, online_status: { value: 'OFFLINE', label: '已下线', tone: 'default' }, actions: [action('edit', '编辑信息'), action('online', '上线'), action('disable', '停用')] }
const version = { agent_id: 'agent_a', revision: 7, content_digest: 'a'.repeat(64), definition,
  actions: [action('edit', '编辑配置'), action('validate', '校验'), action('test', '调试')] }
const detail = { agent, configuration: version }
const options = { environment: 'test', environment_label: '测试', templates: [{ key: 'structured.v1', name: '单步结构化任务', workflow_type: 'structured', definition }], dependencies: [
  { resource_type: 'prompt', resource_id: 'prompt_a', version_id: 'prompt_version', name: '业务提示词', version_label: '提示词初版', revision: 1, state: { label: '已发布' }, content_digest: 'c'.repeat(64) },
  { resource_type: 'model_route', required_capabilities: ['text'], resource_id: 'route_a', version_id: 'route_version', name: '结构化路由', version_label: '模型初版', revision: 1, state: { label: '已发布' }, content_digest: 'd'.repeat(64) },
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

const pythonEnvironment = { profile_id: 'python_local', profile_digest: 'a'.repeat(64), name: 'Python 计算环境', seconds: 10, memory_mb: 128 }

test('脚本节点只有一份代码，保存校验结果结构且不配置模型或工具', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/agents/options', route => route.fulfill({ json: { ...options, python_environments: [pythonEnvironment] } }))
  let saved = false
  let source = ''
  await page.route('**/agents/agent_a/configuration', async route => {
    const node = route.request().postDataJSON().definition.steps[0]
    expect(node.kind).toBe('script')
    expect(node.script).toEqual({ source, profile_id: pythonEnvironment.profile_id, profile_digest: pythonEnvironment.profile_digest })
    expect(node.dependency).toBeNull()
    expect(node.prompt_id).toBeNull()
    expect(node.operator).toBeNull()
    expect(node.failure_handler).toBeNull()
    expect(node).not.toHaveProperty('input_script')
    expect(node).not.toHaveProperty('output_script')
    expect(node.output_schema.properties.data.properties.success.type).toBe('boolean')
    expect(node.output_schema.properties.data.properties.inputs.type).toBe('object')
    saved = true
    await route.fulfill({ json: version })
  })
  await page.goto('#/agents/agent_a?edit=true')
  const step = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await step.getByLabel('步骤类型', { exact: true }).click()
  await page.getByText('脚本处理', { exact: true }).click()
  await expect(step.getByLabel('模型路由', { exact: true })).toHaveCount(0)
  await expect(step.getByLabel('提示词', { exact: true })).toHaveCount(0)
  await expect(step.getByLabel('工具', { exact: true })).toHaveCount(0)
  await expect(step.getByLabel('失败收尾工具', { exact: true })).toHaveCount(0)
  await step.getByRole('tab', { name: 'Python 脚本', exact: true }).click()
  await step.getByRole('button', { name: '填入校验示例', exact: true }).click()
  source = await step.getByRole('textbox', { name: 'Python 脚本代码' }).inputValue()
  expect(source).toContain('"success": success')
  await page.getByRole('tab', { name: '基本配置', exact: true }).first().click()
  await page.getByRole('tab', { name: '流程', exact: true }).click()
  await step.getByRole('tab', { name: 'Python 脚本', exact: true }).click()
  await expect(step.getByRole('textbox', { name: 'Python 脚本代码' })).toHaveValue(source)
  await page.screenshot({ path: '.local/agent-node-python.png', fullPage: true })
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => saved).toBe(true)
})

test('脚本节点缺少渠道执行环境时保留代码并阻止保存', async ({ page }) => {
  await fixture(page)
  let saves = 0
  await page.route('**/agents/agent_a/configuration', route => { saves++; return route.fulfill({ json: version }) })
  const configured = { ...definition, steps: [{ ...definition.steps[0], kind: 'script' }] }
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, configuration: { ...version, definition: configured } } }))
  await page.goto('#/agents/agent_a?edit=true')
  const step = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await step.getByRole('tab', { name: 'Python 脚本', exact: true }).click()
  await expect(step.getByRole('combobox', { name: '脚本执行环境' })).toBeDisabled()
  await expect(step.getByText('当前渠道尚未配置 Python 执行环境')).toBeVisible()
  const source = 'def transform(value, context):\n    return value\n'
  await step.getByRole('textbox', { name: 'Python 脚本代码' }).fill(source)
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(step.getByText('请填写 Python 代码并选择有效执行环境', { exact: true })).toBeVisible()
  await expect(step.getByRole('textbox', { name: 'Python 脚本代码' })).toHaveValue(source)
  expect(saves).toBe(0)
})

test('全量分页由工具节点配置，校验脚本使用独立节点', async ({ page }) => {
  await fixture(page)
  const tool = { resource_type: 'tool', resource_id: 'query', version_id: 'query', name: '项目分页查询', revision: 1, state: { label: '已发布' }, content_digest: 'b'.repeat(64) }
  await page.route('**/admin/v1/agents/options', route => route.fulfill({ json: { ...options, dependencies: [...options.dependencies, tool] } }))
  const configured = { ...definition, steps: [{ ...definition.steps[0], kind: 'tool', dependency: 'query' }], bindings: { ...definition.bindings, tool_ids: ['query'] } }
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, configuration: { ...version, definition: configured } } }))
  let saved = false
  await page.route('**/agents/agent_a/configuration', async route => {
    const node = route.request().postDataJSON().definition.steps[0]
    expect(node.pagination).toEqual({ cursor_input: 'cursor', items_path: 'items', has_more_path: 'has_more', cursor_path: 'cursor', count_path: 'count', total_path: null, max_items: 1000 })
    expect(node.script).toBeNull()
    saved = true
    await route.fulfill({ json: version })
  })
  await page.goto('#/agents/agent_a?edit=true')
  const step = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await expect(step.getByRole('tab', { name: 'Python 脚本', exact: true })).toHaveCount(0)
  await step.getByRole('tab', { name: '全量分页', exact: true }).click()
  await step.getByRole('switch', { name: '启用全量分页' }).click()
  await step.getByRole('textbox', { name: '本页条数字段路径（可选）' }).fill('count')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => saved).toBe(true)
})

for (const entry of ['list', 'detail'] as const) {
  test(`停用智能体从${entry === 'list' ? '列表' : '详情'}确认删除，取消不提交`, async ({ page }) => {
    await fixture(page)
    const stopped = { ...agent, status: { value: 'OFFLINE', label: '已下线', tone: 'default' }, actions: [{ ...action('delete', '删除'), enabled: true }] }
    let deleted = false, requests = 0
    await page.route('**/admin/v1/agents?*', route => route.fulfill({ json: { items: deleted ? [] : [stopped], actions: [] } }))
    await page.route('**/admin/v1/agents/agent_a', async route => {
      if (route.request().method() === 'DELETE') {
        requests++
        expect(route.request().postDataJSON()).toEqual({ revision: agent.revision })
        deleted = true
        await route.fulfill({ status: 204 })
      } else await route.fulfill({ json: { ...detail, agent: stopped } })
    })
    await page.goto(entry === 'list' ? '#/agents' : '#/agents/agent_a')
    await page.getByRole('button', { name: '删除', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '删除智能体' })
    await expect(dialog.getByText(/历史运行记录保留/)).toBeVisible()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(requests).toBe(0)
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await dialog.getByRole('button', { name: '确认', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/#\/agents$/)
    await expect(page.getByRole('link', { name: '业务助手', exact: true })).toHaveCount(0)
    expect(requests).toBe(1)
  })

  test(`智能体${entry === 'list' ? '列表' : '详情'}展示服务端删除限制原因`, async ({ page }) => {
    await fixture(page)
    const blocked = { ...agent, actions: [{ ...action('delete', '删除'), enabled: false, disabled_reason: '智能体仍关联定时计划，请先解除关联' }] }
    await page.route('**/admin/v1/agents?*', route => route.fulfill({ json: { items: [blocked], actions: [] } }))
    await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, agent: blocked } }))
    await page.goto(entry === 'list' ? '#/agents' : '#/agents/agent_a')
    const button = page.getByRole('button', { name: '删除', exact: true })
    await expect(button).toBeDisabled()
    await button.hover({ force: true })
    await expect(page.getByRole('tooltip')).toHaveText('智能体仍关联定时计划，请先解除关联')
  })
}

test('智能体删除时引用变化，错误保留在确认框中', async ({ page }) => {
  await fixture(page)
  const stopped = { ...agent, actions: [{ ...action('delete', '删除'), enabled: true }] }
  await page.route('**/admin/v1/agents/agent_a', route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 409, json: { error: { code: 'AGENT_IN_USE', message: '智能体仍有待派发的业务任务，请先取消或等待处理完成', fields: [] } } })
    : route.fulfill({ json: { ...detail, agent: stopped } }))
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '删除', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '删除智能体' })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('智能体仍有待派发的业务任务')
  await expect(dialog.getByRole('button', { name: '确认', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/#\/agents\/agent_a$/)
})

test('运行限制直达当前配置，编辑直接定位运行策略且刷新保留', async ({ page }) => {
  await fixture(page)
  await page.goto('#/agents/agent_a?tab=limits')
  await expect(page.getByRole('tab', { name: '运行限制', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('16000 Token', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.getByRole('tab', { name: '运行策略', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('单次运行 Token 上限', { exact: true })).toHaveValue('16000')
  await page.reload()
  await expect(page.getByRole('tab', { name: '运行策略', exact: true })).toHaveAttribute('aria-selected', 'true')
})

const assistedProposal = { agent_code: 'business_task', name: '咨询摘要助手', description: '整理咨询要点', owner: '客服团队',
  definition: { ...definition, instructions: '总结咨询问题并列出待办事项。' } }
async function assistanceFixture(page: Page) {
  await fixture(page)
  await page.route('**/admin/v1/agents?*', route => route.fulfill({ json: { items: [{ ...agent, actions: [action('assist', '智能修改')] }], actions: [action('create', '新增智能体'), action('assist', '智能协助')] } }))
}

test('智能协助追问后生成方案，确认保存前没有创建资源', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 })
  await assistanceFixture(page)
  let submissions = 0, saved = 0
  await page.route('**/admin/v1/agents/assistance', async route => {
    submissions++
    const body = route.request().postDataJSON()
    expect(body.idempotency_key).toBeTruthy()
    expect(body.model_route_id).toBe('route_version')
    expect(body.previous_run_id).toBe(submissions === 1 ? null : 'assist_1')
    await route.fulfill({ status: 202, json: { run_id: `assist_${submissions}` } })
  })
  await page.route('**/admin/v1/agents/assistance/runs/*', async route => {
    const first = route.request().url().endsWith('assist_1')
    await route.fulfill({ json: { run_id: first ? 'assist_1' : 'assist_2', state: 'SUCCEEDED', state_label: '已完成',
      reply: { message: first ? '需要输出哪些信息？' : '已生成咨询摘要流程，可继续调整。', proposal: first ? null : assistedProposal }, base_definition: null } })
  })
  await page.route('**/admin/v1/agents/assistance/runs/assist_2/apply', async route => {
    saved++
    expect(route.request().postData()).toBeNull()
    await route.fulfill({ json: { agent_id: 'agent_a', version_id: 'draft_a' } })
  })
  await page.goto('#/agents')
  await expect(page.getByRole('link', { name: '业务助手', exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '智能体配置助手' })).toHaveCount(0)
  await page.getByRole('button', { name: '智能创建', exact: true }).click()
  const dialog = page.getByRole('region', { name: '智能协助工作区', exact: true })
  await dialog.getByLabel('创建或修改需求').fill('创建一个咨询摘要助手')
  await dialog.getByRole('button', { name: '发送', exact: true }).click()
  await expect(dialog.getByText('需要输出哪些信息？')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '创建智能体' })).toHaveCount(0)
  await dialog.getByLabel('创建或修改需求').fill('输出问题、关键信息和待办事项')
  await dialog.getByRole('button', { name: '发送', exact: true }).click()
  await expect(dialog.getByRole('region', { name: '候选智能体方案' })).toBeVisible()
  expect(saved).toBe(0)
  const conversationBox = await dialog.getByRole('region', { name: '智能协助对话', exact: true }).boundingBox()
  const previewBox = await dialog.getByRole('region', { name: '候选智能体方案', exact: true }).boundingBox()
  expect(conversationBox!.x + conversationBox!.width).toBeLessThan(previewBox!.x)
  await expect(dialog.getByRole('button', { name: '创建智能体' })).toBeInViewport()
  await page.screenshot({ path: '.local/agent-assistance-create.png', fullPage: true })
  await dialog.getByRole('button', { name: '创建智能体' }).click()
  await expect(page).toHaveURL(/agents\/agent_a\?edit=true/)
  expect(saved).toBe(1)
})

test('智能协助修改有变更预览，冲突保留方案与对话', async ({ page }) => {
  await assistanceFixture(page)
  await page.route('**/admin/v1/agents/assistance', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ agent_id: 'agent_a' })
    await route.fulfill({ status: 202, json: { run_id: 'assist_edit' } })
  })
  await page.route('**/admin/v1/agents/assistance/runs/assist_edit', route => route.fulfill({ json: { run_id: 'assist_edit', state: 'SUCCEEDED', state_label: '已完成',
    reply: { message: '补充任务指令，保留原流程。', proposal: assistedProposal }, base_definition: definition } }))
  await page.route('**/admin/v1/agents/assistance/runs/assist_edit/apply', route => route.fulfill({ status: 409,
    json: { error: { code: 'REVISION_CONFLICT', message: '智能体已被修改，请开始新对话生成方案；本次方案仍保留', fields: [] } } }))
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '智能修改', exact: true }).click()
  const dialog = page.getByRole('region', { name: '智能协助工作区', exact: true })
  await dialog.getByLabel('创建或修改需求').fill('补充总结咨询问题的指令')
  await dialog.getByRole('button', { name: '发送', exact: true }).click()
  await dialog.getByRole('tab', { name: '变更对照' }).click()
  await expect(dialog.getByText('修改前', { exact: true })).toBeVisible()
  await expect(dialog.getByText('总结咨询问题并列出待办事项。', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '保存修改' }).click()
  await expect(dialog.getByText('智能体已被修改，请开始新对话生成方案；本次方案仍保留')).toBeVisible()
  await expect(dialog.getByText('补充任务指令，保留原流程。')).toBeVisible()
  await expect(dialog.getByRole('region', { name: '候选智能体方案' })).toBeVisible()
  await page.screenshot({ path: '.local/agent-assistance-conflict.png', fullPage: true })
})

test('复杂提示词预览带来源名称，保存后自动发布并关联步骤', async ({ page }) => {
  await assistanceFixture(page)
  const name = '企业客户咨询分析与售后支持智能体抽象的业务诉求分类、关键事实核对与后续行动建议提示词'
  const draft = { name, purpose: '归纳问题与待办事项', step_key: 'answer', content: {
    instruction_blocks: { system: '先提取事实，再分类问题，最后列出待办事项。', output_requirements: '仅使用可核实的事实' },
    message_templates: [], variables: [], change_note: '',
  } }
  let saves = 0
  await page.route('**/admin/v1/agents/assistance', route => route.fulfill({ status: 202, json: { run_id: 'assist_prompts' } }))
  await page.route('**/admin/v1/agents/assistance/runs/assist_prompts', route => route.fulfill({ json: {
    run_id: 'assist_prompts', state: 'SUCCEEDED', state_label: '已完成',
    reply: { message: '已生成方案和可复用提示词', proposal: assistedProposal, prompt_drafts: [draft] },
  } }))
  await page.route('**/admin/v1/agents/assistance/runs/assist_prompts/apply', async route => {
    saves++
    expect(route.request().postData()).toBeNull()
    await route.fulfill({ json: { agent_id: 'agent_a', version_id: 'draft_a', prompts: [{ prompt_id: 'prompt_extracted', name }] } })
  })
  await page.goto('#/agents/assistance')
  await page.getByLabel('创建或修改需求').fill('创建一个复杂咨询分析智能体，并提取可复用的提示词')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('tab', { name: '待创建提示词（1）' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.getByText(name, { exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(name)
  await page.getByText('关联步骤：生成业务结果').hover()
  await expect(page.getByLabel('系统指令', { exact: true })).toHaveValue(draft.content.instruction_blocks.system)
  await expect(page.getByText('关联步骤：生成业务结果')).toBeVisible()
  await expect(page.getByText('同时发布并关联 1 个提示词')).toBeVisible()
  expect(saves).toBe(0)
  await page.screenshot({ path: '.local/agent-extracted-prompts.png', fullPage: true })
  await page.getByRole('button', { name: '创建智能体' }).click()
  await expect(page).toHaveURL(/agents\/agent_a\?edit=true/)
  await expect(page.getByText('以下提示词已自动发布并关联到对应步骤。')).toBeVisible()
  await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', /#\/prompts\?prompt=prompt_extracted$/)
  expect(saves).toBe(1)
})

test('智能协助查询失败可恢复，不重复生成；窄屏预览不溢出', async ({ page }) => {
  await assistanceFixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  let posts = 0, reads = 0
  await page.route('**/admin/v1/agents/assistance', async route => { posts++; await route.fulfill({ status: 202, json: { run_id: 'assist_retry' } }) })
  await page.route('**/admin/v1/agents/assistance/runs/assist_retry', async route => {
    reads++
    if (reads === 1) { await route.fulfill({ status: 503, json: { error: { message: '查询暂不可用', fields: [] } } }); return }
    await route.fulfill({ json: { run_id: 'assist_retry', state: 'SUCCEEDED', state_label: '已完成', reply: { message: '已生成方案', proposal: assistedProposal } } })
  })
  await page.goto('#/agents')
  await page.getByRole('button', { name: '智能创建', exact: true }).click()
  const dialog = page.getByRole('region', { name: '智能协助工作区', exact: true })
  await dialog.getByLabel('创建或修改需求').fill('创建一个咨询摘要助手')
  await dialog.getByRole('button', { name: '发送', exact: true }).click()
  await expect(dialog.getByText('查询暂不可用')).toBeVisible()
  await dialog.getByRole('button', { name: '重新获取结果' }).click()
  await expect(dialog.getByText('已生成方案')).toBeVisible()
  expect(posts).toBe(1)
  await dialog.getByRole('button', { name: '查看生成的方案' }).click()
  await expect(dialog.getByRole('radio', { name: /方案预览/ })).toBeChecked()
  await expect(dialog.getByRole('region', { name: '候选智能体方案' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '创建智能体' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.local/agent-assistance-mobile.png', fullPage: true })
})

test('没有可用模型时智能协助保留输入并禁止发送', async ({ page }) => {
  await assistanceFixture(page)
  await page.route('**/admin/v1/agents/options', route => route.fulfill({ json: { ...options, dependencies: [] } }))
  await page.goto('#/agents')
  await page.getByRole('button', { name: '智能创建', exact: true }).click()
  const dialog = page.getByRole('region', { name: '智能协助工作区', exact: true })
  await dialog.getByLabel('创建或修改需求').fill('帮我创建一个智能体')
  await expect(dialog.getByText('暂无可用模型，请先发布并授权支持文本生成的模型路由')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
})

test('智能协助超时后可沿用需求重新生成，保留未发送内容', async ({ page }) => {
  await assistanceFixture(page)
  const submissions: { message: string; previous_run_id: string | null; idempotency_key: string }[] = []
  await page.route('**/admin/v1/agents/assistance', async route => {
    submissions.push(route.request().postDataJSON())
    await route.fulfill({ status: 202, json: { run_id: `retry_${submissions.length}` } })
  })
  await page.route('**/admin/v1/agents/assistance/runs/*', async route => {
    const runId = route.request().url().split('/').at(-1)
    await route.fulfill({ json: runId === 'retry_2'
      ? { run_id: runId, state: 'FAILED', state_label: '失败', error: '模型调用超时' }
      : { run_id: runId, state: 'SUCCEEDED', state_label: '已完成', reply: {
        message: runId === 'retry_1' ? '请补充查询范围' : '已生成方案', proposal: runId === 'retry_1' ? null : assistedProposal,
      } } })
  })
  await page.goto('#/agents/assistance')
  const input = page.getByLabel('创建或修改需求')
  await input.fill('创建服务推荐助手')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('请补充查询范围')).toBeVisible()
  await input.fill('运行时传入租户编号和需求描述')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('模型调用超时', { exact: true })).toBeVisible()
  expect(submissions).toHaveLength(2)
  await input.fill('还没决定是否发送的补充要求')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(page.getByText('已生成方案', { exact: true })).toBeVisible()
  expect(submissions).toHaveLength(3)
  expect(submissions[2].message).toBe(submissions[1].message)
  expect(submissions[2].previous_run_id).toBe('retry_1')
  expect(submissions[2].idempotency_key).not.toBe(submissions[1].idempotency_key)
  await expect(input).toHaveValue('还没决定是否发送的补充要求')
  await expect(page.getByRole('button', { name: '重新生成', exact: true })).toHaveCount(0)
})

test('智能创建使用独立入口，示例只填入需求，返回前保留未保存内容', async ({ page }) => {
  await assistanceFixture(page)
  await page.goto('#/agents')
  await page.getByRole('button', { name: '智能创建', exact: true }).click()
  await expect(page).toHaveURL(/agents\/assistance$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '智能创建', exact: true })).toBeVisible()
  await expect(page.getByText('增加补充信息分支', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('创建或修改需求')).toHaveValue('')
  await page.screenshot({ path: '.local/agent-assistance-empty.png', fullPage: true })
  await page.getByRole('button', { name: '客户咨询摘要' }).click()
  await expect(page.getByLabel('创建或修改需求')).toBeFocused()
  await expect(page.getByLabel('创建或修改需求')).toHaveValue(/创建一个客户咨询摘要助手/)
  await page.getByRole('button', { name: '返回智能体列表' }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByLabel('创建或修改需求')).toHaveValue(/创建一个客户咨询摘要助手/)
  await page.getByRole('button', { name: '新对话', exact: true }).click()
  await page.getByRole('button', { name: '开始新对话', exact: true }).click()
  await expect(page.getByLabel('创建或修改需求')).toHaveValue('')
})

test('列表智能修改带入对象与草稿，直达刷新仍保留修改上下文', async ({ page }) => {
  await assistanceFixture(page)
  await page.goto('#/agents')
  await expect(page.getByRole('button', { name: '智能创建', exact: true })).toBeVisible()
  await page.screenshot({ path: '.local/agent-list-without-builtin.png', fullPage: true })
  await page.getByRole('button', { name: '智能修改', exact: true }).click()
  await expect(page).toHaveURL(/agents\/assistance\?agent=agent_a/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '智能修改', exact: true })).toBeVisible()
  await expect(page.locator('.agent-assistance-target')).toContainText('业务助手')
  await expect(page.getByLabel('创建或修改需求')).toHaveValue('')
  await expect(page.getByRole('region', { name: '方案预览', exact: true })).toContainText('生成业务结果')
  await page.getByRole('button', { name: '增加补充信息分支' }).click()
  await expect(page.getByLabel('创建或修改需求')).toHaveValue(/增加补充信息的分支/)
  await page.goto('#/agents/assistance?agent=agent_a&version=missing')
  await expect(page.getByLabel('创建或修改需求')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
})

test('继续生成时保留上一版方案且禁止误保存', async ({ page }) => {
  await assistanceFixture(page)
  let submissions = 0
  await page.route('**/admin/v1/agents/assistance', async route => {
    submissions++
    await route.fulfill({ status: 202, json: { run_id: `preview_${submissions}` } })
  })
  await page.route('**/admin/v1/agents/assistance/runs/*', route => route.fulfill({ json: route.request().url().endsWith('preview_1')
    ? { run_id: 'preview_1', state: 'SUCCEEDED', state_label: '已完成', reply: { message: '方案已经生成', proposal: assistedProposal } }
    : { run_id: 'preview_2', state: 'RUNNING', state_label: '处理中' } }))
  await page.goto('#/agents/assistance')
  await page.getByLabel('创建或修改需求').fill('创建咨询摘要助手')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建智能体' })).toBeEnabled()
  await page.getByLabel('创建或修改需求').fill('再增加回复建议')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('region', { name: '候选智能体方案' })).toContainText('咨询摘要助手')
  await expect(page.getByRole('button', { name: '创建智能体' })).toBeDisabled()
  await expect(page.getByText('等待最新方案', { exact: true })).toBeVisible()
})

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

test('配置、流程及资源名称可查看', async ({ page }) => {
  await fixture(page)
  await page.goto('#/agents')
  await page.getByRole('link', { name: '业务助手' }).click()
  await expect(page.getByRole('region', { name: '流程图', exact: true })).toContainText('生成业务结果')
  await expect(page.getByRole('region', { name: '流程图', exact: true })).toContainText('结束')
  await page.screenshot({ path: '.local/agent-desktop.png', fullPage: true })
  await page.getByRole('tab', { name: '模型、提示词与工具技能' }).click()
  await expect(page.getByRole('cell', { name: '业务提示词', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '结构化路由', exact: true })).toBeVisible()

})

test('上下线与启停用分别切换，页面没有版本、草稿和发布入口', async ({ page }) => {
  await fixture(page)
  let online = false, enabled = true, revision = agent.revision
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, agent: { ...agent, revision, online, enabled,
    online_status: { value: online ? 'ONLINE' : 'OFFLINE', label: online ? '已上线' : '已下线', tone: 'default' },
    status: { value: enabled ? 'ACTIVE' : 'DISABLED', label: enabled ? '已启用' : '已停用', tone: 'default' },
    actions: [action('edit', '编辑信息'), action(online ? 'offline' : 'online', online ? '下线' : '上线'), action(enabled ? 'disable' : 'enable', enabled ? '停用' : '启用')],
  } } }))
  await page.route('**/agents/agent_a/state', async route => {
    const body = route.request().postDataJSON()
    expect(body.revision).toBe(revision)
    expect(body).not.toHaveProperty('version_id')
    if (['online', 'offline'].includes(body.operation)) online = body.operation === 'online'
    else enabled = body.operation === 'enable'
    revision++
    await route.fulfill({ json: detail })
  })
  await page.goto('#/agents/agent_a')
  await expect(page.getByRole('combobox', { name: '智能体版本' })).toHaveCount(0)
  for (const name of ['新增草稿', '发布']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  for (const name of ['草稿与当前发布差异', '发布记录']) await expect(page.getByRole('tab', { name, exact: true })).toHaveCount(0)
  for (const [operation, state, remaining] of [['上线', '已上线', '停用'], ['停用', '已停用', '下线'], ['下线', '已下线', '启用'], ['启用', '已启用', '上线']]) {
    await page.getByRole('button', { name: operation, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('操作原因').fill('验证状态切换')
    await dialog.getByRole('button', { name: '确认', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(state, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: remaining, exact: true })).toBeVisible()
  }
})

test('窄屏修改冲突保留草稿，提交不覆盖受信渠道', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/agents/agent_a/configuration', async route => {
    const body = route.request().postDataJSON()
    expect(body.revision).toBe(7)
    expect(body.definition.limits.max_model_rounds).toBe(9)
    expect(body).not.toHaveProperty('channel_id')
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '配置已变更，请刷新后重新检查', fields: [] } } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('tab', { name: '运行策略', exact: true }).click()
  await page.getByLabel('模型轮数上限（次）').fill('9')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(page.getByText('配置已变更，请刷新后重新检查', { exact: true })).toBeVisible()
  await expect(page.getByLabel('模型轮数上限（次）')).toHaveValue('9')
  await page.screenshot({ path: '.local/agent-mobile.png', fullPage: true })
})

test('调试按字段标题生成输入，执行服务未接通时不显示成功结果', async ({ page }) => {
  await fixture(page)
  await page.route('**/agents/agent_a/tests', async route => {
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
  await page.route('**/admin/v1/agents/agent_a/tests', route => route.fulfill({ json: {
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
    expect(body.definition.bindings.model_route_id).toBe('route_version')
    await route.fulfill({ status: 201, json: detail })
  })
  await page.goto('#/agents')
  await page.getByRole('button', { name: '新增智能体', exact: true }).click()
  await page.getByLabel('调用编码').fill('new_agent')
  await page.getByLabel('智能体名称', { exact: true }).fill('新业务助手')
  await page.getByLabel('用途', { exact: true }).fill('业务验证')
  await page.getByLabel('负责人').fill('负责人')
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
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
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, configuration: { ...version, definition: legacy } } }))
  await page.route('**/agents/agent_a/configuration', async route => {
    expect(route.request().postDataJSON().definition.entrypoint).toBe('risk.v1')
    await route.fulfill({ json: { ...version, definition: legacy } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('tab', { name: '基本配置', exact: true }).click()
  await expect(page.getByText('风险评估（旧版） · 通用流程', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '运行策略', exact: true }).click()
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑配置', exact: true })).toBeVisible()
  await page.goto('#/agents')
  await page.getByRole('button', { name: '新增智能体', exact: true }).click()
  await page.getByLabel('流程模板').click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('风险评估（旧版） · 通用流程', { exact: true })).toHaveCount(0)
  await page.locator('.ant-select-dropdown:visible').getByText('通用流程', { exact: true }).click()
  await expect(page.getByRole('dialog').getByTitle('通用流程', { exact: true })).toBeVisible()
})

test('Agent 固定技能参考文件与按需加载选择', async ({ page }) => {
  await fixture(page)
  const skillDependency = { resource_type: 'skill', resource_id: 'skill_a', version_id: 'skill_version', name: '档案解读', version_label: '技能初版', revision: 1, state: { label: '已冻结' }, content_digest: 'e'.repeat(64) }
  await page.route('**/admin/v1/agents/options', route => route.fulfill({ json: { ...options, dependencies: [...options.dependencies, skillDependency] } }))
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, configuration: { ...version, definition: { ...definition, bindings: { ...definition.bindings, skill_ids: ['skill_version'] } } } } }))
  await page.route('**/skills/skill_version/configuration', route => route.fulfill({ json: { files: [
    { relative_path: 'SKILL.md', loadable: true }, { relative_path: 'references/citation.md', loadable: true }, { relative_path: 'scripts/check.py', loadable: false, unavailable_reason: '脚本执行未启用' },
  ] } }))
  let saves = 0
  await page.route('**/agents/agent_a/configuration', async route => {
    saves++
    const body = route.request().postDataJSON()
    expect(body.definition.bindings.skill_loading).toEqual([{ skill_id: 'skill_version', step_keys: ['answer'], selected: true, selected_files: ['references/citation.md'] }])
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '配置已变更，请重新检查', fields: [] } } })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('tab', { name: '资源依赖', exact: true }).click()
  await page.getByRole('button', { name: '档案解读 · 加载设置' }).click()
  await page.getByLabel('生效节点', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('生成业务结果', { exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('switch', { name: '触发按需技能' }).click()
  await page.getByLabel('加载参考资料').click()
  await page.getByText('references/citation.md', { exact: true }).last().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await page.screenshot({ path: '.local/agent-skill-loading.png', fullPage: true })
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(page.getByText('配置已变更，请重新检查', { exact: true })).toBeVisible()
  expect(saves).toBe(1)
})

test('可视化新增审批步骤与连线，保存带原草稿修订', async ({ page }) => {
  await fixture(page)
  let saved = false
  await page.route('**/agents/agent_a/configuration', async route => {
    const body = route.request().postDataJSON()
    expect(body.revision).toBe(7)
    expect(body.definition.steps).toContainEqual(expect.objectContaining({ key: 'approval_step', name: '业务审批', kind: 'compute', operator: 'approval' }))
    expect(body.definition.edges).toContainEqual({ source: 'approval_step', target: 'END', condition: null, otherwise: false })
    saved = true
    await route.fulfill({ json: version })
  })
  await page.goto('#/agents/agent_a')
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('button', { name: '新增步骤', exact: true }).click()
  const step = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await step.getByLabel('步骤标识').fill('approval_step')
  await step.getByLabel('步骤名称').fill('业务审批')
  await step.getByLabel('操作', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('等待审批', { exact: true }).click()
  await step.getByRole('button', { name: '应用配置', exact: true }).click()
  await expect(page.getByRole('region', { name: '流程图', exact: true })).toContainText('业务审批')
  await page.getByRole('button', { name: '新增连线', exact: true }).click()
  const edge = page.getByRole('complementary', { name: '流转配置', exact: true })
  await edge.getByLabel('来源步骤').click()
  await page.locator('.ant-select-dropdown:visible').getByText('业务审批', { exact: true }).click()
  await edge.getByRole('button', { name: '应用配置', exact: true }).click()
  await page.screenshot({ path: '.local/agent-flow-edit.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => saved).toBe(true)
})

const branchedDefinition = { ...definition, workflow_type: 'stateful', entrypoint: 'stateful.v1', start_step: 'find',
  steps: ['find', 'claim', 'analyze', 'save', 'publish', 'finish'].map((key, index) => ({ ...definition.steps[0], key,
    name: ['查找尚未协助的事项', '领取分析资格', '分析本单问题与下一步', '保存模型分析', '复核并发布协助', '结束本轮巡检'][index],
    kind: index === 2 ? 'model' : 'compute', operator: index === 2 ? null : 'object', timeout_seconds: index === 2 ? 120 : 30,
    inputs: { enabled: { source: 'constant', value: true } }, input_schema: { type: 'object', properties: { enabled: { type: 'boolean', title: '是否启用' } } },
    output_schema: { type: 'object', properties: { has_work: { type: 'boolean', title: '有待处理事项' }, needs_analysis: { type: 'boolean', title: '需要分析' }, amount: { type: 'number', title: '金额' }, note: { type: 'string', title: '说明' } } },
  })),
  edges: [
    { source: 'find', target: 'claim', condition: { path: 'has_work', operator: 'eq', value: true } }, { source: 'find', target: 'finish', otherwise: true },
    { source: 'claim', target: 'analyze', condition: { path: 'needs_analysis', operator: 'eq', value: true } },
    { source: 'claim', target: 'publish', condition: { path: 'has_work', operator: 'eq', value: true } }, { source: 'claim', target: 'finish', otherwise: true },
    { source: 'analyze', target: 'save' }, { source: 'save', target: 'publish' }, { source: 'publish', target: 'finish' }, { source: 'finish', target: 'END' },
  ],
}
async function branchFixture(page: Page) {
  await fixture(page)
  await page.route('**/admin/v1/agents/agent_a', route => route.fulfill({ json: { ...detail, configuration: { ...version, definition: branchedDefinition } } }))
}

test('新增步骤后直接连线使用新步骤，返回步骤保留连线，直连可再次编辑', async ({ page }) => {
  await branchFixture(page)
  let body: { definition: typeof branchedDefinition } | undefined
  await page.route('**/agents/agent_a/configuration', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: version }) })
  await page.goto('#/agents/agent_a?edit=true')
  await page.getByRole('button', { name: '新增步骤', exact: true }).click()
  const step = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await step.getByLabel('步骤名称').fill('补充复核')
  await step.getByLabel('步骤标识').fill('review')
  await page.getByRole('button', { name: '新增连线', exact: true }).click()
  const edge = page.getByRole('complementary', { name: '流转配置', exact: true })
  await expect(edge.locator('.ant-select').first()).toContainText('补充复核')
  await edge.getByLabel('后续步骤').click()
  await page.locator('.ant-select-dropdown:visible').getByText('保存模型分析', { exact: true }).click()
  await edge.getByRole('button', { name: '返回步骤', exact: true }).click()
  await expect(step.getByRole('tab', { name: '后续流转' })).toHaveAttribute('aria-selected', 'true')
  const graph = page.getByRole('region', { name: '流程图', exact: true })
  await graph.getByRole('button', { name: '补充复核：直接进入，进入保存模型分析' }).click()
  await expect(edge.locator('.ant-select').last()).toContainText('保存模型分析')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => body?.definition.edges.at(-1)).toMatchObject({ source: 'review', target: 'save' })
  expect(body?.definition.steps.filter(item => item.key === 'review')).toHaveLength(1)
})

test('在步骤后新增自动接续原连线，多模型节点的独立资源保存并展示', async ({ page }) => {
  await branchFixture(page)
  await page.route('**/admin/v1/agents/options*', route => route.fulfill({ json: { ...options, dependencies: [...options.dependencies,
    { ...options.dependencies[0], resource_id: 'review_prompt', version_id: 'review_prompt', name: '复核提示词' },
    { ...options.dependencies[1], resource_id: 'review_route', version_id: 'review_route', name: '复核模型路由' },
  ] } }))
  let body: { definition: typeof branchedDefinition & { steps: { key: string; dependency?: string; prompt_id?: string }[] } } | undefined
  await page.route('**/agents/agent_a/configuration', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: version }) })
  await page.goto('#/agents/agent_a?edit=true')
  const graph = page.getByRole('region', { name: '流程图', exact: true })
  await graph.getByRole('button', { name: '分析本单问题与下一步', exact: true }).click()
  const step = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await step.getByRole('button', { name: '在此步骤后新增' }).click()
  await step.getByLabel('步骤名称').fill('复核分析')
  await step.getByLabel('步骤标识').fill('review')
  await step.getByLabel('步骤类型').click()
  await page.locator('.ant-select-dropdown:visible').getByText('模型调用', { exact: true }).click()
  await step.getByLabel('模型路由', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('复核模型路由', { exact: true }).click()
  await step.getByLabel('提示词', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('复核提示词', { exact: true }).click()
  await page.getByRole('tab', { name: '资源依赖', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: '复核分析' })
  await expect(row).toContainText('复核模型路由')
  await expect(row).toContainText('复核提示词')
  await row.getByRole('button', { name: '配置步骤' }).click()
  await expect(step.getByLabel('步骤名称')).toHaveValue('复核分析')
  await expect(step.locator('.ant-select').filter({ hasText: '复核提示词' })).toBeVisible()
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => body?.definition.steps.find(item => item.key === 'review')).toMatchObject({ dependency: 'review_route', prompt_id: 'review_prompt' })
  expect(body?.definition.edges.filter(item => item.source === 'analyze')).toEqual([{ source: 'analyze', target: 'review' }])
  expect(body?.definition.edges.at(-1)).toMatchObject({ source: 'review', target: 'save' })
  expect(body?.definition.bindings).toMatchObject(branchedDefinition.bindings)
})

test('真实分支条件可读，侧栏修改随节点及分区切换保留，保存包括未点应用的内容', async ({ page }) => {
  await branchFixture(page)
  let body: { definition: typeof branchedDefinition } | undefined
  await page.route('**/agents/agent_a/configuration', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: version }) })
  await page.goto('#/agents/agent_a')
  const graph = page.getByRole('region', { name: '流程图', exact: true })
  await expect(graph.getByRole('button', { name: /领取分析资格：1. 需要分析 等于 是/ })).toBeVisible()
  await page.screenshot({ path: '.local/agent-branches-view.png', fullPage: true })
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page).toHaveURL(/edit=true/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const inspector = page.getByRole('complementary', { name: '步骤配置', exact: true })
  await expect(inspector).toBeVisible()
  await graph.getByRole('button', { name: '领取分析资格', exact: true }).click()
  await expect(inspector.getByRole('heading', { name: '领取分析资格', exact: true })).toBeVisible()
  await inspector.getByLabel('步骤名称', { exact: true }).fill('领取本单分析资格')
  await graph.getByRole('button', { name: '分析本单问题与下一步', exact: true }).click()
  await graph.getByRole('button', { name: '领取本单分析资格', exact: true }).click()
  await expect(inspector.getByLabel('步骤名称', { exact: true })).toHaveValue('领取本单分析资格')
  await inspector.getByRole('tab', { name: '后续流转', exact: true }).click()
  await inspector.getByRole('button', { name: '提高第 2 条分支优先级' }).click()
  await page.screenshot({ path: '.local/agent-branches-edit.png', fullPage: true })
  await page.getByRole('tab', { name: '资源依赖', exact: true }).click()
  await page.getByRole('tab', { name: '流程', exact: true }).click()
  await graph.getByRole('button', { name: '分析本单问题与下一步', exact: true }).click()
  await inspector.getByLabel('超时（秒）', { exact: true }).fill('150')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => body?.definition.steps[2].timeout_seconds).toBe(150)
  expect(body?.definition.steps[1].name).toBe('领取本单分析资格')
  expect(body?.definition.edges.filter(edge => edge.source === 'claim').map(edge => edge.target)).toEqual(['publish', 'analyze', 'finish'])
})

test('条件和固定值使用布尔控件，保存保留布尔类型', async ({ page }) => {
  await branchFixture(page)
  let body: { definition: typeof branchedDefinition } | undefined
  await page.route('**/agents/agent_a/configuration', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: version }) })
  await page.goto('#/agents/agent_a?edit=true')
  await page.getByRole('region', { name: '流程图', exact: true }).getByRole('button', { name: /领取分析资格：1. 需要分析 等于 是/ }).click()
  const edge = page.getByRole('complementary', { name: '流转配置' })
  await edge.getByLabel('比较值', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('否', { exact: true }).click()
  await page.getByRole('region', { name: '流程图', exact: true }).getByRole('button', { name: '领取分析资格', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: '步骤配置' })
  await inspector.getByRole('tab', { name: '输入映射', exact: true }).click()
  await inspector.getByLabel('固定值', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('否', { exact: true }).click()
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => body?.definition.edges[2].condition?.value).toBe(false)
  expect(body?.definition.steps[1].inputs.enabled.value).toBe(false)
})

test('服务端字段错误定位节点并保留其他分区的修改', async ({ page }) => {
  await branchFixture(page)
  await page.route('**/agents/agent_a/configuration', route => route.fulfill({ status: 422, json: { error: { code: 'VALIDATION_ERROR', message: '请修正步骤配置', fields: [{ path: ['definition', 'steps', 2, 'timeout_seconds'], message: '分析步骤的超时超过允许范围' }] } } }))
  await page.goto('#/agents/agent_a?edit=true')
  await page.getByRole('tab', { name: '运行策略', exact: true }).click()
  await page.getByLabel('模型轮数上限（次）').fill('9')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: '步骤配置' })
  await expect(inspector.getByRole('heading', { name: '分析本单问题与下一步' })).toBeVisible()
  await expect(inspector.getByText('分析步骤的超时超过允许范围').last()).toBeVisible()
  await page.getByRole('tab', { name: '运行策略', exact: true }).click()
  await expect(page.getByLabel('模型轮数上限（次）')).toHaveValue('9')
})

test('窄屏流程在自身区域滚动，页面不溢出，查看和编辑使用相同布局', async ({ page }) => {
  await branchFixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('#/agents/agent_a')
  await expect(page.locator('.agent-flow-graph-node')).toHaveCount(6)
  const before = await page.locator('.agent-flow-graph-node').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.left))
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.locator('.agent-flow-graph-node')).toHaveCount(6)
  expect(await page.locator('.agent-flow-graph-node').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.left))).toEqual(before)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('高级 JSON 替换当前节点后侧栏同步，复杂结构与其他分区配置保持完整', async ({ page }) => {
  await branchFixture(page)
  let body: { definition: typeof branchedDefinition } | undefined
  await page.route('**/agents/agent_a/configuration', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: version }) })
  await page.goto('#/agents/agent_a?edit=true')
  await page.getByRole('button', { name: '高级', exact: true }).click()
  await page.getByRole('menuitem', { name: '高级 JSON', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '流程 JSON', exact: true })
  const next = { start_step: branchedDefinition.start_step, edges: branchedDefinition.edges,
    steps: branchedDefinition.steps.map((step, i) => i ? step : { ...step, name: '新的查询步骤', output_schema: { ...step.output_schema, 'x-preserved': { nested: [1, false, '保留'] } } }) }
  await dialog.getByLabel('流程 JSON').fill(JSON.stringify(next))
  await dialog.getByRole('button', { name: '应用到配置' }).click()
  const inspector = page.getByRole('complementary', { name: '步骤配置' })
  await expect(inspector.getByLabel('步骤名称', { exact: true })).toHaveValue('新的查询步骤')
  await inspector.getByLabel('超时（秒）').fill('45')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => body?.definition.steps[0].timeout_seconds).toBe(45)
  expect(body?.definition.steps[0].output_schema).toHaveProperty('x-preserved', { nested: [1, false, '保留'] })
  expect(body?.definition.bindings).toMatchObject(definition.bindings)
})

test('数值与文本条件按类型保存，普通文本不要求 JSON 引号', async ({ page }) => {
  await branchFixture(page)
  let body: { definition: typeof branchedDefinition } | undefined
  await page.route('**/agents/agent_a/configuration', async route => { body = route.request().postDataJSON(); await route.fulfill({ json: version }) })
  await page.goto('#/agents/agent_a?edit=true')
  const graph = page.getByRole('region', { name: '流程图', exact: true })
  await graph.getByRole('button', { name: /领取分析资格：1. 需要分析 等于 是/ }).click()
  const edge = page.getByRole('complementary', { name: '流转配置' })
  await edge.getByLabel('输出字段', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('金额 · amount', { exact: true }).click()
  await edge.getByLabel('比较值', { exact: true }).fill('12.5')
  await graph.getByRole('button', { name: /领取分析资格：2. 有待处理事项 等于 是/ }).click()
  await edge.getByLabel('输出字段', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('说明 · note', { exact: true }).click()
  await edge.getByLabel('比较值', { exact: true }).fill('需要"复核"的订单')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => body?.definition.edges[2].condition?.value).toBe(12.5)
  expect(body?.definition.edges[3].condition?.value).toBe('需要"复核"的订单')
})
