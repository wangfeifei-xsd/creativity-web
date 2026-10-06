import { Button, Descriptions, Form, Input, Modal, Select, Space, Tabs, Typography, theme } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { send } from '../../api/management'
import { formatAmount, formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { AgentEditor } from './AgentEditor'
import { Debug } from './Debug'
import { Flow } from './Flow'
import { type Detail, type Options, type Version, dependencyNames, pretty, workflowNames } from './types'
import './agents.css'

export function AgentsPage() {
  const { '*': path } = useParams()
  return path ? <AgentDetail key={path} agentId={path} /> : <AgentList />
}

function AgentList() {
  const [search, setSearch] = useState('')
  const query = useQuery<Schema<'AgentList'>>(`/admin/v1/agents?search=${encodeURIComponent(search)}`)
  const [creating, setCreating] = useState(false)
  const options = useQuery<Options>(creating ? '/admin/v1/agents/options' : null)
  const navigate = useNavigate()
  return <PageContainer title="智能体" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true) }} /></Space>}>
    <ErrorNotice error={options.error} />
    <Input.Search aria-label="智能体名称或用途" placeholder="智能体名称或用途" onSearch={setSearch} allowClear style={{ maxWidth: 360, marginBottom: 16 }} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="agent_id" dataSource={query.data.items} columns={[
      { title: '智能体名称', render: (_, row) => <Link to={`/agents/${row.agent_id}`}>{row.name}</Link> },
      { title: '用途', dataIndex: 'description', ellipsis: true }, { title: '负责人', dataIndex: 'owner' },
      { title: '状态', render: (_, row) => <StatusTag status={row.status} /> },
    ]} />}
    {creating && !options.data && <Modal open title="新增智能体" footer={null} onCancel={() => setCreating(false)}>{options.error ? <ErrorState error={options.error} onRetry={options.reload} /> : <LoadingState />}</Modal>}
    {creating && options.data && <AgentEditor options={options.data} onClose={() => setCreating(false)} onSaved={detail => { if (detail) navigate(`/agents/${detail.agent.agent_id}`) }} />}
  </PageContainer>
}

function AgentDetail({ agentId }: { agentId: string }) {
  const { token } = theme.useToken()
  const query = useQuery<Detail>(`/admin/v1/agents/${agentId}`)
  const options = useQuery<Options>('/admin/v1/agents/options')
  const [selected, setSelected] = useState<string>()
  const [editor, setEditor] = useState<'version' | 'resource' | 'new' | 'release' | 'offline' | 'emergency_stop' | 'enable'>()
  const [validation, setValidation] = useState<Schema<'AgentValidation'>>()
  const [tab, setTab] = useState('flow')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const detail = query.data
  const version = detail?.versions.find(v => v.version_id === selected) ?? detail?.versions.filter(v => v.status.value === 'DRAFT').at(-1) ?? detail?.versions.at(-1)
  const saved = () => { setEditor(undefined); setValidation(undefined); query.reload(); options.reload() }
  async function validate() {
    if (!version) return
    setBusy(true); setError(undefined)
    try { setValidation(await send(`/admin/v1/agent-versions/${version.version_id}/validate`, 'POST', { revision: version.revision, purpose: 'production' })); setTab('dependencies') }
    catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail) return <LoadingState />
  const definition = version?.definition
  const depIds = definition ? [definition.bindings.prompt_id, definition.bindings.model_route_id, ...definition.bindings.tool_ids, ...definition.bindings.skill_ids].filter((id): id is string => !!id) : []
  const dependencies = depIds.map(id => options.data?.dependencies.find(d => d.version_id === id) ?? { version_id: id, name: '依赖名称不可用', version_label: '版本不可用', resource_type: '' })
  return <div className="agent-detail"><PageContainer title={detail.agent.name} actions={<Space wrap><Link to="/agents">返回智能体列表</Link><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={detail.agent.actions} handlers={{ edit: () => setEditor('resource'), create_version: () => setEditor('new'),
      offline: () => setEditor('offline'), emergency_stop: () => setEditor('emergency_stop'), enable: () => setEditor('enable') }} /></Space>}>
    <ErrorNotice error={error ?? options.error} />
    <div className="agent-detail-summary" style={{ background: token.colorFillAlter, borderRadius: token.borderRadiusLG }}>
    <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} items={[{ key: 'status', label: '当前环境状态', children: <StatusTag status={detail.agent.status} /> },
      { key: 'owner', label: '负责人', children: detail.agent.owner }, { key: 'purpose', label: '用途', children: detail.agent.description }]} />
    </div>
    <div className="agent-version-toolbar">
      <div className="agent-version-picker"><Typography.Text type="secondary">版本</Typography.Text><Select aria-label="智能体版本" className="agent-version-select" value={version?.version_id}
      options={detail.versions.map(v => ({ value: v.version_id, label: `${v.version_label} · ${v.status.label}${v.version_id === detail.release_version_id ? ' · 当前环境生效' : ''}` }))}
      onChange={value => { setSelected(value); setValidation(undefined) }} /></div>
      <div className="agent-version-actions">
      {version && <ActionButtons actions={version.actions} disabled={busy} handlers={{ edit: options.data ? () => setEditor('version') : undefined, validate: () => void validate(), test: () => setTab('debug'), release: () => setEditor('release') }} />}
      </div>
    </div>
    {definition && version && <Tabs className="agent-detail-tabs" activeKey={tab} onChange={setTab} items={[
      { key: 'base', label: '基本信息', children: <Descriptions items={[
        { key: 'flow', label: '流程类型', children: workflowNames[definition.workflow_type] },
        { key: 'code', label: '接入调用编码', children: <Typography.Text copyable>{detail.agent.agent_code}</Typography.Text> },
        { key: 'rev', label: '修订号', children: version.revision },
      ]} /> },
      { key: 'schema', label: '输入输出', children: <Tabs items={[
        { key: 'input', label: '输入结构', children: <JsonContent value={definition.input_schema} /> },
        { key: 'output', label: '输出结构', children: <JsonContent value={definition.output_schema} /> },
      ]} /> },
      { key: 'flow', label: '流程', children: <Flow definition={definition} /> },
      { key: 'dependencies', label: '模型、提示词与工具技能', children: <Space orientation="vertical" style={{ width: '100%' }}>
        <Table rowKey="version_id" pagination={false} dataSource={validation?.dependencies ?? dependencies} columns={[
          { title: '类型', render: (_, d) => dependencyNames[d.resource_type] ?? '资源不可用' }, { title: '资源', dataIndex: 'name' },
        ]} />
        {validation && <Table rowKey="key" pagination={false} dataSource={validation.checks} columns={[
          { title: '发布检查', dataIndex: 'label' }, { title: '结果', render: (_, c) => c.passed ? '通过' : '未通过' },
          { title: '说明', render: (_, c) => c.passed ? '已核验' : c.issues?.map(i => i.message).join('；') },
        ]} />}
      </Space> },
      { key: 'memory', label: '会话与记忆', children: <Descriptions column={1} items={[
        { key: 'conversation', label: '会话', children: definition.context.conversation_enabled ? '已启用' : '未启用' },
        { key: 'summary', label: '摘要', children: definition.context.summary_policy === 'recent' ? '最近摘要' : '不读取' },
        { key: 'memory', label: '长期记忆', children: definition.context.memory_policy ? <><div>读取：{definition.context.memory_policy.read_enabled ? '已启用' : '未启用'}</div>
          <div>写入：{({ DISABLED: '禁止写入', CANDIDATE: '生成候选', EXPLICIT: '明确确认' })[definition.context.memory_policy.write_mode]}</div>
          <div>检索上限：{definition.context.memory_policy.retrieval_limit} 条</div><div>有效期：{definition.context.memory_policy.ttl_seconds} 秒</div></> : '未启用' },
      ]} /> },
      { key: 'limits', label: '运行限制', children: <Descriptions items={[
        { key: 'deadline', label: '运行限时', children: `${definition.limits.deadline_seconds} 秒` },
        { key: 'token', label: 'Token 上限', children: `${definition.limits.token_limit} 个` },
        { key: 'context', label: '上下文上限', children: `${definition.context.context_limit} Token` },
        { key: 'model', label: '模型轮数', children: `最多 ${definition.limits.max_model_rounds} 次` },
        { key: 'tool', label: '工具调用', children: `最多 ${definition.limits.max_tool_calls} 次` },
        { key: 'loop', label: '循环', children: `最多 ${definition.limits.max_iterations} 次，${definition.limits.loop_timeout_seconds} 秒` },
        { key: 'repair', label: '输出修复', children: `最多 ${definition.limits.output_repair_attempts} 次` },
        { key: 'cost', label: '费用上限', children: definition.limits.cost_limit ? formatAmount(definition.limits.cost_limit.amount, definition.limits.cost_limit.currency) : '未设置' },
      ]} /> },
      { key: 'debug', label: '调试', children: <Debug key={`${version.version_id}:${version.revision}`} version={version} /> },
      { key: 'diff', label: '草稿与当前发布差异', children: <Table rowKey="field" dataSource={detail.differences} pagination={false} scroll={{ x: 600 }} columns={[
        { title: '配置', dataIndex: 'label', width: 140 }, { title: '当前发布', render: (_, d) => <JsonContent value={displayDifference(d.field, d.before, options.data)} /> },
        { title: '草稿', render: (_, d) => <JsonContent value={displayDifference(d.field, d.after, options.data)} /> },
      ]} /> },
      { key: 'releases', label: '发布记录', children: <Table rowKey="release_id" dataSource={detail.releases} scroll={{ x: 640 }} columns={[
        { title: '环境', dataIndex: 'environment_label' }, { title: '版本', dataIndex: 'version_label' }, { title: '操作', dataIndex: 'operation_label' },
        { title: '说明', dataIndex: 'note' }, { title: '操作人', render: (_, r) => r.actor_name ?? '名称不可用' }, { title: '时间', render: (_, r) => formatTimestamp(r.created_at) },
      ]} /> },
    ]} />}
    {editor === 'version' && version && options.data && <AgentEditor options={options.data} version={version} onClose={() => setEditor(undefined)} onSaved={saved} />}
    {editor === 'resource' && <EditorDialog title="编辑基本信息" fields={[{ name: 'name', label: '智能体名称', required: true }, { name: 'description', label: '用途', required: true }, { name: 'owner', label: '负责人', required: true }]}
      initial={{ name: detail.agent.name, description: detail.agent.description, owner: detail.agent.owner, revision: detail.agent.revision }} onClose={() => setEditor(undefined)} onSaved={saved}
      onSave={values => send(`/admin/v1/agents/${agentId}`, 'PATCH', values)} />}
    {editor === 'new' && version && <EditorDialog title="新增草稿" fields={[{ name: 'version_label', label: '草稿名称', required: true }]} onClose={() => setEditor(undefined)} onSaved={saved}
      onSave={values => send(`/admin/v1/agents/${agentId}/versions`, 'POST', { ...values, base_version_id: version.version_id })} />}
    {editor && ['offline', 'emergency_stop', 'enable'].includes(editor) && <EditorDialog title={editor === 'offline' ? '下线智能体' : editor === 'enable' ? '启用智能体' : '紧急停用智能体'} danger={editor !== 'enable'}
      fields={[{ name: 'reason', label: '操作原因', required: true }]} onClose={() => setEditor(undefined)} onSaved={saved}
      onSave={values => send(`/admin/v1/agents/${agentId}/state`, 'POST', { ...values, revision: detail.agent.revision, operation: editor })} />}
    {editor === 'release' && version && options.data && <ReleaseDialog version={version} detail={detail} options={options.data} onClose={() => setEditor(undefined)} onSaved={saved} />}
  </PageContainer></div>
}

function JsonContent({ value }: { value: unknown }) {
  return <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' }}>{value == null ? '未设置' : typeof value === 'string' ? value : pretty(value)}</pre>
}

function displayDifference(field: string, value: unknown, options?: Options): unknown {
  if (value == null) return '尚无版本'
  if (field === 'workflow_type') return workflowNames[value as keyof typeof workflowNames] ?? '类型不可用'
  if (field === 'bindings' && typeof value === 'object') return Object.entries(value).map(([key, ids]) => ({
    类型: ({ prompt_id: '提示词', model_route_id: '模型路由', tool_ids: '工具', skill_ids: '技能' } as Record<string, string>)[key],
    资源: (Array.isArray(ids) ? ids : ids ? [ids] : []).map(id => { const dep = options?.dependencies.find(d => d.version_id === id); return dep ? `${dep.name} · ${dep.version_label}` : '依赖名称不可用' }),
  }))
  return value
}

function ReleaseDialog({ detail, version, options, onClose, onSaved }: { detail: Detail; version: Version; options: Options; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const reports = useQuery<Schema<'EvaluationList'>>('/admin/v1/evaluations')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  async function publish(values: { operation: string; note: string; reports?: string[] }) {
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/agents/${detail.agent.agent_id}/releases`, 'POST', { version_id: version.version_id, revision: version.revision,
      expected_mapping_revision: detail.release_revision, environment: options.environment, operation: values.operation, note: values.note, evaluation_refs: values.reports ?? [] }); onSaved() }
    catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Modal open title="环境发布" onCancel={onClose} onOk={() => form.submit()} okText="确认发布" cancelText="取消" confirmLoading={busy} closable={!busy} maskClosable={!busy}>
    <ErrorNotice error={error} /><Descriptions column={1} items={[{ key: 'environment', label: '目标环境', children: options.environment_label }, { key: 'version', label: '来源版本', children: version.version_label }]} />
    <Form form={form} layout="vertical" initialValues={{ operation: 'publish' }} onFinish={publish} disabled={busy}>
      <Form.Item name="operation" label="发布操作"><Select options={[{ value: 'publish', label: '发布' }, ...(version.status.value === 'PUBLISHED' ? [{ value: 'rollback', label: '回滚到此版本' }] : [])]} /></Form.Item>
      <Form.Item name="note" label="发布说明" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="reports" label="评测报告"><Select mode="multiple" options={reports.data?.items?.filter(r => r.state.value === 'COMPLETED').map(r => ({ value: r.evaluation_id, label: `${r.name} · ${r.dataset_version_label}` }))} /></Form.Item>
    </Form>
  </Modal>
}
