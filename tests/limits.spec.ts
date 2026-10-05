import { expect, test, type Page } from '@playwright/test'

const workspace = { channel_id: 'channel-a', channel_name: '测试渠道', environment: 'test', environment_name: '测试', data_scope_id: 'scope-a', data_scope_name: '业务域' }
async function session(page: Page, platform: boolean, writable = true) {
  await page.route('**/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/auth/session') ? {
      user: { user_id: 'operator', display_name: '管理员', login_name: 'operator' },
      workspace: platform ? null : workspace,
      actions: writable ? [{ action_key: platform ? 'channel:govern' : 'budget:manage', label: '管理限额' }] : [],
      navigation: writable ? [{ navigation_key: platform ? 'platform-limits' : 'concurrency-limits', label: platform ? '平台限额' : '并发限额' }] : [],
      expires_at: '2027-01-01T00:00:00Z',
    } : [] })
  })
}

test('渠道并发限额可编辑，保留版本及隐藏周期字段', async ({ page }) => {
  await session(page, false)
  let limit = { id: 'budget-a', version_id: 'version-a', revision: 2, name: '渠道并发', scope_type: 'channel', scope_id: 'channel-a', scope_name: '测试渠道', unit: 'concurrency', unit_label: '并发数', mode: 'HARD', mode_label: '超额阻断', period: 'month', timezone: 'Asia/Shanghai', currency: null, limit_value: '5.00000000', used: '2', remaining: '3', thresholds: ['0.8', '1'], status: 'ACTIVE' }
  let submitted: Record<string, unknown> | undefined
  await page.route('**/admin/v1/budgets', route => route.fulfill({ json: [limit] }))
  await page.route('**/admin/v1/budgets/budget-a', route => {
    submitted = route.request().postDataJSON()
    limit = { ...limit, limit_value: String(submitted?.limit_value), revision: 3, remaining: '6' }
    return route.fulfill({ json: limit })
  })
  await page.goto('/#/concurrency-limits')
  await expect(page.getByRole('heading', { name: '并发限额' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '5 个', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('并发上限（个）').fill('8')
  await page.getByRole('button', { name: '确定' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(submitted).toMatchObject({ revision: 2, limit_value: '8', scope_type: 'channel', scope_id: 'channel-a', unit: 'concurrency', period: 'month', timezone: 'Asia/Shanghai', thresholds: ['0.8', '1'], mode: 'HARD', currency: null })
  expect(submitted).not.toHaveProperty('version_id')
  await expect(page.getByRole('cell', { name: '8 个', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/channel-concurrency.png', fullPage: true })
})

test('平台限额展示占用，提交修订号并保留冲突表单', async ({ page }) => {
  await session(page, true)
  let limit = { limit_code: 'concurrency', name: '平台并发', unit: 'concurrency', unit_label: '并发数', limit_value: 20, used: 7, remaining: 13, status: 'ACTIVE', revision: 3, period: 'minute', timezone: 'Asia/Shanghai', effective_at: '2026-10-04T10:00:00Z' }
  let attempt = 0
  await page.route('**/admin/v1/platform/budget-limits', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body).toEqual({ limit_code: 'concurrency', name: '平台并发', unit: 'concurrency', limit_value: 30, status: 'ACTIVE', revision: attempt === 0 ? 3 : 4, period: 'minute', timezone: 'Asia/Shanghai' })
      if (attempt++ === 0) {
        limit = { ...limit, limit_value: 25, revision: 4 }
        return route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: '平台限额已更新，请刷新后重试', fields: [] } } })
      }
      limit = { ...limit, limit_value: 30, remaining: 23, revision: 4 }
    }
    return route.fulfill({ json: [limit] })
  })
  await page.goto('/#/platform-limits')
  await expect(page.getByRole('cell', { name: '20 个', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '7 个', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('并发上限（个）').fill('30')
  await page.getByRole('button', { name: '确定' }).click()
  await expect(page.getByText('平台限额已更新，请刷新后重试')).toBeVisible()
  await expect(page.getByLabel('并发上限（个）')).toHaveValue('30')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('cell', { name: '25 个', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('并发上限（个）').fill('30')
  await page.getByRole('button', { name: '确定' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '30 个', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/platform-concurrency.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('无权限及错误工作区不请求平台限额', async ({ page }) => {
  await session(page, false, false)
  let requests = 0
  await page.route('**/admin/v1/platform/budget-limits', route => { requests++; return route.fulfill({ json: [] }) })
  await page.goto('/#/platform-limits')
  await expect(page.getByText('无权管理平台限额')).toBeVisible()
  expect(requests).toBe(0)
})
