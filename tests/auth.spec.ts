import { expect, test, type Page } from '@playwright/test'

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#cad6df"/><rect x="150" y="50" width="52" height="52" fill="#738b9f"/></svg>')}`
const error = (message: string) => ({ error: { code: 'CAPTCHA_FAILED', message, fields: [] } })

async function loginPage(page: Page, options: { failChallenge?: boolean; failVerification?: boolean; failLogin?: boolean; proofTtl?: number } = {}) {
  const state = { challenges: 0, verifications: 0, logins: 0, authenticated: false, options }
  await page.route('**/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ status: state.authenticated ? 200 : 401, json: state.authenticated ? {
      user: { user_id: 'test-admin', login_name: 'admin', display_name: '管理员' }, workspace: null, navigation: [], actions: [], expires_at: '2030-01-01T00:00:00Z',
    } : error('请登录') })
    if (path.endsWith('/captcha/challenges')) {
      state.challenges++
      expect(route.request().postDataJSON()).toEqual({ login_name: 'admin' })
      return route.fulfill({ status: options.failChallenge ? 503 : 200, json: options.failChallenge ? error('安全验证服务暂不可用') : {
        challenge_id: `challenge-${state.challenges}`, background: image, piece: image, width: 320, height: 160, piece_size: 52, piece_y: 50, expires_in: 120,
      } })
    }
    if (path.endsWith('/captcha/verify')) {
      state.verifications++
      expect(route.request().postDataJSON().offset).toBeGreaterThan(0)
      return route.fulfill({ status: options.failVerification ? 400 : 200, json: options.failVerification ? error('拼图未对齐，请重新验证') : { captcha_token: 'test-proof', expires_in: options.proofTtl ?? 60 } })
    }
    if (path.endsWith('/auth/login')) {
      state.logins++
      expect(route.request().postDataJSON()).toEqual({ login_name: 'admin', password: 'test-password', captcha_token: 'test-proof' })
      if (options.failLogin) return route.fulfill({ status: 401, json: error('登录名或密码不正确') })
      state.authenticated = true
      return route.fulfill({ json: { access_token: 'test-token', token_type: 'Bearer', expires_in: 7200, expires_at: '2030-01-01T00:00:00Z' } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/#/')
  await page.getByLabel('登录名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  return state
}

async function verifyWithKeyboard(page: Page) {
  await page.getByRole('button', { name: '点击完成滑动验证' }).click()
  const slider = page.getByRole('slider', { name: '拼图位置' })
  await expect(slider).toBeEnabled()
  await slider.press('ArrowRight')
  await slider.press('Enter')
}

test('登录必须先验证，键盘调整不会提前提交，成功凭据随登录提交', async ({ page }) => {
  const state = await loginPage(page)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('请先完成滑动验证')).toBeVisible()
  expect(state.logins).toBe(0)
  await page.getByRole('button', { name: '点击完成滑动验证' }).click()
  const slider = page.getByRole('slider', { name: '拼图位置' })
  await expect(slider).toBeEnabled()
  await slider.press('ArrowRight')
  await slider.press('ArrowRight')
  expect(state.verifications).toBe(0)
  await slider.press('Enter')
  await expect(page.getByRole('button', { name: '验证已通过，点击重新验证' })).toBeVisible()
  await page.getByRole('button', { name: '登录', exact: true }).dblclick()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  expect(state.logins).toBe(1)
})

test('拖动失败后更换挑战，刷新和重试可恢复', async ({ page }) => {
  const state = await loginPage(page, { failVerification: true })
  await page.getByRole('button', { name: '点击完成滑动验证' }).click()
  const slider = page.getByRole('slider', { name: '拼图位置' })
  await expect(slider).toBeEnabled()
  await slider.hover()
  const handle = await slider.boundingBox()
  expect(handle).not.toBeNull()
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle!.x + 150, handle!.y + handle!.height / 2, { steps: 15 })
  await page.mouse.up()
  await expect(page.getByText('拼图未对齐，请重新验证')).toBeVisible()
  await expect.poll(() => state.challenges).toBe(2)
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  state.options.failVerification = false
  await page.getByRole('button', { name: '换一张' }).click()
  await expect.poll(() => state.challenges).toBe(3)
  await expect(slider).toBeEnabled()
  await slider.press('ArrowRight')
  await page.getByRole('button', { name: '确认位置' }).click()
  await expect(page.getByRole('button', { name: '验证已通过，点击重新验证' })).toBeVisible()
})

test('验证码服务故障保留账号密码且允许重试', async ({ page }) => {
  const state = await loginPage(page, { failChallenge: true })
  await page.getByRole('button', { name: '点击完成滑动验证' }).click()
  await expect(page.getByText('安全验证服务暂不可用')).toBeVisible()
  await expect(page.getByRole('slider')).toBeDisabled()
  state.options.failChallenge = false
  await page.getByRole('button', { name: '换一张' }).click()
  await expect(page.getByRole('slider')).toBeEnabled()
  await page.getByRole('dialog').getByRole('button', { name: /关闭|close/i }).click()
  await expect(page.getByLabel('登录名', { exact: true })).toHaveValue('admin')
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('test-password')
})

test('登录失败后验证码失效，保留输入并可重新验证登录', async ({ page }) => {
  const state = await loginPage(page, { failLogin: true })
  await verifyWithKeyboard(page)
  await expect(page.getByText('验证已通过', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('登录名或密码不正确', { exact: true })).toBeVisible()
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('test-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('请先完成滑动验证')).toBeVisible()
  expect(state.logins).toBe(1)
  state.options.failLogin = false
  await verifyWithKeyboard(page)
  await expect(page.getByText('验证已通过', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
})

test('更换登录名或凭据超时后需要重新验证', async ({ page }) => {
  await loginPage(page, { proofTtl: 1 })
  await verifyWithKeyboard(page)
  await expect(page.getByText('验证已通过', { exact: true })).toBeVisible()
  await page.getByLabel('登录名', { exact: true }).fill('another-admin')
  await expect(page.getByRole('button', { name: '点击完成滑动验证' })).toBeVisible()
  await page.getByLabel('登录名', { exact: true }).fill('admin')
  await verifyWithKeyboard(page)
  await expect(page.getByText('验证已通过', { exact: true })).toBeVisible()
  await expect(page.getByText('验证已过期，请重新验证')).toBeVisible()
})

test('窄屏和低高度下表单与验证码没有横向溢出', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 375, height: 667 })
  await loginPage(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: '点击完成滑动验证' }).click()
  await expect(page.getByRole('slider')).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await page.setViewportSize({ width: 820, height: 420 })
  await expect(page.getByRole('button', { name: '换一张' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(820)
  expect(errors).toEqual([])
})
