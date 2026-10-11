import { Button, Form, Input, InputNumber, Modal, Select, Space, Steps, Switch, Tabs, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { PageContainer } from '../../components/PageContainer'
import { type FlowIssue } from './flow-fields'
import { send } from '../../api/management'
import { ErrorNotice } from '../../components/Management'
import { SchemaFields } from '../../components/schema-fields/SchemaFields'
import { schemaRules } from '../../components/schema-fields/schema'
import { SkillLoadingFields } from './SkillLoadingFields'
import { FlowEditor, type FlowEditorHandle } from './FlowEditor'
import { type Definition, type Detail, type Options, type Version, parseObject, pretty, workflowNames } from './types'

type Values = {
  instructions: string
  agent_code: string; name: string; description: string; owner: string; version_label: string; template: string
  input_schema: string; output_schema: string; steps: string; edges: string; start_step: string
  prompt_id: string; model_route_id: string; embedding_route_id?: string; tool_ids: string[]; skill_ids: string[]
  skill_loading_by_resource: Record<string, Omit<NonNullable<Definition['bindings']['skill_loading']>[number], 'version_id'>>
  deadline_seconds: number; token_limit: number; max_model_rounds: number; max_tool_calls: number
  max_iterations: number; loop_timeout_seconds: number; output_repair_attempts: number
  context_limit: number; conversation_enabled: boolean; summary_policy: 'none' | 'recent'
  memory_enabled: boolean; memory_policy: string; amount?: string; currency: string
}
const stepFields: (keyof Values)[][] = [
  ['agent_code', 'name', 'description', 'owner', 'version_label', 'template', 'instructions'],
  ['input_schema', 'output_schema'],
  ['steps', 'edges', 'start_step'],
  ['prompt_id', 'model_route_id', 'embedding_route_id', 'tool_ids', 'skill_ids', 'skill_loading_by_resource'],
  ['deadline_seconds', 'token_limit', 'max_model_rounds', 'max_tool_calls', 'max_iterations', 'loop_timeout_seconds', 'output_repair_attempts', 'context_limit', 'conversation_enabled', 'summary_policy', 'memory_enabled', 'memory_policy', 'amount', 'currency'],
]

function editorField(path: string): keyof Values {
  const field = path.replace(/^(body\.)?(definition\.)?/, '').replace(/^(bindings|limits|context)\./, '').split('.')[0]
  const aliases: Record<string, keyof Values> = { entrypoint: 'template', workflow_type: 'template', cost_limit: 'amount', prompt_version: 'prompt_id', model_route_version: 'model_route_id', embedding_route_version: 'embedding_route_id', tool_versions: 'tool_ids', skill_versions: 'skill_ids', skill_loading: 'skill_loading_by_resource' }
  return aliases[field] ?? field as keyof Values
}

export function AgentEditor({ options, version, name, initialIssues = [], initialFocus, onClose, onSaved }: {
  options: Options; version?: Version; name?: string; initialIssues?: FlowIssue[]; initialFocus?: FlowIssue; onClose: () => void; onSaved: (detail?: Detail) => void
}) {
  const initial = version?.definition ?? options.templates[0].definition
  const [definition, setDefinition] = useState<Definition>(initial)
  const [form] = Form.useForm<Values>()
  const [step, setStep] = useState(() => {
    if (!version) return 0
    if (!initialFocus || /^(steps|edges|start_step)(\.|$)/.test(initialFocus.path ?? '')) return 2
    const section = stepFields.findIndex(names => names.includes(editorField(initialFocus.path ?? '')))
    return section < 0 ? 2 : section
  })
  const flow = useRef<FlowEditorHandle>(null)
  const submitting = useRef(false)
  const [dirty, setDirty] = useState(false)
  const leaving = useRef(false)
  const blocker = useBlocker(() => dirty && !leaving.current)
  const [issues, setIssues] = useState<FlowIssue[]>(initialIssues)
  useEffect(() => {
    if (!initialFocus) return
    if (/^(steps|edges|start_step)(\.|$)/.test(initialFocus.path ?? '')) flow.current?.focus(initialFocus)
    else {
      const field = editorField(initialFocus.path ?? '')
      if (stepFields.some(names => names.includes(field))) form.setFields([{ name: field, errors: [initialFocus.message] }])
    }
  }, [initialFocus, form])
  useEffect(() => {
    if (!dirty) return
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const liveInput = Form.useWatch('input_schema', form)
  const liveTools = Form.useWatch('tool_ids', form)
  let flowDefinition = definition
  try { flowDefinition = { ...definition, input_schema: parseObject(liveInput ?? pretty(definition.input_schema)), bindings: { ...definition.bindings, tool_ids: liveTools ?? definition.bindings.tool_ids } } } catch { /* 输入结构修正前沿用最近有效字段列表。 */ }
  const memoryEnabled = Form.useWatch('memory_enabled', form)
  const selectedSkills: string[] = Form.useWatch('skill_ids', form) ?? initial.bindings.skill_ids ?? []
  const templates = [...options.templates, ...(options.legacy_templates ?? []).filter(t => t.key === version?.definition.entrypoint)]
  function selectTemplate(key: string) {
    const next = templates.find(t => t.key === key)?.definition
    if (!next) return
    setDirty(true); setDefinition(next)
    form.setFieldsValue({ input_schema: pretty(next.input_schema), output_schema: pretty(next.output_schema), steps: pretty(next.steps), edges: pretty(next.edges), start_step: next.start_step })
  }
  const depOptions = (kind: string) => options.dependencies.filter(d => d.resource_type === kind).map(d => ({ value: d.version_id, label: d.name }))
  const routeSupports = (id: string, capabilities: string[]) => {
    const route = options.dependencies.find(d => d.resource_type === 'model_route' && d.version_id === id)
    return capabilities.every(capability => route?.required_capabilities?.includes(capability))
  }
  const routeOptions = (capabilities: string[], reason: string) => options.dependencies.filter(d => d.resource_type === 'model_route').map(d => ({
    value: d.version_id, label: routeSupports(d.version_id, capabilities) ? d.name : `${d.name}（${reason}）`, disabled: !routeSupports(d.version_id, capabilities),
  }))
  const routeRules = (capabilities: string[], message: string) => [{ validator: (_: unknown, id?: string) =>
    !id || routeSupports(id, capabilities) ? Promise.resolve() : Promise.reject(new Error(message)) }]
  async function save() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(undefined)
    try {
      let currentDefinition = definition
      try { currentDefinition = await flow.current?.flush() ?? definition } catch (failure) { setStep(2); throw failure }
      try { await form.validateFields() } catch (failure) {
        const fields = (failure as { errorFields?: { name: string[] }[] }).errorFields
        const invalidStep = stepFields.findIndex(names => fields?.some(field => names.includes(field.name[0] as keyof Values)))
        if (invalidStep >= 0) setStep(invalidStep)
        throw new Error('请修正标记的配置项后保存')
      }
      const v = form.getFieldsValue(true) as Values
      const memoryPolicy = v.memory_enabled ? parseObject(v.memory_policy) : null
      if (v.embedding_route_id && (!memoryPolicy || memoryPolicy.read_enabled === false)) {
        setStep(4)
        throw new Error('语义检索需要启用长期记忆及记忆读取；不使用时请清空语义检索模型路由')
      }
      const steps: unknown = JSON.parse(v.steps), edges: unknown = JSON.parse(v.edges)
      if (!Array.isArray(steps) || !Array.isArray(edges)) throw new Error('步骤和流转边必须为 JSON 数组')
      const body = {
        ...currentDefinition, instructions: v.instructions ?? '', start_step: v.start_step, input_schema: parseObject(v.input_schema), output_schema: parseObject(v.output_schema), steps, edges,
        bindings: { prompt_id: v.prompt_id || null, model_route_id: v.model_route_id || null, embedding_route_id: v.embedding_route_id || null, tool_ids: v.tool_ids ?? [], skill_ids: v.skill_ids ?? [],
          skill_loading: (v.skill_ids ?? []).filter(id => v.skill_loading_by_resource?.[id]).map(id => ({ ...v.skill_loading_by_resource[id], skill_id: id })) },
        limits: { deadline_seconds: v.deadline_seconds, token_limit: v.token_limit, max_model_rounds: v.max_model_rounds, max_tool_calls: v.max_tool_calls,
          max_iterations: v.max_iterations, loop_timeout_seconds: v.loop_timeout_seconds, output_repair_attempts: v.output_repair_attempts, cost_limit: v.amount ? { amount: v.amount, currency: v.currency } : null },
        context: { conversation_enabled: v.conversation_enabled, context_limit: v.context_limit, summary_policy: v.summary_policy,
          memory_policy: memoryPolicy },
      }
      if (version) {
        await send(`/admin/v1/agent-versions/${version.version_id}`, 'PATCH', { revision: version.revision, definition: body })
        leaving.current = true; onSaved()
      } else {
        const created = await send<Detail>('/admin/v1/agents', 'POST', { agent_code: v.agent_code, name: v.name, description: v.description, owner: v.owner, version_label: v.version_label, definition: body })
        leaving.current = true; onSaved(created)
      }
    } catch (failure) {
      leaving.current = false
      setError(failure)
      if (failure instanceof ApiError && failure.fields.length) {
        const nextIssues = failure.fields.map(field => ({ path: field.path.map(String).join('.').replace(/^(body\.)?(definition\.)?/, ''), message: field.message }))
        const flowIssues = nextIssues.filter(issue => /^(steps|edges|start_step)(\.|$)/.test(issue.path))
        setIssues(flowIssues)
        if (flowIssues.length) { setStep(2); flow.current?.focus(flowIssues[0]) }
        else {
          const fields = nextIssues.map(issue => ({ name: editorField(issue.path), errors: [issue.message] }))
          form.setFields(fields)
          const target = stepFields.findIndex(names => fields.some(field => names.includes(field.name as keyof Values)))
          if (target >= 0) setStep(target)
        }
      }
    } finally { setBusy(false); submitting.current = false }

  }
  const titles = ['基本配置', '输入输出', '流程', '资源依赖', '运行策略']
  function close() {
    if (!dirty) { onClose(); return }
    Modal.confirm({ title: '放弃尚未保存的配置？', okText: '放弃修改', cancelText: '继续编辑', onOk: () => { leaving.current = true; onClose() } })
  }
  async function changeSection(next: number) {
    try { await flow.current?.flush(); setStep(next) } catch { setStep(2) }
  }
  const actions = <Space wrap><Button onClick={close} disabled={busy}>{version ? '返回详情' : '取消'}</Button>
    {!version && step > 0 && <Button onClick={() => void changeSection(step - 1)} disabled={busy}>上一步</Button>}
    {!version && step < 4 ? <Button type="primary" disabled={busy} onClick={() => void form.validateFields(stepFields[step]).then(() => changeSection(step + 1)).catch(() => {})}>下一步</Button> :
      <Button type="primary" loading={busy} onClick={() => void save()}>保存草稿</Button>}</Space>
  const content = <>
    <Modal open={blocker.state === 'blocked'} title="放弃尚未保存的配置？" okText="放弃修改" cancelText="继续编辑"
      okButtonProps={{ disabled: busy }} onOk={() => blocker.state === 'blocked' && blocker.proceed()}
      onCancel={() => blocker.state === 'blocked' && blocker.reset()} />
    {version ? <Tabs className="agent-editor-tabs" activeKey={String(step)} onChange={key => void changeSection(Number(key))} items={titles.map((label, index) => ({ key: String(index), label, disabled: busy }))} /> :
      <Steps size="small" current={step} items={titles.map(title => ({ title }))} style={{ marginBottom: 24 }} />}
    {error != null && <div style={{ marginBottom: 16 }}><ErrorNotice error={error} /></div>}
    <Form form={form} layout="vertical" disabled={busy} onValuesChange={() => setDirty(true)} initialValues={{ instructions: initial.instructions ?? '', template: initial.entrypoint, version_label: '初始草稿', input_schema: pretty(initial.input_schema), output_schema: pretty(initial.output_schema),
      steps: pretty(initial.steps), edges: pretty(initial.edges), start_step: initial.start_step, ...initial.bindings, ...initial.limits, ...initial.context,
      skill_loading_by_resource: Object.fromEntries((initial.bindings.skill_loading ?? []).map(item => [item.skill_id, item])),
      amount: initial.limits.cost_limit?.amount, currency: initial.limits.cost_limit?.currency ?? 'CNY', memory_enabled: !!initial.context.memory_policy,
      memory_policy: pretty(initial.context.memory_policy ?? { allowed_types: ['PREFERENCE', 'FACT'], read_enabled: true, suggest_enabled: false, write_mode: 'DISABLED', ttl_seconds: 15552000, max_items: 100, retrieval_limit: 10, failure_mode: 'OMIT' }) }}>
      <div hidden={step !== 0}>
        {!version && <><Form.Item name="agent_code" label="调用编码" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>
          <Form.Item name="name" label="智能体名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="description" label="用途" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="owner" label="负责人" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="version_label" label="草稿名称" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item></>}
        <Form.Item name="template" label="流程模板"><Select onChange={selectTemplate} options={templates.map(t => ({ value: t.key,
          label: t.name === workflowNames[t.workflow_type] ? t.name : `${t.name} · ${workflowNames[t.workflow_type]}` }))} /></Form.Item>
        <Form.Item name="instructions" label="任务指令"><Input.TextArea rows={6} maxLength={32000} /></Form.Item>
      </div>
      <div hidden={step !== 1}>
        <Form.Item name="input_schema" label="输入结构" rules={schemaRules}><SchemaFields label="输入结构" disabled={busy} /></Form.Item>
        <Form.Item name="output_schema" label="输出结构" rules={schemaRules}><SchemaFields label="输出结构" disabled={busy} /></Form.Item>
      </div>
      <div hidden={step !== 2}>
        <FlowEditor key={definition.entrypoint} ref={flow} value={flowDefinition} options={options} disabled={busy} issues={issues} onDirty={() => setDirty(true)} onChange={next => {
          setDefinition(next)
          form.setFieldsValue({ steps: pretty(next.steps), edges: pretty(next.edges), start_step: next.start_step })
        }} />
        <Form.Item name="start_step" hidden><Input /></Form.Item>
        <Form.Item name="steps" hidden><Input /></Form.Item>
        <Form.Item name="edges" hidden><Input /></Form.Item>
      </div>
      <div hidden={step !== 3}>
        <Form.Item name="prompt_id" label="提示词"><Select allowClear showSearch optionFilterProp="label" options={depOptions('prompt')} /></Form.Item>
        <Form.Item name="model_route_id" label="模型路由" rules={routeRules(['text'], '请选择支持文本生成的模型路由')}><Select allowClear showSearch optionFilterProp="label" options={routeOptions(['text'], '不支持文本生成')} /></Form.Item>
        <Form.Item name="embedding_route_id" label="语义检索模型路由" extra="仅在读取长期记忆时使用，需选择支持向量生成的路由" rules={routeRules(['embedding'], '此路由不支持向量生成，请更换或清空语义检索模型路由')}><Select allowClear showSearch optionFilterProp="label" options={routeOptions(['embedding'], '不支持向量生成')} /></Form.Item>
        <Form.Item name="tool_ids" label="工具白名单"><Select mode="multiple" optionFilterProp="label" options={depOptions('tool')} /></Form.Item>
        <Form.Item name="skill_ids" label="技能"><Select mode="multiple" optionFilterProp="label" options={depOptions('skill')} /></Form.Item>
        {selectedSkills.map(id => <SkillLoadingFields key={id} versionId={id} label={depOptions('skill').find(d => d.value === id)?.label ?? '技能名称不可用'} />)}
      </div>
      <div hidden={step !== 4}>
        {([
          ['deadline_seconds', '运行限时（秒）', 1, 3600], ['loop_timeout_seconds', '循环限时（秒）', 1, 3600], ['token_limit', 'Token 上限（个）', 1, 1000000],
          ['context_limit', '上下文上限（Token）', 1, 1000000], ['max_model_rounds', '模型轮数上限（次）', 1, 100], ['max_tool_calls', '工具调用上限（次）', 0, 100],
          ['max_iterations', '循环上限（次）', 1, 100], ['output_repair_attempts', '输出修复上限（次）', 0, 2],
        ] as const).map(([name, label, min, max]) => <Form.Item key={name} name={name} label={label}><InputNumber min={min} max={max} precision={0} style={{ width: '100%' }} /></Form.Item>)}
        <Form.Item name="amount" label="费用上限"><InputNumber stringMode min="0.00000001" precision={8} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="currency" label="币种"><Select options={[{ value: 'CNY', label: '人民币' }, { value: 'USD', label: '美元' }]} /></Form.Item>
        <Form.Item name="conversation_enabled" label="启用会话" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="summary_policy" label="会话摘要"><Select options={[{ value: 'none', label: '不读取' }, { value: 'recent', label: '最近摘要' }]} /></Form.Item>
        <Form.Item name="memory_enabled" label="启用长期记忆" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="memory_policy" label="记忆策略" hidden={!memoryEnabled}><Input.TextArea rows={8} /></Form.Item>
      </div>
    </Form>
  </>
  return version ? <div className="agent-editor-page"><PageContainer title={`${name ?? '智能体'} · 编辑配置`} actions={actions}>
    <div className="agent-editor-state"><Tag>{version.version_label}</Tag><Tag color={dirty ? 'processing' : 'default'}>{dirty ? '有未保存的修改' : '草稿'}</Tag></div>{content}
  </PageContainer></div> : <Modal open width={1280} title="新增智能体" onCancel={close} closable={!busy} maskClosable={false}
    styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }} footer={actions}>{content}</Modal>
}
