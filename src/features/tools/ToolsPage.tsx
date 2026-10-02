import { App, Button, Descriptions, Input, Select, Space, Table, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { ToolCalls } from './ToolCalls'
import { ToolTestPanel } from './ToolTestPanel'
import { ToolVersionEditor } from './ToolVersionEditor'

const sources = [{ value: 'http', label: 'HTTP 接口' }, { value: 'mcp', label: 'MCP 工具' }, { value: 'builtin', label: '预置函数' }]
const effects = [{ value: 'READ_ONLY', label: '只读' }, { value: 'IDEMPOTENT_WRITE', label: '幂等写入' }, { value: 'EXTERNAL_WRITE', label: '外部写入' }]
const json = (value: unknown) => <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(value, null, 2)}</pre>

export function ToolsPage() {
  const params = useParams()
  const toolId = params['*']?.split('/')[0]
  return toolId ? <ToolDetail key={toolId} toolId={toolId} /> : <ToolList />
}

function ToolList() {
  const [source, setSource] = useState<string>()
  const [effect, setEffect] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [search, setSearch] = useState('')
  const [referencedBy, setReferencedBy] = useState<string>()
  const [creating, setCreating] = useState(false)
  const filters = new URLSearchParams()
  if (source) filters.set('source_type', source)
  if (effect) filters.set('effect_type', effect)
  if (status) filters.set('status', status)
  if (search) filters.set('search', search)
  if (referencedBy) filters.set('referenced_by', referencedBy)
  const query = useQuery<Schema<'ToolList'>>(`/admin/v1/tools?${filters}`)
  return <PageContainer title="工具管理" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true) }} /></Space>}>
    <Space wrap style={{ marginBottom: 20 }}>
      <Input.Search aria-label="工具名称或用途" placeholder="工具名称或用途" onSearch={setSearch} allowClear />
      <Select aria-label="来源" placeholder="全部来源" allowClear options={sources} onChange={setSource} style={{ width: 150 }} />
      <Select aria-label="影响类型" placeholder="全部影响类型" allowClear options={effects} onChange={setEffect} style={{ width: 170 }} />
      <Select aria-label="启用状态" placeholder="全部状态" allowClear options={[{ value: 'ACTIVE', label: '已启用' }, { value: 'DISABLED', label: '已停用' }]} onChange={setStatus} style={{ width: 140 }} />
      <Select aria-label="引用智能体" placeholder="全部引用智能体" allowClear style={{ minWidth: 180 }} onChange={setReferencedBy}
        options={query.data?.referenced_agents?.map(ref => ({ value: ref.version_id, label: `${ref.resource_name ?? '名称不可用'} · ${ref.version_label}` }))} />
    </Space>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="tool_id" dataSource={query.data.items} scroll={{ x: 780 }} columns={[
        { title: '工具名称', render: (_, row) => <Link to={`/tools/${row.tool_id}`}>{row.name}</Link> },
        { title: '用途', dataIndex: 'description', ellipsis: true }, { title: '来源', dataIndex: 'source_label' },
        { title: '影响类型', render: (_, row) => row.effect_labels.join('、') || '未配置版本' },
        { title: '负责人', dataIndex: 'owner' }, { title: '状态', render: (_, row) => <StatusTag status={row.status} /> },
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
  const { modal } = App.useApp()
  const { session } = useSession()
  const query = useQuery<Schema<'ToolDetail'>>(`/admin/v1/tools/${toolId}`)
  const bindings = useQuery<Schema<'BindingOption'>[]>(`/admin/v1/tool-bindings?tool_id=${toolId}`)
  const [selected, setSelected] = useState<string>()
  const [editor, setEditor] = useState<'resource' | 'new' | 'version'>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const detail = query.data
  const version = detail?.versions.find(v => v.version.version_id === selected) ?? detail?.versions.at(-1)
  const definition = version?.definition
  const binding = bindings.data?.find(b => b.binding.adapter_key === definition?.binding.adapter_key)
  async function mutate(action: 'disable' | 'freeze' | 'release') {
    if (!detail || busy) return
    setBusy(true); setError(undefined)
    try {
      if (action === 'disable') await send(`/admin/v1/tools/${toolId}/disable`, 'POST', { revision: detail.tool.revision })
      else if (action === 'freeze' && version) await send(`/admin/v1/tool-versions/${version.version.version_id}/freeze`, 'POST', { revision: version.revision })
      else if (action === 'release' && version) await send(`/admin/v1/tools/${toolId}/releases`, 'POST', { version_id: version.version.version_id, expected_revision: detail.release_revision, note: '发布工具版本' })
      query.reload()
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  function disable() {
    modal.confirm({ title: '停用工具', content: <><p>{detail?.impact.message}</p>
      <p>引用版本：{detail?.impact.references.length ?? 0} 个；进行中调用：{detail?.impact.ongoing_calls ?? 0} 次。</p></>,
    okText: '停用', okButtonProps: { danger: true }, cancelText: '取消', onOk: () => mutate('disable') })
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail) return <LoadingState />
  return <PageContainer title={detail.tool.name} actions={<Space wrap><Link to="/tools">返回工具列表</Link>
    <Button onClick={query.reload} loading={busy}>刷新</Button><ActionButtons actions={detail.tool.actions}
      handlers={busy ? {} : { edit: () => setEditor('resource'), create_version: () => setEditor('new'), disable }} /></Space>}>
    <ErrorNotice error={error} />
    <Descriptions items={[
      { key: 'source', label: '来源', children: detail.tool.source_label }, { key: 'owner', label: '负责人', children: detail.tool.owner },
      { key: 'state', label: '状态', children: <StatusTag status={detail.tool.status} /> },
      { key: 'description', label: '用途', children: detail.tool.description },
    ]} />
    <Space wrap style={{ marginBottom: 16 }}>
      <Select aria-label="工具版本" style={{ minWidth: 220 }} value={version?.version.version_id} onChange={setSelected}
        placeholder="请选择版本" options={detail.versions.map(v => ({ value: v.version.version_id,
          label: `${v.version.version_label} · ${v.status.label}${detail.release_version_id === v.version.version_id ? ' · 当前环境已发布' : ''}` }))} />
      {version && <ActionButtons actions={version.actions} handlers={busy ? {} : { edit: () => setEditor('version'), freeze: () => void mutate('freeze'),
        release: () => { modal.confirm({ title: '发布工具版本', content: `将“${version.version.version_label}”发布到${session.workspace?.environment_name ?? '当前环境'}。`,
          okText: '发布', cancelText: '取消', onOk: () => mutate('release') }) } }} />}
    </Space>
    {definition && version ? <Tabs items={[
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
        { key: 'domain', label: '业务数据域', children: session.workspace && definition.allowed_data_domains.includes(session.workspace.data_scope_id) ? session.workspace.data_scope_name : '名称不可用' },
        { key: 'environment', label: '环境', children: definition.environments.map(environment => ({ dev: '开发', test: '测试', fat: '验收', prod: '生产' })[environment]).join('、') },
        { key: 'actions', label: '必要授权', children: definition.required_scopes?.map(scope => session.actions.find(a => a.action_key === scope)?.label ?? '授权名称不可用').join('、') },
        { key: 'subject', label: '主体要求', children: definition.subject_requirements?.required ? '需要受信业务主体' : '使用当前身份' },
      ]} /> },
      { key: 'policy', label: '执行策略', children: <Descriptions column={2} items={[
        { key: 'timeout', label: '超时', children: `${definition.timeout_seconds} 秒` },
        { key: 'size', label: '结果上限', children: `${definition.max_result_size} 字节` },
        { key: 'attempts', label: '最多尝试', children: `${definition.retry_policy?.max_attempts} 次` },
        { key: 'delay', label: '重试间隔', children: `${definition.retry_policy?.delay_ms} 毫秒` },
        { key: 'ttl', label: '缓存有效期', children: `${definition.cache_policy?.ttl_seconds} 秒` },
        { key: 'freshness', label: '数据最大时效', children: `${definition.cache_policy?.freshness_seconds} 秒` },
      ]} /> },
      { key: 'test', label: '测试', children: <ToolTestPanel key={`${version.version.version_id}:${version.revision}`} version={version} /> },
      { key: 'versions', label: '版本与引用', children: <><Table rowKey={v => v.version.version_id} dataSource={detail.versions} columns={[
        { title: '版本', render: (_, v) => v.version.version_label }, { title: '状态', render: (_, v) => v.status.label },
        { title: '执行状态', render: (_, v) => v.unavailable_reason ?? '可执行' },
      ]} /><Table rowKey="version_id" dataSource={detail.impact.references} columns={[
        { title: '引用资源', render: (_, ref) => ref.resource_name ?? '名称不可用' }, { title: '引用版本', dataIndex: 'version_label' },
      ]} /></> },
      { key: 'calls', label: '调用记录', children: <ToolCalls toolId={toolId} /> },
    ]} /> : <Typography.Paragraph>暂无工具版本</Typography.Paragraph>}
    {editor === 'resource' && <ToolResourceEditor tool={detail.tool} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} />}
    {(editor === 'new' || editor === 'version') && <ToolVersionEditor tool={detail.tool} version={editor === 'version' ? version : undefined}
      onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} />}
  </PageContainer>
}
