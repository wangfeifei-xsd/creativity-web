import { resourceSummary } from './resource-fixtures'
import { expect, test, type Page } from '@playwright/test'

const skillProposal = { skill_code: 'reply_review', name: '客服回复检查', description: '检查遗漏和无依据的承诺', owner: '客服团队', tags: [], version_label: '当前配置',
  instructions: '## 使用场景\n\n回复客户前。\n\n## 操作步骤\n\n1. 核对客户问题。\n2. 标记没有依据的承诺。\n\n## 输出\n\n列出问题和修改建议。',
  settings: { loading_mode: 'on_demand', priority: 0, context_budget: 16000, change_note: '补充检查步骤', tool_requirements: [], tool_bindings: {}, required_model_capabilities: [], input_variables: [], allowed_agents: [], conflict_groups: [] } }

test('智能创建技能经过追问、完整技能书预览和保存', async ({ page }) => {
  await fixture(page)
  let turns = 0, saves = 0
  await page.route('**/skills/assistance', async route => {
    const body = route.request().postDataJSON()
    expect(body.skill_id).toBeNull()
    expect(body.model_route_id).toBe('route_a')
    expect(body.previous_run_id).toBe(turns ? 'skill_turn_1' : null)
    turns++
    await route.fulfill({ status: 202, json: { run_id: `skill_turn_${turns}` } })
  })
  await page.route('**/skills/assistance/runs/*', route => route.fulfill({ json: {
    run_id: `skill_turn_${turns}`, state: 'SUCCEEDED', state_label: '已完成', base: null,
    reply: turns === 1 ? { message: '需要检查哪些类型的问题？', proposal: null } : { message: '已整理检查步骤与输出要求。', proposal: skillProposal },
  } }))
  await page.route('**/skills/assistance/runs/skill_turn_2/apply', async route => {
    saves++
    expect(route.request().postData()).toBeNull()
    await route.fulfill({ json: { skill_id: 'skill_a' } })
  })
  await page.goto('#/skills')
  await page.getByRole('button', { name: '智能创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: '智能创建', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '客服回复检查', exact: true }).click()
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('需要检查哪些类型的问题？')).toBeVisible()
  await expect(page.getByRole('button', { name: '创建技能', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: '技能创建或修改需求' }).fill('检查遗漏和无依据的承诺，给出修改建议。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const preview = page.getByRole('region', { name: '技能书预览', exact: true })
  await expect(preview.getByRole('heading', { name: '操作步骤', exact: true })).toBeVisible()
  expect(saves).toBe(0)
  await page.getByText('源文件', { exact: true }).click()
  await expect(preview.locator('pre')).toContainText('"name": "客服回复检查"')
  await page.getByText('格式化', { exact: true }).click()
  await page.screenshot({ path: '.local/skill-assistance-create.png', fullPage: true })
  await page.getByRole('button', { name: '创建技能', exact: true }).click()
  await expect(page).toHaveURL(/skills\/skill_a$/)
  expect(saves).toBe(1)
})

test('智能修改可直达并刷新恢复当前技能，冲突保留技能书', async ({ page }) => {
  await fixture(page)
  await page.goto('#/skills/skill_a')
  await page.getByRole('button', { name: '智能修改', exact: true }).click()
  await expect(page).toHaveURL(/skills\/assistance\?skill=skill_a$/)
  await page.reload()
  await expect(page.getByRole('region', { name: '技能书预览', exact: true })).toContainText('只提取已确认的事实。')
  await page.route('**/skills/assistance', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ skill_id: 'skill_a', base_revision: 1 })
    await route.fulfill({ status: 202, json: { run_id: 'skill_edit' } })
  })
  await page.route('**/skills/assistance/runs/skill_edit', route => route.fulfill({ json: {
    run_id: 'skill_edit', state: 'SUCCEEDED', state_label: '已完成',
    reply: { message: '补充了检查步骤。', proposal: { ...skillProposal, skill_code: skill.skill_code } },
    base: { ...skillProposal, ...skill, instructions: version.instruction_preview, settings },
  } }))
  await page.route('**/skills/assistance/runs/skill_edit/apply', route => route.fulfill({ status: 409, json: {
    error: { code: 'REVISION_CONFLICT', message: '技能已被修改，请开始新对话；本次技能书仍保留', request_id: 'conflict', fields: [] },
  } }))
  await page.getByRole('textbox', { name: '技能创建或修改需求' }).fill('补充检查步骤')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('tab', { name: '变更对照', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '变更对照', exact: true })).toContainText('只提取已确认的事实。')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByText('技能已被修改，请开始新对话；本次技能书仍保留')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
  await expect(page.getByRole('tabpanel', { name: '变更对照', exact: true })).toContainText('标记没有依据的承诺。')
})

test('生成失败可重试并保留未发送内容，离开时确认', async ({ page }) => {
  await fixture(page)
  let turns = 0
  let releaseAdmission!: () => void
  const admission = new Promise<void>(resolve => { releaseAdmission = resolve })
  await page.route('**/skills/assistance', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ message: '生成客服技能', previous_run_id: null })
    turns++
    if (turns === 1) await admission
    await route.fulfill({ status: 202, json: { run_id: `retry_${turns}` } })
  })
  await page.route('**/skills/assistance/runs/*', route => route.fulfill({ json: {
    run_id: `retry_${turns}`, state: turns === 1 ? 'TIMED_OUT' : 'SUCCEEDED', state_label: turns === 1 ? '已超时' : '已完成',
    reply: turns === 1 ? null : { message: '技能书已生成', proposal: skillProposal }, base: null,
  } }))
  await page.goto('#/skills/assistance')
  const input = page.getByRole('textbox', { name: '技能创建或修改需求' })
  await input.fill('生成客服技能')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await input.fill('尚未发送的补充规则')
  releaseAdmission()
  await expect(page.getByRole('button', { name: '重新生成', exact: true })).toBeEnabled()
  await expect(input).toHaveValue('尚未发送的补充规则')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建技能', exact: true })).toBeEnabled()
  await expect(input).toHaveValue('尚未发送的补充规则')
  await page.getByRole('button', { name: '返回技能列表', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '离开技能智能协助？' })).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  expect(turns).toBe(2)
})

test('窄屏预览可用，继续生成时禁止保存旧技能书', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  let turns = 0
  await page.route('**/skills/assistance', async route => { turns++; await route.fulfill({ status: 202, json: { run_id: `mobile_${turns}` } }) })
  await page.route('**/skills/assistance/runs/*', route => route.fulfill({ json: {
    run_id: `mobile_${turns}`, state: turns === 1 ? 'SUCCEEDED' : 'RUNNING', state_label: turns === 1 ? '已完成' : '执行中',
    reply: turns === 1 ? { message: '已生成', proposal: skillProposal } : null, base: null,
  } }))
  await page.goto('#/skills/assistance')
  await page.getByRole('textbox', { name: '技能创建或修改需求' }).fill('生成技能书')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '查看生成的技能书', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建技能', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '.local/skill-assistance-mobile.png', fullPage: true })
  await page.getByText('需求对话', { exact: true }).first().click()
  await page.getByRole('textbox', { name: '技能创建或修改需求' }).fill('再补充异常处理')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByText('技能书 · 待保存', { exact: true }).click()
  await expect(page.getByRole('button', { name: '创建技能', exact: true })).toBeDisabled()
  await expect(page.getByRole('region', { name: '技能书预览', exact: true })).toContainText('标记没有依据的承诺。')
})

test('已发布技能保存前确认新任务生效影响', async ({ page }) => {
  await fixture(page)
  await page.route('**/skills/skill_a/configuration', route => route.fulfill({ json: { ...version, status: { value: 'PUBLISHED', label: '已发布' } } }))
  await page.route('**/skills/assistance', route => route.fulfill({ status: 202, json: { run_id: 'published_edit' } }))
  await page.route('**/skills/assistance/runs/published_edit', route => route.fulfill({ json: {
    run_id: 'published_edit', state: 'SUCCEEDED', state_label: '已完成', reply: { message: '已修改', proposal: skillProposal }, base: null,
  } }))
  let saves = 0
  await page.route('**/skills/assistance/runs/published_edit/apply', async route => { saves++; await route.fulfill({ json: { skill_id: 'skill_a' } }) })
  await page.goto('#/skills/assistance?skill=skill_a')
  await page.getByRole('textbox', { name: '技能创建或修改需求' }).fill('补充检查规则')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '保存已发布技能的修改？' })
  await expect(dialog).toContainText('所有引用此技能的新任务将使用修改后的内容。')
  expect(saves).toBe(0)
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page).toHaveURL(/skills\/skill_a$/)
  expect(saves).toBe(1)
})

test('无模型时无法发送，无授权时隐藏技能智能入口', async ({ page }) => {
  await fixture(page)
  await page.route('**/skills/assistance/options', route => route.fulfill({ json: [] }))
  await page.goto('#/skills/assistance')
  await expect(page.getByText('暂无可用模型，请先发布并授权支持文本生成的模型路由')).toBeVisible()
  await page.getByRole('textbox', { name: '技能创建或修改需求' }).fill('创建技能')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
  await page.route('**/skills?*', route => route.fulfill({ json: { items: [{ ...skill, actions: [] }], actions: [] } }))
  await page.getByRole('button', { name: '返回技能列表', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '离开', exact: true }).click()
  await expect(page.getByRole('button', { name: '智能创建', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '智能修改', exact: true })).toHaveCount(0)
})

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试',  }
const skill = { skill_id: 'skill_a', skill_code: 'rental_intent', name: '租赁诉求解析', description: '提取用户确认的条件', owner: '业务负责人', tags: [], revision: 1,
  status: { value: 'ACTIVE', label: '已启用', tone: 'success' }, actions: [action('edit', '编辑技能'), action('assist', '智能修改'), action('create_version', '新增版本')] }
const source = '---\nname: rental-intent\ndescription: 提取用户条件\n---\n只提取已确认的事实。'
const settings = { loading_mode: 'on_demand', priority: 0, context_budget: 16000, change_note: '', tool_requirements: [], required_model_capabilities: [], input_variables: [], allowed_agents: [], conflict_groups: [] }
const files = [
  { relative_path: 'SKILL.md', size_bytes: 128, content_type: 'text/markdown', loadable: true, unavailable_reason: null, sha256: 'a'.repeat(64) },
  { relative_path: 'references/conditions.md', size_bytes: 30, content_type: 'text/markdown', loadable: true, unavailable_reason: null, sha256: 'b'.repeat(64) },
  { relative_path: 'scripts/check.py', size_bytes: 25, content_type: 'application/octet-stream', loadable: false, unavailable_reason: '脚本执行未启用', sha256: 'c'.repeat(64) },
]
const version = { version_id: 'skill_a', version_label: '初始版本', revision: 1, status: { value: 'DRAFT', label: '草稿', tone: 'default' }, settings,
  metadata: { name: 'rental-intent', description: '提取用户条件', license: 'MIT' }, files, package_hash: 'd'.repeat(64),
  discovery_preview: 'rental-intent\n提取用户条件', instruction_preview: '只提取已确认的事实。',
  actions: [action('edit', '编辑包'), action('validate', '检查依赖'), action('test', '加载测试'), action('freeze', '冻结版本'), action('export', '导出技能包')] }
const summary = (value: typeof version) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'instruction_preview'))
const detail = { skill, versions: [summary(version)], references: [], release_version_id: null, release_revision: null }

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    let json: unknown = []
    if (path.includes('/resource-management/')) json = [resourceSummary('skill_a', skill.name)]
    else if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin_a', display_name: '管理员', login_name: 'admin' }, workspace,
      navigation: [{ navigation_key: 'skills', label: '技能管理' }], actions: [action('skill:manage', '管理技能')], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/skills') json = { items: [skill], actions: [action('create', '新增技能'), action('import', '导入技能包'), action('assist', '智能创建')] }
    else if (path === '/admin/v1/skills/assistance/options') json = [{ route_id: 'route_a', name: '文本生成模型' }]
    else if (path === '/admin/v1/skills/skill_a') json = detail
    else if (path === '/admin/v1/skills/skill_a/configuration') json = version
    else if (path.endsWith('/files')) { const file = files.find(f => f.relative_path === url.searchParams.get('path'))!; json = { path: file.relative_path, text: file.relative_path === 'SKILL.md' ? source : file.loadable ? '参考条件' : 'raise RuntimeError()', unavailable_reason: file.unavailable_reason } }
    await route.fulfill({ json })
  })
}

test('技能包文件树、脚本状态与两种预览使用实际内容', async ({ page }) => {
  await fixture(page)
  await page.goto('#/skills')
  await page.getByRole('link', { name: '租赁诉求解析' }).click()
  await expect(page.getByRole('radio', { name: '格式化', exact: true })).toBeChecked()
  await expect(page.locator('.markdown-content')).toHaveText('只提取已确认的事实。')
  await page.getByText('源文件', { exact: true }).click()
  await expect(page.getByText(source, { exact: true })).toBeVisible()
  await page.getByText('check.py', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '格式化', exact: true })).toHaveCount(0)
  await expect(page.getByText('raise RuntimeError()', { exact: true })).toBeVisible()
  await expect(page.getByText('脚本执行未启用').first()).toBeVisible()
  await page.getByRole('tab', { name: '加载预览' }).click()
  await expect(page.getByText('rental-intent\n提取用户条件', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '完整指令', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '完整指令', exact: true }).getByText('只提取已确认的事实。', { exact: true })).toBeVisible()
})

test('Markdown 切换保持原文，文件树紧凑且窄屏上下排列', async ({ page }) => {
  await fixture(page)
  const markdown = `${source}\n\n## 操作步骤\n\n1. **查看订单**\n2. 确认信息\n\n| 项目 | 说明 |\n| --- | --- |\n| 租金 | 按约定 |\n\n\`\`\`json\n{"ok": true}\n\`\`\``
  await page.route('**/skill-versions/skill_a/files?*', route => route.fulfill({ json: { path: 'SKILL.md', text: markdown, unavailable_reason: null } }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('#/skills/skill_a')
  const preview = page.locator('.skill-files-preview')
  await expect(preview.getByRole('heading', { name: '操作步骤' })).toBeVisible()
  await expect(preview.getByRole('cell', { name: '按约定' })).toBeVisible()
  await expect(preview.locator('pre code')).toHaveText('{"ok": true}\n')
  const tree = await page.locator('.skill-files-tree').boundingBox()
  const content = await page.locator('.skill-files-content').boundingBox()
  expect(tree!.width).toBeLessThanOrEqual(220)
  expect(content!.width).toBeGreaterThan(tree!.width * 2)
  await page.getByText('源文件', { exact: true }).click()
  await expect(preview.locator('pre')).toHaveText(markdown)
  await page.getByText('格式化', { exact: true }).click()
  await expect(preview.getByRole('heading', { name: '操作步骤' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileTree = await page.locator('.skill-files-tree').boundingBox()
  const mobileContent = await page.locator('.skill-files-content').boundingBox()
  expect(mobileContent!.y).toBeGreaterThanOrEqual(mobileTree!.y + mobileTree!.height)
  expect(mobileContent!.x + mobileContent!.width).toBeLessThanOrEqual(390)
})

test('加载测试只提交所选文件并显示省略记录', async ({ page }) => {
  await fixture(page)
  let calls = 0
  await page.route('**/skill-versions/skill_a/tests', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: [] }); return }
    calls++
    expect(route.request().postDataJSON()).toEqual({ revision: 1, selected: true, selected_files: ['references/conditions.md'], variables: {}, context_budget: 16000 })
    await route.fulfill({ json: { test_id: 'test_a', version_id: 'skill_a', version_label: '初始版本', created_at: '2026-10-02T01:00:00Z', evidence_label: '加载验证', run_id: null,
      result: { complete: true, loaded: [{ version_id: 'skill_a', path: 'SKILL.md', text: '只提取已确认的事实。', trigger_reason: '加载测试', budget_units: 30, sha256: 'a'.repeat(64) }], discoveries: [],
        omitted: [{ version_id: 'skill_a', path: 'scripts/check.py', reason: '脚本执行未启用' }], issues: [], used_budget: 30, budget_unit: 'utf8_bytes', callable_tool_versions: [] } } })
  })
  await page.goto('#/skills/skill_a')
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
  await page.route('**/skills/skill_a/configuration', async route => {
    if (route.request().method() === 'GET') { await route.fallback(); return }
    writes++
    const body = route.request().postDataJSON()
    expect(body.files).toEqual([{ relative_path: 'references/new.md', text: '新增资料内容' }])
    expect(body).not.toHaveProperty('channel_id')
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '技能草稿已变更，请刷新', fields: [] } } })
  })
  await page.goto('#/skills/skill_a')
  await page.getByRole('button', { name: '修改', exact: true }).click()
  await page.getByLabel('新文件路径').fill('references/new.md')
  await page.getByRole('button', { name: '新增文件', exact: true }).click()
  await page.getByLabel('文件正文').fill('新增资料内容')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('技能草稿已变更，请刷新', { exact: true })).toBeVisible()
  await expect(page.getByLabel('文件正文')).toHaveValue('新增资料内容')
  expect(writes).toBe(1)
})

test('技能详情直接加载当前配置，没有版本选择器', async ({ page }) => {
  await fixture(page)
  await page.goto('#/skills/skill_a')
  await page.getByRole('tab', { name: '加载预览' }).click()
  await page.getByRole('tab', { name: '完整指令', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '完整指令', exact: true }).getByText('只提取已确认的事实。', { exact: true })).toBeVisible()
  await expect(page.getByLabel('技能版本')).toHaveCount(0)
})

test('导出通过受控产物下载', async ({ page }) => {
  await fixture(page)
  await page.route('**/skill-versions/skill_a/exports', route => route.fulfill({ json: { artifact_id: 'artifact_export', name: 'rental.zip' } }))
  await page.route('**/artifacts/artifact_export/content', route => route.fulfill({ body: 'zip fixture', headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="rental.zip"' } }))
  await page.goto('#/skills/skill_a')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出技能包', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('rental.zip')
})

test('导入预览后显式绑定本渠道工具，契约失败保留选择', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const archiveUrl = 'https://files.example.test/channels/channel_a/files/file_a/archive-answer.zip'
  let uploads = 0, previews = 0
  await page.route('**/files/upload', async route => {
    uploads++
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=')
    expect(route.request().postDataBuffer()?.toString()).toContain('name="file"; filename="archive-answer.zip"')
    await route.fulfill({ status: 201, json: { url: archiveUrl, name: 'archive-answer.zip', content_type: 'application/zip', size_bytes: 512 } })
  })
  const requirement = { tool_code: 'archive.find-notes', version_label: '配置初版', source_type: 'mcp', input_schema: { type: 'object' }, output_schema: { type: 'object' } }
  await page.route('**/skills/tool-options', route => route.fulfill({ json: [{ ...requirement, tool_code: 'local_archive', version_id: 'local_tool_v1', name: '本地档案工具', available: true, reason: null }] }))
  await page.route('**/skills/imports/preview', async route => {
    previews++
    expect(route.request().postDataJSON()).toEqual({ archive_url: archiveUrl })
    await route.fulfill({ json: { metadata: { name: 'archive-answer' }, files, settings: { tool_requirements: [requirement], tool_bindings: {} }, instruction_preview: '引用已授权的档案查询结果。' } })
  })
  let imports = 0
  await page.route('**/skills/imports', async route => {
    imports++
    const body = route.request().postDataJSON()
    expect(body.tool_bindings).toEqual({ 'archive.find-notes': 'local_tool_v1' })
    expect(body.archive_url).toBe(archiveUrl)
    expect(body).not.toHaveProperty('archive_base64')
    expect(body).not.toHaveProperty('channel_id')
    await route.fulfill({ status: 422, json: { error: { code: 'SKILL_DEPENDENCY_MISSING', message: '工具输入或输出 schema 与依赖契约不兼容', fields: [] } } })
  })
  await page.goto('#/skills')
  await page.getByRole('button', { name: '导入技能包', exact: true }).click()
  await page.getByLabel('技能编码').fill('archive_answer')
  await page.getByLabel('负责人').fill('配置人员')
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/archive-answer.zip')
  const choice = page.getByLabel('工具依赖：archive.find-notes')
  await expect(choice).toBeVisible()
  await expect(page.getByText('本地档案工具', { exact: true })).toHaveCount(0)
  await choice.click()
  await page.getByText('本地档案工具', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: /保存$/ }).click()
  await expect(page.getByText('工具输入或输出 schema 与依赖契约不兼容', { exact: true })).toBeVisible()
  await expect(page.getByText('本地档案工具', { exact: true }).first()).toBeVisible()
  await page.getByText('工具输入或输出 schema 与依赖契约不兼容', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('skill-import-mobile.png'), fullPage: true })
  expect(uploads).toBe(1)
  expect(previews).toBe(1)
  expect(imports).toBe(1)
})
