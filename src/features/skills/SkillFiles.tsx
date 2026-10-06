import { Alert, Col, Row, Tree, Typography } from 'antd'
import { Table } from '../../components/Table'
import { fileTree } from './file-tree'
import { useState } from 'react'
import { useQuery } from '../../api/useQuery'
import type { Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'


export function SkillFiles({ version }: { version: Schema<'SkillVersionView'> }) {
  const [selected, setSelected] = useState('SKILL.md')
  const query = useQuery<Schema<'SkillFileContent'>>(`/admin/v1/skill-versions/${version.version_id}/files?path=${encodeURIComponent(selected)}`)
  return <><Row gutter={[20, 20]}>
    <Col xs={24} md={7}><Tree defaultExpandAll treeData={fileTree(version.files.map(f => f.relative_path))} selectedKeys={[selected]}
      onSelect={keys => { if (keys[0]) setSelected(String(keys[0])) }} /></Col>
    <Col xs={24} md={17}>{query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
      <Typography.Title level={5}>{selected}</Typography.Title>
      {query.data.unavailable_reason && <Alert type="warning" title={query.data.unavailable_reason} />}
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 480, overflowY: 'auto' }}>{query.data.text ?? '此文件不能作为文本预览'}</pre>
    </>}</Col>
  </Row><Table rowKey="relative_path" size="small" dataSource={version.files} scroll={{ x: 600 }} columns={[
    { title: '文件路径', dataIndex: 'relative_path' }, { title: '大小', render: (_, file) => `${file.size_bytes} 字节` },
    { title: '加载状态', render: (_, file) => file.unavailable_reason ?? '可加载' },
  ]} /></>
}
