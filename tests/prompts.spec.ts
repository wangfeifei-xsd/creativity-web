import { expect, test, type Page } from '@playwright/test'

const actions = [
  { action_key: 'prompt:manage', label: '编辑提示词' }, { action_key: 'version:edit', label: '编辑草稿' },
  { action_key: 'version:read', label: '查看版本' }, { action_key: 'run:create', label: '调试' },
]
const content = { instruction_blocks: { system: '只分析事实', output_requirements: '返回中文结论' },
  message_templates: [{ source: 'input', template: '{{ text }}' }], change_note: '',
  variables: [{ name: 'text', display_name: '待评估文本', type: 'string', required: true, default: null, max_length: 4096, source: 'input', sensitivity: 'sensitive' }] }
const version = { name: '风险分析', revision: 1, actions, status: { value: 'DRAFT', label: '草稿', tone: 'default' },
  version: { channel_id: 'rental', version_id: 'v1', resource_id: 'p1', resource_type: 'prompt', version_label: '初版', state: 'DRAFT', draft_revision: 1,
    content, content_digest: 'a'.repeat(64), dependencies_digest: 'b'.repeat(64), dependency_version_ids: [], output_schema: {} } }
const prompt = { prompt_id: 'p1', prompt_code: 'risk', name: '风险分析', purpose: '分析业务文本', revision: 1,
  version_label: '初版', status: version.status, releases: [], last_test_at: null, agent_count: 0, actions }
const session = { user: { user_id: 'alice', display_name: '配置人员', login_name: 'alice' },
  navigation: [{ navigation_key: 'prompts', label: '提示词' }], actions,
  workspace: { channel_id: 'rental', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'orders', data_scope_name: '订单' },
  expires_at: '2026-10-03T00:00:00Z' }
const rendered = { sections: [{ source: 'system', label: '系统指令', text: '只分析事实', original_characters: 5, truncated_characters: 0 },
  { source: 'input', label: '调用输入', text: '••••••', original_characters: 6, truncated_characters: 0 }],
  estimated_tokens: 18, estimate_method: '按字节数估算', context_limit: null, estimated_remaining_tokens: null, masked: true }

async function setup(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const payload = path.endsWith('/auth/session') ? session : path === '/admin/v1/prompts' ? { items: [prompt], actions } :
      path === '/admin/v1/prompts/p1' ? prompt : path.endsWith('/versions') ? [version] :
        path === '/admin/v1/prompt-versions/v1' ? version : path.endsWith('/render') ? rendered : []
    await route.fulfill({ json: payload })
  })
  await page.goto('/prompts')
  await page.getByRole('button', { name: '风险分析', exact: true }).click()
}

test('提示词六个操作区、中文变量、脱敏预览和未知上下文上限', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await setup(page)
  for (const name of ['编辑', '变量', '预览', '调试', '版本', '引用']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '变量', exact: true }).click()
  await expect(page.getByLabel('中文名称', { exact: true })).toHaveValue('待评估文本')
  await page.getByRole('tab', { name: '预览', exact: true }).click()
  await page.getByLabel('待评估文本', { exact: true }).fill('敏感样例')
  await page.getByRole('button', { name: '渲染预览', exact: true }).click()
  await expect(page.getByText('敏感内容已脱敏', { exact: true })).toBeVisible()
  await expect(page.getByText('尚未确认', { exact: true })).toHaveCount(2)
  await expect(page.getByText('••••••', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/prompts-preview.png', fullPage: true })
  expect(errors).toEqual([])
})

test('草稿冲突保留输入并展示最新修订', async ({ page }) => {
  await setup(page)
  await page.route('**/admin/v1/prompt-versions/v1', async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 409,
      json: { error: { code: 'REVISION_CONFLICT', message: '草稿已变更，请检查差异', fields: [] }, request_id: 'r1' } })
    else await route.fulfill({ json: { ...version, revision: 2, version: { ...version.version, draft_revision: 2 } } })
  })
  await page.getByLabel('系统指令', { exact: true }).fill('本地未保存内容')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('当前内容已更新至修订 2', { exact: true })).toBeVisible()
  await expect(page.getByLabel('系统指令', { exact: true })).toHaveValue('本地未保存内容')
  await page.getByText('最新已保存内容', { exact: true }).click()
  await expect(page.getByText('本次编辑内容', { exact: true })).toBeVisible()
})

test('旧测试读取固定快照，后续草稿不替换测试内容', async ({ page }) => {
  await setup(page)
  await page.route('**/admin/v1/prompt-versions/v1/tests', route => route.fulfill({ json: [{ test_id: 't1', version_id: 'v1', version_label: '旧草稿', draft_revision: 1,
    model_route_version: 'route1', model_route_name: '文本模型', sample_title: '旧样例', run_id: 'run1',
    status: { value: 'SUCCEEDED', label: '已完成', tone: 'success' }, created_at: '2026-10-01T00:00:00Z',
    snapshot: { ...version.version, content: { ...content, instruction_blocks: { system: '历史模板原文', output_requirements: '' } } },
    rendered, output: null, masked: true, descriptor_digest: 'c'.repeat(64) }] }))
  await page.getByRole('tab', { name: '调试', exact: true }).click()
  await page.getByRole('button', { name: '查看快照', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('旧草稿', { exact: true })).toBeVisible()
  await dialog.getByText('模板配置快照', { exact: true }).click()
  await expect(dialog.getByText(/历史模板原文/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: '查看完整渲染和结果' })).toHaveCount(0)
})
