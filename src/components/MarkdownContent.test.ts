import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

const render = (text: string) => renderToStaticMarkup(createElement(MarkdownContent, { text }))

describe('Markdown 内容展示', () => {
  it('渲染标题、强调、列表、表格和代码块', () => {
    const html = render('# 操作指南\n\n**核对订单**\n\n- 查看状态\n- 确认下一步\n\n| 项目 | 说明 |\n| --- | --- |\n| 租金 | 按订单约定 |\n\n```json\n{"ok": true}\n```')
    expect(html).toContain('<h1>操作指南</h1>')
    expect(html).toContain('<strong>核对订单</strong>')
    expect(html).toContain('<li>查看状态</li>')
    expect(html).toContain('<th>项目</th>')
    expect(html).toContain('<td>按订单约定</td>')
    expect(html).toContain('<pre><code class="language-json">')
  })

  it('将文件头元数据与 Markdown 正文分开', () => {
    const html = render('---\n{"name": "内部技能名称"}\n---\n\n## 核对事实\n\n这是用户可读的指令。')
    expect(html).toContain('<h2>核对事实</h2>')
    expect(html).not.toContain('内部技能名称')
    expect(html).not.toContain('<hr')
  })

  it('不执行文件中的 HTML，也不生成危险协议链接', () => {
    const html = render('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[危险链接](javascript:alert%281%29)\n\n[文档](https://example.com/guide)')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror=')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('href="https://example.com/guide" target="_blank" rel="noopener noreferrer"')
  })
})
