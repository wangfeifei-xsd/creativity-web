import { Button, Descriptions, Input, Modal, Space, Tabs, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined, MessageOutlined, PauseCircleOutlined, PlayCircleOutlined, PoweroffOutlined, ReloadOutlined, SlidersOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { send } from '../../api/management'
import { formatAmount } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { SchemaView } from '../../components/schema-fields/SchemaFields'
import { AgentDependencies } from './AgentDependencies'
import { AgentSection, AgentValues, AgentWorkspace } from './AgentWorkspace'
import { AgentAssistance } from './AgentAssistance'
import { AgentEditor } from './AgentEditor'
import { Debug } from './Debug'
import { Flow } from './Flow'
import { type Detail, type Options, workflowNames } from './types'
import type { FlowIssue } from './flow-fields'
import './agents.css'

export function AgentsPage() {
  const { '*': path } = useParams()
  const [params] = useSearchParams()
  if (path === 'assistance') return <AgentAssistance key={params.toString()} agentId={params.get('agent') ?? undefined} />
  return path ? <AgentDetail key={path} agentId={path} /> : <AgentList />
}

function AgentList() {
  const [search, setSearch] = useState('')
  const query = useQuery<Schema<'AgentList'>>(`/admin/v1/agents?search=${encodeURIComponent(search)}`)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Schema<'AgentView'>>()
  const options = useQuery<Options>(creating ? '/admin/v1/agents/options' : null)
  const navigate = useNavigate()
  const canAssist = query.data?.actions.some(action => action.action_key === 'assist')
  const canOperate = query.data?.items.some(item => item.actions.some(action => ['assist', 'delete'].includes(action.action_key)))
  return <PageContainer title="智能体" actions={<Space wrap><Button onClick={query.reload}>刷新</Button>
    <ActionButtons primaryAction={canAssist ? 'assist' : 'create'} actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true) }} />
    {canAssist && <Button type="primary" icon={<ThunderboltOutlined aria-hidden />} onClick={() => navigate('/agents/assistance')}>智能创建</Button>}</Space>}>
    <ErrorNotice error={options.error} />
    <Input.Search aria-label="智能体名称或用途" placeholder="智能体名称或用途" onSearch={setSearch} allowClear style={{ maxWidth: 360, marginBottom: 16 }} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="agent_id" dataSource={query.data.items} columns={[
      { title: '智能体名称', render: (_, row) => <Link to={`/agents/${row.agent_id}`}>{row.name}</Link> },
      { title: '用途', dataIndex: 'description', ellipsis: true }, { title: '负责人', dataIndex: 'owner' },
      { title: '上下线状态', render: (_, row) => <StatusTag status={row.online_status} /> },
      { title: '启停状态', render: (_, row) => <StatusTag status={row.status} /> },
      ...(canOperate ? [{ title: '操作', width: 220, render: (_: unknown, row: Schema<'AgentView'>) => <ActionButtons actions={row.actions} icons={{ delete: <DeleteOutlined aria-hidden /> }} handlers={{
        assist: () => navigate(`/agents/assistance?agent=${encodeURIComponent(row.agent_id)}`), delete: () => setDeleting(row),
      }} /> }] : []),
    ]} />}
    {creating && !options.data && <Modal open title="新增智能体" footer={null} onCancel={() => setCreating(false)}>{options.error ? <ErrorState error={options.error} onRetry={options.reload} /> : <LoadingState />}</Modal>}
    {creating && options.data && <AgentEditor options={options.data} onClose={() => setCreating(false)} onSaved={detail => { if (detail) navigate(`/agents/${detail.agent.agent_id}`) }} />}
    {deleting && <DeleteAgentDialog agent={deleting} onClose={() => setDeleting(undefined)} onSaved={() => { setDeleting(undefined); query.reload() }} />}
  </PageContainer>
}

function AgentDetail({ agentId }: { agentId: string }) {
  const query = useQuery<Detail>(`/admin/v1/agents/${agentId}`)
  const options = useQuery<Options>('/admin/v1/agents/options')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialFocus, setInitialFocus] = useState<FlowIssue>()
  const editing = searchParams.get('edit')
  const closeEditor = () => { setSearchParams({}, { replace: true }); setInitialFocus(undefined); setEditor(undefined) }
  const [editor, setEditor] = useState<'resource' | 'online' | 'offline' | 'disable' | 'enable' | 'delete'>()
  const [validation, setValidation] = useState<Schema<'AgentValidation'>>()
  const [tab, setTab] = useState(() => searchParams.get('tab') === 'limits' ? 'limits' : 'flow')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const reload = () => { setError(undefined); setValidation(undefined); query.reload(); options.reload() }
  const detail = query.data
  const configuration = detail?.configuration
  const saved = () => { closeEditor(); setValidation(undefined); query.reload(); options.reload() }
  async function validate() {
    if (!configuration) return
    setBusy(true); setError(undefined)
    try { setValidation(await send(`/admin/v1/agents/${agentId}/validate`, 'POST', { revision: configuration.revision, purpose: 'debug' })); setTab('dependencies') }
    catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={reload} />
  if (!detail) return <LoadingState />
  if (editing && !options.data) return options.error ? <ErrorState error={options.error} onRetry={options.reload} /> : <LoadingState />
  const definition = configuration?.definition
  const depIds = definition ? [...new Set([definition.bindings.prompt_id, definition.bindings.model_route_id, definition.bindings.embedding_route_id,
    ...definition.bindings.tool_ids, ...definition.bindings.skill_ids, ...definition.steps.flatMap(step => [step.dependency, step.prompt_id])].filter((id): id is string => !!id))] : []
  // 校验可能在解析依赖前失败，仍保留已保存的依赖，方便定位和修改。
  const dependencies = depIds.map(id => validation?.dependencies.find(d => d.version_id === id) ?? options.data?.dependencies.find(d => d.version_id === id)
    ?? { version_id: id, name: '依赖名称不可用', resource_type: '' })
  const validationIssues = validation?.checks.flatMap(check => check.issues ?? []) ?? []
  if (editing && configuration && options.data && configuration.actions.some(action => action.action_key === 'edit')) return <AgentEditor key={configuration.agent_id}
    options={options.data} configuration={configuration} name={detail.agent.name} initialIssues={validationIssues.filter(issue => /^(steps|edges|start_step)(\.|$)/.test(issue.path ?? ''))}
    initialFocus={initialFocus} initialSection={searchParams.get('section') === 'limits' ? 4 : undefined} onClose={closeEditor} onSaved={saved} />
  const openEditor = (issue?: FlowIssue) => { if (!configuration) return; setInitialFocus(issue); setSearchParams({ edit: 'true', ...(!issue && tab === 'limits' ? { section: 'limits' } : {}) }) }
  return <AgentWorkspace className="agent-detail"><PageContainer title={detail.agent.name} actions={<Space wrap><Link to="/agents"><ArrowLeftOutlined aria-hidden /> 返回智能体列表</Link><Button icon={<ReloadOutlined aria-hidden />} onClick={reload}>刷新</Button>
    {detail.agent.actions.some(action => action.action_key === 'edit') && <Button icon={<ThunderboltOutlined aria-hidden />} onClick={() => navigate(`/agents/assistance?${new URLSearchParams({ agent: agentId,  })}`)}>智能修改</Button>}
    <ActionButtons actions={detail.agent.actions} icons={{ edit: <EditOutlined aria-hidden />, offline: <PoweroffOutlined aria-hidden />, online: <PlayCircleOutlined aria-hidden />, disable: <PauseCircleOutlined aria-hidden />, enable: <PlayCircleOutlined aria-hidden />, delete: <DeleteOutlined aria-hidden /> }} handlers={{ edit: () => setEditor('resource'), online: () => setEditor('online'),
      offline: () => setEditor('offline'), disable: () => setEditor('disable'), enable: () => setEditor('enable'), delete: () => setEditor('delete') }} /></Space>}>
    <ErrorNotice error={error ?? options.error} />
    <div className="agent-detail-summary">
    <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} items={[{ key: 'online', label: '上下线状态', children: <StatusTag status={detail.agent.online_status} /> }, { key: 'status', label: '启停状态', children: <StatusTag status={detail.agent.status} /> },
      { key: 'owner', label: '负责人', children: detail.agent.owner }, { key: 'purpose', label: '用途', children: detail.agent.description }]} />
    </div>
    <div className="agent-configuration-toolbar">
      <div className="agent-configuration-actions">
      {configuration && <ActionButtons actions={configuration.actions} primaryAction="edit" icons={{ edit: <EditOutlined aria-hidden />, validate: <CheckCircleOutlined aria-hidden />, test: <SlidersOutlined aria-hidden /> }} disabled={busy} handlers={{ edit: options.data ? () => openEditor() : undefined, validate: () => void validate(), test: () => setTab('debug') }} />}
      </div>
    </div>
    {definition && configuration && <Tabs className="agent-detail-tabs" activeKey={tab} onChange={setTab} items={[
      { key: 'base', label: '基本信息', children: <AgentSection><AgentValues items={[
        { label: '任务指令', wide: true, value: <Typography.Paragraph className="agent-instructions">{definition.instructions || '未设置'}</Typography.Paragraph> },
        { label: '流程类型', value: workflowNames[definition.workflow_type] },
        { label: '接入调用编码', value: <Typography.Text copyable>{detail.agent.agent_code}</Typography.Text> },
      ]} /></AgentSection> },
      { key: 'schema', label: '输入输出', children: <AgentSection className="agent-schema-section"><Tabs className="agent-inner-tabs" items={[
        { key: 'input', label: '输入结构', children: <SchemaView value={definition.input_schema} label="输入结构" /> },
        { key: 'output', label: '输出结构', children: <SchemaView value={definition.output_schema} label="输出结构" /> },
      ]} /></AgentSection> },
      { key: 'flow', label: '流程', children: <Flow key={configuration.agent_id} definition={definition} options={options.data} /> },
      { key: 'dependencies', label: '模型、提示词与工具技能', children: <Space orientation="vertical" className="agent-full-width" size={20}>
        <AgentDependencies resources={dependencies} />
        {validation && <AgentSection title="配置校验"><Table rowKey="key" pagination={false} dataSource={validation.checks} columns={[
          { title: '配置校验', dataIndex: 'label' }, { title: '结果', render: (_, c) => c.passed ? '通过' : '未通过' },
          { title: '说明', render: (_, c) => c.passed ? '已核验' : <Space orientation="vertical" size={0}>{c.issues?.map((issue, index) => configuration.actions.some(action => action.action_key === 'edit') && issue.path ? <Button key={index} type="link" className="agent-flow-issue-link" onClick={() => openEditor(issue)}>{issue.message}</Button> : <span key={index}>{issue.message}</span>)}</Space> },
        ]} /></AgentSection>}
      </Space> },
      { key: 'memory', label: '会话与记忆', children: <div className="agent-two-columns">
        <AgentSection title="会话" icon={<MessageOutlined aria-hidden />}><AgentValues className="is-rows" items={[
          { label: '会话状态', value: <Tag color={definition.context.conversation_enabled ? 'success' : 'default'}>{definition.context.conversation_enabled ? '已启用' : '未启用'}</Tag> },
          { label: '摘要', value: definition.context.summary_policy === 'recent' ? '最近摘要' : '不读取' },
        ]} /></AgentSection>
        <AgentSection title="长期记忆" icon={<DatabaseOutlined aria-hidden />}><AgentValues className="is-rows" items={definition.context.memory_policy ? [
          { label: '读取', value: <Tag color={definition.context.memory_policy.read_enabled ? 'success' : 'default'}>{definition.context.memory_policy.read_enabled ? '已启用' : '未启用'}</Tag> },
          { label: '写入', value: ({ DISABLED: '禁止写入', CANDIDATE: '生成候选', EXPLICIT: '明确确认' })[definition.context.memory_policy.write_mode] },
          { label: '检索上限', value: `${definition.context.memory_policy.retrieval_limit} 条` },
          { label: '有效期', value: `${definition.context.memory_policy.ttl_seconds} 秒` },
        ] : [{ label: '记忆状态', value: <Tag>未启用</Tag> }]} /></AgentSection>
      </div> },
      { key: 'limits', label: '运行限制', children: <div className="agent-two-columns">
        <AgentSection title="运行预算" icon={<ClockCircleOutlined aria-hidden />}><AgentValues className="is-rows" items={[
          { label: '运行限时', value: `${definition.limits.deadline_seconds} 秒` },
          { label: '单次运行 Token 上限', value: `${definition.limits.token_limit} Token` },
          { label: '上下文上限', value: `${definition.context.context_limit} Token` },
          { label: '费用上限', value: definition.limits.cost_limit ? formatAmount(definition.limits.cost_limit.amount, definition.limits.cost_limit.currency) : '未设置' },
        ]} /></AgentSection>
        <AgentSection title="执行上限" icon={<SlidersOutlined aria-hidden />}><AgentValues className="is-rows" items={[
          { label: '模型轮数', value: `最多 ${definition.limits.max_model_rounds} 次` },
          { label: '工具调用', value: `最多 ${definition.limits.max_tool_calls} 次` },
          { label: '循环', value: `最多 ${definition.limits.max_iterations} 次，${definition.limits.loop_timeout_seconds} 秒` },
          { label: '输出修复', value: `最多 ${definition.limits.output_repair_attempts} 次` },
        ]} /></AgentSection>
      </div> },
      { key: 'debug', label: '调试', children: <Debug key={`${configuration.agent_id}:${configuration.revision}`} configuration={configuration} /> },
    ]} />}
    {editor === 'resource' && <EditorDialog title="编辑基本信息" fields={[{ name: 'name', label: '智能体名称', required: true }, { name: 'description', label: '用途', required: true }, { name: 'owner', label: '负责人', required: true }]}
      initial={{ name: detail.agent.name, description: detail.agent.description, owner: detail.agent.owner, revision: detail.agent.revision }} onClose={() => setEditor(undefined)} onSaved={saved}
      onSave={values => send(`/admin/v1/agents/${agentId}`, 'PATCH', values)} />}
    {editor && ['online', 'offline', 'disable', 'enable'].includes(editor) && <EditorDialog title={({ online: '上线智能体', offline: '下线智能体', disable: '停用智能体', enable: '启用智能体' } as Record<string, string>)[editor]} danger={editor === 'offline' || editor === 'disable'}
      fields={[{ name: 'reason', label: '操作原因', required: true }]} onClose={() => setEditor(undefined)} onSaved={saved}
      onSave={values => send(`/admin/v1/agents/${agentId}/state`, 'POST', { ...values, revision: detail.agent.revision, operation: editor })} />}
    {editor === 'delete' && <DeleteAgentDialog agent={detail.agent} onClose={() => setEditor(undefined)} onSaved={() => navigate('/agents', { replace: true })} />}
  </PageContainer></AgentWorkspace>
}

function DeleteAgentDialog({ agent, onClose, onSaved }: { agent: Schema<'AgentView'>; onClose: () => void; onSaved: () => void }) {
  return <EditorDialog title="删除智能体" fields={[]} danger onClose={onClose} onSaved={onSaved}
    onSave={() => send(`/admin/v1/agents/${agent.agent_id}`, 'DELETE', { revision: agent.revision })}>
    <Typography.Paragraph>确认删除“{agent.name}”？删除后所有环境均不可再使用该智能体，历史运行记录保留。</Typography.Paragraph>
  </EditorDialog>
}
