import { Form, Select } from 'antd'
import { useImperativeHandle, type Ref } from 'react'
import { FlowValueInput } from './FlowValueInput'
import { fieldChoices, fieldSchema, withCurrentChoice, type Edge } from './flow-fields'
import { type Definition, pretty } from './types'

type Values = { source: string; target: string; mode: string; path: string; operator: 'eq' | 'ne' | 'exists'; value?: string }
export type EdgeFormHandle = { flush: () => Promise<Edge> }
export function FlowEdgeForm({ ref, edge, source, definition, onDirty, disabled }: {
  ref?: Ref<EdgeFormHandle>; edge?: Edge; source: string; definition: Definition; onDirty: () => void; disabled?: boolean
}) {
  const [form] = Form.useForm<Values>()
  const mode = Form.useWatch('mode', form) ?? (edge?.otherwise ? 'otherwise' : edge?.condition ? 'condition' : 'direct')
  const sourceKey = Form.useWatch('source', form) ?? edge?.source ?? source
  const path = Form.useWatch('path', form) ?? edge?.condition?.path
  const operator = Form.useWatch('operator', form) ?? edge?.condition?.operator ?? 'eq'
  const schema = definition.steps.find(step => step.key === sourceKey)?.output_schema ?? {}
  const names = definition.steps.map(step => ({ value: step.key, label: step.name }))
  useImperativeHandle(ref, () => ({ async flush() {
    const values = await form.validateFields()
    return { source: values.source, target: values.target, otherwise: values.mode === 'otherwise', condition: values.mode === 'condition'
      ? { path: values.path, operator: values.operator, value: values.operator === 'exists' ? null : JSON.parse(values.value ?? '') as unknown } : null }
  } }))
  return <Form component={false} name="flow-edge" form={form} layout="vertical" disabled={disabled} onValuesChange={onDirty}
    initialValues={{ source: edge?.source ?? source, target: edge?.target ?? 'END', mode: edge?.otherwise ? 'otherwise' : edge?.condition ? 'condition' : 'direct', path: edge?.condition?.path, operator: edge?.condition?.operator ?? 'eq', value: edge?.condition ? pretty(edge.condition.value) : undefined }}>
    <Form.Item name="source" label="来源步骤" rules={[{ required: true, message: '请选择来源步骤' }]}><Select showSearch optionFilterProp="label" options={names} onChange={() => form.setFieldsValue({ path: undefined, value: undefined })} /></Form.Item>
    <Form.Item name="mode" label="流转方式"><Select options={[{ value: 'direct', label: '直接进入' }, { value: 'condition', label: '满足条件' }, { value: 'otherwise', label: '其余情况（兜底）' }]} /></Form.Item>
    {mode === 'condition' && <>
      <Form.Item name="path" label="输出字段" rules={[{ required: true, message: '请选择条件字段' }]}><Select showSearch optionFilterProp="label" options={withCurrentChoice(fieldChoices(schema), path)} onChange={() => form.setFieldValue('value', undefined)} /></Form.Item>
      <Form.Item name="operator" label="比较方式"><Select options={[{ value: 'eq', label: '等于' }, { value: 'ne', label: '不等于' }, { value: 'exists', label: '存在' }]} /></Form.Item>
      {operator !== 'exists' && <Form.Item name="value" label="比较值" rules={[{ validator: (_, value?: string) => { try { JSON.parse(value ?? ''); return Promise.resolve() } catch { return Promise.reject(new Error('请填写比较值，复杂值须为有效 JSON')) } } }]}><FlowValueInput schema={fieldSchema(schema, path ?? '')} path={path} disabled={disabled} /></Form.Item>}
    </>}
    <Form.Item name="target" label="后续步骤" rules={[{ required: true, message: '请选择后续步骤' }]}><Select showSearch optionFilterProp="label" options={[...names, { value: 'END', label: '结束' }]} /></Form.Item>
  </Form>
}
