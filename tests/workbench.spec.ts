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

async function fixture(page: Page, items = navigation, channel = false) {
  await page.route('**/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/auth/session') ? {
      user: { user_id: 'admin', login_name: 'admin', display_name: '管理员' },
      workspace: channel ? { channel_id: 'channel-a', channel_name: '渠道甲', environment: 'test',
        environment_name: '测试',  } : null,
      workspace_options: [], default_workspace: null, can_access_platform: !channel,
      navigation: items, actions: [], expires_at: '2030-01-01T00:00:00Z',
    } : [] })
  })
}

for (const [width, columns] of [[1391, 4], [820, 3], [375, 2], [320, 2]]) {
  test(`工作台卡片自适应布局，无横向溢出（${width}）`, async ({ page }) => {
    await fixture(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('#/')
    const shortcuts = page.getByRole('navigation', { name: '工作台入口' })
    await expect(shortcuts.getByRole('link')).toHaveCount(navigation.length)
    await expect(shortcuts.locator('.workspace-shortcut-icon')).toHaveCount(navigation.length)
    expect(await shortcuts.getByRole('link').allTextContents()).toEqual(navigation.map(item => item.label))
    const boxes = await shortcuts.getByRole('link').evaluateAll(links =>
      links.map(link => { const { x, y, width, height } = link.getBoundingClientRect(); return { x, y, width, height } }))
    expect(boxes.filter(box => box.y === boxes[0].y)).toHaveLength(columns)
    for (const box of boxes) {
      expect(box.width).toBeGreaterThan(100)
      expect(box.height).toBeGreaterThanOrEqual(108)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}

test('整张卡片支持跳转、返回和键盘焦点', async ({ page }) => {
  await fixture(page)
  await page.goto('#/')
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
  await page.goto('#/')
  const shortcuts = page.getByRole('navigation', { name: '工作台入口' })
  await expect(shortcuts.getByRole('link')).toHaveCount(1)
  await expect(shortcuts.getByRole('link', { name: label, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '账号管理', exact: true })).toHaveCount(0)
  await expect(page.getByText('未登记入口', { exact: true })).toHaveCount(0)
  const text = shortcuts.locator('.workspace-shortcut-label')
  expect(await text.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await text.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(21)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

for (const channel of [false, true]) {
  test(`没有可用入口时保留空状态（${channel ? '渠道' : '平台'}）`, async ({ page }) => {
    await fixture(page, [], channel)
    await page.goto('#/')
    await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '工作台入口' })).toHaveCount(0)
    await expect(page.getByText(channel ? '暂无可用菜单，请联系管理员' : '尚未分配可用渠道，请联系平台管理员', { exact: true })).toBeVisible()
  })
}
