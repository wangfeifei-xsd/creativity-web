import { toolPermissionLabel } from './permissionLabel'
import { Button, Descriptions, Input, Select, Space, Tabs, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { useResourceSummaries } from '../resources/useResourceSummaries'
import { resourceColumns } from '../resources/resourceColumns'
import { ResourceActions } from '../resources/ResourceManagement'
import { ToolCalls } from './ToolCalls'
import { ToolTestPanel } from './ToolTestPanel'
import { ToolVersionEditor } from './ToolVersionEditor'

const sources = [{ value: 'http', label: 'HTTP 接口' }, { value: 'mcp', label: 'MCP 工具' }, { value: 'builtin', label: '预置函数' }, { value: 'sandbox', label: '隔离脚本' }]
const effects = [{ value: 'READ_ONLY', label: '只读' }, { value: 'IDEMPOTENT_WRITE', label: '幂等写入' }, { value: 'EXTERNAL_WRITE', label: '外部写入' }]
const json = (value: unknown) => <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(value, null, 2)}</pre>

export function ToolsPage() {
  const params = useParams()
  const toolId = params['*']?.split('/')[0]
  return toolId ? <ToolDetail key={toolId} toolId={toolId} /> : <ToolList />
}

function ToolList() {
  const navigate = useNavigate()
  const [source, setSource] = useState<string>()
  const [effect, setEffect] = useState<string>()
  const [search, setSearch] = useState('')
  const [referencedBy, setReferencedBy] = useState<string>()
  const [creating, setCreating] = useState(false)
  const filters = new URLSearchParams()
  if (source) filters.set('source_type', source)
  if (effect) filters.set('effect_type', effect)
  if (search) filters.set('search', search)
  if (referencedBy) filters.set('referenced_by', referencedBy)
  const query = useQuery<Schema<'ToolList'>>(`/admin/v1/tools?${filters}`)
  const summaries = useResourceSummaries('tool', query.data?.items.map(row => row.tool_id) ?? [], query.data)
  return <PageContainer title="工具管理" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true) }} /></Space>}>
    <Space wrap className="query-filters" style={{ marginBottom: 20 }}>
      <Input.Search aria-label="工具名称或用途" placeholder="工具名称或用途" onSearch={setSearch} allowClear />
      <Select aria-label="来源" placeholder="全部来源" allowClear options={sources} onChange={setSource} style={{ width: 150 }} />
      <Select aria-label="影响类型" placeholder="全部影响类型" allowClear options={effects} onChange={setEffect} style={{ width: 170 }} />
      <Select aria-label="引用智能体" placeholder="全部引用智能体" allowClear style={{ minWidth: 180 }} onChange={setReferencedBy}
        options={query.data?.referenced_agents?.map(ref => ({ value: ref.version_id, label: `${ref.resource_name ?? '名称不可用'} · ${ref.version_label}` }))} />
    </Space>
    <ErrorNotice error={summaries.error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="tool_id" dataSource={query.data.items} scroll={{ x: 780 }} columns={[
        { title: '工具名称', render: (_, row) => <Link to={`/tools/${row.tool_id}`}>{row.name}</Link> },
        { title: '用途', dataIndex: 'description', ellipsis: true }, { title: '来源', dataIndex: 'source_label' },
        { title: '影响类型', render: (_, row) => row.effect_labels.join('、') || '未配置' },
        { title: '负责人', dataIndex: 'owner' },
        ...resourceColumns<Schema<'ToolView'>>('tool', summaries.items, row => row.tool_id, row => navigate(`/tools/${row.tool_id}?edit=1`), query.reload),
      ]} />}
    {creating && <ToolResourceEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); query.reload() }} />}
  </PageContainer>
}

function ToolResourceEditor({ tool, onClose, onSaved }: { tool?: Schema<'ToolView'>; onClose: () => void; onSaved: () => void }) {
  return <EditorDialog title={tool ? '编辑工具' : '新增工具'} initial={tool ? { ...tool } : { source_type: 'builtin' }}
    onClose={onClose} onSaved={onSaved} fields={[
      { name: 'name', label: '工具名称', required: true },
      ...(!tool ? [{ name: 'tool_code', label: '工具编码', required: true }, { name: 'source_type', label: '来源类型', kind: 'select' as const, options: sources, required: true }] : []),
      { name: 'description', label: '用途', required: true }, { name: 'owner', label: '负责人', required: true },
    ]} onSave={values => send(tool ? `/admin/v1/tools/${tool.tool_id}` : '/admin/v1/tools', tool ? 'PATCH' : 'POST', tool
      ? { revision: tool.revision, name: values.name, description: values.description, owner: values.owner } : values)} />
}

function ToolDetail({ toolId }: { toolId: string }) {
  const { session } = useSession()
  const query = useQuery<Schema<'ToolDetail'>>(`/admin/v1/tools/${toolId}`)
  const bindings = useQuery<Schema<'BindingOption'>[]>(`/admin/v1/tool-bindings?tool_id=${toolId}`)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editor, setEditor] = useState<'resource' | 'new' | 'version' | undefined>(() => searchParams.get('edit') === '1' ? 'version' : undefined)
  const [activeTab, setActiveTab] = useState('contract')
  const detail = query.data
  const version = detail?.versions.find(v => v.version.version_id === toolId)
  const summaries = useResourceSummaries('tool', [toolId], query.data)
  const navigate = useNavigate()
  const definition = version?.definition
  const binding = bindings.data?.find(b => b.binding.adapter_key === definition?.binding.adapter_key)
  function closeEditor() {
    setEditor(undefined)
    if (searchParams.has('edit')) {
      const next = new URLSearchParams(searchParams); next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail) return <LoadingState />
  return <PageContainer title={detail.tool.name} actions={<Space wrap><Link to="/tools">返回工具列表</Link>
    <Button onClick={query.reload}>刷新</Button><Button onClick={() => setEditor('resource')}>编辑信息</Button>
    <ResourceActions kind="tool" summary={summaries.items[toolId]} onEdit={() => setEditor('version')} onChanged={() => navigate('/tools')} /></Space>}>
    <Descriptions items={[
      { key: 'source', label: '来源', children: detail.tool.source_label }, { key: 'owner', label: '负责人', children: detail.tool.owner },
      { key: 'state', label: '状态', children: summaries.items[toolId]?.status.label ?? '加载中' },
      { key: 'description', label: '用途', children: detail.tool.description },
    ]} />
    {definition && version ? <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
      { key: 'contract', label: '契约', children: <><Descriptions items={[{ key: 'code', label: '工具编码', children: detail.tool.tool_code }]} />
        <Typography.Title level={5}>输入结构</Typography.Title>{json(definition.input_schema)}
        <Typography.Title level={5}>输出结构</Typography.Title>{json(definition.output_schema)}</> },
      { key: 'binding', label: '连接绑定', children: <Descriptions column={1} items={[
        { key: 'name', label: '来源连接', children: binding?.name ?? '连接名称不可用' },
        { key: 'implementation', label: '实现版本', children: definition.binding.implementation_version },
        { key: 'effect', label: '实际影响', children: effects.find(e => e.value === definition.effect_type)?.label ?? '影响类型未确认' },
        { key: 'execution', label: '执行状态', children: version.unavailable_reason ?? '可执行' },
      ]} /> },
      { key: 'permissions', label: '权限', children: <Descriptions column={1} items={[
        { key: 'environment', label: '环境', children: definition.environments.map(environment => ({ dev: '开发', test: '测试', fat: '验收', prod: '生产' })[environment]).join('、') },
        { key: 'actions', label: '必要授权', children: definition.required_scopes?.map(scope => toolPermissionLabel(scope, session.actions)).join('、') },
        { key: 'subject', label: '主体要求', children: definition.subject_requirements?.required ? '需要受信业务主体' : '使用当前身份' },
      ]} /> },
      { key: 'policy', label: '执行策略', children: <Descriptions column={2} items={[
        { key: 'writeMode', label: '写入授权', children: definition.effect_type === 'READ_ONLY' ? '只读' : definition.write_policy?.authorization_mode === 'preauthorized' ? '预授权自动执行' : '逐次确认' },
        { key: 'timeout', label: '超时', children: `${definition.timeout_seconds} 秒` },
        { key: 'size', label: '结果上限', children: `${definition.max_result_size} 字节` },
        { key: 'attempts', label: '最多尝试', children: `${definition.retry_policy?.max_attempts} 次` },
        { key: 'delay', label: '重试间隔', children: `${definition.retry_policy?.delay_ms} 毫秒` },
        { key: 'ttl', label: '缓存有效期', children: `${definition.cache_policy?.ttl_seconds} 秒` },
        { key: 'freshness', label: '数据最大时效', children: `${definition.cache_policy?.freshness_seconds} 秒` },
      ]} /> },
      { key: 'test', label: '测试', children: <ToolTestPanel key={`${version.version.version_id}:${version.revision}`} version={version} /> },
      { key: 'calls', label: '调用记录', children: <ToolCalls toolId={toolId} /> },
    ]} /> : <Typography.Paragraph>尚未配置工具</Typography.Paragraph>}
    {editor === 'resource' && <ToolResourceEditor tool={detail.tool} onClose={closeEditor} onSaved={() => { closeEditor(); query.reload() }} />}
    {(editor === 'new' || editor === 'version') && <ToolVersionEditor tool={detail.tool} version={editor === 'version' ? version : undefined}
      onClose={closeEditor} onSaved={() => { closeEditor(); query.reload() }} />}
  </PageContainer>
}
