import { Button, Form, Input, InputNumber, Modal, Select, Space, Steps, Switch } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { ErrorNotice } from '../../components/Management'
import { SkillLoadingFields } from './SkillLoadingFields'
import { type Definition, type Detail, type Options, type Version, parseObject, pretty, workflowNames } from './types'

type Values = {
  agent_code: string; name: string; description: string; owner: string; version_label: string; template: string
  input_schema: string; output_schema: string; steps: string; edges: string; start_step: string
  prompt_version: string; model_route_version: string; tool_versions: string[]; skill_versions: string[]
  skill_loading_by_version: Record<string, Omit<NonNullable<Definition['bindings']['skill_loading']>[number], 'version_id'>>
  deadline_seconds: number; token_limit: number; max_model_rounds: number; max_tool_calls: number
  max_iterations: number; loop_timeout_seconds: number; output_repair_attempts: number
  context_limit: number; conversation_enabled: boolean; summary_policy: 'none' | 'recent'
  memory_enabled: boolean; memory_policy: string; amount?: string; currency: string
}

export function AgentEditor({ options, version, onClose, onSaved }: {
  options: Options; version?: Version; onClose: () => void; onSaved: (detail?: Detail) => void
}) {
  const initial = version?.definition ?? options.templates[0].definition
  const [definition, setDefinition] = useState<Definition>(initial)
  const [form] = Form.useForm<Values>()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const memoryEnabled = Form.useWatch('memory_enabled', form)
  const selectedSkills: string[] = Form.useWatch('skill_versions', form) ?? initial.bindings.skill_versions ?? []
  const templates = [...options.templates, ...(options.legacy_templates ?? []).filter(t => t.key === version?.definition.entrypoint)]
  function selectTemplate(key: string) {
    const next = templates.find(t => t.key === key)?.definition
    if (!next) return
    setDefinition(next)
    form.setFieldsValue({ input_schema: pretty(next.input_schema), output_schema: pretty(next.output_schema), steps: pretty(next.steps), edges: pretty(next.edges), start_step: next.start_step })
  }
  const depOptions = (kind: string) => options.dependencies.filter(d => d.resource_type === kind).map(d => ({ value: d.version_id, label: `${d.name} · ${d.version_label} · ${d.state.label}` }))
  async function save() {
    setBusy(true); setError(undefined)
    try {
      const v = form.getFieldsValue(true) as Values
      const steps: unknown = JSON.parse(v.steps), edges: unknown = JSON.parse(v.edges)
      if (!Array.isArray(steps) || !Array.isArray(edges)) throw new Error('步骤和流转边必须为 JSON 数组')
      const body = {
        ...definition, start_step: v.start_step, input_schema: parseObject(v.input_schema), output_schema: parseObject(v.output_schema), steps, edges,
        bindings: { prompt_version: v.prompt_version || null, model_route_version: v.model_route_version || null, tool_versions: v.tool_versions ?? [], skill_versions: v.skill_versions ?? [],
          skill_loading: (v.skill_versions ?? []).filter(id => v.skill_loading_by_version?.[id]).map(id => ({ ...v.skill_loading_by_version[id], version_id: id })) },
        limits: { deadline_seconds: v.deadline_seconds, token_limit: v.token_limit, max_model_rounds: v.max_model_rounds, max_tool_calls: v.max_tool_calls,
          max_iterations: v.max_iterations, loop_timeout_seconds: v.loop_timeout_seconds, output_repair_attempts: v.output_repair_attempts, cost_limit: v.amount ? { amount: v.amount, currency: v.currency } : null },
        context: { conversation_enabled: v.conversation_enabled, context_limit: v.context_limit, summary_policy: v.summary_policy,
          memory_policy: v.memory_enabled ? parseObject(v.memory_policy) : null },
      }
      if (version) { await send(`/admin/v1/agent-versions/${version.version_id}`, 'PATCH', { revision: version.revision, definition: body }); onSaved() }
      else onSaved(await send<Detail>('/admin/v1/agents', 'POST', { agent_code: v.agent_code, name: v.name, description: v.description, owner: v.owner, version_label: v.version_label, definition: body }))
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  const titles = ['基本配置', '输入输出与流程', '资源依赖', '运行策略']
  return <Modal open width={880} title={version ? '编辑智能体配置' : '新增智能体'} onCancel={onClose} closable={!busy} maskClosable={!busy}
    styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }} footer={<Space wrap><Button onClick={onClose} disabled={busy}>取消</Button>
      {step > 0 && <Button onClick={() => setStep(step - 1)} disabled={busy}>上一步</Button>}
      {step < 3 ? <Button type="primary" onClick={() => void form.validateFields().then(() => setStep(step + 1)).catch(() => {})}>下一步</Button> :
        <Button type="primary" loading={busy} onClick={() => void save()}>保存草稿</Button>}</Space>}>
    <Steps size="small" current={step} items={titles.map(title => ({ title }))} style={{ marginBottom: 24 }} />
    <ErrorNotice error={error} />
    <Form form={form} layout="vertical" disabled={busy} initialValues={{ template: initial.entrypoint, version_label: '初始草稿', input_schema: pretty(initial.input_schema), output_schema: pretty(initial.output_schema),
      steps: pretty(initial.steps), edges: pretty(initial.edges), start_step: initial.start_step, ...initial.bindings, ...initial.limits, ...initial.context,
      skill_loading_by_version: Object.fromEntries((initial.bindings.skill_loading ?? []).map(item => [item.version_id, item])),
      amount: initial.limits.cost_limit?.amount, currency: initial.limits.cost_limit?.currency ?? 'CNY', memory_enabled: !!initial.context.memory_policy,
      memory_policy: pretty(initial.context.memory_policy ?? { allowed_types: ['PREFERENCE', 'FACT'], read_enabled: true, suggest_enabled: false, write_mode: 'DISABLED', ttl_seconds: 15552000, max_items: 100, retrieval_limit: 10, failure_mode: 'OMIT' }) }}>
      <div hidden={step !== 0}>
        {!version && <><Form.Item name="agent_code" label="调用编码" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>
          <Form.Item name="name" label="智能体名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="description" label="用途" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="owner" label="负责人" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="version_label" label="草稿名称" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item></>}
        <Form.Item name="template" label="流程模板"><Select onChange={selectTemplate} options={templates.map(t => ({ value: t.key, label: `${t.name} · ${workflowNames[t.workflow_type]}` }))} /></Form.Item>
      </div>
      <div hidden={step !== 1}>
        <Form.Item name="input_schema" label="输入结构"><Input.TextArea rows={7} /></Form.Item>
        <Form.Item name="output_schema" label="输出结构"><Input.TextArea rows={7} /></Form.Item>
        <Form.Item name="start_step" label="起始步骤"><Input /></Form.Item>
        <Form.Item name="steps" label="步骤配置"><Input.TextArea rows={12} /></Form.Item>
        <Form.Item name="edges" label="流转条件"><Input.TextArea rows={6} /></Form.Item>
      </div>
      <div hidden={step !== 2}>
        <Form.Item name="prompt_version" label="提示词版本"><Select allowClear showSearch optionFilterProp="label" options={depOptions('prompt')} /></Form.Item>
        <Form.Item name="model_route_version" label="模型路由版本"><Select allowClear showSearch optionFilterProp="label" options={depOptions('model_route')} /></Form.Item>
        <Form.Item name="tool_versions" label="工具白名单"><Select mode="multiple" optionFilterProp="label" options={depOptions('tool')} /></Form.Item>
        <Form.Item name="skill_versions" label="技能版本"><Select mode="multiple" optionFilterProp="label" options={depOptions('skill')} /></Form.Item>
        {selectedSkills.map(id => <SkillLoadingFields key={id} versionId={id} label={depOptions('skill').find(d => d.value === id)?.label ?? '技能名称不可用'} />)}
      </div>
      <div hidden={step !== 3}>
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
  </Modal>
}
