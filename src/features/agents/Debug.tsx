import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Button, Descriptions, Form, Input, InputNumber, Select, Switch } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { formatAmount } from '../../api/presentation'
import { ErrorNotice, type Schema } from '../../components/Management'
import { StatusTag } from '../../components/StatusTag'
import { type Version, pretty } from './types'

type Field = { title?: string; type?: string; enum?: unknown[] }

export function Debug({ version }: { version: Version }) {
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [result, setResult] = useState<Schema<'AgentTestView'>>()
  const properties = (version.definition.input_schema.properties ?? {}) as Record<string, Field>
  const required = (version.definition.input_schema.required ?? []) as string[]
  async function run(values: Record<string, unknown>) {
    setBusy(true); setError(undefined); setResult(undefined)
    try {
      const input = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined).map(([key, value]) => [key, ['object', 'array'].includes(properties[key].type ?? '') && typeof value === 'string' ? JSON.parse(value) : value]))
      setResult(await send(`/admin/v1/agent-versions/${version.version_id}/tests`, 'POST', { revision: version.revision, input, idempotency_key: crypto.randomUUID() }))
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <><ErrorNotice error={error} /><Form form={form} layout="vertical" onFinish={run} disabled={busy}>
    {Object.entries(properties).map(([name, field]) => <Form.Item key={name} name={name} label={field.title ?? name} valuePropName={field.type === 'boolean' ? 'checked' : 'value'} rules={[{ required: required.includes(name) }]}>
      {field.enum ? <Select options={field.enum.map(v => ({ value: String(v), label: String(v) }))} /> : field.type === 'boolean' ? <Switch /> : ['number', 'integer'].includes(field.type ?? '') ? <InputNumber precision={field.type === 'integer' ? 0 : undefined} style={{ width: '100%' }} /> : <Input.TextArea rows={3} />}
    </Form.Item>)}
    <Button type="primary" htmlType="submit" loading={busy}>开始调试</Button>
  </Form>
    {result && <><Descriptions style={{ marginTop: 16 }} items={[
      { key: 'state', label: '状态', children: <StatusTag status={result.state} /> },
      { key: 'time', label: '耗时', children: result.duration_ms == null ? '尚未确认' : `${result.duration_ms} 毫秒` },
      { key: 'cost', label: '费用', children: formatAmount(result.cost?.amount, result.cost?.currency) },
    ]} />{result.result && result.state.value === 'SUCCEEDED' && <pre style={{ whiteSpace: 'pre-wrap' }}>{pretty(result.result)}</pre>}
      <RunViewer key={result.run_id} runId={result.run_id} />{result.trace_url && <Link to={result.trace_url}>查看步骤轨迹</Link>}</>}
  </>
}
