import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ManagementAppearanceContext } from '../app/management/context'
import { StatusTag } from './StatusTag'

function render(props: ComponentProps<typeof StatusTag>, enabled = true) {
  return renderToStaticMarkup(createElement(ManagementAppearanceContext, { value: enabled }, createElement(StatusTag, props)))
}

describe('统一状态标签', () => {
  it('旧接口的启用、完成和发布文案使用相同成功样式', () => {
    for (const label of ['启用', '已启用', '已完成', '已发布', '验证通过']) {
      const html = render({ label })
      expect(html).toContain('ant-tag-success')
      expect(html).toContain('management-status-tag')
      expect(html).toContain(label)
    }
  })

  it('否定和部分完成不会被误标为成功', () => {
    for (const label of ['未启用', '未发布', '未完成', '已停用', '草稿']) expect(render({ label })).toContain('ant-tag-default')
    expect(render({ label: '未通过' })).toContain('ant-tag-error')
    expect(render({ label: '部分完成' })).toContain('ant-tag-warning')
    expect(render({ label: '执行中' })).toContain('ant-tag-processing')
  })

  it('保留服务端为同名状态明确指定的语义', () => {
    expect(render({ status: { value: 'ACTIVE', label: '启用', tone: 'warning' } })).toContain('ant-tag-warning')
    expect(render({ status: { value: 'QUEUED', label: '排队中', tone: 'default' } })).toContain('ant-tag-default')
  })

  it('缺失文案保持不可用，不显示编码或误用成功色', () => {
    const html = render({ status: { value: 'PUBLISHED', label: ' ', tone: 'success' } })
    expect(html).toContain('状态不可用')
    expect(html).not.toContain('PUBLISHED')
    expect(html).not.toContain('ant-tag-success')
  })

  it('保留未知文案并使用中性色，支持调用方明确指定语义', () => {
    expect(render({ label: '等待供应商复核' })).toContain('ant-tag-default')
    expect(render({ label: '等待供应商复核' })).toContain('等待供应商复核')
    expect(render({ label: '等待供应商复核', tone: 'warning' })).toContain('ant-tag-warning')
  })

  it('排除页面维持原标签，不添加管理页修饰', () => {
    const html = render({ status: { value: 'PUBLISHED', label: '已发布', tone: 'success' } }, false)
    expect(html).toContain('ant-tag-success')
    expect(html).not.toContain('management-status')
  })
})
