import { Alert, Avatar, Badge, Button, Card, Collapse, Descriptions, Empty, Input, Modal, Segmented, Select, Space, Spin, Tabs, Tag, Typography, theme } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined, CheckCircleFilled, CommentOutlined, FileTextOutlined, FormOutlined, PlusOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState, type ComponentRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { isAbort, useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { SchemaView } from '../../components/schema-fields/SchemaFields'
import { SchemaComparison } from '../../components/schema-fields/SchemaComparison'
import { DifferenceValue } from './AgentDifferences'
import { Flow } from './Flow'
import { type Definition, type Detail, type Options, type Version, workflowNames } from './types'

type Turn = Schema<'AssistanceTurn'>
type Message = { text: string; runId?: string; response?: Turn }
const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])
const fields = { instructions: '任务指令', workflow_type: '流程类型', start_step: '起始步骤', input_schema: '输入结构', output_schema: '输出结构', steps: '流程步骤', edges: '后续流转', bindings: '资源依赖', limits: '运行限制', context: '会话与记忆' } as const

export function AgentAssistance({ agentId, versionId }: { agentId?: string; versionId?: string }) {
  const navigate = useNavigate()
  const query = useQuery<Detail>(agentId ? `/admin/v1/agents/${agentId}` : null)
  if (agentId && !query.data) return <Space orientation="vertical" className="agent-flow-full-width">
    <Button icon={<ArrowLeftOutlined aria-hidden />} onClick={() => navigate('/agents')}>返回智能体列表</Button>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />}
  </Space>
  const base = query.data?.versions.find(version => version.version_id === versionId)
    ?? (versionId ? undefined : query.data?.versions.filter(version => version.status.value === 'DRAFT').at(-1) ?? query.data?.versions.at(-1))
  if (agentId && (!query.data?.agent.actions.some(action => action.action_key === 'edit') || !base)) return <Space orientation="vertical">
    <Button icon={<ArrowLeftOutlined aria-hidden />} onClick={() => navigate('/agents')}>返回智能体列表</Button>
    <Alert type="warning" showIcon title="当前智能体或版本不可修改，请返回列表重新选择" />
  </Space>
  return <AssistanceWorkspace agent={query.data?.agent} base={base} />
}

function AssistanceWorkspace({ agent, base }: { agent?: Detail['agent']; base?: Version }) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const options = useQuery<Options>('/admin/v1/agents/options')
  const [route, setRoute] = useState<string>()
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<unknown>()
  const [pollError, setPollError] = useState<unknown>()
  const [retry, setRetry] = useState(0)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pane, setPane] = useState('conversation')
  const busyRef = useRef(false)
  const pendingRequest = useRef<{ body: string; key: string } | null>(null)
  const composer = useRef<ComponentRef<typeof Input.TextArea>>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)
  const activeId = last?.runId && !terminal.has(last.response?.state ?? '') ? last.runId : undefined
  const pending = sending || !!activeId
  // 继续对话时保留最近的方案供核对，只有最新一轮确认的方案可以保存。
  const candidate = [...messages].reverse().find(message => message.response?.state === 'SUCCEEDED' && message.response.reply?.proposal)
  const proposal = candidate?.response?.reply?.proposal
  const preview = proposal?.definition ?? base?.definition
  const canSave = !!proposal && candidate === last && !pending && !saving
  const routes = options.data?.dependencies.filter(item => item.resource_type === 'model_route' && item.required_capabilities?.includes('text')) ?? []
  const selectedRoute = route ?? routes[0]?.version_id
  const canSend = !pending && !saving && !!text.trim() && routes.some(item => item.version_id === selectedRoute)
  const title = agent ? '智能修改' : '智能创建'
  const examples = agent ? [
    { title: '补齐中文字段', text: '为这个智能体的输入输出字段补齐中文名称和必要说明，保留已有业务含义。' },
    { title: '增加补充信息分支', text: '为这个智能体增加补充信息的分支：缺少必要信息时先追问，信息完整后再继续处理。' },
    { title: '调整处理流程', text: '检查这个智能体的处理流程，补充输入校验和失败处理，并说明具体调整。' },
  ] : [
    { title: '客户咨询摘要', text: '创建一个客户咨询摘要助手：输入咨询内容，输出问题分类、关键信息和待办事项。' },
    { title: '订单咨询处理', text: '创建一个订单咨询助手：先确认订单号和客户问题，信息不足时追问，根据可用的订单查询工具整理答复。' },
    { title: '客服回复检查', text: '创建一个客服回复检查助手：输入客户问题与拟回复内容，检查是否答非所问，并输出问题及修改建议。' },
  ]

  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        const response = await apiClient.request<Turn>(`/admin/v1/agents/assistance/runs/${activeId}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setPollError(undefined)
        setMessages(previous => previous.map(message => message.runId === activeId ? { ...message, response } : message))
        if (!terminal.has(response.state)) timer = setTimeout(() => void poll(), 1500)
      } catch (failure) { if (!isAbort(failure)) setPollError(failure) }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [activeId, retry])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages, sending])

  async function submit() {
    if (busyRef.current || !canSend) return
    busyRef.current = true; setSending(true); setError(undefined)
    const previous = [...messages].reverse().find(message => message.response?.state === 'SUCCEEDED')
    const body = { message: text.trim(), agent_id: agent?.agent_id ?? null, base_version_id: base?.version_id ?? null,
      model_route_id: selectedRoute ?? null, previous_run_id: previous?.runId ?? null }
    const encoded = JSON.stringify(body)
    if (pendingRequest.current?.body !== encoded) pendingRequest.current = { body: encoded, key: crypto.randomUUID() }
    try {
      const receipt = await send<Schema<'AdmissionReceipt'>>('/admin/v1/agents/assistance', 'POST', { ...body, idempotency_key: pendingRequest.current.key })
      setMessages(items => [...items, { text: body.message, runId: receipt.run_id }]); setText(''); pendingRequest.current = null
    } catch (failure) { setError(failure) } finally { busyRef.current = false; setSending(false) }
  }
  async function save() {
    if (!candidate?.runId || !canSave || busyRef.current) return
    busyRef.current = true; setSaving(true); setError(undefined)
    try {
      const result = await send<Schema<'AssistanceSaved'>>(`/admin/v1/agents/assistance/runs/${candidate.runId}/apply`, 'POST')
      navigate(`/agents/${result.agent_id}?edit=${result.version_id}`)
    } catch (failure) { setError(failure) } finally { busyRef.current = false; setSaving(false) }
  }
  function reset() {
    const clear = () => { setMessages([]); setText(''); setError(undefined); setPollError(undefined); setPane('conversation'); pendingRequest.current = null; composer.current?.focus() }
    if (messages.length || text) Modal.confirm({ title: '开始新对话？', content: '当前对话及尚未保存的方案将清除。', okText: '开始新对话', cancelText: '继续当前对话', onOk: clear })
    else clear()
  }
  function back() {
    const leave = () => navigate(agent ? `/agents/${agent.agent_id}` : '/agents')
    if (messages.length || text) Modal.confirm({ title: '离开智能协助？', content: '当前对话及尚未保存的方案不会保留。', okText: '离开', cancelText: '继续编辑', onOk: leave })
    else leave()
  }
  const style = {
    '--assist-bg': token.colorBgContainer, '--assist-text': token.colorText, '--assist-muted': token.colorTextSecondary,
    '--assist-border': token.colorBorderSecondary, '--assist-line': token.colorBorder, '--assist-primary': token.colorPrimary,
    '--assist-tint': token.colorPrimaryBg, '--assist-soft': token.colorFillAlter, '--assist-success': token.colorSuccess,
    '--assist-radius': `${token.borderRadiusLG}px`,
  } as CSSProperties

  return <section className="agent-assistance" style={style} aria-label="智能协助工作区">
    <header className="agent-assistance-heading">
      <div className="agent-assistance-heading-title"><Button aria-label={agent ? '返回智能体详情' : '返回智能体列表'} icon={<ArrowLeftOutlined aria-hidden />} onClick={back} disabled={saving} />
        <Typography.Title level={2}>{title}</Typography.Title><Tag icon={<ThunderboltOutlined aria-hidden />}>智能体配置助手</Tag></div>
      <Button icon={<PlusOutlined aria-hidden />} onClick={reset} disabled={pending || saving}>新对话</Button>
    </header>
    <ErrorNotice error={error ?? options.error} />
    {options.error != null && <Button onClick={options.reload}>重新加载模型</Button>}
    {options.data && !routes.length && <Alert type="warning" showIcon title="暂无可用模型，请先发布并授权支持文本生成的模型路由" />}
    <Segmented className="agent-assistance-pane-switch" aria-label="工作区视图" block value={pane} onChange={setPane}
      options={[{ value: 'conversation', label: '需求对话', icon: <CommentOutlined aria-hidden /> }, { value: 'preview', label: proposal ? '方案预览 · 待保存' : agent ? '当前配置' : '方案预览', icon: <FileTextOutlined aria-hidden /> }]} />
    <div className="agent-assistance-layout">
      <section className="agent-assistance-panel agent-assistance-conversation" data-active={pane === 'conversation'} aria-label="智能协助对话">
        <div className="agent-assistance-panel-heading"><span><ThunderboltOutlined aria-hidden />需求对话</span></div>
        {agent && <div className="agent-assistance-target"><FormOutlined aria-hidden /><div><strong>{agent.name}</strong><span>{base?.version_label}</span></div><Tag>修改对象</Tag></div>}
        <div className={`agent-assistance-messages${messages.length ? '' : ' is-empty'}`} role="log" aria-live="polite">
          {!messages.length && <div className="agent-assistance-empty">
            <span className="agent-assistance-welcome-icon"><ThunderboltOutlined aria-hidden /></span>
            <Typography.Title level={4}>{agent ? '这个智能体需要怎样调整？' : '你想创建怎样的智能体？'}</Typography.Title>
            <div className="agent-assistance-examples">{examples.map(example => <Button key={example.title} onClick={() => { setText(example.text); composer.current?.focus() }}>
              <span>{example.title}</span><ArrowRightOutlined aria-hidden /></Button>)}</div>
          </div>}
          {messages.map((message, index) => <div className="agent-assistance-turn" key={message.runId ?? index}>
            <div className="agent-assistance-message user"><Avatar size={30} icon={<UserOutlined aria-hidden />} /><div className="agent-assistance-bubble">{message.text}</div></div>
            {message.response?.reply && <div className="agent-assistance-message assistant"><Avatar size={30} icon={<ThunderboltOutlined aria-hidden />} /><div className="agent-assistance-answer">
              <div className="agent-assistance-bubble">{message.response.reply.message}</div>
              {message === candidate && proposal && <Button className="agent-assistance-result" onClick={() => setPane('preview')} aria-label="查看生成的方案">
                <CheckCircleFilled aria-hidden /><span><strong>{proposal.name}</strong><small>{proposal.definition.steps.length} 个处理步骤 · 输入与输出已配置</small></span><ArrowRightOutlined aria-hidden />
              </Button>}
            </div></div>}
            {message.response?.error && <Alert type="error" showIcon title={message.response.error} />}
            {message.response && ['CANCELLED', 'TIMED_OUT'].includes(message.response.state) && !message.response.error && <Alert type="warning" title={message.response.state_label} />}
          </div>)}
          {pending && <Space className="agent-assistance-working"><Spin size="small" /><span>{
            last?.response?.state === 'QUEUED' ? '排队中，请勿切换或关闭页面'
              : last?.response?.state === 'RUNNING' ? '执行中，请勿切换或关闭页面'
                : last?.response?.state_label ?? '排队中，请勿切换或关闭页面'
          }</span></Space>}
          <ErrorNotice error={pollError} />{pollError != null && <Button onClick={() => { setPollError(undefined); setRetry(value => value + 1) }}>重新获取结果</Button>}
          <div ref={bottom} />
        </div>
        <div className="agent-assistance-composer"><Input.TextArea ref={composer} aria-label="创建或修改需求" placeholder={messages.length ? '描述需要补充或调整的内容…' : agent ? '描述要调整的流程、字段或处理方式…' : '描述业务目标、输入内容和期望结果…'}
          variant="borderless" value={text} onChange={event => setText(event.target.value)} autoSize={{ minRows: 3, maxRows: 7 }} maxLength={8000} disabled={saving}
          onKeyDown={event => { if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit() } }} />
          <div className="agent-assistance-composer-toolbar"><Select aria-label="协助模型" placeholder="选择协助模型" value={selectedRoute} onChange={setRoute} loading={!options.data && !options.error}
            disabled={pending || saving} options={routes.map(item => ({ value: item.version_id, label: item.name }))} />
            <span className="agent-assistance-keyboard">⌘ / Ctrl + Enter</span><Button type="primary" aria-label="发送" title="发送" icon={<ArrowUpOutlined aria-hidden />} loading={sending} disabled={!canSend} onClick={() => void submit()} /></div>
        </div>
      </section>
      <section className="agent-assistance-panel agent-assistance-preview" data-active={pane === 'preview'} aria-label={proposal ? '候选智能体方案' : '方案预览'}>
        <div className="agent-assistance-panel-heading"><span><FileTextOutlined aria-hidden />{proposal || !agent ? '方案预览' : '当前配置'}</span>
          <Badge status={pending ? 'processing' : proposal ? 'success' : 'default'} text={pending ? '生成中' : proposal ? candidate === last ? '已生成' : '待更新' : agent ? '修改前' : '等待生成'} /></div>
        {preview ? <><div className="agent-assistance-preview-content">
          <div className="agent-assistance-preview-header"><Typography.Title level={4}>{proposal?.name ?? agent?.name}</Typography.Title><Tag>{proposal ? '待保存' : base?.status.label}</Tag></div>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[{ key: 'owner', label: '负责人', children: proposal?.owner ?? agent?.owner }, { key: 'type', label: '流程', children: workflowNames[preview.workflow_type] }]} />
          <Typography.Paragraph className="agent-assistance-purpose">{proposal?.description ?? agent?.description}</Typography.Paragraph>
          <Tabs className="agent-assistance-preview-tabs" items={[
            { key: 'flow', label: '流程', children: <Flow key={candidate?.runId ?? base?.version_id} definition={preview} options={options.data} compact /> },
            { key: 'schema', label: '输入输出', children: <Space orientation="vertical" className="agent-flow-full-width"><Typography.Text strong>输入字段</Typography.Text><SchemaView value={preview.input_schema} label="输入结构" /><Typography.Text strong>输出字段</Typography.Text><SchemaView value={preview.output_schema} label="输出结构" /></Space> },
            { key: 'instructions', label: '任务指令', children: <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{preview.instructions || '沿用绑定的提示词'}</Typography.Paragraph> },
            { key: 'configuration', label: '完整配置', children: <Collapse items={[
              { key: 'code', label: '接入配置', children: <Descriptions size="small" items={[{ key: 'code', label: '调用编码', children: proposal?.agent_code ?? agent?.agent_code }]} /> },
              ...(['bindings', 'limits', 'context'] as const).map(field => ({ key: field, label: fields[field], children: <DifferenceValue field={field} value={preview[field]} definition={preview} options={options.data} /> })),
            ]} /> },
            ...(proposal && candidate?.response?.base_definition ? [{ key: 'changes', label: '变更对照', children: <ProposalChanges before={candidate.response.base_definition} after={proposal.definition} options={options.data} /> }] : []),
          ]} />
        </div><div className="agent-assistance-save"><span>{proposal ? candidate === last ? '保存为草稿' : '等待最新方案' : '当前版本的配置'}</span>
          {proposal && <Button type="primary" loading={saving} disabled={!canSave} onClick={() => void save()}>{agent ? '保存为新草稿' : '创建并保存草稿'}</Button>}
        </div></> : <div className="agent-assistance-preview-empty"><span><FileTextOutlined aria-hidden /></span><Typography.Text>方案生成后在这里预览</Typography.Text></div>}
      </section>
    </div>
  </section>
}

function ProposalChanges({ before, after, options }: { before: Definition; after: Definition; options?: Options }) {
  const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
  if (!changed.length) return <Empty description="流程配置没有变化" />
  return <Space orientation="vertical" style={{ width: '100%' }}>{changed.map(field => <Card key={field} size="small" title={fields[field]}>
    {field === 'input_schema' || field === 'output_schema' ? <SchemaComparison before={before[field]} after={after[field]} label={fields[field]} /> : <>
      <Typography.Text strong>修改前</Typography.Text><DifferenceValue field={field} value={before[field]} definition={before} options={options} />
      <Typography.Text strong>修改后</Typography.Text><DifferenceValue field={field} value={after[field]} definition={after} options={options} />
    </>}
  </Card>)}</Space>
}
