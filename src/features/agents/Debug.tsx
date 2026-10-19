import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Button, Empty, Form, Input, InputNumber } from 'antd'
import { CodeOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { AgentSection } from './AgentWorkspace'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { ErrorNotice, type Schema } from '../../components/Management'
import { EnumSelect } from '../../components/schema-fields/EnumSelect'
import { parseSchemaInput, schemaInputHint, schemaRequiredValue, SchemaInputError, type InputProperty } from '../../components/schema-fields/input'
import { type Configuration } from './types'

export function Debug({ configuration }: { configuration: Configuration }) {
  const allowed = configuration.actions.some(action => action.action_key === 'test')
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [result, setResult] = useState<Schema<'AgentTestView'>>()
  const properties = (configuration.definition.input_schema.properties ?? {}) as Record<string, InputProperty>
  const required = (configuration.definition.input_schema.required ?? []) as string[]
  async function run(values: Record<string, unknown>) {
    if (!allowed) return
    clearFormErrors(form)
    setBusy(true); setError(undefined); setResult(undefined)
    try {
      const input = parseSchemaInput(properties, values)
      setResult(await send(`/admin/v1/agents/${configuration.agent_id}/tests`, 'POST', { revision: configuration.revision, input, idempotency_key: crypto.randomUUID() }))
    } catch (failure) {
      applyFormErrors(form, failure, path => path.slice(0, 1))
      if (failure instanceof SchemaInputError) form.setFields([{ name: failure.field, errors: [failure.message] }])
      setError(failure)
    } finally { setBusy(false) }
  }
  return <div className={`agent-debug${result ? ' has-result' : ''}`}><AgentSection title="调试输入" icon={<CodeOutlined aria-hidden />}><ErrorNotice error={error} /><Form form={form} layout="vertical" onFinish={run} disabled={busy}>
    {Object.entries(properties).map(([name, field]) => <Form.Item key={name} name={name} label={field.title ?? name} extra={schemaInputHint(field)} rules={[{ required: required.includes(name), transform: value => schemaRequiredValue(field, value) }]}>
      {field.enum || field.type === 'boolean' ? <EnumSelect values={field.enum ?? [true, false]} /> : field.type === 'number' || field.type === 'integer' ? <InputNumber precision={field.type === 'integer' ? 0 : undefined} style={{ width: '100%' }} /> : <Input.TextArea rows={3} />}
    </Form.Item>)}
    {!Object.keys(properties).length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无需填写输入" />}
    <div className="agent-debug-actions"><Button type="primary" icon={<PlayCircleOutlined aria-hidden />} htmlType="submit" loading={busy} disabled={!allowed} title={!allowed ? '当前渠道环境没有运行权限' : undefined}>开始调试</Button></div>
  </Form></AgentSection>
    <AgentSection title="运行结果" icon={<PlayCircleOutlined aria-hidden />}>{result ? <>
      <RunViewer key={result.run_id} runId={result.run_id} />{result.trace_url && <Link to={result.trace_url}>查看步骤轨迹</Link>}</> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调试结果" />}</AgentSection>
  </div>
}
