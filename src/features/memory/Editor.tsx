import { Button, Form, Input, InputNumber, Modal, Select, Space } from 'antd'
import { useState } from 'react'
import { ApiError, apiClient } from '../../api/client'
import { send } from '../../api/management'
import { ErrorNotice, type Schema } from '../../components/Management'

type Attribute = Schema<'MemoryAttribute'>
type Memory = Schema<'MemoryView'>
type Values = { anchor_id: string; key: string; text: string; games: string[]; min: number; max: number; expires_at?: string }

export function MemoryEditor({ attributes, subjects, anchorId, memory, onClose, onSaved }: {
  attributes: Attribute[]; subjects: Schema<'MemorySubject'>[]; anchorId?: string; memory?: Memory;
  onClose: () => void; onSaved: (memory: Memory) => void;
}) {
  const [form] = Form.useForm<Values>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [revision, setRevision] = useState(memory?.revision)
  const key = Form.useWatch('key', form) ?? memory?.key ?? attributes[0]?.key
  const value = memory?.value
  const budget = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const initial = { anchor_id: anchorId, key: memory?.key ?? attributes[0]?.key, text: typeof value === 'string' ? value : undefined,
    games: Array.isArray(value) ? value : [], min: budget.min, max: budget.max,
    expires_at: memory?.expires_at ? localTime(memory.expires_at) : undefined }
  async function save(values: Values) {
    setBusy(true); setError(undefined)
    try {
      const attribute = attributes.find(a => a.key === values.key)
      const body = { value: values.key === 'usual_budget' ? { min: values.min, max: values.max, currency: 'CNY' }
        : values.key === 'favorite_games' ? values.games : values.text,
      ...(values.expires_at ? { expires_at: new Date(values.expires_at).toISOString() } : {}) }
      const saved = memory
        ? await send<Memory>(`/admin/v1/memories/${memory.memory_id}`, 'PATCH', { ...body, revision })
        : await send<Memory>(`/admin/v1/memories?anchor_id=${encodeURIComponent(anchorId ?? values.anchor_id)}`, 'POST', { ...body, key: values.key, memory_type: attribute?.memory_type })
      onSaved(saved)
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <Modal open title={memory ? '修正记忆' : '新增记忆'} onCancel={onClose} closable={!busy} maskClosable={!busy}
    footer={<Space><Button onClick={onClose} disabled={busy}>取消</Button><Button type="primary" aria-label={busy ? '保存中' : '保存'} loading={busy} disabled={busy} onClick={() => form.submit()}>保存</Button></Space>}>
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
      <Form.Item name="key" label="属性" rules={[{ required: true }]}><Select disabled={!!memory} options={attributes.filter(a => a.memory_type === 'PREFERENCE').map(a => ({ value: a.key, label: a.label }))} /></Form.Item>
      {key === 'usual_budget' ? <Space align="start">
        <Form.Item name="min" label="预算下限（元）" rules={[{ required: true, message: '请填写预算下限' }]}><InputNumber min={0} max={1000000} precision={0} /></Form.Item>
        <Form.Item name="max" label="预算上限（元）" rules={[{ required: true, message: '请填写预算上限' }]}><InputNumber min={0} max={1000000} precision={0} /></Form.Item>
      </Space> : key === 'favorite_games' ? <Form.Item name="games" label="常玩游戏" rules={[{ required: true, message: '请填写常玩游戏' }]}><Select mode="tags" tokenSeparators={['、', ',']} /></Form.Item>
        : <Form.Item name="text" label="记忆值" rules={[{ required: true, message: '请填写记忆值' }]}><Input maxLength={100} /></Form.Item>}
      <Form.Item name="expires_at" label="有效截止时间" extra="未指定时使用当前记忆策略的有效期。"><Input type="datetime-local" /></Form.Item>
    </Form>
  </Modal>
}

function localTime(value: string) {
  const date = new Date(value)
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
