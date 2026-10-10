import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessageContent } from './Timeline'

const result = JSON.stringify({ schema_version: '1.0', business_status: 'COMPLETED', data: { 说明: '分支保留回复', record_id: '内部记录' }, evidence_refs: [], warnings: ['请复核'] })
const render = (role: string, text: string) => renderToStaticMarkup(createElement(MessageContent, { role, text, status: 'COMPLETED' }))

describe('会话消息内容', () => {
  it('分支中的完整业务结果显示正文和提醒，隐藏内部封装与标识', () => {
    const html = render('assistant', result)
    expect(html).toContain('分支保留回复')
    expect(html).toContain('请复核')
    expect(html).not.toContain('business_status')
    expect(html).not.toContain('内部记录')
  })

  it('用户提交的相同 JSON 与助手普通文本保持原内容', () => {
    expect(render('user', result)).toContain('business_status')
    expect(render('assistant', '普通回复')).toContain('普通回复')
    expect(render('assistant', '{"data":"正文"}')).toContain('&quot;data&quot;')
  })
})
