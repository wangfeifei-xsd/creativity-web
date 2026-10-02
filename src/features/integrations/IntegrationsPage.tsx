import { Button, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { DelegationKeys } from './DelegationKeys'
import { IntegrationEditor } from './IntegrationEditor'

export function IntegrationsPage() {
  const id = useParams()['*']?.split('/')[0]
  return id ? <IntegrationDetail key={id} id={id} /> : <IntegrationList />
}

function IntegrationList() {
  const query = useQuery<Schema<'IntegrationList'>>('/admin/v1/integrations')
  const { session } = useSession()
  const [creating, setCreating] = useState(false)
  return <PageContainer title="业务接入" actions={<Space><Button onClick={query.reload}>刷新</Button>
    {session.navigation.some(item => item.navigation_key === 'mcp-connections') && <Link to="/mcp-connections">MCP 工具连接</Link>}
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ 'integration:create': () => setCreating(true) }} /></Space>}>
    <Tabs items={[{ key: 'connections', label: '旧 HTTP 连接', children: query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="integration_id" dataSource={query.data.items} scroll={{ x: 780 }} columns={[
        { title: '接入名称', render: (_, row) => <Link to={`/integrations/${row.integration_id}`}>{row.name}</Link> },
        { title: '环境', dataIndex: 'environment_name' }, { title: '数据域', dataIndex: 'data_scope_name' },
        { title: '适配器', dataIndex: 'adapter_name' }, { title: '版本', dataIndex: 'adapter_version' },
        { title: '连接健康', dataIndex: 'health_name' }, { title: '状态', dataIndex: 'status_name' },
      ]} /> }, ...(session.actions.some(a => a.action_key === 'key:manage')
        ? [{ key: 'delegation', label: '身份委托', children: <DelegationKeys /> }] : [])]} />
    {creating && <IntegrationEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); query.reload() }} />}
  </PageContainer>
}

function IntegrationDetail({ id }: { id: string }) {
  const query = useQuery<Schema<'IntegrationView'>>(`/admin/v1/integrations/${id}`)
  const capabilities = useQuery<Schema<'BusinessCapabilityView'>[]>(`/admin/v1/integrations/${id}/capabilities`)
  const tests = useQuery<Schema<'ContractTestView'>[]>(`/admin/v1/integrations/${id}/tests`)
  const [editing, setEditing] = useState(false)
  const [testing, setTesting] = useState(false)
  function reload() { query.reload(); capabilities.reload(); tests.reload() }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  const row = query.data
  if (!row) return <LoadingState />
  return <PageContainer title={row.name} actions={<Space wrap><Link to="/integrations">返回业务接入</Link><Button onClick={reload}>刷新</Button>
    <ActionButtons actions={row.actions} handlers={{ 'integration:edit': () => setEditing(true), 'integration:test': () => setTesting(true) }} /></Space>}>
    <Descriptions items={[{ key: 'env', label: '环境', children: row.environment_name },
      { key: 'scope', label: '数据域', children: row.data_scope_name },
      { key: 'adapter', label: '适配器', children: `${row.adapter_name} · ${row.adapter_version}` },
      { key: 'health', label: '连接健康', children: row.health_name }, { key: 'status', label: '状态', children: row.status_name },
      { key: 'endpoint', label: '业务服务地址', children: row.business_endpoint }]} />
    <Tabs items={[{ key: 'capabilities', label: '旧协议能力', children: <><ErrorNotice error={capabilities.error} />
      <Table rowKey="operation" loading={!capabilities.data && !capabilities.error} dataSource={capabilities.data} pagination={false} columns={[
        { title: '能力', dataIndex: 'name' }, { title: '支持状态', render: (_, c) => c.supported ? '已实现' : '不支持' },
        { title: '连接授权', render: (_, c) => c.allowed ? '已授权' : '未授权' },
        { title: '匿名访问', render: (_, c) => c.public ? '公开只读' : '需登录主体' },
        { title: '契约验证', render: (_, c) => <Tag color={c.verified ? 'success' : 'default'}>{c.verified ? '已通过' : '待验证'}</Tag> },
      ]} /></> }, { key: 'tests', label: '契约测试', children: <><ErrorNotice error={tests.error} />
      <Table rowKey="test_id" dataSource={tests.data} loading={!tests.data && !tests.error} columns={[
        { title: '测试时间', render: (_, t) => formatTimestamp(t.created_at) }, { title: '结果', dataIndex: 'state_name' },
        { title: '配置修订', dataIndex: 'config_revision' },
      ]} expandable={{ expandedRowRender: t => <Table rowKey="operation" dataSource={t.results} pagination={false} columns={[
        { title: '能力', dataIndex: 'name' }, { title: '结论', dataIndex: 'message' },
        { title: '数据条数', render: (_, r) => r.item_count == null ? '未返回' : `${r.item_count} 条` },
      ]} /> }} /></> }]} />
    {editing && <IntegrationEditor row={row} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload() }} />}
    {testing && <ContractTest row={row} capabilities={capabilities.data ?? []} onClose={() => setTesting(false)} onSaved={() => { setTesting(false); reload() }} />}
  </PageContainer>
}

function ContractTest({ row, capabilities, onClose, onSaved }: { row: Schema<'IntegrationView'>;
  capabilities: Schema<'BusinessCapabilityView'>[]; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ operation: string; arguments: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const submitting = useRef(false)
  return <Modal open title="契约测试" onCancel={onClose} closable={!busy} maskClosable={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>运行测试</Button></Space>}>
    <ErrorNotice error={error} />
    <Form form={form} layout="vertical" initialValues={{ arguments: '{}' }} disabled={busy} onFinish={async values => {
      if (submitting.current) return
      submitting.current = true; setBusy(true); setError(undefined)
      try { await send(`/admin/v1/integrations/${row.integration_id}/tests`, 'POST', {
        revision: row.revision, cases: [{ operation: values.operation, arguments: JSON.parse(values.arguments) as unknown }],
      }); onSaved() }
      catch (failure) { setError(failure) }
      finally { submitting.current = false; setBusy(false) }
    }}>
      <Form.Item name="operation" label="能力" rules={[{ required: true }]}><Select options={capabilities.filter(c => c.allowed && c.supported).map(c => ({ value: c.operation, label: c.name }))} /></Form.Item>
      <Form.Item name="arguments" label="查询参数" rules={[{ required: true }]}><Input.TextArea rows={5} /></Form.Item>
    </Form>
  </Modal>
}
