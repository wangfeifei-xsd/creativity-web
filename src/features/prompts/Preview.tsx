import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Select, Space, Switch, Typography } from 'antd'
import { useState } from 'react'
import { parseBindings, type BindingValues } from './binding-values'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { contentOf, errorText, send, type Schema, type Variable, type Version } from './types'

export function BindingFields({ variables }: { variables: Variable[] }) {
  return <>{variables.filter(variable => variable.source === 'input').map(variable => <Form.Item
    key={variable.name} name={['input', variable.name]} label={variable.display_name}
    rules={variable.required && variable.default == null ? [{ required: true, message: `请填写${variable.display_name}` }] : []}>
    {variable.type === 'boolean' ? <Select allowClear options={[{ value: true, label: '是' }, { value: false, label: '否' }]} /> :
      variable.type === 'integer' || variable.type === 'number' ? <InputNumber style={{ width: '100%' }} /> :
        <Input.TextArea rows={3} placeholder={variable.type === 'object' || variable.type === 'array' ? 'JSON' : undefined} />}
  </Form.Item>)}</>
}
export function RenderResult({ value }: { value: Schema<'PromptRenderView'> }) {
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Descriptions size="small" items={[
      { key: 'size', label: '预计上下文', children: `${value.estimated_tokens} Token` },
      { key: 'limit', label: '上下文上限', children: value.context_limit == null ? '尚未确认' : `${value.context_limit} Token` },
      { key: 'remaining', label: '预计剩余', children: value.estimated_remaining_tokens == null ? '尚未确认' : `${value.estimated_remaining_tokens} Token` },
    ]} />
    <Typography.Text type="secondary">{value.estimate_method}</Typography.Text>
    {value.masked && <Alert type="info" title="敏感内容已脱敏" />}
    {value.sections.map((section, index) => <Card key={index} size="small" title={section.label}>
      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{section.text || '无内容'}</Typography.Paragraph>
      {section.truncated_characters > 0 && <Typography.Text type="warning">已截断 {section.truncated_characters} 个字符</Typography.Text>}
    </Card>)}
  </Space>
}
export function PromptPreview({ version }: { version: Version }) {
  const [form] = Form.useForm<BindingValues & { reveal_sensitive: boolean }>()
  const [result, setResult] = useState<Schema<'PromptRenderView'>>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const variables = contentOf(version).variables ?? []
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    {error && <Alert type="error" title={error} />}
    <Form form={form} layout="vertical" onFinish={async values => {
      clearFormErrors(form)
      setBusy(true); setError(undefined); setResult(undefined)
      try { setResult(await send(`/admin/v1/prompt-versions/${version.version.version_id}/render`, { input: parseBindings(variables, values), reveal_sensitive: values.reveal_sensitive ?? false })) }
      catch (error) { applyFormErrors(form, error); setError(errorText(error)) }
      finally { setBusy(false) }
    }}>
      <BindingFields variables={variables} />
      {version.actions.some(action => action.action_key === 'data:read_sensitive') && <Form.Item name="reveal_sensitive" label="显示敏感原文" valuePropName="checked"><Switch /></Form.Item>}
      <Button type="primary" htmlType="submit" loading={busy}>渲染预览</Button>
    </Form>
    {result && <RenderResult value={result} />}
  </Space>
}
