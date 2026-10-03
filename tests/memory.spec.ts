import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const attributes = [{ key: 'usual_budget', label: '通常预算', memory_type: 'PREFERENCE', value_schema: { type: 'object' } }, { key: 'interests', label: '长期兴趣', memory_type: 'PREFERENCE', value_schema: { type: 'array', items: { type: 'string' } } }]
const workspaces = ['租号渠道', '陪玩渠道'].map((channel_name, index) => ({ channel_id: `channel_${index}`, channel_name, environment: 'test', environment_name: '测试', data_scope_id: 'domain', data_scope_name: '业务数据域' }))

async function fixture(page: Page) {
  const state = { channel: 0, status: 'PROPOSED', enabled: true, revision: 1, prefRevision: 0, min: 100, max: 200, conflict: false, writes: [] as Record<string, unknown>[] }
  const preferences = () => ({ enabled: state.enabled, revision: state.prefRevision, actions: [action('preferences', '长期记忆'), action('clear', '清空记忆')] })
  const memory = () => ({ memory_id: 'memory_one', layer: 'profile', layer_label: '人物画像', key: 'usual_budget', display_name: '通常预算', memory_type: 'PREFERENCE', type_label: '明确偏好', value: { min: state.min, max: state.max, currency: 'CNY' },
    value_label: state.channel ? '800–900 元' : `${state.min}–${state.max} 元`, status: state.status, status_label: state.status === 'PROPOSED' ? '待确认' : '生效中', confirmed: state.status === 'ACTIVE',
    revision: state.revision, version_id: 'version_private', version: state.revision, expires_at: '2027-01-01T00:00:00Z', subject_name: '王先生', usage_count: 2, created_at: '2026-10-02T01:00:00Z',
    sources: [{ name: '偏好咨询', source_type_label: '用户输入', source_version: '1', observed_at: '2026-10-02T01:00:00Z' }],
    actions: [action('edit', '修正'), action('delete', '遗忘'), ...(state.status === 'PROPOSED' ? [action('confirm', '确认')] : [])] })
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    let json: unknown = {}
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin', login_name: 'admin', display_name: '管理员' }, workspace: workspaces[state.channel], navigation: [{ navigation_key: 'memories', label: '记忆管理' }], actions: [], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = workspaces
    else if (path.endsWith('/auth/channel-context')) { state.channel = 1; json = { access_token: 'second-token' } }
    else if (path === '/admin/v1/memory-subjects') json = [{ anchor_id: 'memory_one', label: '王先生' }]
    else if (path === '/admin/v1/memories' && method === 'GET') json = { items: [memory()], attributes, next_cursor: null, has_more: false, actions: [action('create', '新增记忆'), action('policy', '渠道策略')] }
    else if (path === '/admin/v1/memories' && method === 'POST') { state.writes.push(request.postDataJSON()); state.status = 'ACTIVE'; json = memory() }
    else if (path.endsWith('/memory-preferences')) {
      if (method === 'PUT') { state.enabled = request.postDataJSON().enabled; state.prefRevision++ }
      json = preferences()
    } else if (path.endsWith('/memory_one/confirm')) { state.status = 'ACTIVE'; state.revision++; json = memory() }
    else if (path.endsWith('/memory_one') && method === 'PATCH') {
      state.writes.push(request.postDataJSON())
      if (state.conflict) { state.conflict = false; state.revision++; await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '记忆已变化，请刷新后重试', request_id: 'conflict_request', retryable: false, fields: [] } } }); return }
      state.min = request.postDataJSON().value.min; state.max = request.postDataJSON().value.max; state.revision++; json = memory()
    } else if ((path.endsWith('/memory_one') && method === 'DELETE') || path.endsWith('/memories/clear')) json = { deletion_id: 'job_one' }
    else if (path.endsWith('/memory_one')) json = { memory: memory(), preferences: preferences(), versions: [{ version: 1, status_label: '待确认', reason: '推断候选', changed_at: '2026-10-02T01:00:00Z' }] }
    else if (path.endsWith('/memory-deletions/job_one')) json = { deletion_id: 'job_one', status: 'PENDING', status_label: '等待清理', count: 1, requested_at: '2026-10-02T01:00:00Z', completed_at: null }
    else if (path.endsWith('/memory-consolidations')) json = [{ id: 'consolidation_one', revision: 1, conversation_name: '偏好咨询', state: 'FAILED', state_label: '整理失败', generated_count: 0, attempt: 3, generation_run_id: 'run_one', created_at: '2026-10-04T01:00:00Z', updated_at: '2026-10-04T01:00:00Z', message: '请检查运行详情与记忆策略', can_retry: true }]
    else if (path.endsWith('/consolidation_one/retry')) { state.writes.push(request.postDataJSON()); json = null }
    else if (path.endsWith('/memory-policy')) {
      if (method === 'PUT') state.writes.push(request.postDataJSON())
      json = { attributes, consolidation: { enabled: true, idle_seconds: 1800, batch_messages: 20 }, allowed_types: ['PREFERENCE', 'FACT'], read_enabled: true, suggest_enabled: true, write_mode: 'EXPLICIT', ttl_seconds: 15552000, max_items: 100, retrieval_limit: 10, failure_mode: 'OMIT', revision: 1, actions: [action('policy', '保存策略')] }
    }
    await route.fulfill({ json })
  })
  return state
}

test('确认候选、查看来源并在修正冲突后保留输入', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/memories')
  await page.getByRole('link', { name: '通常预算', exact: true }).click()
  await expect(page.getByText('偏好咨询')).toBeVisible()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByText('已明确确认', { exact: true })).toBeVisible()
  state.conflict = true
  await page.getByRole('button', { name: '修正', exact: true }).click()
  await page.getByLabel('结构化记忆值（JSON）', { exact: true }).fill('{"min":300,"max":500,"currency":"CNY"}')
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('记忆已变化，请刷新后重试')).toBeVisible()
  await page.getByRole('button', { name: '读取最新版本，保留填写内容' }).click()
  await expect(page.getByLabel('结构化记忆值（JSON）', { exact: true })).toHaveValue('{"min":300,"max":500,"currency":"CNY"}')
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('300–500 元')).toBeVisible()
  expect(state.writes[0].revision).not.toBe(state.writes[1].revision)
})

test('关闭长期记忆保留列表，清空进入可刷新删除进度', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/memories/subjects/memory_one')
  await page.getByRole('switch', { name: '长期记忆' }).click()
  await expect(page.getByRole('switch', { name: '长期记忆' })).not.toBeChecked()
  expect(state.enabled).toBe(false)
  await expect(page.getByText('100–200 元')).toBeVisible()
  await page.getByRole('button', { name: '清空记忆', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '清空', exact: true }).click()
  await expect(page.getByRole('heading', { name: '记忆删除进度' })).toBeVisible()
  await expect(page.getByText('等待清理', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('等待清理', { exact: true })).toBeVisible()
})

test('新增与策略表单使用结构化值和明确单位', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/memories/subjects/memory_one')
  await page.getByRole('button', { name: '新增记忆', exact: true }).click()
  await page.getByLabel('结构化记忆值（JSON）', { exact: true }).fill('{"min":100,"max":200,"currency":"CNY"}')
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('heading', { name: '通常预算' })).toBeVisible()
  expect(state.writes[0]).toEqual({ key: 'usual_budget', memory_type: 'PREFERENCE', value: { min: 100, max: 200, currency: 'CNY' } })
  await page.getByRole('link', { name: '返回记忆列表' }).click()
  await page.getByRole('button', { name: '渠道策略', exact: true }).click()
  await page.getByLabel('主体记忆上限（条）', { exact: true }).fill('50')
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.writes.at(-1)?.max_items).toBe(50)
  expect(state.writes.at(-1)).not.toHaveProperty('actions')
})

test('窄屏详情与删除操作不显示内部标识', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/memories/memory_one')
  await expect(page.getByText('偏好咨询')).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/memory_one|version_private|PROPOSED|PREFERENCE/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: test.info().outputPath('memory-mobile.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '遗忘', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '遗忘', exact: true }).click()
  await expect(page.getByRole('heading', { name: '记忆删除进度' })).toBeVisible()
})

test('切换渠道后同号主体不会复用前一渠道记忆', async ({ page }) => {
  await fixture(page)
  await page.goto('/memories/subjects/memory_one')
  await expect(page.getByText('100–200 元')).toBeVisible()
  await page.getByRole('button', { name: '切换工作区' }).click()
  await page.getByRole('dialog').getByRole('combobox').click()
  await page.locator('.ant-select-dropdown:visible').getByText('陪玩渠道 · 测试 · 业务数据域', { exact: true }).click()
  await page.getByRole('button', { name: '进入工作区', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  await page.goto('/memories/subjects/memory_one')
  await expect(page.getByText('800–900 元')).toBeVisible()
  await expect(page.getByText('100–200 元')).toHaveCount(0)
})


test('画像数组由属性定义编辑，后台失败可查看运行并重试', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/memories/subjects/memory_one')
  await expect(page.getByRole('link', { name: '会话记忆' })).toHaveAttribute('href', '/conversations')
  await page.getByLabel('记忆层级').click()
  await page.locator('.ant-select-dropdown:visible').getByText('归档', { exact: true }).click()
  await page.getByRole('button', { name: '后台整理', exact: true }).click()
  await expect(page.getByText('整理失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看运行' })).toHaveAttribute('href', '/runs/run_one')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).toEqual({ revision: 1 })
  await page.locator('.ant-drawer-close').click()
  await page.getByRole('button', { name: '新增记忆', exact: true }).click()
  await page.getByLabel('属性', { exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('长期兴趣', { exact: true }).click()
  await page.getByLabel('记忆值', { exact: true }).fill('阅读')
  await page.getByLabel('记忆值', { exact: true }).press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(2)
  expect(state.writes[1]).toEqual({ key: 'interests', memory_type: 'PREFERENCE', value: ['阅读'] })
})
