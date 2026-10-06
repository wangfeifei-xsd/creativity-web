import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Button, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { ErrorNotice, type Schema } from '../../components/Management'
import { type Version } from './types'

type Field = { title?: string; type?: string; enum?: unknown[] }

export function Debug({ version }: { version: Version }) {
  const allowed = version.actions.some(action => action.action_key === 'test')
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [result, setResult] = useState<Schema<'AgentTestView'>>()
  const properties = (version.definition.input_schema.properties ?? {}) as Record<string, Field>
  const required = (version.definition.input_schema.required ?? []) as string[]
  async function run(values: Record<string, unknown>) {
    if (!allowed) return
    setBusy(true); setError(undefined); setResult(undefined)
    try {
      const input = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined).map(([key, value]) => [key, ['object', 'array'].includes(properties[key].type ?? '') && typeof value === 'string' ? JSON.parse(value) : value]))
      setResult(await send(`/admin/v1/agent-versions/${version.version_id}/tests`, 'POST', { revision: version.revision, input, idempotency_key: crypto.randomUUID() }))
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Space orientation="vertical" size="middle" style={{ width: '100%' }}><ErrorNotice error={error} /><Form form={form} layout="vertical" onFinish={run} disabled={busy}>
    {Object.entries(properties).map(([name, field]) => <Form.Item key={name} name={name} label={field.title ?? name} valuePropName={field.type === 'boolean' ? 'checked' : 'value'} rules={[{ required: required.includes(name) }]}>
      {field.enum ? <Select options={field.enum.map(v => ({ value: String(v), label: String(v) }))} /> : field.type === 'boolean' ? <Switch /> : ['number', 'integer'].includes(field.type ?? '') ? <InputNumber precision={field.type === 'integer' ? 0 : undefined} style={{ width: '100%' }} /> : <Input.TextArea rows={3} />}
    </Form.Item>)}
    <Button type="primary" htmlType="submit" loading={busy} disabled={!allowed} title={!allowed ? '当前渠道环境没有运行权限' : undefined}>开始调试</Button>
  </Form>
    {result && <>
      <RunViewer key={result.run_id} runId={result.run_id} />{result.trace_url && <Link to={result.trace_url}>查看步骤轨迹</Link>}</>}
  </Space>
}
