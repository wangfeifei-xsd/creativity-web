import { Button, Form, Input, InputNumber, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { ModelDialog } from './shared'

export function ProvidersPage() {
  const { session } = useSession()
  const query = useQuery<Schema<'ProviderView'>[]>('/admin/v1/model-providers')
  const protocols = useQuery<Schema<'ProtocolView'>[]>('/admin/v1/model-protocols')
  const [editor, setEditor] = useState<{ provider?: Schema<'ProviderView'> }>()
  const row = editor?.provider
  const choices = protocols.data?.map(p => ({ value: p.code, label: p.name }))
  return <PageContainer title="模型供应商" actions={<Space><Button onClick={query.reload}>刷新</Button><ActionButtons actions={session.actions} handlers={{ 'channel:govern': () => setEditor({}) }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="id" dataSource={query.data} columns={[
      { title: '供应商', dataIndex: 'name' }, { title: '协议', render: (_, r) => <Space wrap>{r.protocols.map(p => <Tag key={p}>{protocols.data?.find(i => i.code === p)?.name ?? '名称不可用'}</Tag>)}</Space> },
      { title: '模板地址', render: (_, r) => typeof r.template_content?.endpoint === 'string' ? r.template_content?.endpoint : '未设置' },
      { title: '操作', render: (_, r) => <ActionButtons actions={session.actions} handlers={{ 'channel:govern': () => setEditor({ provider: r }) }} /> },
    ]} />}
    <Table rowKey="code" pagination={false} dataSource={protocols.data} columns={[
      { title: '协议', dataIndex: 'name' }, { title: '适配状态', render: (_, p) => <Tag>{p.enabled ? '已实现，按模型验证' : '未启用'}</Tag> }, { title: '原因', render: (_, p) => p.reason ?? '无' },
    ]} />
    {editor && <ModelDialog title={row ? '编辑供应商' : '新增供应商'} initial={row ? { ...row, ...row.template_content } : { timeout_seconds: 60 }} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} onSave={v => send('/admin/v1/model-providers', 'POST', {
      code: v.code, name: v.name, protocols: v.protocols, revision: row?.revision ?? null,
      template_content: v.endpoint ? { protocol: v.protocol, endpoint: v.endpoint, timeout_seconds: v.timeout_seconds } : {},
    })}>
      <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="code" label="供应商编码" rules={[{ required: true }]}><Input disabled={!!row} /></Form.Item>
      <Form.Item name="protocols" label="协议" rules={[{ required: true }]}><Select mode="multiple" options={choices} /></Form.Item>
      <Form.Item name="protocol" label="模板协议"><Select options={choices} allowClear /></Form.Item>
      <Form.Item name="endpoint" label="模板基础地址"><Input /></Form.Item>
      <Form.Item name="timeout_seconds" label="模板超时（秒）"><InputNumber min={1} max={600} /></Form.Item>
    </ModelDialog>}
  </PageContainer>
}
