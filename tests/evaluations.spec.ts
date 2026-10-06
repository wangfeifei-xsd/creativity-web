import { expect, test, type Page } from '@playwright/test'

const action = (action_key: string, label: string) => ({ action_key, label })
const workspace = { channel_id: 'channel_a', channel_name: '示例渠道', environment: 'prod', environment_name: '生产',  }
const sample = { case_key: 'normal', title: '固定结果样本', input: { request: '固定输入' }, assertions: [{ kind: 'equal', path: 'data.answer', expected: '完成', name: '结果一致' }], labels: ['正常'], label_source: '人工固定预期', human_label: { decision: 'approved', reason: '已审阅' }, fixture: [] }
const dataset = { dataset_id: 'dataset_a', name: '结构输出样本', scenario: '结构契约', owner: '审阅人员', applicability: '通用结构输出', revision: 2, current_version_id: 'version_a', actions: [action('version', '新建样本版本'), action('import', '导入样本'), action('review', '人工标注')], versions: [{ version_id: 'version_a', version_label: '固定第一版', content_digest: 'a'.repeat(64), captured_at: '2026-10-02T10:00:00Z', reference_versions: [], cases: [{ case_id: 'case_a', case_key: 'normal', title: '固定结果样本', valid: true, payload: sample }] }] }
const task = { evaluation_id: 'evaluation_a', name: '生产发布回归', dataset_name: dataset.name, dataset_version_label: '固定第一版', revision: 3, state: { value: 'PAUSED', label: '已暂停派发', tone: 'default' }, execution_mode: 'fixture', execution_mode_label: '固定数据评测', candidates: [], config: {}, human_review: null, created_at: '2026-10-02T10:00:00Z', actions: [action('refresh', '更新报告'), action('resume', '继续派发'), action('cancel', '取消评测')] }
const report = { report_id: 'evaluation_a', evaluation_id: 'evaluation_a', revision: 3, report_digest: 'b'.repeat(64), reproducible: true, complete: false, candidates: [{ candidate_id: 'candidate_a', agent_name: '条目整理助手', version_id: 'draft_a', version_label: '候选第二版', total: 2, counts: { PASSED: 1, UNEXECUTED: 1 }, pass_rate: 0.5, regression: null, critical_failures: 0, release_passed: false }], results: [{ result_id: 'result_a', candidate_id: 'candidate_a', title: '固定结果样本', state: 'UNEXECUTED', state_label: '未执行', run_id: null, attempt_number: 1, labels: ['正常'], judgment: null }], cost: { amounts: {}, unknown_count: 1, pending_count: 1, run_count: 1 }, latency: { mean_ms: 12 }, baseline: null, warnings: ['任务未全部完成，当前为部分报告'], human_review: null }

async function fixture(page: Page) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = {}
    if (path.endsWith('/auth/session')) json = { user: { user_id: 'admin', display_name: '管理员', login_name: 'admin' }, workspace, navigation: [{ navigation_key: 'evaluations', label: '效果评测' }], actions: [], expires_at: '2030-01-01T00:00:00Z' }
    else if (path.endsWith('/auth/channels')) json = [workspace]
    else if (path === '/admin/v1/evaluation-datasets') json = { items: [dataset], actions: [action('create', '新建样本集')] }
    else if (path === '/admin/v1/evaluation-datasets/dataset_a') json = dataset
    else if (path === '/admin/v1/evaluations') json = { items: [task], actions: [action('create', '发起评测')] }
    else if (path.endsWith('/comparison')) json = report
    else if (path === '/admin/v1/evaluations/evaluation_a') json = task
    await route.fulfill({ json })
  })
}

test('样本版本、人工标签与导入错误行可审阅', async ({ page }) => {
  await fixture(page)
  await page.route('**/evaluation-datasets/dataset_a/imports', async route => {
    expect(route.request().postDataJSON()).not.toHaveProperty('channel_id')
    await route.fulfill({ json: { columns: ['input'], mapping: {}, rows: [{ row_number: 1, case: sample, errors: [] }, { row_number: 2, case: null, errors: ['行格式不合法'] }], valid_count: 1, error_count: 1, preview_digest: 'a'.repeat(64) } })
  })
  await page.goto('#/evaluations')
  await page.getByRole('link', { name: '结构输出样本' }).click()
  await expect(page.getByRole('cell', { name: '人工固定预期' })).toBeVisible()
  await page.getByRole('button', { name: '导入样本', exact: true }).click()
  await page.getByLabel('新版本名称').fill('导入版本')
  await page.getByLabel('样本内容', { exact: true }).fill('{"input":{}}\nbad')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.getByText('行格式不合法')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认导入' })).toBeDisabled()
})

test('部分报告不显示整集通过，暂停和冲突反馈保留上下文', async ({ page }) => {
  await fixture(page)
  await page.route('**/evaluations/evaluation_a/control', async route => {
    expect(route.request().postDataJSON()).toEqual({ revision: 3, operation: 'resume' })
    await route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '评测状态已变化，请刷新', fields: [] } } })
  })
  await page.goto('#/evaluations/evaluation_a')
  await expect(page.getByText('50.0%', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无可定价费用')).toBeVisible()
  await expect(page.getByText('任务未全部完成，当前为部分报告')).toBeVisible()
  await page.getByRole('button', { name: '继续派发' }).click()
  await expect(page.getByText('评测状态已变化，请刷新')).toBeVisible()
  await page.screenshot({ path: '/tmp/creativity-evaluation-report.png', fullPage: true })
})

test('窄屏发布检查显示服务端阻断原因', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/agent-versions/draft_a', route => route.fulfill({ json: { revision: 7 } }))
  await page.route('**/agent-versions/draft_a/release-check', async route => {
    expect(route.request().postDataJSON()).toEqual({ revision: 7, evaluation_refs: ['evaluation_a'] })
    await route.fulfill({ json: { valid: false, checks: [{ key: 'evaluation', label: '生产评测证据', passed: false, issues: [{ message: '关键样本失败，禁止发布' }] }] } })
  })
  await page.goto('#/evaluations/evaluation_a')
  await page.getByRole('tab', { name: '发布检查' }).click()
  await page.getByLabel('发布候选').click()
  await page.getByText('条目整理助手 · 候选第二版', { exact: true }).last().click()
  await page.getByRole('button', { name: '检查当前版本' }).click()
  await expect(page.getByText('关键样本失败，禁止发布')).toBeVisible()
  await page.screenshot({ path: '/tmp/creativity-evaluation-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('人工复核使用结果修订且与确定性判定分列', async ({ page }) => {
  await fixture(page)
  await page.route('**/admin/v1/evaluations/evaluation_a', route => route.fulfill({ json: { ...task, actions: [...task.actions, action('review_result', '复核样本结果')] } }))
  await page.route('**/evaluations/evaluation_a/comparison', route => route.fulfill({ json: { ...report, results: [{ ...report.results[0], state: 'FAILED', state_label: '未通过', revision: 9, judgment: { passed: false, violations: [{ name: '计算错误' }], semantic: null } }] } }))
  let saved = false
  await page.route('**/evaluation-results/result_a/review', async route => {
    expect(route.request().postDataJSON()).toEqual({ revision: 9, label: { decision: 'approved', reason: '已独立核对结果' } })
    saved = true
    await route.fulfill({ json: task })
  })
  await page.goto('#/evaluations/evaluation_a')
  await page.getByRole('tab', { name: '样本结果' }).click()
  await expect(page.getByRole('columnheader', { name: '确定性判定' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '人工结论' })).toBeVisible()
  await expect(page.getByText('计算错误', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '复核', exact: true }).click()
  await page.getByLabel('复核理由').fill('已独立核对结果')
  await page.getByRole('button', { name: '保存结论' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(saved).toBeTruthy()
})
