import { expect, test } from '@playwright/test'

test('工作台能加载且不存在浏览器运行错误', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('一玄智能平台')).toBeVisible()
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  await expect(page.locator('.ant-empty-description')).toHaveText('暂无数据')
  expect(errors).toEqual([])
})

test('窄屏布局和直接访问不存在的页面', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.goto('/missing-page')
  await expect(page.getByText('页面不存在')).toBeVisible()
})
