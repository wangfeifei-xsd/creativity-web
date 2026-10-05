// 26 的管理页面驱动；请求原样转发到临时真实 API，凭据仅通过管道传入。
import { chromium, expect } from '@playwright/test'

let input = ''
for await (const chunk of process.stdin) input += chunk
const config = JSON.parse(input)
const webURL = new URL('/creativity/', config.web).href
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.setDefaultTimeout(20000)
const errors = []
const requests = []
let closing = false
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => {
  const url = new URL(response.url())
  if (url.pathname.startsWith('/admin/v1/')) requests.push({
    method: response.request().method(), path: url.pathname, status: response.status(),
  })
})
await page.route('**/admin/v1/**', async route => {
  const url = new URL(route.request().url())
  try {
    const response = await route.fetch({ url: `${config.api}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  } catch (error) {
    // 页面切换可终止流请求；只忽略浏览器已经处理该请求的明确反馈。
    if (!closing && !String(error).includes('Route is already handled')) throw error
  }
})
await page.addInitScript(token => sessionStorage.setItem('creativity.management.token', token), config.sessionToken)
const button = (parent, name) => parent.getByRole('button', { name, exact: true })
const dialog = name => page.getByRole('dialog', name ? { name, exact: true } : undefined)
async function choose(parent, label, value) {
  const field = parent.getByLabel(label, { exact: true })
  await field.click()
  await page.locator('.ant-select-dropdown:visible').getByText(value, { exact: true }).click()
  await field.press('Escape')
}
async function capture(path, action) {
  process.stderr.write(`操作：${path}\n`)
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST')
  await action()
  const response = await pending
  expect(response.ok(), `${path}: ${response.status()}`).toBe(true)
  return response.json()
}
const result = { model_evidence: 'controlled_fixture', requests }
try {
  if (config.stage === 'model') {
    await page.goto(`${webURL}#/models`)
    await page.getByRole('tab', { name: '供应商连接', exact: true }).click()
    await button(page, '新增连接').click()
    await dialog().getByLabel('连接名称').fill('受控模型连接')
    await choose(dialog(), '供应商', config.provider)
    await choose(dialog(), '协议', 'Chat Completions 兼容')
    await dialog().getByLabel('基础地址').fill('https://models.example/v1')
    await dialog().getByLabel('凭据', { exact: true }).fill('controlled-model-credential')
    const connection = await capture('/admin/v1/model-connections', () => button(dialog(), '保存').click())
    result.connection_id = connection.id
    await expect(dialog()).toBeHidden()
    await page.getByRole('tab', { name: '模型', exact: true }).click()
    await button(page, '新增模型').click()
    await dialog().getByLabel('模型名称').fill('受控模型')
    await dialog().getByLabel('稳定别名').fill('controlled')
    await choose(dialog(), '供应商连接', `${config.provider} · 受控模型连接`)
    await dialog().getByLabel('供应商模型名').fill('controlled')
    await dialog().getByLabel('上下文上限（Token）').fill('32000')
    await dialog().getByLabel('默认参数（JSON）').fill('{"max_tokens":100}')
    result.model = await capture('/admin/v1/models', () => button(dialog(), '保存').click())
    await expect(dialog()).toBeHidden()
  } else if (config.stage === 'dependencies') {
    await page.goto(`${webURL}#/usage`)
    await page.getByRole('tab', { name: '预算', exact: true }).click()
    await button(page, '新增预算').click()
    await dialog().getByLabel('预算名称').fill('渠道并发限额')
    await choose(dialog(), '限额类型', '并发数')
    await dialog().getByLabel('限额', { exact: true }).fill('5')
    result.budget = await capture('/admin/v1/budgets', () => button(dialog(), '确定').click())
    await expect(dialog()).toBeHidden()
    await page.goto(`${webURL}#/model-routes`)
    await button(page, '新增路由').click()
    await dialog().getByLabel('路由名称').fill('验证模型路由')
    await dialog().getByLabel('路由编码').fill('controlled_route')
    const route = await capture('/admin/v1/model-routes', () => button(dialog(), '保存').click())
    await expect(dialog()).toBeHidden()
    await button(page, '版本').click()
    await button(page, '新增版本').click()
    const versionDialog = dialog('新增路由版本')
    await versionDialog.getByLabel('版本名称').fill('受控初版')
    await choose(versionDialog, '首选模型', `${config.provider} · 受控模型连接 · 受控模型`)
    for (const capability of ['结构化输出', '工具调用', '流式输出']) await choose(versionDialog, '必需能力', capability)
    result.route_version = await capture(`/admin/v1/model-routes/${route.id}/versions`, () => button(versionDialog, '保存').click())
    await expect(versionDialog).toBeHidden()
    await button(dialog('验证模型路由'), '正式发布').click()
    result.route_release = await capture(`/admin/v1/model-routes/${route.id}/releases`, () => button(dialog('发布 受控初版'), '保存').click())
    await page.goto(`${webURL}#/prompts`)
    await button(page, '导入').click()
    await dialog().getByLabel('名称', { exact: true }).fill('配置样例提示词')
    await dialog().getByLabel('编码', { exact: true }).fill('text-brief')
    await dialog().getByLabel('用途', { exact: true }).fill('验证配置闭环')
    await dialog().getByLabel('提示词内容').fill(JSON.stringify({ format_version: 1, content: config.prompt }))
    result.prompt = await capture('/admin/v1/prompts/import', () => button(dialog(), '确定').click())
    await expect(dialog()).toBeHidden()
    await page.getByRole('tab', { name: '调试', exact: true }).click()
    await button(page, '添加样例').click()
    await dialog().getByLabel('样例名称').fill('调试样本')
    await dialog().getByLabel('输出约束（每行一项）').fill('包含：验证完成')
    await capture(`/admin/v1/prompts/${result.prompt.version.resource_id}/samples`, () => button(dialog(), '确定').click())
    await expect(dialog()).toBeHidden()
    await choose(page, '模型路由版本', '验证模型路由 · 受控初版')
    await choose(page, '固定样例', '调试样本')
    result.debug = await capture(`/admin/v1/prompt-versions/${result.prompt.version.version_id}/tests`, () => button(page, '开始调试').click())
    await expect(dialog('测试快照').getByText('已完成', { exact: true }).first()).toBeVisible({ timeout: 60000 })
    await dialog('测试快照').getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('tab', { name: '版本', exact: true }).click()
    await button(page, '发布').click()
    await dialog('发布提示词').getByLabel('变更说明').fill('26 联调依赖发布')
    result.prompt_release = await capture(`/admin/v1/prompts/${result.prompt.version.resource_id}/releases`, () => button(dialog('发布提示词'), '确定').click())
    await expect(dialog()).toBeHidden()
  } else throw new Error('未知管理验证步骤')
  expect(errors).toEqual([])
  process.stdout.write(JSON.stringify(result))
} catch (error) {
  const message = `${error.stack}\n${await page.locator('body').innerText()}`.replaceAll(config.sessionToken, '[已脱敏]').replaceAll('controlled-model-credential', '[已脱敏]')
  process.stderr.write(`${config.stage}: ${message}\n`)
  process.exitCode = 1
} finally {
  closing = true
  await browser.close()
}
