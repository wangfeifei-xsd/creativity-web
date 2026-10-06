import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { ErrorNotice } from '../../components/Management'
import { type Definition, type Options, parseObject, pretty } from './types'

type Step = Definition['steps'][number]
type Edge = Definition['edges'][number]
type Mapping = { field: string; source: 'input' | 'step' | 'constant'; step?: string; path?: string; value?: string }
type StepValues = Omit<Step, 'input_schema' | 'output_schema' | 'inputs'> & { input_schema: string; output_schema: string; mappings: Mapping[] }
const kinds = [{ value: 'model', label: '模型调用' }, { value: 'tool', label: '工具调用' }, { value: 'compute', label: '计算与确认' }]

export function FlowEditor({ value, options, onChange }: { value: Definition; options: Options; onChange: (value: Definition) => void }) {
  const [editing, setEditing] = useState<Step | 'new'>()
  const [edge, setEdge] = useState<number | 'new'>()
  const [error, setError] = useState<unknown>()
  const names = value.steps.map(step => ({ value: step.key, label: step.name }))
  const label = (key: string) => key === 'END' ? '结束' : names.find(item => item.value === key)?.label ?? '步骤不可用'
  function move(from: string, to: string) {
    const steps = [...value.steps]
    const index = steps.findIndex(step => step.key === from), target = steps.findIndex(step => step.key === to)
    if (index < 0 || target < 0 || index === target) return
    const [item] = steps.splice(index, 1); steps.splice(target, 0, item)
    onChange({ ...value, steps })
  }
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <ErrorNotice error={error} />
    <Space wrap><span>起始步骤</span><Select aria-label="起始步骤" value={value.start_step} options={names} style={{ minWidth: 200 }} onChange={start_step => onChange({ ...value, start_step })} />
      <Button onClick={() => { setError(undefined); setEditing('new') }} disabled={value.steps.length >= 64}>新增步骤</Button>
      <Button onClick={() => setEdge('new')} disabled={value.edges.length >= 256}>新增连线</Button></Space>
    <Row gutter={[12, 12]} aria-label="流程编辑画布">
      {value.steps.map((step, index) => <Col key={step.key} xs={24} md={12}>
        <Card size="small" title={<Space>{step.key === value.start_step && <Tag color="blue">起点</Tag>}{step.name}</Space>}
          draggable onDragStart={event => event.dataTransfer.setData('text/plain', step.key)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); move(event.dataTransfer.getData('text/plain'), step.key) }}
          actions={[
            <Button key="edit" type="link" onClick={() => { setError(undefined); setEditing(step) }}>编辑</Button>,
            <Button key="up" type="link" disabled={!index} onClick={() => move(step.key, value.steps[index - 1].key)}>上移</Button>,
            <Button key="delete" type="link" danger disabled={value.steps.length === 1} onClick={() => Modal.confirm({ title: `删除步骤“${step.name}”及其连线？`, okText: '删除', cancelText: '取消', onOk: () => {
              const steps = value.steps.filter(item => item.key !== step.key)
              onChange({ ...value, steps, start_step: value.start_step === step.key ? steps[0].key : value.start_step, edges: value.edges.filter(item => item.source !== step.key && item.target !== step.key) })
            } })}>删除</Button>,
          ]}>
          <Space orientation="vertical"><span>{kinds.find(kind => kind.value === step.kind)?.label ?? '步骤类型不可用'} · {step.timeout_seconds} 秒</span>
            {value.edges.filter(item => item.source === step.key).map((item, i) => <Button key={i} type="link" onClick={() => setEdge(value.edges.indexOf(item))}>→ {label(item.target)}{item.otherwise ? '（其余情况）' : item.condition ? '（满足条件）' : ''}</Button>)}
          </Space>
        </Card>
      </Col>)}
    </Row>
    <Table rowKey={(_, index) => String(index)} size="small" pagination={false} dataSource={value.edges} columns={[
      { title: '来源', render: (_, item) => label(item.source) }, { title: '去向', render: (_, item) => label(item.target) },
      { title: '条件', render: (_, item) => item.otherwise ? '其余情况' : item.condition ? '满足条件' : '直接进入' },
      { title: '操作', render: (_, _item, index) => <Space><Button onClick={() => setEdge(index)}>编辑</Button><Button danger onClick={() => onChange({ ...value, edges: value.edges.filter((_, i) => i !== index) })}>删除</Button></Space> },
    ]} />
    {editing && <StepEditor key={editing === 'new' ? 'new' : editing.key} step={editing === 'new' ? undefined : editing} definition={value} options={options} onClose={() => setEditing(undefined)} onSave={step => {
      onChange({ ...value, steps: editing === 'new' ? [...value.steps, step] : value.steps.map(item => item.key === editing.key ? step : item) }); setEditing(undefined)
    }} />}
    {edge !== undefined && <EdgeEditor key={edge} edge={edge === 'new' ? undefined : value.edges[edge]} names={names} onClose={() => setEdge(undefined)} onSave={item => {
      onChange({ ...value, edges: edge === 'new' ? [...value.edges, item] : value.edges.map((old, index) => index === edge ? item : old) }); setEdge(undefined)
    }} />}
  </Space>
}

function StepEditor({ step, definition, options, onClose, onSave }: { step?: Step; definition: Definition; options: Options; onClose: () => void; onSave: (step: Step) => void }) {
  const [form] = Form.useForm<StepValues>()
  const [error, setError] = useState<unknown>()
  const kind = Form.useWatch('kind', form) ?? step?.kind ?? 'compute'
  return <Modal open title={step ? '编辑步骤' : '新增步骤'} width={760} onCancel={onClose} okText="确定" cancelText="取消" onOk={async () => {
    try {
      const values = await form.validateFields()
      const inputs: Step['inputs'] = {}
      for (const item of values.mappings ?? []) {
        if (Object.hasOwn(inputs, item.field)) throw new Error('输入字段不能重复')
        inputs[item.field] = { source: item.source, step: item.source === 'step' ? item.step : null, path: item.source === 'constant' ? '' : item.path ?? '', value: item.source === 'constant' ? JSON.parse(item.value ?? 'null') as unknown : null }
      }
      onSave({ key: values.key, name: values.name, kind: values.kind, operator: values.kind === 'compute' ? values.operator ?? 'object' : null, dependency: values.kind === 'compute' ? null : values.dependency ?? null,
        inputs, input_schema: parseObject(values.input_schema), output_schema: parseObject(values.output_schema), timeout_seconds: values.timeout_seconds, failure_policy: values.failure_policy,
        max_retries: values.failure_policy === 'retry' ? values.max_retries : 0 })
    } catch (failure) { setError(failure) }
  }} styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}>
    <ErrorNotice error={error} />
    <Form name="flow-step" form={form} layout="vertical" initialValues={step ? { ...step, input_schema: pretty(step.input_schema), output_schema: pretty(step.output_schema), mappings: Object.entries(step.inputs ?? {}).map(([field, source]) => ({ ...source, field, value: pretty(source.value) })) } : {
      key: `step_${crypto.randomUUID().slice(0, 8)}`, name: '', kind: 'compute', timeout_seconds: 30, failure_policy: 'retry', max_retries: 2,
      input_schema: pretty({ type: 'object', properties: {} }), output_schema: pretty({ type: 'object', properties: {} }), mappings: [],
    }}>
      <Form.Item name="key" label="步骤标识" rules={[{ required: true }]}><Input disabled={!!step} /></Form.Item>
      <Form.Item name="name" label="步骤名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
      <Form.Item name="kind" label="步骤类型"><Select options={kinds} /></Form.Item>
      {kind === 'compute' && <Form.Item name="operator" label="操作"><Select options={[{ value: 'object', label: '对象组装' }, { value: 'input', label: '等待补充' }, { value: 'approval', label: '等待审批' }]} /></Form.Item>}
      {kind !== 'compute' && <Form.Item name="dependency" label={kind === 'tool' ? '工具' : '模型路由'}><Select allowClear options={options.dependencies.filter(item => item.resource_type === (kind === 'tool' ? 'tool' : 'model_route')).map(item => ({ value: item.version_id, label: item.name }))} /></Form.Item>}
      <Form.Item name="input_schema" label="输入结构"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="output_schema" label="输出结构"><Input.TextArea rows={4} /></Form.Item>
      <Form.List name="mappings">{(fields, { add, remove }) => <Space orientation="vertical" style={{ width: '100%' }}>{fields.map(field => <Card size="small" key={field.key} extra={<Button danger onClick={() => remove(field.name)}>删除映射</Button>}>
        <Form.Item name={[field.name, 'field']} label="输入字段" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name={[field.name, 'source']} label="来源" rules={[{ required: true }]}><Select options={[{ value: 'input', label: '运行输入' }, { value: 'step', label: '步骤输出' }, { value: 'constant', label: '固定值' }]} /></Form.Item>
        <Form.Item name={[field.name, 'step']} label="来源步骤"><Select allowClear options={definition.steps.filter(item => item.key !== step?.key).map(item => ({ value: item.key, label: item.name }))} /></Form.Item>
        <Form.Item name={[field.name, 'path']} label="字段路径"><Input /></Form.Item>
        <Form.Item name={[field.name, 'value']} label="固定值（JSON）"><Input.TextArea rows={2} /></Form.Item>
      </Card>)}<Button onClick={() => add({ source: 'input', path: '' })}>新增输入映射</Button></Space>}</Form.List>
      <Form.Item name="timeout_seconds" label="超时（秒）"><InputNumber min={1} max={3600} /></Form.Item>
      <Form.Item name="failure_policy" label="失败处理"><Select options={[{ value: 'retry', label: '重试' }, { value: 'fail', label: '终止' }, { value: 'partial', label: '部分结果' }]} /></Form.Item>
      <Form.Item name="max_retries" label="重试上限（次）"><InputNumber min={1} max={2} /></Form.Item>
    </Form>
  </Modal>
}

function EdgeEditor({ edge, names, onClose, onSave }: { edge?: Edge; names: { value: string; label: string }[]; onClose: () => void; onSave: (edge: Edge) => void }) {
  const [form] = Form.useForm<{ source: string; target: string; mode: string; path: string; operator: 'eq' | 'ne' | 'exists'; value: string }>()
  const [error, setError] = useState<unknown>()
  const mode = Form.useWatch('mode', form)
  return <Modal open title="编辑连线" onCancel={onClose} okText="确定" cancelText="取消" onOk={async () => {
    try {
      const values = await form.validateFields()
      onSave({ source: values.source, target: values.target, otherwise: values.mode === 'otherwise', condition: values.mode === 'condition' ? { path: values.path, operator: values.operator, value: values.operator === 'exists' ? null : JSON.parse(values.value) as unknown } : null })
    } catch (failure) { setError(failure) }
  }}>
    <ErrorNotice error={error} />
    <Form name="flow-edge" form={form} layout="vertical" initialValues={{ source: edge?.source, target: edge?.target ?? 'END', mode: edge?.otherwise ? 'otherwise' : edge?.condition ? 'condition' : 'direct', path: edge?.condition?.path, operator: edge?.condition?.operator ?? 'eq', value: pretty(edge?.condition?.value ?? null) }}>
      <Form.Item name="source" label="来源步骤" rules={[{ required: true }]}><Select options={names} /></Form.Item>
      <Form.Item name="target" label="后续步骤" rules={[{ required: true }]}><Select options={[...names, { value: 'END', label: '结束' }]} /></Form.Item>
      <Form.Item name="mode" label="流转方式"><Select options={[{ value: 'direct', label: '直接进入' }, { value: 'condition', label: '满足条件' }, { value: 'otherwise', label: '其余情况' }]} /></Form.Item>
      {mode === 'condition' && <><Form.Item name="path" label="输出字段路径" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="operator" label="比较方式"><Select options={[{ value: 'eq', label: '等于' }, { value: 'ne', label: '不等于' }, { value: 'exists', label: '存在' }]} /></Form.Item>
        <Form.Item name="value" label="比较值（JSON）"><Input.TextArea rows={3} /></Form.Item></>}
    </Form>
  </Modal>
}
