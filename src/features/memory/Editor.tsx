import { DateTimeInput } from '../../components/DateTimeInput'
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd'
import { useState } from 'react'
import { ApiError, apiClient } from '../../api/client'
import { send } from '../../api/management'
import { ErrorNotice, type Schema } from '../../components/Management'

type Attribute = Schema<'MemoryAttribute'>
type Memory = Schema<'MemoryView'>
type Values = { anchor_id: string; key: string; value: unknown; expires_at?: string }

function valueKind(attribute?: Attribute) {
  const schema = attribute?.value_schema ?? {}
  if (Array.isArray(schema.enum)) return 'enum'
  if (schema.type === 'array' && (schema.items as { type?: string } | undefined)?.type === 'string') return 'tags'
  return ['string', 'number', 'integer', 'boolean'].includes(String(schema.type)) ? String(schema.type) : 'json'
}

export function MemoryEditor({ attributes, subjects, anchorId, memory, onClose, onSaved }: {
  attributes: Attribute[]; subjects: Schema<'MemorySubject'>[]; anchorId?: string; memory?: Memory;
  onClose: () => void; onSaved: (memory: Memory) => void;
}) {
  const [form] = Form.useForm<Values>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [revision, setRevision] = useState(memory?.revision)
  const first = attributes.find(a => a.memory_type === 'PREFERENCE')
  const key = Form.useWatch('key', form) ?? memory?.key ?? first?.key
  const attribute = attributes.find(a => a.key === key)
  const kind = valueKind(attribute)
  const initial = { anchor_id: anchorId, key: memory?.key ?? first?.key,
    value: memory ? kind === 'json' ? JSON.stringify(memory.value, null, 2) : memory.value : undefined,
    expires_at: memory?.expires_at ? localTime(memory.expires_at) : undefined }
  async function save(values: Values) {
    setBusy(true); setError(undefined)
    try {
      const body = { value: kind === 'json' ? JSON.parse(String(values.value)) : values.value,
        ...(values.expires_at ? { expires_at: new Date(values.expires_at).toISOString() } : {}) }
      const saved = memory
        ? await send<Memory>(`/admin/v1/memories/${memory.memory_id}`, 'PATCH', { ...body, revision })
        : await send<Memory>(`/admin/v1/memories?anchor_id=${encodeURIComponent(anchorId ?? values.anchor_id)}`, 'POST', { ...body, key: values.key, memory_type: attribute?.memory_type })
      onSaved(saved)
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <Modal open title={memory ? '修正画像' : '新增画像'} onCancel={onClose} closable={!busy} maskClosable={!busy}
    footer={<Space><Button onClick={onClose} disabled={busy}>取消</Button><Button type="primary" aria-label={busy ? '保存中' : '保存'} loading={busy} disabled={busy || !attribute} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error} />
    {error instanceof ApiError && error.status === 409 && memory && <Button onClick={async () => {
      setBusy(true)
      try { const latest = await apiClient.request<Schema<'MemoryDetail'>>(`/admin/v1/memories/${memory.memory_id}`); setRevision(latest.memory.revision); setError(undefined) }
      catch (failure) { setError(failure) } finally { setBusy(false) }
    }} disabled={busy}>读取最新版本，保留填写内容</Button>}
    <Form form={form} layout="vertical" initialValues={initial} onFinish={save} disabled={busy}>
      {!anchorId && !memory && <Form.Item name="anchor_id" label="主体" rules={[{ required: true, message: '请选择主体' }]}>
        <Select showSearch optionFilterProp="label" options={subjects.map(s => ({ value: s.anchor_id, label: s.label }))} />
      </Form.Item>}
      <Form.Item name="key" label="属性" rules={[{ required: true }]}><Select disabled={!!memory} onChange={() => form.setFieldValue('value', undefined)} options={attributes.filter(a => a.memory_type === 'PREFERENCE').map(a => ({ value: a.key, label: a.label }))} /></Form.Item>
      <Form.Item key={key} name="value" label={kind === 'json' ? '结构化记忆值（JSON）' : '记忆值'} valuePropName={kind === 'boolean' ? 'checked' : 'value'} rules={[{ required: kind !== 'boolean', message: '请填写记忆值' }, ...(kind === 'json' ? [{ validator: async (_: unknown, value: unknown) => { try { JSON.parse(String(value)) } catch { throw new Error('请输入有效的 JSON') } } }] : [])]}>
        {kind === 'json' ? <Input.TextArea rows={6} /> : kind === 'tags' ? <Select mode="tags" tokenSeparators={['、', ',']} /> : kind === 'boolean' ? <Switch /> : kind === 'number' || kind === 'integer' ? <InputNumber precision={kind === 'integer' ? 0 : undefined} /> : kind === 'enum' ? <Select options={(attribute?.value_schema.enum as (string | number)[]).map(value => ({ value, label: String(value) }))} /> : <Input maxLength={Number(attribute?.value_schema.maxLength ?? 4000)} />}
      </Form.Item>
      <Form.Item name="expires_at" label="有效截止时间" extra="未指定时使用当前记忆策略的有效期。"><DateTimeInput /></Form.Item>
    </Form>
  </Modal>
}

function localTime(value: string) {
  const date = new Date(value)
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
