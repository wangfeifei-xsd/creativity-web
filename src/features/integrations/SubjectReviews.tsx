import { Button, Form, InputNumber, Modal, Select, Space, Switch, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

const base = '/admin/v1/subject-review-bindings'

export function SubjectReviews() {
  const query = useQuery<Schema<'SubjectReviewView'>[]>(base)
  const [editing, setEditing] = useState<Schema<'SubjectReviewView'> | 'new'>()
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Space><Button type="primary" onClick={() => setEditing('new')}>配置主体复核</Button><Button onClick={query.reload}>刷新</Button></Space>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="binding_id" dataSource={query.data} scroll={{ x: 700 }} columns={[
        { title: '接入服务', dataIndex: 'client_name' },
        { title: '身份复核连接', render: (_, row) => <Link to={`/mcp-connections/${row.connection_id}`}>{row.connection_name}</Link> },
        { title: '身份工具', dataIndex: 'tool_name' },
        { title: '状态', render: (_, row) => <Tag color={row.unavailable_reason ? 'warning' : 'success'}>{row.status_name}</Tag> },
        { title: '原因', render: (_, row) => row.unavailable_reason ?? '当前配置可用' },
        { title: '操作', render: (_, row) => <Button onClick={() => setEditing(row)}>编辑</Button> },
      ]} />}
    {editing && <ReviewEditor row={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)}
      onSaved={() => { setEditing(undefined); query.reload() }} />}
  </Space>
}

function ReviewEditor({ row, onClose, onSaved }: { row?: Schema<'SubjectReviewView'>; onClose: () => void; onSaved: () => void }) {
  const clients = useQuery<Schema<'NamedOption'>[]>(`${base}/options`)
  const connections = useQuery<Schema<'McpList'>>('/admin/v1/mcp-connections')
  const [connectionId, setConnectionId] = useState<string | undefined>(row?.connection_id)
  const detail = useQuery<Schema<'McpDetail'>>(connectionId ? `/admin/v1/mcp-connections/${connectionId}` : null)
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const snapshot = detail.data?.discoveries[0]
  return <Modal open title={row ? '编辑主体复核' : '配置主体复核'} onCancel={onClose} closable={!busy} maskClosable={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button type="primary" loading={busy}
      disabled={!snapshot || !!clients.error || !!connections.error} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error ?? clients.error ?? connections.error ?? detail.error} />
    <Form form={form} layout="vertical" disabled={busy} initialValues={{ ...row, timeout_seconds: row?.timeout_seconds ?? 5, enabled: row?.enabled ?? true }}
      onFinish={async values => {
        if (busy || !snapshot) return
        setBusy(true); setError(undefined)
        try {
          await send(base, 'POST', { ...values, connection_id: connectionId, discovery_id: snapshot.discovery_id, revision: row?.revision })
          onSaved()
        } catch (failure) { setError(failure) }
        finally { setBusy(false) }
      }}>
      <Form.Item name="client_id" label="接入服务" rules={[{ required: true }]}><Select disabled={!!row} options={clients.data} /></Form.Item>
      <Form.Item label="MCP 连接" required><Select value={connectionId} loading={!connections.data && !connections.error}
        onChange={id => { setConnectionId(id); form.setFieldValue('remote_tool_name', undefined) }}
        options={connections.data?.items.map(item => ({ value: item.connection_id, label: item.name,
          disabled: item.status.value !== 'ENABLED' || !item.credential_mask }))} /></Form.Item>
      <Form.Item name="remote_tool_name" label="身份复核工具" rules={[{ required: true }]}><Select loading={!!connectionId && !detail.data && !detail.error}
        options={snapshot?.tools.filter(tool => tool.purpose === 'subject_review').map(tool => ({ value: tool.name, label: tool.title ?? '待补充显示名称' }))} /></Form.Item>
      <Form.Item name="timeout_seconds" label="复核超时（秒）" rules={[{ required: true }]}><InputNumber min={1} max={30} /></Form.Item>
      <Form.Item name="enabled" label="启用复核" valuePropName="checked"><Switch /></Form.Item>
    </Form>
  </Modal>
}
