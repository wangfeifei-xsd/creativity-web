import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'domain_a', data_scope_name: '业务数据域' }
const skill = { skill_id: 'skill_a', skill_code: 'rental_intent', name: '租赁诉求解析', description: '提取用户确认的条件', owner: '业务负责人', tags: [], revision: 1,
  status: { value: 'ACTIVE', label: '已启用', tone: 'success' }, actions: [action('edit', '编辑技能'), action('create_version', '新增版本')] }
const source = '---\nname: rental-intent\ndescription: 提取用户条件\n---\n只提取已确认的事实。'
const settings = { loading_mode: 'on_demand', priority: 0, context_budget: 16000, change_note: '', tool_requirements: [], required_model_capabilities: [], input_variables: [], allowed_agents: [], conflict_groups: [] }
const files = [
  { relative_path: 'SKILL.md', size_bytes: 128, content_type: 'text/markdown', loadable: true, unavailable_reason: null, sha256: 'a'.repeat(64) },
  { relative_path: 'references/conditions.md', size_bytes: 30, content_type: 'text/markdown', loadable: true, unavailable_reason: null, sha256: 'b'.repeat(64) },
  { relative_path: 'scripts/check.py', size_bytes: 25, content_type: 'application/octet-stream', loadable: false, unavailable_reason: '脚本执行未启用', sha256: 'c'.repeat(64) },
]
const version = { version_id: 'version_a', version_label: '初始版本', revision: 1, status: { value: 'DRAFT', label: '草稿', tone: 'default' }, settings,
  metadata: { name: 'rental-intent', description: '提取用户条件', license: 'MIT' }, files, package_hash: 'd'.repeat(64),
  discovery_preview: 'rental-intent\n提取用户条件', instruction_preview: '只提取已确认的事实。',
  actions: [action('edit', '编辑包'), action('validate', '检查依赖'), action('test', '加载测试'), action('freeze', '冻结版本'), action('export', '导出技能包')] }
const detail = { skill, versions: [version], references: [], release_version_id: null, release_revision: null }

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace,
      navigation: [{ navigation_key: 'skills', label: '技能管理' }], actions: [action('skill:manage', '管理技能')], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/skills') json = { items: [skill], actions: [action('create', '新增技能'), action('import', '导入技能包')] }
    else if (path === '/admin/v1/skills/skill_a') json = detail
    else if (path.endsWith('/files')) { const file = files.find(f => f.relative_path === url.searchParams.get('path'))!; json = { path: file.relative_path, text: file.relative_path === 'SKILL.md' ? source : file.loadable ? '参考条件' : 'raise RuntimeError()', unavailable_reason: file.unavailable_reason } }
    await route.fulfill({ json })
  })
}

test('技能包文件树、脚本状态与两种预览使用实际内容', async ({ page }) => {
  await fixture(page)
  await page.goto('/skills')
  await page.getByRole('link', { name: '租赁诉求解析' }).click()
  await expect(page.getByText(source, { exact: true })).toBeVisible()
  await page.getByText('check.py', { exact: true }).click()
  await expect(page.getByText('raise RuntimeError()', { exact: true })).toBeVisible()
  await expect(page.getByText('脚本执行未启用').first()).toBeVisible()
  await page.getByRole('tab', { name: '加载预览' }).click()
  await expect(page.getByText('rental-intent\n提取用户条件', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '完整指令', exact: true }).click()
  await expect(page.getByText('只提取已确认的事实。', { exact: true })).toBeVisible()
})

test('加载测试只提交所选文件并显示省略记录', async ({ page }) => {
  await fixture(page)
  let calls = 0
  await page.route('**/skill-versions/version_a/tests', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: [] }); return }
    calls++
    expect(route.request().postDataJSON()).toEqual({ revision: 1, selected: true, selected_files: ['references/conditions.md'], variables: {}, context_budget: 16000 })
    await route.fulfill({ json: { test_id: 'test_a', version_id: 'version_a', version_label: '初始版本', created_at: '2026-10-02T01:00:00Z', evidence_label: '加载验证', run_id: null,
      result: { complete: true, loaded: [{ version_id: 'version_a', path: 'SKILL.md', text: '只提取已确认的事实。', trigger_reason: '加载测试', budget_units: 30, sha256: 'a'.repeat(64) }], discoveries: [],
        omitted: [{ version_id: 'version_a', path: 'scripts/check.py', reason: '脚本执行未启用' }], issues: [], used_budget: 30, budget_unit: 'utf8_bytes', callable_tool_versions: [] } } })
  })
  await page.goto('/skills/skill_a')
  await page.getByRole('tab', { name: '测试', exact: true }).click()
  await page.getByLabel('本次所需资料').click()
  await page.getByText('references/conditions.md', { exact: true }).last().click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '验证加载' }).click()
  await expect(page.getByText('加载验证通过', { exact: true })).toBeVisible()
  await expect(page.getByText('上下文占用：30 字节')).toBeVisible()
  await expect(page.getByRole('cell', { name: '脚本执行未启用', exact: true }).last()).toBeVisible()
  expect(calls).toBe(1)
})

test('窄屏编辑资料并保留服务端错误前的输入', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  let writes = 0
  await page.route('**/skill-versions/version_a', async route => {
    writes++
    const body = route.request().postDataJSON()
    expect(body.files).toEqual([{ relative_path: 'references/new.md', text: '新增资料内容' }])
    expect(body).not.toHaveProperty('channel_id')
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '技能草稿已变更，请刷新', fields: [] } } })
  })
  await page.goto('/skills/skill_a')
  await page.getByRole('button', { name: '编辑包', exact: true }).click()
  await page.getByLabel('新文件路径').fill('references/new.md')
  await page.getByRole('button', { name: '新增文件', exact: true }).click()
  await page.getByLabel('文件正文').fill('新增资料内容')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('技能草稿已变更，请刷新', { exact: true })).toBeVisible()
  await expect(page.getByLabel('文件正文')).toHaveValue('新增资料内容')
  expect(writes).toBe(1)
})

test('导出通过受控产物下载', async ({ page }) => {
  await fixture(page)
  await page.route('**/skill-versions/version_a/exports', route => route.fulfill({ json: { artifact_id: 'artifact_export', name: 'rental.zip' } }))
  await page.route('**/artifacts/artifact_export/content', route => route.fulfill({ body: 'zip fixture', headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="rental.zip"' } }))
  await page.goto('/skills/skill_a')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出技能包', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('rental.zip')
})
