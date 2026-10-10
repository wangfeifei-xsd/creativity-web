import { Alert, Flex, Segmented, Tree, Typography } from 'antd'
import { Table } from '../../components/Table'
import { fileTree } from './file-tree'
import { useState } from 'react'
import { useQuery } from '../../api/useQuery'
import type { Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { MarkdownContent } from '../../components/MarkdownContent'
import './skill-files.css'

export function SkillFiles({ version }: { version: Schema<'SkillVersionView'> }) {
  const [selected, setSelected] = useState('SKILL.md')
  const [mode, setMode] = useState<'formatted' | 'source'>('formatted')
  const query = useQuery<Schema<'SkillFileContent'>>(`/admin/v1/skill-versions/${version.version_id}/files?path=${encodeURIComponent(selected)}`)
  const markdown = /\.(md|markdown)$/i.test(selected) || version.files.find(file => file.relative_path === selected)?.content_type === 'text/markdown'
  return <><div className="skill-files-layout">
    <div className="skill-files-tree"><Tree blockNode defaultExpandAll treeData={fileTree(version.files.map(f => f.relative_path))} selectedKeys={[selected]}
      titleRender={node => <span title={String(node.key)}>{String(node.title)}</span>}
      onSelect={keys => { if (keys[0]) setSelected(String(keys[0])) }} /></div>
    <div className="skill-files-content">{query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
      <Flex align="center" justify="space-between" wrap gap="small" className="skill-files-heading">
        <Typography.Title level={5} style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{selected}</Typography.Title>
        {markdown && query.data.text != null && <Segmented aria-label="文件展示方式" value={mode} onChange={setMode} options={[
          { label: '格式化', value: 'formatted' }, { label: '源文件', value: 'source' },
        ]} />}
      </Flex>
      {query.data.unavailable_reason && <Alert type="warning" title={query.data.unavailable_reason} />}
      <div className="skill-files-preview">
        {query.data.text != null && markdown && mode === 'formatted'
          ? <MarkdownContent text={query.data.text} renderLink={(href, children) => {
            if (!href) return children
            try {
              const target = new URL(href, `https://skill.invalid/${selected}`)
              const path = decodeURIComponent(target.pathname.slice(1))
              if (target.origin !== 'https://skill.invalid' || !version.files.some(file => file.relative_path === path)) return children
              return <a href={`#${path}`} onClick={event => { event.preventDefault(); setSelected(path) }}>{children}</a>
            } catch { return children }
          }} />
          : <pre className="skill-files-source">{query.data.text ?? '此文件不能作为文本预览'}</pre>}
      </div>
    </>}</div>
  </div><Table rowKey="relative_path" size="small" dataSource={version.files} scroll={{ x: 600 }} columns={[
    { title: '文件路径', dataIndex: 'relative_path' }, { title: '大小', render: (_, file) => `${file.size_bytes} 字节` },
    { title: '加载状态', render: (_, file) => file.unavailable_reason ?? '可加载' },
  ]} /></>
}
