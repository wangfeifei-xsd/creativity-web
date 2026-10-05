import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '租号渠道', environment: 'test', environment_name: '测试', data_scope_id: 'data_a', data_scope_name: '业务数据域' }
const session = { user: { user_id: 'admin', display_name: '管理员', login_name: 'admin' }, workspace,
  navigation: [{ navigation_key: 'conversations', label: '会话管理' }], actions: [action('conversation:read', '查看会话')], expires_at: '2030-01-01T00:00:00Z' }

async function fixture(page: Page, empty = false) {
  const state = { status: 'ACTIVE', running: !empty, cancelled: false, empty, attempts: [] as Record<string, unknown>[], failFirst: false }
  const conversation = () => ({ conversation_id: 'conversation_a', title: '租号咨询', agent_id: 'agent_a', agent_name: '租号助手', subject_name: '王先生',
    environment: 'test', environment_label: '测试', status: state.status, status_label: state.status === 'ACTIVE' ? '使用中' : '已归档', revision: 1,
    active_run_id: state.running ? 'run_a' : null, created_at: '2026-10-02T01:00:00Z', updated_at: '2026-10-02T01:00:00Z', expires_at: '2026-12-31T01:00:00Z',
    actions: [action('title', '修改标题'), action(state.status === 'ACTIVE' ? 'archive' : 'restore', state.status === 'ACTIVE' ? '归档' : '恢复'),
      action('delete', '删除'), action('export', '导出'), ...(!state.running && state.status === 'ACTIVE' ? [action('send', '发送'), action('upload', '上传附件')] : [])] })
  const detail = () => ({ conversation: conversation(), input_schema: { type: 'object', properties: { message: { type: 'string', title: '消息' } }, required: ['message'] },
    summaries: [{ summary_id: 'summary_a', version: 1, content: '已确认租期三天', source_message_ids: ['message_old'], source_sequences: [1], truncation: {}, created_at: '2026-10-02T01:00:00Z' }],
    contexts: [{ run_id: 'run_a', included_message_ids: ['message_a'], summary_version: '1', truncation: { reason: '超过消息窗口或字符容量', omitted_sequences: [1, 2] } }], executable: true, unavailable_reason: null })
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    let json: unknown = []
    if (path.endsWith('/auth/session')) json = session
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/conversations') json = { items: [conversation()], has_more: false, next_cursor: null, actions: [action('create', '新建会话')], agents: [{ agent_code: 'rental', name: '租号助手' }], unavailable_reason: null }
    else if (path.endsWith('/deletion-preview')) json = { messages: 2, summaries: 1, runs: 1, exclusive_memories: 1, shared_memories: 2, explanation: '删除后立即停止访问并取消在途任务。' }
    else if (path === '/admin/v1/conversations/conversation_a' && method === 'DELETE') json = { deletion_id: 'deletion_a' }
    else if (path === '/admin/v1/conversations/conversation_a') json = detail()
    else if (path.endsWith('/archive') || path.endsWith('/restore')) { state.status = path.endsWith('/archive') ? 'ARCHIVED' : 'ACTIVE'; json = conversation() }
    else if (path.endsWith('/cancel')) { state.running = false; state.cancelled = true; json = {} }
    else if (path.endsWith('/messages') && method === 'POST') {
      state.attempts.push(route.request().postDataJSON())
      if (state.failFirst && state.attempts.length === 1) { await route.abort('failed'); return }
      state.empty = false; state.running = true; json = { turn_id: 'turn_a' }
    } else if (path.endsWith('/messages')) json = {
      items: state.empty ? [] : [
        { message_id: 'message_a', turn_id: 'turn_a', run_id: 'run_a', sequence: 1, role: 'user', role_label: '用户', status: 'COMPLETED', status_label: '已完成', text: '我要租三天', attachments: [], created_at: '2026-10-02T01:00:00Z' },
        { message_id: 'message_b', turn_id: 'turn_a', run_id: 'run_a', sequence: 2, role: 'assistant', role_label: '助手', status: state.cancelled ? 'CANCELLED' : 'PARTIAL', status_label: state.cancelled ? '已取消' : '未完成', text: '已找到部分账号', attachments: [], created_at: '2026-10-02T01:00:01Z' },
      ],
      turns: state.empty ? [] : [{ turn_id: 'turn_a', sequence: 1, run_id: 'run_a', version_label: '初始版本', state: state.cancelled ? 'CANCELLED' : 'RUNNING', state_label: state.cancelled ? '已取消' : '执行中', result: null, result_label: null, output_schema: {}, source_run_id: null, duration_seconds: state.cancelled ? 3.25 : null, can_cancel: state.running, can_view_run: true }],
      has_more: false, next_cursor: null,
    }
    else if (path === '/admin/v1/deletions/deletion_a') json = { deletion_id: 'deletion_a', conversation_id: 'conversation_a', status: 'PENDING', status_label: '等待清理', requested_at: '2026-10-02T01:02:00Z', completed_at: null }
    await route.fulfill({ json })
  })
  return state
}

test('持久化时间线区分部分内容和取消终态并保留历史版本', async ({ page }) => {
  await fixture(page)
  await page.goto('#/conversations')
  await page.getByRole('link', { name: '租号咨询' }).click()
  await expect(page.getByText('未完成', { exact: true })).toBeVisible()
  await expect(page.getByText('第 1 轮 · 初始版本')).toBeVisible()
  await page.getByRole('button', { name: '取消运行', exact: true }).click()
  await expect(page.getByText('已取消', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('已找到部分账号')).toBeVisible()
  await expect(page.getByText('耗时：3.25 秒')).toBeVisible()
})

test('网络失败保留正文并复用客户端消息标识', async ({ page }) => {
  const state = await fixture(page, true)
  state.failFirst = true
  await page.goto('#/conversations/conversation_a')
  await page.getByLabel('消息', { exact: true }).fill('请推荐杭州的账号')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('网络连接失败，请重试')).toBeVisible()
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('请推荐杭州的账号')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('已找到部分账号')).toBeVisible()
  expect(state.attempts).toHaveLength(2)
  expect(state.attempts[0].client_message_id).toBe(state.attempts[1].client_message_id)
  expect(state.attempts[0]).toEqual({ content: '请推荐杭州的账号', input: { message: '请推荐杭州的账号' }, attachments: [], client_message_id: expect.any(String) })
})

test('归档恢复与删除进度入口可用', async ({ page }) => {
  await fixture(page, true)
  await page.goto('#/conversations/conversation_a')
  await page.getByRole('button', { name: '归档', exact: true }).click()
  await expect(page.getByText('已归档', { exact: true })).toBeVisible()
  await expect(page.getByLabel('消息', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(page.getByLabel('消息', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('撤销记忆 1 条；更新来源 2 条。')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('heading', { name: '删除进度', exact: true })).toBeVisible()
  await expect(page.getByText('等待清理', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('等待清理', { exact: true })).toBeVisible()
})

test('窄屏摘要来源和截断记录可读且不泄露内部标识', async ({ page }) => {
  await fixture(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('#/conversations/conversation_a')
  await page.getByRole('button', { name: '摘要与上下文' }).click()
  await expect(page.getByText('已确认租期三天')).toBeVisible()
  await expect(page.getByText(/消息序号 1、2/)).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/conversation_a|agent_a|run_a|message_a/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('conversations-mobile.png'), fullPage: true, animations: 'disabled' })
})
