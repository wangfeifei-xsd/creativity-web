import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Tabs, Typography, type FormInstance } from 'antd'
import { useImperativeHandle, useState, type ReactNode, type Ref } from 'react'
import { SchemaFields } from '../../components/schema-fields/SchemaFields'
import { schemaRules, type SchemaObject } from '../../components/schema-fields/schema'
import { FlowValueInput } from './FlowValueInput'
import { fieldChoices, fieldSchema, locateFlowIssue, stepKinds, withCurrentChoice, type FlowIssue, type Step, type StepTab } from './flow-fields'
import { type Definition, type Options, parseObject, pretty } from './types'

type Mapping = { field: string; source: 'input' | 'step' | 'constant'; step?: string | null; path?: string; value?: string }
type Values = Omit<Step, 'input_schema' | 'output_schema' | 'inputs'> & { input_schema: string; output_schema: string; mappings: Mapping[] }
export type StepFormHandle = { flush: () => Promise<Step>; focus: (issue: FlowIssue) => void }
const jsonRule = { validator: (_: unknown, value?: string) => { try { JSON.parse(value ?? ''); return Promise.resolve() } catch { return Promise.reject(new Error('请填写符合字段类型的值，复杂值须为有效 JSON')) } } }
const parseOr = (value: string | undefined, fallback: SchemaObject) => { try { return parseObject(value ?? '{}') } catch { return fallback } }

export function FlowStepForm({ ref, step, definition, options, initialTab = 'base', branches, onDirty, disabled }: {
  ref?: Ref<StepFormHandle>; step?: Step; definition: Definition; options: Options; initialTab?: StepTab; branches?: ReactNode; onDirty: () => void; disabled?: boolean
}) {
  const [form] = Form.useForm<Values>()
  const [tab, setTab] = useState<StepTab>(initialTab)
  const [initial] = useState(() => step ? { ...step, input_schema: pretty(step.input_schema), output_schema: pretty(step.output_schema),
    mappings: Object.entries(step.inputs ?? {}).map(([field, source]) => ({ ...source, field, value: pretty(source.value) })) } : {
    key: `step_${crypto.randomUUID().slice(0, 8)}`, name: '', kind: 'compute' as const, operator: 'object' as const, timeout_seconds: 30, failure_policy: 'fail' as const, max_retries: 0,
    input_schema: pretty({ type: 'object', properties: {} }), output_schema: pretty({ type: 'object', properties: {} }), mappings: [],
  })
  const kind = Form.useWatch('kind', form) ?? initial.kind
  const failurePolicy = Form.useWatch('failure_policy', form) ?? initial.failure_policy
  const inputSchema = parseOr(Form.useWatch('input_schema', form), step?.input_schema ?? {})
  const [issue, setIssue] = useState<FlowIssue>()
  const tabForField = (field: string): StepTab => field === 'mappings' || field === 'input_schema' ? 'inputs' : field === 'output_schema' ? 'output' : 'base'
  useImperativeHandle(ref, () => ({
    async flush() {
      let values: Values
      try { values = await form.validateFields() } catch (failure) {
        const first = (failure as { errorFields?: { name: (string | number)[] }[] }).errorFields?.[0]?.name
        if (first) { setTab(tabForField(String(first[0]))); requestAnimationFrame(() => form.scrollToField(first, { block: 'nearest', focus: true })) }
        throw failure
      }
      const inputs: Step['inputs'] = {}
      for (const item of values.mappings ?? []) inputs[item.field] = {
        source: item.source, step: item.source === 'step' ? item.step ?? null : null,
        path: item.source === 'constant' ? '' : item.path ?? '', value: item.source === 'constant' ? JSON.parse(item.value ?? 'null') as unknown : null,
      }
      return { ...step, key: values.key, name: values.name, kind: values.kind, operator: values.kind === 'compute' ? values.operator ?? 'object' : null,
        dependency: values.kind === 'compute' ? null : values.dependency ?? null, inputs,
        input_schema: parseObject(values.input_schema), output_schema: parseObject(values.output_schema), timeout_seconds: values.timeout_seconds,
        failure_policy: values.failure_policy, max_retries: values.failure_policy === 'retry' ? values.max_retries : 0 }
    },
    focus(next) {
      const location = locateFlowIssue(definition, next.path ?? '')
      setIssue(next); setTab(location.tab)
      if (location.field && location.field !== 'inputs') form.setFields([{ name: location.field as keyof Values, errors: [next.message] }])
    },
  }))
  const dependencies = options.dependencies.filter(item => item.resource_type === (kind === 'tool' ? 'tool' : 'model_route'))
  const dependency = Form.useWatch('dependency', form) ?? initial.dependency
  const depOptions = dependencies.map(item => ({ value: item.version_id, label: item.name, disabled: kind === 'model' && !item.required_capabilities?.includes('text') }))
  if (dependency && !depOptions.some(item => item.value === dependency)) depOptions.push({ value: dependency, label: '资源不可用，请重新选择', disabled: true })
  const base = <>
    <Form.Item name="name" label="步骤名称" rules={[{ required: true, whitespace: true, message: '请填写步骤名称' }]}><Input maxLength={128} /></Form.Item>
    <Form.Item name="kind" label="步骤类型"><Select options={Object.entries(stepKinds).map(([value, label]) => ({ value, label }))} onChange={() => form.setFieldsValue({ dependency: null })} /></Form.Item>
    {kind === 'compute' ? <Form.Item name="operator" label="操作"><Select options={[{ value: 'object', label: '对象组装' }, { value: 'input', label: '等待补充' }, { value: 'approval', label: '等待审批' }]} /></Form.Item> :
      <Form.Item name="dependency" label={kind === 'tool' ? '工具' : '模型路由'} extra={kind === 'model' ? '留空使用智能体默认模型路由' : undefined} rules={kind === 'tool' ? [{ required: true, message: '请选择工具' }] : []}>
        <Select allowClear showSearch optionFilterProp="label" options={depOptions} /></Form.Item>}
    {kind === 'tool' && dependency && !definition.bindings.tool_ids.includes(dependency) && <Alert type="warning" showIcon title="此工具尚未加入资源依赖中的工具白名单" className="agent-flow-field-notice" />}
    <div className="agent-flow-form-pair"><Form.Item name="timeout_seconds" label="超时（秒）" rules={[{ required: true, message: '请填写超时' }]}><InputNumber min={1} max={3600} precision={0} /></Form.Item>
      <Form.Item name="failure_policy" label="失败处理"><Select options={[{ value: 'fail', label: '终止并报错' }, { value: 'retry', label: '重试' }, { value: 'partial', label: '返回部分结果' }]} /></Form.Item></div>
    {failurePolicy === 'retry' && <Form.Item name="max_retries" label="重试上限（次）" rules={[{ required: true, message: '请填写重试次数' }]}><InputNumber min={1} max={2} precision={0} /></Form.Item>}
    <Form.Item name="key" label="步骤标识" rules={[{ required: true, message: '请填写步骤标识' }, { validator: (_, value: string) => definition.steps.some(item => item.key === value && item.key !== step?.key) || value === 'END' ? Promise.reject(new Error('步骤标识已使用')) : Promise.resolve() }]}><Input disabled={!!step || disabled} /></Form.Item>
  </>
  const inputs = <>
    <Form.Item name="input_schema" label="输入结构" rules={schemaRules}><SchemaFields label="步骤输入结构" disabled={disabled} compact /></Form.Item>
    <Form.List name="mappings">{(fields, { add, remove }) => <Space orientation="vertical" className="agent-flow-full-width" size="middle">
      {fields.map(field => <Card size="small" key={field.key} title={`输入映射 ${field.name + 1}`} extra={<Button size="small" danger disabled={disabled} onClick={() => { remove(field.name); onDirty() }}>删除</Button>}>
        <MappingFields form={form} index={field.name} schema={inputSchema} definition={definition} stepKey={step?.key} disabled={disabled} />
      </Card>)}
      <Button disabled={disabled || fields.length >= 100} onClick={() => { add({ source: 'input', path: '' }); onDirty() }}>新增输入映射</Button>
    </Space>}</Form.List>
  </>
  return <Form component={false} name={`flow-step-${initial.key}`} form={form} layout="vertical" initialValues={initial} disabled={disabled} onValuesChange={() => { setIssue(undefined); onDirty() }}>
    {issue && <Alert type="error" showIcon title={issue.message} className="agent-flow-field-notice" />}
    <Tabs size="small" activeKey={tab} onChange={key => setTab(key as StepTab)} items={[
      { key: 'base', label: '基础配置', forceRender: true, children: base },
      { key: 'inputs', label: '输入映射', forceRender: true, children: inputs },
      { key: 'output', label: '输出结构', forceRender: true, children: <Form.Item name="output_schema" rules={schemaRules}><SchemaFields label="步骤输出结构" disabled={disabled} compact /></Form.Item> },
      ...(branches ? [{ key: 'branches', label: '后续流转', forceRender: true, children: branches }] : []),
    ]} />
  </Form>
}

function MappingFields({ form, index, schema, definition, stepKey, disabled }: { form: FormInstance<Values>; index: number; schema: SchemaObject; definition: Definition; stepKey?: string; disabled?: boolean }) {
  const item = Form.useWatch(['mappings', index], form) as Mapping | undefined
  const sourceSchema = item?.source === 'step' ? definition.steps.find(step => step.key === item.step)?.output_schema ?? {} : definition.input_schema
  const sourceFields = withCurrentChoice(fieldChoices(sourceSchema, item?.source === 'step' ? '完整步骤输出' : '完整运行输入'), item?.path)
  const targetFields = withCurrentChoice(fieldChoices(schema, undefined, true), item?.field)
  const steps = definition.steps.filter(step => step.key !== stepKey).map(step => ({ value: step.key, label: step.name }))
  if (item?.step && !steps.some(step => step.value === item.step)) steps.push({ value: item.step, label: '来源步骤不可用' })
  return <>
    <Form.Item name={[index, 'field']} label="输入字段" rules={[{ required: true, message: '请选择输入字段' }, { validator: (_, value: string) => (form.getFieldValue('mappings') as Mapping[] ?? []).filter(mapping => mapping.field === value).length > 1 ? Promise.reject(new Error('输入字段不能重复映射')) : Promise.resolve() }]}><Select showSearch optionFilterProp="label" options={targetFields} onChange={() => form.setFieldValue(['mappings', index, 'value'], undefined)} /></Form.Item>
    <Form.Item name={[index, 'source']} label="来源"><Select options={[{ value: 'input', label: '运行输入' }, { value: 'step', label: '步骤输出' }, { value: 'constant', label: '固定值' }]} onChange={() => { form.setFieldValue(['mappings', index, 'path'], ''); form.setFieldValue(['mappings', index, 'step'], null); form.setFieldValue(['mappings', index, 'value'], undefined) }} /></Form.Item>
    {item?.source === 'step' && <Form.Item name={[index, 'step']} label="来源步骤" rules={[{ required: true, message: '请选择来源步骤' }]}><Select showSearch optionFilterProp="label" options={steps} onChange={() => form.setFieldValue(['mappings', index, 'path'], '')} /></Form.Item>}
    {item?.source !== 'constant' ? <Form.Item name={[index, 'path']} label="来源字段"><Select showSearch optionFilterProp="label" options={sourceFields} /></Form.Item> :
      <Form.Item name={[index, 'value']} label="固定值" rules={[jsonRule]}><FlowValueInput schema={fieldSchema(schema, item.field ?? '')} path={item.field} disabled={disabled} /></Form.Item>}
    {!targetFields.length && <Typography.Text type="secondary">请先在输入结构中定义字段</Typography.Text>}
  </>
}
