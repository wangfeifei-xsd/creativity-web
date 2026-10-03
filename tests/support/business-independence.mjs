// 23 的真实页面驱动；仅通过管道传递临时凭据，不录制追踪或写入凭据文件。
import { chromium, expect } from '@playwright/test'

let input = ''
for await (const chunk of process.stdin) input += chunk
const config = JSON.parse(input)
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.setDefaultTimeout(15000)
const errors = []
const requests = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => {
  const url = new URL(response.url())
  if (url.pathname.startsWith('/admin/v1/')) requests.push({
    method: response.request().method(), path: url.pathname, status: response.status(),
  })
})
// 只转发到临时真实 HTTP 服务；不替换响应正文或认证结果。
await page.route('**/admin/v1/**', async route => {
  const url = new URL(route.request().url())
  const response = await route.fetch({ url: `${config.api}${url.pathname}${url.search}` })
  await route.fulfill({ response })
})
const button = (parent, name) => parent.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
async function choose(parent, label, option, search = option) {
  const field = parent.getByLabel(label, { exact: true })
  await field.click()
  if (await field.isEditable()) await field.fill(search)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({ hasText: option }).click()
  await field.press('Escape')
}
async function selected(parent, label, prefix) {
  const field = parent.getByLabel(label, { exact: true })
  await field.click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: prefix }).first().click()
  await field.press('Escape')
}
async function capture(path, action, status = 200) {
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === 'POST')
  await action()
  const response = await pending
  expect(response.status(), path).toBe(status)
  return response.json()
}
async function confirm(name = '确认') {
  await button(dialog(), name).click()
  await expect(dialog()).toBeHidden()
}
async function enter(name) {
  await button(page, '切换工作区').click()
  await dialog().getByRole('combobox').click()
  await page.locator('.ant-select-dropdown:visible').getByText(`${name} · 测试 · ${name}数据域`, { exact: true }).click()
  const auth = await capture('/admin/v1/auth/channel-context', () => button(dialog(), '进入工作区').click())
  await expect(dialog()).toBeHidden()
  return auth
}
let result = {}
try {
  if (config.sessionToken) await page.addInitScript(token => {
    if (!sessionStorage.getItem('creativity.management.token')) sessionStorage.setItem('creativity.management.token', token)
  }, config.sessionToken)
  await page.goto(config.web)
  if (!config.sessionToken) {
    await page.getByLabel('登录名', { exact: true }).fill('root-admin')
    await page.getByLabel('密码', { exact: true }).fill('Changed-password-5678')
    await button(page, '登录').click()
  }
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
  if (config.stage === 'channel') {
    const s = config.scenario
    await page.goto(`${config.web}/channels`)
    await button(page, '开通渠道').click()
    await dialog().getByLabel('渠道名称').fill(s.name)
    await dialog().getByLabel('渠道编码').fill(s.code)
    await dialog().getByLabel('负责人', { exact: true }).fill('接入验证人员')
    await choose(dialog(), '首位管理员', '平台管理员（root-admin）')
    await dialog().getByLabel('数据域名称').fill(`${s.name}数据域`)
    await dialog().getByLabel('外部数据域类型').fill(s.scope_type)
    await dialog().getByLabel('外部数据域编号').fill(s.scope_id)
    for (const action of ['正式发布', '读取敏感原文']) await choose(dialog(), '独立授权', action)
    result.channel = await capture('/admin/v1/channels', () => confirm(), 201)
    result.auth = await enter(s.name)
    const detail = `${config.web}/channels/${result.channel.channel_id}`
    await page.goto(detail)
    await page.getByRole('tab', { name: '接入服务', exact: true }).click()
    await button(page, '登记接入服务').click()
    await dialog().getByLabel('名称', { exact: true }).fill('验证后端')
    await choose(dialog(), '环境', '测试')
    for (const action of ['执行能力', '查看运行元数据', '查看运行内容', '读取敏感原文']) await choose(dialog(), '可调用能力', action)
    await choose(dialog(), '业务数据域', `测试 · ${s.name}数据域`)
    result.client = await capture(`/admin/v1/channels/${result.channel.channel_id}/clients`, () => confirm(), 201)
    await page.getByRole('tab', { name: '接入 Key', exact: true }).click()
    await button(page, '创建 Key').click()
    await dialog().getByLabel('名称', { exact: true }).fill('接入验证凭据')
    await choose(dialog(), '环境', '测试')
    for (const action of ['执行能力', '查看运行元数据', '查看运行内容', '读取敏感原文']) await choose(dialog(), '可调用能力', action)
    await choose(dialog(), '接入服务', '验证后端 · 测试')
    await dialog().getByLabel('有效期至').fill(config.expires)
    result.key = await capture(`/admin/v1/channels/${result.channel.channel_id}/keys`, () => button(dialog(), '确认').click(), 201)
    await expect(page.getByLabel('完整 Key')).toBeVisible()
    await button(page, '完成').click()
    await page.goto(`${config.web}/integrations`)
    await page.getByRole('tab', { name: '身份委托', exact: true }).click()
    await button(page, '创建委托密钥').click()
    await selected(dialog(), '接入服务', '验证后端')
    await dialog().getByLabel('签发者').fill('controlled-source')
    await dialog().getByLabel('受众').fill('creativity-api')
    await dialog().getByLabel('密钥到期时间').fill(config.expires)
    result.delegation = await capture('/admin/v1/delegation-keys', () => button(dialog(), '确认').click(), 201)
    await expect(page.getByRole('textbox', { name: '委托签名密钥', exact: true })).toBeVisible()
    await button(page, '完成').click()
  } else {
    if (!config.sessionToken) await enter(config.scenario.name)
    if (config.stage === 'resources') {
      await page.goto(`${config.web}/mcp-connections`)
      await button(page, '新增连接').click()
      await dialog().getByLabel('连接名称', { exact: true }).fill('验证源服务')
      await dialog().getByLabel('服务地址').fill(config.endpoint)
      result.connection = await capture('/admin/v1/mcp-connections', () => confirm(), 201)
      await page.getByRole('link', { name: '验证源服务', exact: true }).click()
      await button(page, '更新凭据').click()
      await dialog().getByLabel('服务令牌').fill('fixture-service-only')
      await confirm()
      const connectionId = result.connection.connection_id
      result.discovery = await capture(`/admin/v1/mcp-connections/${connectionId}/discover`, () => button(page, '发现工具').click())
      await capture(`/admin/v1/mcp-connections/${connectionId}/enable`, () => button(page, '启用').click())
      await page.getByRole('tab', { name: '远程工具', exact: true }).click()
      await button(page, '导入草稿').click()
      await dialog().getByLabel('本地显示名称').fill('授权查询工具')
      await dialog().getByLabel('负责人').fill('接入验证人员')
      await choose(dialog(), '实际影响', '只读')
      await choose(dialog(), '必要业务权限', '执行能力', 'run:create')
      result.imported = await capture(`/admin/v1/mcp-connections/${connectionId}/imports`, () => confirm('导入草稿'), 201)
      await page.goto(`${config.web}/tools/${result.imported.local_tool_id}`)
      await capture(`/admin/v1/tool-versions/${result.imported.imported_version}/freeze`, () => button(page, '冻结版本').click())
      await button(page, '发布到当前环境').click()
      await capture(`/admin/v1/tools/${result.imported.local_tool_id}/releases`, () => confirm('发布'))
      await page.goto(`${config.web}/integrations`)
      await button(page, '配置主体复核').click()
      await selected(dialog(), '接入服务', '验证后端')
      // 此控件没有 HTML id，按表单标签定位它所属的选择器。
      await dialog().locator('.ant-form-item').filter({ hasText: /^MCP 连接/ }).getByRole('combobox').click()
      await page.locator('.ant-select-dropdown:visible').getByText('验证源服务', { exact: true }).click()
      await choose(dialog(), '身份复核工具', '当前主体权限')
      result.review = await capture('/admin/v1/subject-review-bindings', () => confirm('保存'))
      await page.goto(`${config.web}/skills`)
      await button(page, '导入技能包').click()
      await dialog().getByLabel('技能编码').fill('shared_skill')
      await dialog().getByLabel('本地显示名称').fill('配置接入技能')
      await dialog().getByLabel('负责人').fill('接入验证人员')
      await dialog().locator('input[type=file]').setInputFiles(config.skillPackage)
      await selected(dialog(), `工具依赖：${config.remoteTool} · 初始版本`, '授权查询工具')
      result.skill = await capture('/admin/v1/skills/imports', () => button(dialog(), '保存').click(), 201)
      await expect(dialog()).toBeHidden()
      await button(page, '冻结版本').click()
      result.frozenSkill = await capture(`/admin/v1/skill-versions/${result.skill.versions[0].version_id}/freeze`, () => confirm('冻结'))
    } else if (config.stage === 'agent') {
      await page.goto(`${config.web}/agents`)
      await button(page, '新增智能体').click()
      await dialog().getByLabel('调用编码').fill('shared_agent')
      await dialog().getByLabel('智能体名称').fill('配置接入助手')
      await dialog().getByLabel('用途').fill('处理授权源数据')
      await dialog().getByLabel('负责人').fill('接入验证人员')
      await selected(dialog(), '流程模板', '通用流程')
      await button(dialog(), '下一步').click()
      for (const [field, label] of Object.entries({ input_schema: '输入结构', output_schema: '输出结构', steps: '步骤配置', edges: '流转条件' })) {
        await dialog().getByLabel(label, { exact: true }).fill(JSON.stringify(config.definition[field]))
      }
      await dialog().getByLabel('起始步骤').fill('lookup')
      await button(dialog(), '下一步').click()
      await selected(dialog(), '提示词版本', '配置样例提示词')
      await selected(dialog(), '模型路由版本', '验证模型路由')
      await selected(dialog(), '工具白名单', '授权查询工具')
      await selected(dialog(), '技能版本', '配置接入技能')
      await choose(dialog(), '加载方式', '始终加载')
      await choose(dialog(), '加载参考资料', 'references/output.md')
      await button(dialog(), '下一步').click()
      await dialog().getByLabel('运行限时（秒）', { exact: true }).fill('180')
      result.agent = await capture('/admin/v1/agents', () => button(dialog(), '保存草稿').click(), 201)
      await expect(dialog()).toBeHidden()
      const versionId = result.agent.versions[0].version_id
      result.validation = await capture(`/admin/v1/agent-versions/${versionId}/validate`, () => button(page, '校验').click())
      expect(result.validation.valid, JSON.stringify(result.validation)).toBe(true)
      await page.getByRole('tab', { name: '调试', exact: true }).click()
      for (const [key, value] of Object.entries(config.scenario.input)) {
        await page.getByLabel(config.definition.input_schema.properties[key].title, { exact: true })
          .fill(typeof value === 'string' ? value : JSON.stringify(value))
      }
      result.debug = await capture(`/admin/v1/agent-versions/${versionId}/tests`, () => button(page, '开始调试').click())
      await expect(page.getByText('工具缺少符合约定的受信业务主体', { exact: true }).first()).toBeVisible({ timeout: 30000 })
      await button(page, '发布').click()
      await dialog().getByLabel('发布说明').fill('23 受控测试环境配置验证')
      result.release = await capture(`/admin/v1/agents/${result.agent.agent.agent_id}/releases`, () => confirm('确认发布'))
      await page.getByRole('tab', { name: '发布记录', exact: true }).click()
      await expect(page.getByRole('cell', { name: '23 受控测试环境配置验证', exact: true })).toBeVisible()
      if (config.screenshot) await page.screenshot({ path: config.screenshot, fullPage: true, animations: 'disabled' })
    } else {
      throw new Error('未知验证步骤')
    }
  }
  expect(errors).toEqual([])
  result.requests = requests
  // 复用真实会话以遵守登录限流；Token 只经管道交回父进程，不进入证据。
  result.sessionToken = await page.evaluate(() => sessionStorage.getItem('creativity.management.token'))
  process.stdout.write(JSON.stringify(result))
} catch (error) {
  // 失败只输出操作错误；响应正文可能含一次性秘密，不写入诊断日志。
  let detail = error.stack
  if (config.stage === 'agent') detail += `\n调试回执：${JSON.stringify(result.debug)}\n页面：${await page.locator('body').innerText()}`
  for (const secret of [config.sessionToken, result.sessionToken, result.key?.api_key, result.delegation?.signing_secret, result.auth?.access_token].filter(Boolean)) detail = detail.replaceAll(secret, '[已脱敏]')
  process.stderr.write(`${config.stage}: ${detail}\n`)
  process.exitCode = 1
} finally {
  await page.unrouteAll({ behavior: 'wait' })
  await browser.close()
}
