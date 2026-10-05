import { expect, test, type Page } from '@playwright/test'

const workspace = { channel_id: 'channel_a', channel_name: '业务渠道', environment: 'test', environment_name: '测试', data_scope_id: 'domain_a', data_scope_name: '业务数据域' }
const receipt = { run_id: 'run_a', state: 'SUCCEEDED', state_label: '已完成', created_at: '2026-10-02T03:00:00Z', deadline: '2026-10-02T03:01:00Z', status_url: '/api/v1/runs/run_a', events_url: '/api/v1/runs/run_a/events' }
const result = { ...receipt, channel_id: 'channel_a', release_snapshot_id: 'snapshot_a', result: { business_status: 'PARTIAL', schema_version: '1.0', data: { answer: '已完成可核实的部分' }, warnings: ['还有一项数据待确认'], evidence_refs: [] }, partial_output: null, error: null, artifacts: [], usage_summary: { attempt_count: 2, input_tokens: null, output_tokens: null, complete: false, unpriced_count: 1, amounts: { CNY: { reported_amount: '0.0012', complete: false } } } }
const detail = { ...receipt, name: '业务助手', purpose_label: '调试', completed_at: '2026-10-02T03:00:04Z', conversation_id: null, parent_run_id: null, content_allowed: true, input: { request: '请处理' }, versions: [{ name: '提示词初版', type: 'prompt', version_id: 'prompt_v1' }], actual_inputs: [{ name: '生成结果', value: { messages: [{ role: 'user', content: '请处理' }] } }], evidence: [{ title: '工具查询结果', observed_at: '2026-10-02T03:00:03Z', source_version: '1.0', location: {} }], error: null, result, actions: [{ action_key: 'rerun', label: '重新执行' }] }

async function fixture(page: Page, content = true) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace, navigation: [{ navigation_key: 'runs', label: '执行中心' }], actions: [], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/runs/options') json = { agents: [{ value: 'agent_a', label: '业务助手' }], keys: [], errors: [] }
    else if (path === '/admin/v1/runs') json = { items: [{ ...receipt, name: '业务助手', error: null }], next_cursor: null }
    else if (path.endsWith('/detail')) json = content ? detail : { ...detail, content_allowed: false, input: null, result: null, actual_inputs: [], evidence: [], versions: [], actions: [] }
    else if (path.endsWith('/trace')) json = { items: [{ step_id: 'step_a', name: '生成结果', state_label: '已完成', attempts: [{ attempt_id: 'attempt_a', state_label: '失败', kind_label: '模型调用', started_at: receipt.created_at, error: { message: '连接中断' } }, { attempt_id: 'attempt_b', state_label: '成功', kind_label: '模型调用', started_at: receipt.created_at, error: null }] }], next_sequence: null }
    else if (path.endsWith('/rerun')) {
      expect(route.request().headers()['idempotency-key']).toBeTruthy()
      expect(route.request().postDataJSON()).toEqual({ input: null })
      json = { ...receipt, run_id: 'run_b', state: 'QUEUED', state_label: '排队中' }
    }
    await route.fulfill({ json })
  })
}

test('执行中心展示名称、独立尝试、部分业务结果和费用完整性', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/runs')
  await page.getByRole('link', { name: '业务助手' }).click()
  await expect(page.getByText('部分完成', { exact: true })).toBeVisible()
  await expect(page.getByText('还有一项数据待确认')).toBeVisible()
  await expect(page.getByText('0.0012 CNY（未完整）')).toBeVisible()
  await expect(page.getByText('连接中断', { exact: false })).toBeVisible()
  await page.getByText('实际输入与加载记录', { exact: true }).click()
  await expect(page.getByText('请处理', { exact: false }).last()).toBeVisible()
  await page.getByText('工具证据', { exact: true }).click()
  await expect(page.getByText('工具查询结果')).toBeVisible()
  await page.screenshot({ path: '/tmp/creativity-runs-desktop.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '重新执行', exact: true }).click()
  await expect(page.getByRole('link', { name: '查看新运行' })).toHaveAttribute('href', '#/runs/run_b')
})

test('窄屏无原文权限时仍可查看步骤，不提供输入输出或重新执行', async ({ page }) => {
  await fixture(page, false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/runs/run_a')
  await expect(page.getByText('当前权限可查看执行轨迹，输入输出未授权')).toBeVisible()
  await expect(page.getByText('生成结果', { exact: true })).toBeVisible()
  await expect(page.getByText('输入与依赖版本', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新执行', exact: true })).toHaveCount(0)
  await page.screenshot({ path: '/tmp/creativity-runs-mobile.png', fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('原文权限收紧后隐藏部分内容并继续更新执行状态', async ({ page }) => {
  await fixture(page)
  let contentAllowed = true
  let finished = false
  await page.route('**/admin/v1/runs/run_a/detail', route => route.fulfill({ json: {
    ...detail, state: finished ? 'SUCCEEDED' : 'RUNNING', state_label: finished ? '已完成' : '执行中',
    content_allowed: contentAllowed, result: null, input: null, actual_inputs: [], evidence: [], versions: [], actions: [],
  } }))
  await page.route('**/admin/v1/runs/run_a/events', route => route.fulfill({
    contentType: 'text/event-stream', body: 'id: 1\nevent: text_delta\ndata: {"payload":{"text":"待校验的敏感片段"}}\n\n',
  }))
  await page.goto('/#/runs/run_a')
  await page.getByText('部分内容（尚未通过结果校验）', { exact: true }).click()
  await expect(page.getByText('待校验的敏感片段', { exact: true })).toBeVisible()
  contentAllowed = false
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('当前权限可查看执行轨迹，输入输出未授权')).toBeVisible()
  await expect(page.getByText('待校验的敏感片段', { exact: true })).toHaveCount(0)
  finished = true
  await expect(page.locator('.ant-descriptions-item-content').filter({ hasText: /^已完成$/ })).toBeVisible({ timeout: 8000 })
})

test('删除运行先展示影响，清理失败可以重试并显示完成进度', async ({ page }) => {
  await fixture(page)
  let retried = false
  await page.route('**/admin/v1/runs/run_a/detail', route => route.fulfill({ json: { ...detail, actions: [{ action_key: 'delete', label: '删除运行内容' }] } }))
  const progress = () => ({ deletion_id: 'deletion_a', status: retried ? 'COMPLETED' : 'FAILED', status_label: retried ? '已删除' : '清理待重试', completed: retried ? 2 : 1, total: 2, steps: [{ label: '运行内容', completed: 1, total: 1, failed: 0 }, { label: '文件', completed: retried ? 1 : 0, total: 1, failed: retried ? 0 : 1 }], proof_digests: retried ? ['proof'] : [] })
  await page.route('**/admin/v1/data-lifecycle/deletion-preview', route => route.fulfill({ json: { resources: [{ resource_type: 'run', label: '运行内容', count: 1 }, { resource_type: 'artifact', label: '文件', count: 1 }], shared_memories: 0, explanation: '删除立即阻断访问与恢复。' } }))
  await page.route('**/admin/v1/data-lifecycle/deletions', async route => {
    expect(route.request().postDataJSON()).toEqual({ resource_type: 'run', resource_id: 'run_a' })
    await route.fulfill({ json: progress() })
  })
  await page.route('**/admin/v1/deletions/deletion_a/progress', route => route.fulfill({ json: progress() }))
  await page.route('**/admin/v1/deletions/deletion_a/retry', async route => { retried = true; await route.fulfill({ json: progress() }) })
  await page.goto('/#/runs/run_a')
  await page.getByRole('button', { name: '删除运行内容' }).click()
  await expect(page.getByRole('dialog')).toContainText('删除立即阻断访问与恢复')
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('button', { name: '重试清理' })).toBeVisible()
  await expect(page.getByText('输入与依赖版本', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重试清理' }).click()
  await expect(page.getByText('关联内容已清理完成')).toBeVisible()
  expect(retried).toBe(true)
  await page.screenshot({ path: '/tmp/creativity-deletion-progress.png', fullPage: true, animations: 'disabled' })
})

test('暂停运行的批准绑定本次确认摘要并保留原运行', async ({ page }) => {
  await fixture(page)
  let resumed = false
  await page.route('**/admin/v1/runs/run_a/detail', route => route.fulfill({ json: {
    ...detail, state: resumed ? 'RUNNING' : 'WAITING_APPROVAL', state_label: resumed ? '执行中' : '等待审批', result: null, actions: [],
  } }))
  await page.route('**/admin/v1/runs/run_a/events', route => route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' }))
  await page.route('**/admin/v1/runs/run_a/interruption', route => route.fulfill({ json: {
    interruption_id: 'interrupt_a', revision: 3, confirmation_digest: 'a'.repeat(64), name: '批准保存业务数据', state: 'WAITING_APPROVAL', state_label: '等待审批', proposed_input: { value: '待确认内容' }, input_schema: { type: 'object' }, can_approve: true, can_respond: false, can_verify: false,
  } }))
  await page.route('**/admin/v1/runs/run_a/resume', async route => {
    expect(route.request().postDataJSON()).toEqual({ interruption_id: 'interrupt_a', revision: 3, confirmation_digest: 'a'.repeat(64), decision: 'approve', input: {}, idempotency_key: expect.any(String) })
    resumed = true
    await route.fulfill({ json: { ...receipt, state: 'QUEUED' } })
  })
  await page.goto('/#/runs/run_a')
  await expect(page.getByText(/待确认内容/)).toBeVisible()
  await page.getByRole('button', { name: '批准执行', exact: true }).click()
  await expect.poll(() => resumed).toBe(true)
  await expect(page).toHaveURL(/\/#\/runs\/run_a$/)
  await expect(page.getByRole('button', { name: '批准执行', exact: true })).toHaveCount(0)
})

test('同一运行连续审批时刷新确认凭据，外部审批后也可继续下一步', async ({ page }) => {
  await fixture(page)
  let interruption = 1
  const submissions: { interruption_id: string; idempotency_key: string }[] = []
  await page.route('**/admin/v1/runs/run_a/detail', route => route.fulfill({ json: {
    ...detail, state: interruption < 4 ? 'WAITING_APPROVAL' : 'SUCCEEDED', state_label: interruption < 4 ? '等待审批' : '已完成', result: null, actions: [],
  } }))
  await page.route('**/admin/v1/runs/run_a/events', route => route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' }))
  await page.route('**/admin/v1/runs/run_a/interruption', route => route.fulfill({ json: {
    interruption_id: `interrupt_${interruption}`, revision: interruption, confirmation_digest: String(interruption).repeat(64),
    name: `批准第 ${interruption} 步`, state: 'WAITING_APPROVAL', state_label: '等待审批', proposed_input: { value: `第 ${interruption} 步内容` },
    input_schema: { type: 'object' }, can_approve: true, can_respond: false, can_verify: false,
  } }))
  await page.route('**/admin/v1/runs/run_a/resume', async route => {
    const body = route.request().postDataJSON()
    expect(body).toMatchObject({ interruption_id: `interrupt_${interruption}`, revision: interruption, confirmation_digest: String(interruption).repeat(64), decision: 'approve', input: {} })
    submissions.push(body)
    interruption++
    await route.fulfill({ json: { ...receipt, state: 'QUEUED' } })
  })
  await page.goto('/#/runs/run_a')
  await expect(page.getByText('批准第 1 步', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '批准执行', exact: true }).click()
  await expect(page.getByText('批准第 2 步', { exact: true })).toBeVisible()
  interruption = 3
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('批准第 3 步', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '批准执行', exact: true }).click()
  await expect(page.getByRole('button', { name: '批准执行', exact: true })).toHaveCount(0)
  expect(submissions.map(item => item.interruption_id)).toEqual(['interrupt_1', 'interrupt_3'])
  expect(submissions[0].idempotency_key).not.toBe(submissions[1].idempotency_key)
  await expect(page).toHaveURL(/\/#\/runs\/run_a$/)
})

test('连续补充按本次输入结构重置表单，显式否值与零值可提交', async ({ page }) => {
  await fixture(page)
  let interruption = 1
  await page.route('**/admin/v1/runs/run_a/detail', route => route.fulfill({ json: {
    ...detail, state: interruption < 3 ? 'WAITING_INPUT' : 'SUCCEEDED', state_label: interruption < 3 ? '等待补充' : '已完成', result: null, actions: [],
  } }))
  await page.route('**/admin/v1/runs/run_a/events', route => route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' }))
  await page.route('**/admin/v1/runs/run_a/interruption', route => route.fulfill({ json: {
    interruption_id: `input_${interruption}`, revision: 1, confirmation_digest: String(interruption).repeat(64), name: `补充第 ${interruption} 步`,
    state: 'WAITING_INPUT', state_label: '等待补充', proposed_input: {}, can_respond: true, can_approve: false, can_verify: false,
    input_schema: { type: 'object', properties: { quantity: { type: 'integer', title: '数量' }, enabled: { type: 'boolean', title: '启用处理' } }, required: ['quantity', 'enabled'] },
  } }))
  await page.route('**/admin/v1/runs/run_a/resume', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ interruption_id: `input_${interruption}`, input: { quantity: interruption === 1 ? 5 : 0, enabled: interruption === 1 } })
    interruption++
    await route.fulfill({ json: { ...receipt, state: 'QUEUED' } })
  })
  await page.goto('/#/runs/run_a')
  await page.getByLabel('数量', { exact: true }).fill('5')
  await page.getByRole('radio', { name: '是', exact: true }).check()
  await page.getByRole('button', { name: '提交并继续', exact: true }).click()
  await expect(page.getByText('补充第 2 步', { exact: true })).toBeVisible()
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('')
  await expect(page.getByRole('radio', { name: '是', exact: true })).not.toBeChecked()
  await expect(page.getByRole('radio', { name: '否', exact: true })).not.toBeChecked()
  await page.getByLabel('数量', { exact: true }).fill('0')
  await page.getByRole('radio', { name: '否', exact: true }).check()
  await page.getByRole('button', { name: '提交并继续', exact: true }).click()
  await expect.poll(() => interruption).toBe(3)
})
