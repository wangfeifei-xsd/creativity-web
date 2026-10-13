import { expect, test, type Page } from '@playwright/test'

const workspace = { channel_id: 'channel-a', channel_name: '租号渠道', environment: 'test', environment_name: '测试',  }
const record = { id: 'usage-1', channel_id: 'channel-a', run_id: 'run-1', attempt_id: 'attempt-1', created_at: '2026-10-02T02:00:00Z', names: { model: '文本模型', agent: '匹配助手' }, purpose: 'production', purpose_label: '正式调用', input_tokens: null, output_tokens: null, cached_tokens: null, reasoning_tokens: null, usage_status: 'MISSING', usage_label: '用量缺失', pricing_status: 'UNPRICED', pricing_label: '未定价', amount: null, currency: null, state: 'PENDING', state_label: '待核实', outcome_label: '结果待核实', revision: 1, normalized_tokens: {}, subset_relations: {}, calculation: {} }
const summary = { requests: 2, attempts: 3, success_rate: '0.5000', input_tokens: 200, output_tokens: 50, missing_usage: 1, unpriced: 1, costs: [{ currency: 'USD', priced: '0.03000000', provisional: '0.01000000' }, { currency: 'CNY', priced: '0.12000000', provisional: '0.00000000' }], trend: [{ date: '2026-10-02', attempts: 3, input_tokens: 200, output_tokens: 50, costs: {} }], aggregate_updated_at: '2026-10-02T02:01:00Z', ledger_watermark: '2026-10-02T02:00:00Z', price_complete: false, timezone: 'Asia/Shanghai' }
async function setup(page: Page, totals: Omit<typeof summary, 'success_rate' | 'input_tokens' | 'output_tokens'> & { success_rate: string | null; input_tokens: number | null; output_tokens: number | null } = summary) {
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = path.endsWith('/auth/session') ? { user: { user_id: 'u1', display_name: '运营人员', login_name: 'operator' }, workspace, actions: [{ action_key: 'usage:read', label: '查看用量' }], navigation: [{ navigation_key: 'usage', label: '用量' }], expires_at: '2026-10-03T00:00:00Z' }
      : path.endsWith('/auth/channels') ? [workspace]
        : path.endsWith('/usage/summary') ? totals
          : path.endsWith('/usage/records') ? { items: [record], total: 1, offset: 0, limit: 20 }
            : path.endsWith('/usage/options') ? { models: [{ value: 'm1', label: '文本模型' }], agents: [], actors: [],  keys: [] }
              : path.endsWith('/usage/records/usage-1') ? { ...record, source: {}, events: [], adjustments: [] } : []
    await route.fulfill({ json })
  })
}

test('USG 页面保留币种、缺失值及只读权限，支持筛选与核查', async ({ page }) => {
  await setup(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('#/usage')
  await expect(page.getByRole('heading', { name: '用量', exact: true })).toBeVisible()
  await expect(page.getByText('0.03000000 USD', { exact: true })).toBeVisible()
  await expect(page.getByText('0.12000000 CNY', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出明细' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '预算', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '调用明细' }).click()
  await expect(page.getByRole('cell', { name: '金额未确认', exact: false })).toBeVisible()
  await expect(page.getByRole('cell', { name: '用量缺失', exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: '核查' }).click()
  await expect(page.getByText('用量核查', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByLabel('主体类型').fill('member')
  await page.getByLabel('主体编号').fill('subject-1')
  const requested = page.waitForRequest(request => request.url().includes('/usage/records?') && request.url().includes('subject_id=subject-1'))
  await page.getByRole('button', { name: '查询', exact: true }).click()
  expect((await requested).url()).toContain('subject_type=member')
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/usage-desktop.png', fullPage: true })
})

test('没有模型调用时明确显示空数据，刷新截至当前的查询包含新调用', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-13T02:54:00Z'))
  await setup(page, { ...summary, requests: 111, attempts: 0, success_rate: null, input_tokens: null, output_tokens: null, unpriced: 0, missing_usage: 0, costs: [], trend: [], price_complete: true })
  await page.goto('#/usage')
  await expect(page.getByText('暂无模型调用', { exact: true })).toHaveCount(4)
  await expect(page.getByText('价格完整', { exact: true })).toHaveCount(0)
  await expect(page.getByText('未确认', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('结束时间')).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: '截至当前' })).toBeChecked()
  await page.clock.setFixedTime(new Date('2026-10-13T02:55:00Z'))
  await page.route('**/usage/summary?**', route => route.fulfill({ json: { ...summary, requests: 111, attempts: 1, success_rate: '1.0000' } }))
  const requested = page.waitForRequest(request => request.url().includes('/usage/summary?'))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  const url = new URL((await requested).url())
  expect(url.searchParams.get('end_at')).toBe('2026-10-13T02:55:00.000Z')
  expect(url.searchParams.has('through_now')).toBe(false)
  await expect(page.getByText('100.00%', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无模型调用', { exact: true })).toHaveCount(0)
})

test('固定历史时间范围在刷新时保持不变', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-13T02:54:00Z'))
  await setup(page)
  await page.goto('#/usage')
  await page.getByRole('checkbox', { name: '截至当前' }).uncheck()
  await expect(page.getByLabel('结束时间')).toBeEnabled()
  const queried = page.waitForRequest(request => request.url().includes('/usage/summary?'))
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const original = new URL((await queried).url()).search
  await page.clock.setFixedTime(new Date('2026-10-13T03:55:00Z'))
  const refreshed = page.waitForRequest(request => request.url().includes('/usage/summary?'))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  expect(new URL((await refreshed).url()).search).toBe(original)
})

test('有调用但缺少用量或结果时说明原因，真实零值正常展示', async ({ page }) => {
  await setup(page, { ...summary, success_rate: null, input_tokens: null, output_tokens: 0 })
  await page.goto('#/usage')
  await expect(page.getByText('结果待核实', { exact: true })).toBeVisible()
  await expect(page.getByText('用量缺失', { exact: true })).toBeVisible()
  await expect(page.locator('.ant-card').filter({ hasText: '输出 Token' }).getByText('0', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无模型调用', { exact: true })).toHaveCount(0)
})

test('用量接口失败时显示加载失败，不伪装成暂无调用', async ({ page }) => {
  await setup(page)
  await page.route('**/usage/summary?**', route => route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: '用量服务暂不可用', request_id: 'usage-failure' } } }))
  await page.goto('#/usage')
  await expect(page.getByText('加载失败', { exact: true })).toHaveCount(7)
  await expect(page.getByText('暂无模型调用', { exact: true })).toHaveCount(0)
})

test('USG 窄屏总览与调用明细无页面横向溢出', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('#/usage')
  await expect(page.getByRole('heading', { name: '用量', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('tab', { name: '调用明细' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('账单核查保留缺失金额与币种差异，不把缺失值显示成零', async ({ page }) => {
  await setup(page)
  const statement = { id: 'statement', name: '十月用量', version: '第一版', currency: 'USD', start_at: '2026-10-01T00:00:00Z', end_at: '2026-10-02T00:00:00Z' }
  await page.route('**/admin/v1/provider-statements', route => route.fulfill({ json: [statement] }))
  await page.route('**/admin/v1/provider-statements/options', route => route.fulfill({ json: [] }))
  await page.route('**/admin/v1/provider-statements/statement', route => route.fulfill({ json: { ...statement, checked_at: '2026-10-03T01:00:00Z', counts: [{ state: 'CURRENCY_MISMATCH', label: '币种不同', count: 1 }], results: [{ state_label: '币种不同', line_id: '1', request_id: 'provider-request', model_name: '文本模型', provider_amount: '0.30', platform_amount: null, platform_currency: null, difference: null, late_reported: true, run_id: 'run-1' }] } }))
  await page.goto('#/usage')
  await page.getByRole('tab', { name: '供应商账单', exact: true }).click()
  await page.getByRole('button', { name: '核查', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '供应商账单核查' })
  await expect(panel.getByRole('cell', { name: '0.30 USD', exact: true })).toBeVisible()
  await expect(panel.getByText('导入后上报', { exact: true })).toBeVisible()
  await expect(panel.getByRole('link', { name: '查看运行' })).toHaveAttribute('href', '#/runs/run-1')
  await expect(panel.getByRole('cell', { name: '金额未确认', exact: true })).toHaveCount(2)
  await page.screenshot({ path: '/tmp/creativity-enhancements-statement.png', fullPage: true, animations: 'disabled' })
})
