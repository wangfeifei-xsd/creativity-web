import { Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd'
import { useRef, useState, type ReactNode } from 'react'
import type { NamePath } from 'antd/es/form/interface'
import { ApiError } from '../api/client'
import { applyFormErrors } from '../api/form-errors'
import { isAbort } from '../api/useQuery'
import type { components } from '../api/generated/schema'

export type Schema<K extends keyof components['schemas']> = components['schemas'][K]
export type Values = Record<string, unknown>
export type Choice = { value: string; label: string }
export type Field = { name: NamePath; label: string; kind?: 'password' | 'number' | 'select' | 'multiple' | 'datetime' | 'switch';
  required?: boolean; options?: Choice[]; disabled?: boolean; min?: number; max?: number; help?: string }
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null
  const titles: Record<number, string> = { 401: '登录已失效', 403: '暂无操作权限', 404: '内容不可见',
    409: '提交冲突', 422: '字段填写有误', 429: '额度或频率受限', 503: '服务暂不可用' }
  return <Alert type="error" showIcon title={error instanceof ApiError ? titles[error.status] || '请求失败' : '请求失败'}
    description={<>{error instanceof Error ? error.message : '请稍后重试'}
      {error instanceof ApiError && error.requestId && <div>请求标识：{error.requestId}</div>}</>} />
}
export function ActionButtons({ actions, handlers, disabled }: { actions: readonly Schema<'VisibleAction'>[];
  handlers: Record<string, (() => void) | undefined>; disabled?: boolean }) {
  return <Space wrap>{actions.filter(a => handlers[a.action_key]).map(a =>
    <Button key={a.action_key} disabled={disabled} onClick={handlers[a.action_key]}>{a.label}</Button>)}</Space>
}
export function Fields({ fields }: { fields: Field[] }) {
  return fields.map(field => <Form.Item key={JSON.stringify(field.name)} name={field.name} label={field.label}
    extra={field.help} valuePropName={field.kind === 'switch' ? 'checked' : 'value'}
    rules={field.required ? [{ required: true, message: `请填写${field.label}` }] : undefined}>
    {field.kind === 'select' || field.kind === 'multiple' ? <Select showSearch optionFilterProp="label"
      mode={field.kind === 'multiple' ? 'multiple' : undefined} options={field.options} disabled={field.disabled} />
      : field.kind === 'number' ? <InputNumber min={field.min} max={field.max} style={{ width: '100%' }} />
        : field.kind === 'switch' ? <Switch disabled={field.disabled} />
          : field.kind === 'password' ? <Input.Password autoComplete="new-password" />
            : <Input disabled={field.disabled} type={field.kind === 'datetime' ? 'datetime-local' : 'text'} />}
  </Form.Item>)
}
export type EditorProps = { title: string; fields: Field[]; initial?: Values; children?: ReactNode;
  onSave: (values: Values) => Promise<unknown>; onClose: () => void; onSaved: () => void;
  latestRevision?: () => Promise<number | null | undefined>; danger?: boolean }
export function EditorDialog({ title, fields, initial, children, onSave, onClose, onSaved, latestRevision, danger }: EditorProps) {
  const [form] = Form.useForm<Values>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(initial?.revision)
  const [recovered, setRecovered] = useState(false)
  const submitting = useRef(false)
  async function submit(values: Values) {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(undefined)
    try { await onSave({ ...values, ...(revision !== undefined ? { revision } : {}) }); onSaved() }
    catch (failure) { if (!isAbort(failure)) { setError(failure); applyFormErrors(form, failure) } }
    finally { submitting.current = false; setBusy(false) }
  }
  return <Modal open title={title} onCancel={onClose} destroyOnHidden maskClosable={!busy} closable={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" danger={danger} loading={busy} onClick={() => form.submit()}>确认</Button></Space>}>
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <ErrorNotice error={error} />
      {error instanceof ApiError && error.status === 409 && latestRevision && <Button disabled={busy} onClick={async () => {
        if (submitting.current) return
        submitting.current = true; setBusy(true)
        try {
          const latest = await latestRevision()
          if (latest === undefined) throw new ApiError('当前记录不可见，请保留填写内容并重新核对', 404, null)
          setRevision(latest); setError(undefined); setRecovered(true)
        }
        catch (failure) { if (!isAbort(failure)) setError(failure) }
        finally { submitting.current = false; setBusy(false) }
      }}>读取最新版本，保留填写内容</Button>}
      {recovered && <Alert type="info" title="已更新版本，请核对填写内容后重新提交" />}
      {children}
      <Form form={form} layout="vertical" initialValues={initial} onFinish={submit} disabled={busy}>
        <Fields fields={fields} />
      </Form>
    </Space>
  </Modal>
}
export function SecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [error, setError] = useState<unknown>()
  const [copied, setCopied] = useState(false)
  return <Modal open title="接入 Key" onCancel={onClose} footer={<Button onClick={onClose}>完成</Button>}>
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Alert type="warning" title="完整 Key 仅显示本次，请复制并妥善保存" />
      <Input.TextArea readOnly value={secret} aria-label="完整 Key" autoSize />
      <Button onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied(true) }
        catch (failure) { setError(failure) } }}>{copied ? '已复制' : '复制 Key'}</Button>
      <ErrorNotice error={error} />
      <Typography.Text type="secondary">关闭后仅可查看掩码。</Typography.Text>
    </Space>
  </Modal>
}
