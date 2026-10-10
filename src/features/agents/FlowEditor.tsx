import { Alert, Button, Dropdown, Input, Modal, Popconfirm, Select, Space, Typography } from 'antd'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { ErrorNotice } from '../../components/Management'
import { FlowGraph } from './FlowGraph'
import { FlowBranches } from './FlowBranches'
import { FlowStepForm, type StepFormHandle } from './FlowStepForm'
import { FlowEdgeForm, type EdgeFormHandle } from './FlowEdgeForm'
import { locateFlowIssue, moveBranch, type FlowIssue, type StepTab } from './flow-fields'
import { parseFlowJson } from './flow-json'
import { type Definition, type Options, pretty } from './types'

type Selection = { kind: 'step'; key: string; tab?: StepTab } | { kind: 'new' } | { kind: 'edge'; index: number | 'new'; source: string }
export type FlowEditorHandle = { flush: () => Promise<Definition>; focus: (issue: FlowIssue) => void }

export function FlowEditor({ ref, value, options, onChange, onDirty, disabled, issues = [] }: {
  ref?: Ref<FlowEditorHandle>; value: Definition; options: Options; onChange: (value: Definition) => void; onDirty: () => void; disabled?: boolean; issues?: FlowIssue[]
}) {
  const [selection, setSelection] = useState<Selection>({ kind: 'step', key: value.start_step })
  const stepForm = useRef<StepFormHandle>(null)
  const edgeForm = useRef<EdgeFormHandle>(null)
  const pending = useRef(false)
  const [generation, setGeneration] = useState(0)
  const [error, setError] = useState<unknown>()
  const [focus, setFocus] = useState<FlowIssue>()
  const [jsonDraft, setJsonDraft] = useState<string>()
  const [jsonError, setJsonError] = useState<unknown>()
  const selectedKey = selection.kind === 'step' ? selection.key : selection.kind === 'edge' ? selection.source : undefined
  const step = value.steps.find(item => item.key === selectedKey)
  const names = value.steps.map(item => ({ value: item.key, label: item.name }))
  function dirty() { pending.current = true; onDirty() }
  function change(next: Definition) { onChange(next); onDirty() }
  async function flush(): Promise<Definition> {
    if (!pending.current) return value
    let next = value
    try {
      if (selection.kind === 'edge' && edgeForm.current) {
        const edge = await edgeForm.current.flush()
        const index = selection.index === 'new' ? value.edges.length : selection.index
        next = { ...value, edges: selection.index === 'new' ? [...value.edges, edge] : value.edges.map((item, i) => i === selection.index ? edge : item) }
        setSelection({ kind: 'edge', index, source: edge.source })
      } else if (stepForm.current) {
        const result = await stepForm.current.flush()
        next = { ...value, steps: selection.kind === 'new' ? [...value.steps, result] : value.steps.map(item => item.key === selectedKey ? result : item) }
        if (selection.kind === 'new') setSelection({ kind: 'step', key: result.key })
      }
      pending.current = false; setError(undefined); change(next)
      return next
    } catch (failure) { setError(failure); throw failure }
  }
  function focusIssue(issue: FlowIssue) {
    const location = locateFlowIssue(value, issue.path ?? '')
    setFocus(issue)
    if (location.node) setSelection({ kind: 'step', key: location.node, tab: location.tab })
  }
  useImperativeHandle(ref, () => ({ flush, focus: focusIssue }))
  useEffect(() => { if (focus) stepForm.current?.focus(focus) }, [focus, selection])
  async function select(next: Selection) {
    const activate = () => {
      if (next.kind === 'new' || next.kind === 'edge') setGeneration(n => n + 1)
      setSelection(next); pending.current = next.kind === 'new' || (next.kind === 'edge' && next.index === 'new'); setFocus(undefined); setError(undefined)
    }
    if (!pending.current) { activate(); return }
    try { await flush(); activate() } catch { /* 保留未完成的当前配置，字段已显示错误。 */ }
  }
  async function mutate(action: (current: Definition) => Definition) {
    try { change(action(await flush())) } catch { /* 修正当前字段后再修改流程。 */ }
  }
  const branches = step && <FlowBranches definition={value} source={step.key} disabled={disabled}
    onEdit={index => void select({ kind: 'edge', index, source: step.key })} onAdd={() => void select({ kind: 'edge', index: 'new', source: step.key })}
    onDelete={index => void mutate(current => ({ ...current, edges: current.edges.filter((_, i) => i !== index) }))}
    onMove={(index, offset) => void mutate(current => moveBranch(current, index, offset))} />
  return <div className="agent-flow-editor" aria-label="流程配置">
    <div className="agent-flow-editor-toolbar"><Space wrap><Typography.Text>起始步骤</Typography.Text><Select aria-label="起始步骤" value={value.start_step} options={names} disabled={disabled}
      className="agent-flow-start-picker" onChange={start_step => void mutate(current => ({ ...current, start_step }))} />
      <Button disabled={disabled || value.steps.length >= 64} onClick={() => void select({ kind: 'new' })}>新增步骤</Button>
      <Button disabled={disabled || value.edges.length >= 256} onClick={() => void select({ kind: 'edge', index: 'new', source: selectedKey ?? value.start_step })}>新增连线</Button></Space>
      <Dropdown disabled={disabled} menu={{ items: [{ key: 'json', label: '高级 JSON' }], onClick: () => void (async () => {
        try { const current = await flush(); setJsonError(undefined); setJsonDraft(pretty({ start_step: current.start_step, steps: current.steps, edges: current.edges })) } catch { /* 保留字段错误。 */ }
      })() }}><Button disabled={disabled}>高级</Button></Dropdown>
    </div>
    {issues.length > 0 && <Alert type="error" showIcon title="请修正配置项" className="agent-flow-field-notice" description={<Space orientation="vertical" size={0}>{issues.map((issue, index) => <Button type="link" key={index} className="agent-flow-issue-link" onClick={() => { void flush().then(() => focusIssue(issue)).catch(() => {}) }}>{issue.message}</Button>)}</Space>} />}
    <div className="agent-flow-workspace">
      <FlowGraph definition={value} selected={selectedKey} onSelect={key => void select({ kind: 'step', key })} onEdge={index => void select({ kind: 'edge', index, source: value.edges[index].source })}
        invalidNodes={issues.map(issue => locateFlowIssue(value, issue.path ?? '').node).filter((key): key is string => !!key)} disabled={disabled} />
      <aside className="agent-flow-inspector" aria-label={selection.kind === 'edge' ? '流转配置' : '步骤配置'}>
        <div className="agent-flow-inspector-heading"><Typography.Title level={5}>{selection.kind === 'new' ? '新增步骤' : selection.kind === 'edge' ? '配置流转' : step?.name ?? '步骤不可用'}</Typography.Title>
          {step && selection.kind === 'step' && <Popconfirm title={`删除步骤“${step.name}”及其连线？`} description="引用此步骤的输入映射需要重新配置。" okText="删除" cancelText="取消" disabled={disabled || value.steps.length === 1}
            onConfirm={() => { const steps = value.steps.filter(item => item.key !== step.key); const start_step = value.start_step === step.key ? steps[0].key : value.start_step;
              pending.current = false; setError(undefined); setFocus(undefined); change({ ...value, steps, start_step, edges: value.edges.filter(item => item.source !== step.key && item.target !== step.key) }); setSelection({ kind: 'step', key: start_step }) }}>
            <Button size="small" danger disabled={disabled || value.steps.length === 1}>删除步骤</Button></Popconfirm>}
        </div>
        <ErrorNotice error={error} />
        {selection.kind === 'edge' ? <FlowEdgeForm key={`edge-${selection.index}-${generation}`} ref={edgeForm} edge={selection.index === 'new' ? undefined : value.edges[selection.index]} source={selection.source} definition={value} onDirty={dirty} disabled={disabled} /> :
          (selection.kind === 'new' || step) && <FlowStepForm key={`${selection.kind === 'new' ? 'new' : step!.key}-${generation}`} ref={stepForm} step={selection.kind === 'new' ? undefined : step} definition={value} options={options}
            initialTab={selection.kind === 'step' ? selection.tab : undefined} branches={selection.kind === 'new' ? undefined : branches} onDirty={dirty} disabled={disabled} />}
        <Space wrap className="agent-flow-inspector-actions">
          <Button type="primary" disabled={disabled} onClick={() => void flush().catch(() => {})}>应用配置</Button>
          {selection.kind !== 'step' && <Button disabled={disabled} onClick={() => { pending.current = false; setError(undefined); setSelection({ kind: 'step', key: selectedKey ?? value.start_step, tab: 'branches' }) }}>返回步骤</Button>}
        </Space>
      </aside>
    </div>
    <Modal open={jsonDraft !== undefined} title="流程 JSON" width={800} okText="应用到草稿" cancelText="取消" onCancel={() => setJsonDraft(undefined)} onOk={() => {
      try { const next = { ...value, ...parseFlowJson(jsonDraft ?? '') }; pending.current = false; setGeneration(n => n + 1); change(next); setSelection({ kind: 'step', key: next.start_step }); setJsonDraft(undefined) }
      catch (failure) { setJsonError(failure) }
    }}><ErrorNotice error={jsonError} /><Input.TextArea aria-label="流程 JSON" rows={18} spellCheck={false} value={jsonDraft} onChange={event => setJsonDraft(event.target.value)} /></Modal>
  </div>
}
