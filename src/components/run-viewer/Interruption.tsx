import { Button, Card, Form, Input, InputNumber, Radio, Space } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../Management'

type Field = { title?: string; type?: string }
export function Interruption({ runId, snapshot, onResumed }: { runId: string; snapshot: Schema<'RunDetail'>; onResumed: () => Promise<void> }) {
  // 运行状态可能连续两次都是等待；每次快照刷新仍须取得当前中断及最新操作权限。
  const query = useQuery<Schema<'InterruptionView'> | null>(`/admin/v1/runs/${runId}/interruption`, true, snapshot)
  const value = query.data
  return <><ErrorNotice error={query.error} />{value && <InterruptionForm
    key={`${value.interruption_id}:${value.revision}:${value.confirmation_digest}`}
    runId={runId} value={value} onResumed={onResumed}
  />}</>
}

function InterruptionForm({ runId, value, onResumed }: { runId: string; value: Schema<'InterruptionView'>; onResumed: () => Promise<void> }) {
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [key] = useState(() => crypto.randomUUID())
  const fields = (value.input_schema.properties ?? {}) as Record<string, Field>
  async function submit(decision: 'respond' | 'approve' | 'reject' | 'verify') {
    if (busy) return
    setBusy(true); setError(undefined)
    try {
      const input: Record<string, unknown> = {}
      if (decision === 'respond') {
        const entered = await form.validateFields()
        for (const [name, field] of Object.entries(fields)) {
          if (entered[name] === undefined || entered[name] === '') continue
          input[name] = field.type === 'array' || field.type === 'object' ? JSON.parse(entered[name] as string) as unknown : entered[name]
        }
      }
      await apiClient.request(`/admin/v1/runs/${runId}/resume`, { method: 'POST', body: JSON.stringify({
        interruption_id: value.interruption_id, revision: value.revision, confirmation_digest: value.confirmation_digest,
        decision, input, idempotency_key: key,
      }) })
      await onResumed()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <><ErrorNotice error={error} /><Card title={value.name}>
    {value.state === 'WAITING_APPROVAL' && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(value.proposed_input, null, 2)}</pre>}
    {value.can_respond && <Form name={`interruption-${value.interruption_id}`} form={form} layout="vertical" disabled={busy}>{Object.entries(fields).map(([name, field]) => <Form.Item key={name} name={name} label={field.title || '补充内容'} rules={[{ required: (value.input_schema.required as string[] | undefined)?.includes(name) }]}>
      {field.type === 'boolean' ? <Radio.Group options={[{ label: '是', value: true }, { label: '否', value: false }]} /> : field.type === 'number' || field.type === 'integer' ? <InputNumber precision={field.type === 'integer' ? 0 : undefined} style={{ width: '100%' }} /> : <Input.TextArea rows={field.type === 'object' || field.type === 'array' ? 5 : 2} />}
    </Form.Item>)}</Form>}
    <Space>{value.can_respond && <Button type="primary" loading={busy} onClick={() => void submit('respond')}>提交并继续</Button>}
      {value.can_verify && <Button loading={busy} onClick={() => void submit('verify')}>核查来源状态</Button>}
      {value.can_approve && <><Button type="primary" loading={busy} onClick={() => void submit('approve')}>批准执行</Button><Button danger disabled={busy} onClick={() => void submit('reject')}>拒绝并结束</Button></>}
    </Space>
  </Card></>
}
