import { App, Button, Descriptions, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { ImportDialog } from './ImportDialog'

const base = '/admin/v1/mcp-connections' as const
const json = (value: unknown) => <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(value, null, 2)}</pre>

export function McpPage() {
  const params = useParams()
  const id = params['*']?.split('/')[0]
  return id ? <McpDetail key={id} id={id} /> : <Connections />
}

function Connections() {
  const query = useQuery<Schema<'McpList'>>(base)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  return <PageContainer title="MCP 连接" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true) }} /></Space>}>
    <Input.Search aria-label="连接名称" placeholder="连接名称" allowClear onSearch={setSearch} style={{ maxWidth: 320, marginBottom: 16 }} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="connection_id" scroll={{ x: 720 }} dataSource={query.data.items.filter(row => row.name.includes(search))} columns={[
        { title: '连接名称', render: (_, row) => <Link to={`/mcp-connections/${row.connection_id}`}>{row.name}</Link> },
        { title: '连接方式', dataIndex: 'transport_label' },
        { title: '启用状态', render: (_, row) => <StatusTag status={row.status} /> },
        { title: '健康状态', render: (_, row) => <StatusTag status={row.health} /> },
        { title: '最近检查', render: (_, row) => formatTimestamp(row.last_check_at) },
      ]} />}
    {creating && <ConnectionEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); query.reload() }} />}
  </PageContainer>
}

function ConnectionEditor({ connection, onClose, onSaved }: { connection?: Schema<'McpConnection'>; onClose: () => void; onSaved: () => void }) {
  return <EditorDialog title={connection ? '编辑连接' : '新增连接'} onClose={onClose} onSaved={onSaved}
    initial={{ name: connection?.name, endpoint: connection?.endpoint, transport: 'streamable_http',
      connect_seconds: connection?.timeouts.connect_seconds ?? 10, operation_seconds: connection?.timeouts.operation_seconds ?? 30,
      interval_seconds: connection?.health_policy.interval_seconds ?? 300, failure_threshold: connection?.health_policy.failure_threshold ?? 3 }}
    fields={[
      { name: 'name', label: '连接名称', required: true }, { name: 'endpoint', label: '服务地址', required: true },
      { name: 'connect_seconds', label: '连接超时（秒）', kind: 'number', min: 1, max: 30, required: true },
      { name: 'operation_seconds', label: '操作超时（秒）', kind: 'number', min: 1, max: 120, required: true },
      { name: 'interval_seconds', label: '检查间隔（秒）', kind: 'number', min: 30, max: 86400, required: true },
      { name: 'failure_threshold', label: '连续失败阈值（次）', kind: 'number', min: 1, max: 10, required: true },
    ]} onSave={values => send(connection ? `${base}/${connection.connection_id}` : base, connection ? 'PATCH' : 'POST', {
      ...(connection ? { revision: connection.revision } : {}), name: values.name, endpoint: values.endpoint, transport: 'streamable_http',
      timeouts: { connect_seconds: values.connect_seconds, operation_seconds: values.operation_seconds },
      health_policy: { interval_seconds: values.interval_seconds, failure_threshold: values.failure_threshold },
    })}>
    <Select aria-label="连接方式" style={{ width: '100%' }} value="streamable_http" options={[
      { value: 'streamable_http', label: 'Streamable HTTP' }, { value: 'stdio', label: '本地进程（暂不可用）', disabled: true },
      { value: 'oauth', label: 'OAuth 用户委托（暂不可用）', disabled: true },
    ]} />
  </EditorDialog>
}

function McpDetail({ id }: { id: string }) {
  const { modal } = App.useApp()
  const query = useQuery<Schema<'McpDetail'>>(`${base}/${id}`)
  const [editor, setEditor] = useState<'connection' | 'credential'>()
  const [selected, setSelected] = useState<string>()
  const [importing, setImporting] = useState<Schema<'RemoteTool'>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [feedback, setFeedback] = useState<Schema<'McpCheck'>>()
  const detail = query.data
  const snapshot = detail?.discoveries.find(item => item.discovery_id === selected) ?? detail?.discoveries[0]
  const diff = useQuery<Schema<'McpDiff'>>(snapshot ? `${base}/${id}/discoveries/${snapshot.discovery_id}/diff` : null)
  const impact = useQuery<Schema<'McpImpact'>>(`${base}/${id}/impact`)
  async function act(action: string) {
    if (!detail || busy) return
    setBusy(true); setError(undefined); setFeedback(undefined)
    try {
      const result = await send<Schema<'McpCheck'> | Schema<'McpDiscovery'> | Schema<'McpConnection'>>(`${base}/${id}/${action}`, 'POST',
        ['enable', 'disable'].includes(action) ? { revision: detail.connection.revision } : undefined)
      if ('check_id' in result) setFeedback(result)
      query.reload(); impact.reload()
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  async function disable() {
    try {
      const current = await apiClient.request<Schema<'McpImpact'>>(`${base}/${id}/impact`)
      modal.confirm({ title: '停用连接', content: <><p>{current.message}</p><p>关联工具 {current.tools.length} 个，在途调用 {current.ongoing_calls} 次。</p></>,
        okText: '停用', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => act('disable') })
    } catch (failure) { setError(failure) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail) return <LoadingState />
  const connection = detail.connection
  return <PageContainer title={connection.name} actions={<Space wrap><Link to="/mcp-connections">返回连接列表</Link>
    <Button disabled={busy} onClick={query.reload}>刷新</Button><ActionButtons disabled={busy} actions={connection.actions} handlers={{
      edit: () => setEditor('connection'), credential: () => setEditor('credential'), test: () => void act('test'),
      discover: () => void act('discover'), enable: () => void act('enable'), disable: () => void disable(),
    }} /></Space>}>
    <ErrorNotice error={error} />
    {feedback && <Typography.Paragraph type={feedback.error_category ? 'danger' : undefined}>{feedback.error_message ?? '连接测试通过'}</Typography.Paragraph>}
    <Descriptions items={[
      { key: 'status', label: '启用状态', children: <StatusTag status={connection.status} /> },
      { key: 'health', label: '健康状态', children: <StatusTag status={connection.health} /> },
      { key: 'checked', label: '最近检查', children: formatTimestamp(connection.last_check_at) },
    ]} />
    <Tabs items={[
      { key: 'basic', label: '基本配置', children: <Descriptions column={1} items={[
        { key: 'transport', label: '连接方式', children: connection.transport_label },
        { key: 'endpoint', label: '服务地址', children: <Typography.Text style={{ overflowWrap: 'anywhere' }}>{connection.endpoint}</Typography.Text> },
        { key: 'timeout', label: '操作超时', children: `${connection.timeouts.operation_seconds} 秒` },
        { key: 'interval', label: '检查间隔', children: `${connection.health_policy.interval_seconds} 秒` },
        { key: 'threshold', label: '连续失败阈值', children: `${connection.health_policy.failure_threshold} 次` },
      ]} /> },
      { key: 'auth', label: '鉴权', children: <Descriptions items={[{ key: 'token', label: '服务凭据', children: connection.credential_mask ?? '未配置' }]} /> },
      { key: 'test', label: '连接测试', children: <Table rowKey="check_id" scroll={{ x: 700 }} dataSource={detail.checks} expandable={{ expandedRowRender: row => <>{json(row.server_info)}{json(row.capabilities)}</> }} columns={[
        { title: '检查时间', render: (_, row) => formatTimestamp(row.checked_at) }, { title: '协商协议', render: (_, row) => row.negotiated_version ?? '未完成协商' },
        { title: '健康状态', render: (_, row) => <StatusTag status={row.health} /> },
        { title: '耗时', render: (_, row) => row.latency_ms == null ? '未记录' : `${row.latency_ms} 毫秒` },
        { title: '检查结果', render: (_, row) => row.error_message ?? '检查通过' },
      ]} /> },
      { key: 'tools', label: '远程工具', children: <><Select aria-label="发现快照" placeholder="暂无发现快照" style={{ minWidth: 240, marginBottom: 16 }}
        value={snapshot?.discovery_id} onChange={setSelected} options={detail.discoveries.map(row => ({ value: row.discovery_id, label: formatTimestamp(row.discovered_at) }))} />
        <Table rowKey="name" scroll={{ x: 700 }} dataSource={snapshot?.tools ?? []} expandable={{ expandedRowRender: row => <><Descriptions items={[{ key: 'name', label: '远端工具名', children: row.name }]} />{json(row.input_schema)}{json(row.output_schema)}</> }} columns={[
          { title: '工具名称', render: (_, row) => detail.imports.find(item => item.remote_tool_name === row.name)?.name ?? row.title ?? '待补充显示名称' },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          { title: '变化', render: (_, row) => diff.data ? diff.data.items.find(item => item.remote_tool_name === row.name)?.labels.join('、') ?? '无变化' : diff.error ? '差异不可用' : '差异待加载' },
          { title: '导入版本', render: (_, row) => { const imported = detail.imports.find(item => item.discovery_id === snapshot?.discovery_id && item.remote_tool_name === row.name)
            return imported ? <Link to={`/tools/${imported.local_tool_id}`}>查看本地版本</Link> : '未导入' } },
          { title: '操作', render: (_, row) => connection.actions.some(action => action.action_key === 'import') ? <Button disabled={busy} onClick={() => setImporting(row)}>导入草稿</Button> : null },
        ]} /></> },
      { key: 'diff', label: '同步差异', children: diff.error ? <ErrorState error={diff.error} onRetry={diff.reload} /> :
        <Table rowKey="remote_tool_name" dataSource={diff.data?.items ?? []} columns={[
          { title: '工具名称', render: (_, row) => row.name ?? '待补充显示名称' }, { title: '变化', render: (_, row) => row.labels.join('、') },
          { title: '影响', render: (_, row) => row.breaking ? <Tag color="error">需要新版本及重新验证</Tag> : '可审阅导入' },
        ]} /> },
      { key: 'agents', label: '引用影响', children: <><Table rowKey="import_id" dataSource={detail.imports} columns={[
        { title: '本地工具', render: (_, row) => <Link to={`/tools/${row.local_tool_id}`}>{row.name}</Link> },
        { title: '连接可用性', render: (_, row) => row.unavailable_reason ?? '连接可用' },
      ]} />{impact.error ? <ErrorState error={impact.error} onRetry={impact.reload} /> : <Table rowKey="version_id"
        dataSource={impact.data?.tools.flatMap(tool => tool.references) ?? []} columns={[
          { title: '关联资源', render: (_, row) => row.resource_name ?? '名称不可用' }, { title: '引用版本', dataIndex: 'version_label' },
        ]} />}</> },
      { key: 'calls', label: '运行记录', children: <Space orientation="vertical">{detail.imports.map(item => <Link key={item.import_id} to={`/tools/${item.local_tool_id}`}>查看“{item.name}”的调用记录</Link>)}</Space> },
    ]} />
    {editor === 'connection' && <ConnectionEditor connection={connection} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} />}
    {editor === 'credential' && <EditorDialog title="更新服务凭据" fields={[{ name: 'token', label: '服务令牌', kind: 'password', required: true }]}
      onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }}
      onSave={values => send(`${base}/${id}/credentials`, 'POST', { revision: connection.revision, token: values.token })} />}
    {importing && snapshot && <ImportDialog id={id} snapshot={snapshot} tool={importing} targets={detail.imports} onClose={() => setImporting(undefined)} onSaved={() => { setImporting(undefined); query.reload() }} />}
  </PageContainer>
}
