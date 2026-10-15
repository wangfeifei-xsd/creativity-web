import { expect, test, type Page } from '@playwright/test'

const navigation = [
  { navigation_key: 'model-providers', label: '模型供应商' },
  { navigation_key: 'channels', label: '渠道管理' },
  { navigation_key: 'accounts', label: '账号管理' },
  { navigation_key: 'roles', label: '角色管理' },
  { navigation_key: 'menus', label: '菜单管理' },
  { navigation_key: 'platform-limits', label: '平台限额' },
  { navigation_key: 'platform-usage', label: '平台用量' },
  { navigation_key: 'audit-events', label: '操作审计' },
]

async function fixture(page: Page, items = navigation, channel = false, actions: { action_key: string; label: string }[] = []) {
  await page.route('**/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/auth/session') ? {
      user: { user_id: 'admin', login_name: 'admin', display_name: '管理员' },
      workspace: channel ? { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test',
        environment_name: '测试',  } : null,
      workspace_options: [], default_workspace: null, can_access_platform: !channel,
      navigation: items, actions, expires_at: '2030-01-01T00:00:00Z',
    } : [] })
  })
}

const todoNavigation = [
  { navigation_key: 'integrations', label: '业务接入' },
  { navigation_key: 'runs', label: '运行记录' },
]
const todoActions = [
  { action_key: 'integration:manage', label: '管理业务接入' },
  { action_key: 'run:read', label: '查看运行' },
]
const todo = { id: 'schedule_failed', name: '订单协助巡检', consecutive_failures: 3,
  failure_threshold: 3, message: '连续失败 3 次，已自动暂停。最近原因：供应商超时', run_id: 'run_failed' }

test('工作台待办展示自动暂停原因并定位关联计划', async ({ page }) => {
  await fixture(page, todoNavigation, true, todoActions)
  await page.route('**/admin/v1/schedule-todos?*', route => route.fulfill({ json: { total: 1, items: [todo] } }))
  await page.route('**/admin/v1/schedules?*', route => {
    expect(new URL(route.request().url()).searchParams.get('schedule_id')).toBe(todo.id)
    return route.fulfill({ json: [{ ...todo, revision: 1, state: 'PAUSED', state_label: '失败自动暂停',
      last_error: { message: todo.message, run_id: todo.run_id }, spec: { interval_seconds: 60, timezone: 'Asia/Shanghai', failure_threshold: 3 } }] })
  })
  await page.route('**/admin/v1/agents?*', route => route.fulfill({ json: { items: [] } }))
  await page.goto('#/workbench')
  const region = page.getByRole('region', { name: '待办事项' })
  await expect(region.getByRole('heading', { name: '待办事项（1）' })).toBeVisible()
  await expect(region.getByText(todo.name, { exact: true })).toBeVisible()
  await expect(region.getByText('连续失败 3 / 3 次', { exact: true })).toBeVisible()
  await expect(region.getByText('最近原因：供应商超时', { exact: true })).toBeVisible()
  await expect(region.getByRole('link', { name: '查看失败运行' })).toHaveAttribute('href', '#/runs/run_failed')
  await region.getByRole('link', { name: '去处理' }).click()
  await expect(page).toHaveURL(/tab=automation&section=schedules&schedule_id=schedule_failed$/)
  await expect(page.getByRole('cell', { name: todo.name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看全部计划' }).click()
  await expect(page).not.toHaveURL(/schedule_id/)
})

test('待办恢复后刷新移除，查询失败不冒充空待办', async ({ page }) => {
  await fixture(page, todoNavigation, true, todoActions)
  let state = 'paused'
  await page.route('**/admin/v1/schedule-todos?*', route => state === 'error'
    ? route.fulfill({ status: 503, json: {} })
    : route.fulfill({ json: { total: state === 'paused' ? 1 : 0, items: state === 'paused' ? [todo] : [] } }))
  await page.goto('#/workbench')
  const region = page.getByRole('region', { name: '待办事项' })
  await expect(region.getByText(todo.name, { exact: true })).toBeVisible()
  state = 'resumed'
  await region.getByRole('button', { name: '刷新待办' }).click()
  await expect(region.getByText('暂无待办事项')).toBeVisible()
  state = 'error'
  await region.getByRole('button', { name: '刷新待办' }).click()
  await expect(region.getByText('服务暂不可用，请稍后重试')).toBeVisible()
  await expect(region.getByText('暂无待办事项')).toHaveCount(0)
  await expect(region.getByRole('heading', { name: '待办事项（0）' })).toHaveCount(0)
})

test('待办支持服务端分页，窄屏可处理且没有运行权限时不展示运行链接', async ({ page }) => {
  await fixture(page, todoNavigation, true, todoActions.slice(0, 1))
  await page.route('**/admin/v1/schedule-todos?*', route => {
    const pageNumber = new URL(route.request().url()).searchParams.get('page')
    return route.fulfill({ json: { total: 6, items: pageNumber === '1'
      ? Array.from({ length: 5 }, (_, i) => ({ ...todo, id: `schedule_${i}`, name: `巡检${i + 1}` }))
      : [{ ...todo, name: '巡检6' }] } })
  })
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('#/workbench')
  const region = page.getByRole('region', { name: '待办事项' })
  await expect(region.getByRole('link', { name: '去处理' })).toHaveCount(5)
  await expect(region.getByRole('link', { name: '查看失败运行' })).toHaveCount(0)
  await region.getByTitle('2', { exact: true }).click()
  await expect(region.getByText('巡检6', { exact: true })).toBeVisible()
  await expect(region.getByRole('link', { name: '去处理' })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

for (const variant of ['platform', 'no-menu', 'no-action']) {
  test(`没有待办访问入口时不请求待办（${variant}）`, async ({ page }) => {
    await fixture(page, variant === 'no-menu' ? [] : todoNavigation, variant !== 'platform', variant === 'no-action' ? [] : todoActions)
    let requests = 0
    page.on('request', request => { if (request.url().includes('/schedule-todos')) requests++ })
    await page.goto('#/workbench')
    await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '待办事项' })).toHaveCount(0)
    expect(requests).toBe(0)
  })
}

for (const [width, columns] of [[1391, 4], [820, 3], [375, 2], [320, 2]]) {
  test(`工作台卡片自适应布局，无横向溢出（${width}）`, async ({ page }) => {
    await fixture(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('#/workbench')
    await expect(page.getByRole('region', { name: '配置指引', exact: true })).toHaveCount(0)
    const shortcuts = page.getByRole('navigation', { name: '工作台入口' })
    const visible = navigation.slice(0, columns * 2)
    await expect(shortcuts.getByRole('link')).toHaveCount(visible.length)
    await expect(shortcuts.locator('.workspace-shortcut-icon')).toHaveCount(visible.length)
    expect(await shortcuts.getByRole('link').allTextContents()).toEqual(visible.map(item => item.label))
    const boxes = await shortcuts.getByRole('link').evaluateAll(links =>
      links.map(link => { const { x, y, width, height } = link.getBoundingClientRect(); return { x, y, width, height } }))
    expect(boxes.filter(box => box.y === boxes[0].y)).toHaveLength(columns)
    for (const box of boxes) {
      expect(box.width).toBeGreaterThan(100)
      expect(box.height).toBeGreaterThanOrEqual(90)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (navigation.length > visible.length) {
      const expand = shortcuts.getByRole('button', { name: /展开全部快捷入口/ })
      await expect(expand).toHaveAttribute('aria-expanded', 'false')
      await expand.click()
      await expect(shortcuts.getByRole('link')).toHaveCount(navigation.length)
      await shortcuts.getByRole('button', { name: '收起快捷入口' }).click()
      await expect(shortcuts.getByRole('link')).toHaveCount(visible.length)
    }
  })
}

test('整张卡片支持跳转、返回和键盘焦点', async ({ page }) => {
  await fixture(page)
  await page.goto('#/workbench')
  const link = page.getByRole('navigation', { name: '工作台入口' }).getByRole('link', { name: '模型供应商', exact: true })
  const card = link.locator('.workspace-shortcut-card')
  const border = await card.evaluate(element => getComputedStyle(element).borderColor)
  await link.hover()
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).borderColor)).not.toBe(border)
  await link.click({ position: { x: 8, y: 8 } })
  await expect(page).toHaveURL('/creativity/#/model-providers')
  await expect(page.getByRole('heading', { name: '模型供应商', exact: true })).toBeVisible()
  await page.goBack()
  await page.getByRole('button', { name: '用户菜单', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(link).toBeFocused()
  expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
  await link.press('Enter')
  await expect(page).toHaveURL('/creativity/#/model-providers')
})

test('仅展示服务端返回的已登记入口，名称较长时换行且保持可达', async ({ page }) => {
  const label = '渠道内模型供应商与连接配置管理入口'
  await fixture(page, [
    { navigation_key: 'model-providers', label },
    { navigation_key: 'unknown-page', label: '未登记入口' },
  ], true)
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('#/workbench')
  const shortcuts = page.getByRole('navigation', { name: '工作台入口' })
  await expect(shortcuts.getByRole('link')).toHaveCount(1)
  await expect(shortcuts.getByRole('link', { name: label, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '账号管理', exact: true })).toHaveCount(0)
  await expect(page.getByText('未登记入口', { exact: true })).toHaveCount(0)
  const text = shortcuts.locator('.workspace-shortcut-label')
  expect(await text.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await text.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(21)
  const guide = page.getByRole('region', { name: '配置指引' })
  await expect(guide.getByRole('link')).toHaveCount(0)
  await expect(guide.getByRole('button', { name: '打开供应商连接' }).first()).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

for (const channel of [false, true]) {
  test(`没有可用入口时保留空状态（${channel ? '渠道' : '平台'}）`, async ({ page }) => {
    await fixture(page, [], channel)
    await page.goto('#/workbench')
    await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '工作台入口' })).toHaveCount(0)
    await expect(page.getByText(channel ? '暂无可用菜单，请联系管理员' : '尚未分配可用渠道，请联系平台管理员', { exact: true })).toBeVisible()
  })
}
